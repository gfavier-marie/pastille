// Processus principal : toute la logique vit ici, les fenêtres ne font qu'afficher.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync, mkdirSync, mkdtempSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, normalize, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  app,
  BrowserWindow,
  desktopCapturer,
  clipboard,
  ClipboardItem,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  net,
  protocol,
  screen,
  session as electronSession,
  shell,
  systemPreferences,
} from 'electron';
import { allAnnotations, findAnnotation, type Geometry, type Session } from '@pastille/shared';
import type { CaptureResult, EditorFocus, ExportFormat, ExportResult, MenuAction, MenuState, PairingState, SettingsState, SettingsTab } from '../ipc.ts';
import { createCapture, listWindows, windowTarget, type CapturedImage } from './capture.ts';
import { createClicks } from './clicks.ts';
import { createDictation } from './dictation.ts';
import { createMenubar } from './menubar.ts';
import { exportSession } from './export/index.ts';
import { createFakeSession } from './export/fixture.ts';
import { createMcp, MCP_PORT } from './mcp.ts';
import { createSessionStore } from './session-store.ts';
import { createTablet } from './tablet.ts';
import QRCode from 'qrcode';
import { encodeWav, wavDurationMs } from './wav.ts';
import { createLicense, POLAR, SITE_URL, TRIAL_DAYS } from './license.ts';
import { createSettings, type Settings } from './settings.ts';
import { createTranscriber } from './transcriber.ts';
import { checkForUpdate, installUpdate, type Update } from './updater.ts';
import { createVideo } from './video.ts';
import { createVideoWindow } from './video-window.ts';
import { createVideoFeedback } from './video-feedback.ts';
import { downloadFile, MODEL_FILE, MODEL_URL } from './whisper.ts';

const isMac = process.platform === 'darwin';
const repoRoot = join(app.getAppPath(), '..', '..');
const preload = join(import.meta.dirname, '../preload/index.cjs');
// Relais de la tablette : le relais partagé pour l'app installée, local en développement ;
// PASTILLE_RELAY vise un autre relais (auto-hébergé).
// Le même Worker répond aussi sur https://pastille.vibescreener.workers.dev (apps et tablettes appairées avant).
const RELAY_URL = process.env.PASTILLE_RELAY ?? (app.isPackaged ? 'https://relay.vibescreener.dev' : 'http://localhost:8787');
// Tests sans interaction : « capture » (mesure de 5 captures), « editor » (session factice,
// dictée, photo de l'éditeur, exports) ou « tablet » (attend un croquis sur le point #1).
// Données dans un dossier temporaire.
const autotest = process.env.PASTILLE_AUTOTEST as 'capture' | 'editor' | 'tablet' | undefined;
if (autotest) app.setPath('userData', mkdtempSync(join(tmpdir(), 'pastille-autotest-')));
else {
  // Ancien nom de l'app (Pastille) : sessions, réglages, appairage et modèle sont repris une fois.
  const legacy = join(app.getPath('appData'), 'Pastille');
  for (const name of ['sessions', 'models', 'settings.json', 'state.json', 'pairing.json']) {
    const from = join(legacy, name), to = join(app.getPath('userData'), name);
    if (!existsSync(from) || existsSync(to)) continue;
    mkdirSync(app.getPath('userData'), { recursive: true });
    renameSync(from, to);
  }
}
if (autotest === 'editor') {
  // Faux micro qui joue l'échantillon de dictée : la chaîne micro → Whisper → commentaire est testée sans personne.
  app.commandLine.appendSwitch('use-fake-device-for-media-stream');
  app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
  // Chromium ne lit pas dans l'archive asar : l'app empaquetée reçoit l'échantillon par PASTILLE_FAKE_AUDIO.
  const sample = process.env.PASTILLE_FAKE_AUDIO ?? join(app.getAppPath(), 'fixtures', 'dictee-fr.wav');
  app.commandLine.appendSwitch('use-file-for-fake-audio-capture', sample);
  app.commandLine.appendSwitch('disable-features', 'AudioServiceOutOfProcess'); // sinon le bac à sable audio ne lit pas le fichier
  // Fenêtre de l'éditeur recouverte par d'autres apps : elle reste « visible », sinon la dictée s'arrête (micro libéré).
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'pastille', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

type Page = 'editor' | 'poc' | 'overlay' | 'settings' | 'menu' | 'bar' | 'welcome' | 'pairing' | 'video' | 'video-feedback';
function loadPage(win: BrowserWindow, page: Page, hash = '') {
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl) void win.loadURL(`${devUrl}/${page}.html${hash && `#${hash}`}`);
  else void win.loadFile(join(import.meta.dirname, '../renderer', `${page}.html`), { hash });
}

const settings = createSettings(app.getPath('userData'), app.getPath('documents'));
const store = createSessionStore(
  app.getPath('userData'),
  (s) => {
    editor?.webContents.send('session:changed', s);
    updateTrayMenu();
    tablet?.refresh();
  },
  () => settings.get().context,
);
const tablet = autotest && autotest !== 'tablet'
  ? null
  : createTablet({
      dataDir: app.getPath('userData'),
      relayUrl: RELAY_URL,
      store,
      onStatus: (connected) => {
        editor?.webContents.send('tablet:status', connected);
        pairingWindow?.webContents.send('tablet:status', connected);
        pairingWindow?.setContentSize(720, pairingHeight(connected));
        broadcastSettings();
      },
    });
// Essai puis licence Polar. PASTILLE_TRIAL_DAYS raccourcit l'essai et PASTILLE_POLAR=sandbox vise le bac à sable, pour les essais.
const polar = process.env.PASTILLE_POLAR === 'sandbox' ? POLAR.sandbox : POLAR.production;
const license = createLicense({ dataDir: app.getPath('userData'), trialDays: Number(process.env.PASTILLE_TRIAL_DAYS ?? TRIAL_DAYS), polar });
const exportDir = () => (autotest ? join(app.getPath('userData'), 'exports') : settings.get().exportDir);
const modelDir = join(app.getPath('userData'), 'models');
// Serveur MCP pour Claude Code : son adresse, ou l'erreur affichée dans les réglages.
const mcp = createMcp({
  store,
  instructions: () => settings.get().instructions,
  onClient: () => {
    settings.update({ mcpSeenAt: new Date().toISOString() });
    broadcastSettings();
  },
});
let mcpStatus: SettingsState['mcp'] = {};
const transcriber = createTranscriber({
  binDirs: app.isPackaged ? [join(process.resourcesPath, 'whisper')] : [join(repoRoot, 'vendor', 'whisper')],
  modelDirs: app.isPackaged ? [modelDir] : [modelDir, join(repoRoot, 'models')],
  settings,
});

let editor: BrowserWindow | null = null;
let pocWindow: BrowserWindow | null = null;
// La file attend que le modèle soit chargé ; sans moteur, la dictée passe en erreur (audio conservé).
const dictation = createDictation(store, (wav) => transcriber.transcribe(wav));
let shortcutRegistered = false;
let captureAccelerator: string | null = null; // raccourci de capture enregistré
let recording = false; // une dictée est en cours dans l'éditeur

/** « Command+Control+Alt+P » → « ⌃⌥⌘P » ; « Control+Alt+P » → « Ctrl+Alt+P ». */
function shortcutLabel(accelerator: string) {
  if (!isMac) return accelerator.replace(/CommandOrControl|CmdOrCtrl|Control/g, 'Ctrl');
  const symbols: Record<string, string> = { CommandOrControl: '⌘', CmdOrCtrl: '⌘', Command: '⌘', Cmd: '⌘', Shift: '⇧', Alt: '⌥', Option: '⌥', Control: '⌃', Ctrl: '⌃' };
  const order = '⌃⌥⇧⌘'; // ordre des menus de macOS
  const keys = accelerator.split('+').map((k) => symbols[k] ?? k);
  return keys.sort((a, b) => (order.indexOf(a) + 1 || 9) - (order.indexOf(b) + 1 || 9)).join('');
}

/** Raccourci global ; s'il est déjà pris, l'ancien est gardé et l'échec signalé (§4.2). */
function registerShortcut(accelerator: string): boolean {
  if (captureAccelerator) globalShortcut.unregister(captureAccelerator); // celui du mode vidéo reste
  try {
    shortcutRegistered = globalShortcut.register(accelerator, () => startCapture());
  } catch {
    shortcutRegistered = false;
  }
  captureAccelerator = shortcutRegistered ? accelerator : null;
  return shortcutRegistered;
}

// ——— Éditeur ———

function createEditor() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 560,
    show: false,
    title: 'VibeScreener',
    backgroundColor: '#161618',
    // macOS : l'en-tête sombre de l'éditeur sert de barre de titre.
    ...(isMac ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 18, y: 19 } } : {}),
    webPreferences: { preload },
  });
  win.setContentProtection(true);
  // Fermer cache la fenêtre, prête pour la prochaine capture. Windows : elle est réduite, pour rester dans la barre des tâches.
  win.on('close', (e) => {
    if (!quitting) {
      e.preventDefault();
      if (isMac) win.hide();
      else win.minimize();
    }
  });
  loadPage(win, 'editor');
  return win;
}

function showEditor(focus?: EditorFocus) {
  inspirationFor = null; // revenir à l'éditeur annule l'inspiration en attente
  editor ??= createEditor();
  if (focus) editor.webContents.send('editor:focus', focus);
  if (editor.isMinimized()) editor.restore();
  editor.show();
  if (isMac) app.focus({ steal: true });
  editor.focus();
}

// ——— Captures ———

// Inspiration d'un point : l'éditeur s'efface pour laisser chercher une page modèle, et la prochaine
// capture (raccourci, menu, barre) est jointe au point au lieu de devenir un écran.
let inspirationFor: string | null = null;

/** Point qui attend son inspiration, s'il existe toujours dans la session ouverte. */
function inspirationTarget() {
  const s = store.get();
  return inspirationFor && s ? findAnnotation(s, inspirationFor) : undefined;
}

function startCapture() {
  if (video.isRecording()) return; // le mode vidéo capture déjà à chaque clic
  // Essai fini sans licence : l'onglet Licence s'ouvre à la place. Sessions, exports et Claude Code restent libres.
  if (!license.canCapture()) {
    checkLicense(); // licence à revérifier : de nouveau en ligne, peut-être
    return showSettings('license');
  }
  welcomeWindow?.webContents.send('welcome:shortcut');
  // Le micro chauffe pendant que l'utilisateur vise : la dictée démarre sans délai au clic.
  if (!inspirationTarget()) editor?.webContents.send('editor:prepare-mic');
  void capture.start();
}

async function onCapture(c: CapturedImage) {
  const target = inspirationTarget();
  if (target) {
    // L'éditeur revient sur le point, bulle ouverte, sans relancer la dictée.
    await store.addInspiration(target.annotation.id, c.png, c.target === 'window' ? { app: c.app, windowTitle: c.title } : undefined);
    return showEditor({ captureId: target.capture.id, annotationId: target.annotation.id, openBubble: true });
  }
  const capture = await store.addCapture(c.png, {
    width: c.width,
    height: c.height,
    scaleFactor: c.scaleFactor,
    source: { app: c.app, windowTitle: c.title, displayId: c.displayId },
  });
  // Clic : un point ; zone glissée sans ⌥ : un rectangle. Dans les deux cas, bulle ouverte et dictée lancée.
  const geometry: Geometry | undefined = c.point ? { kind: 'point', ...c.point } : c.zone && { kind: 'zone', ...c.zone };
  const annotationId = geometry && store.addAnnotation(capture.id, geometry);
  showEditor({ captureId: capture.id, annotationId, openBubble: !!annotationId, dictate: !!annotationId });
  reportCapture({
    ok: true,
    width: c.width,
    height: c.height,
    scaleFactor: c.scaleFactor,
    target: c.target,
    app: c.app,
    title: c.title,
    timings: c.timings,
  });
}

const captureResults: CaptureResult[] = [];
function reportCapture(r: CaptureResult) {
  captureResults.push(r);
  console.log('CAPTURE', JSON.stringify(r));
  pocWindow?.webContents.send('capture:result', r);
}

// ——— Mode vidéo ———
// ⌃⌥⌘R : on navigue dans son app, chaque clic suivi de paroles devient un point sur l'image d'avant
// le clic (voir video.ts). ⌃⌥⌘R arrête et ouvre l'éditeur. Pas de fichier vidéo : la session reste ordinaire.

const VIDEO_SHORTCUT = isMac ? 'Command+Control+Alt+R' : 'Control+Alt+R';
const videoWindow = createVideoWindow({ preload, loadPage, onAudio: (chunk) => video.onAudio(chunk) });
const videoFeedback = createVideoFeedback({ preload, loadPage });
const logVideo = (entry: Record<string, unknown>) => console.log('VIDEO', JSON.stringify(entry));
const video = createVideo({
  store,
  submit: (id, samples) => dictation.submit(id, encodeWav(samples)),
  freeze: (displayId) => videoWindow.freeze(displayId),
  crop: (frameId, rect) => videoWindow.crop(frameId, rect),
  target: async (click) => {
    const windows = listWindows(); // lancée dès le clic
    const d = screen.getAllDisplays().find((x) => x.id === click.displayId) ?? screen.getPrimaryDisplay();
    const { rect, hit } = windowTarget(await windows, d, { x: d.bounds.x + click.x, y: d.bounds.y + click.y });
    return { rect, app: hit?.owner.name, title: hit?.title };
  },
  log: logVideo,
  nextNumber: () => store.get()?.captures.reduce((n, c) => n + c.annotations.length, 1) ?? 1,
  onFeedback: (state) => videoFeedback.update(state),
});
const inside = (p: { x: number; y: number }, r: Electron.Rectangle) => p.x >= r.x && p.y >= r.y && p.x < r.x + r.width && p.y < r.y + r.height;
const clicks = createClicks({
  // Nos fenêtres ne se commentent pas ; la barre ne compte que sous la pilule (le reste laisse passer les clics).
  ignore: (p) =>
    menubar.pointerInBar() || BrowserWindow.getAllWindows().some((w) => w.isVisible() && !menubar.isBar(w) && !videoFeedback.isWindow(w) && inside(p, w.getBounds())),
  onClick: (p, at) => {
    const d = screen.getDisplayNearestPoint(p);
    video.onClick({
      displayId: d.id,
      display: { width: d.bounds.width, height: d.bounds.height, scaleFactor: d.scaleFactor },
      x: p.x - d.bounds.x,
      y: p.y - d.bounds.y,
      at,
    });
  },
});
let videoStarting = false;
let videoMetrics: ReturnType<typeof setInterval> | undefined;

async function toggleVideo() {
  if (video.isRecording()) return stopVideo();
  if (videoStarting || capture.isBusy()) return;
  if (!license.canCapture()) {
    checkLicense();
    return showSettings('license');
  }
  if (!clicks.allowed()) {
    clicks.ask();
    const { response } = await dialog.showMessageBox({
      type: 'warning',
      message: 'Le mode vidéo a besoin de voir vos clics.',
      detail: `Autorise VibeScreener dans Réglages Système > Confidentialité et sécurité > Accessibilité, puis relance l'enregistrement (${shortcutLabel(VIDEO_SHORTCUT)}).`,
      buttons: ['Ouvrir les Réglages', 'Annuler'],
      defaultId: 0,
      cancelId: 1,
    });
    if (response === 0) void shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
    return;
  }
  videoStarting = true;
  try {
    editor?.hide(); // on relit son app, pas l'éditeur
    await videoWindow.start();
    await videoFeedback.start();
    await clicks.start();
    video.start();
    logVideo({ started: true, displays: screen.getAllDisplays().length });
    // Mesures du lot V0 : processeur (% d'un cœur, tous processus) et mémoire de l'app.
    videoMetrics = setInterval(() => {
      const metrics = app.getAppMetrics();
      logVideo({
        cpu: Math.round(metrics.reduce((n, m) => n + m.cpu.percentCPUUsage, 0)),
        memoryMB: Math.round(metrics.reduce((n, m) => n + m.memory.workingSetSize, 0) / 1024),
      });
    }, 30_000);
  } catch (err) {
    clicks.stop();
    videoWindow.stop();
    videoFeedback.stop();
    void dialog.showMessageBox({ type: 'warning', message: err instanceof Error ? err.message : String(err) });
  } finally {
    videoStarting = false;
    updateTrayMenu();
  }
}

/** Arrête l'enregistrement : le dernier segment est enregistré avant de fermer flux et micro. */
async function finishVideo() {
  clearInterval(videoMetrics);
  clicks.stop();
  videoFeedback.stop();
  const summary = await video.stop();
  videoWindow.stop();
  updateTrayMenu();
  return summary;
}

async function stopVideo() {
  const summary = await finishVideo();
  logVideo({ stopped: true, ...summary });
  if (summary.firstCaptureId) showEditor({ captureId: summary.firstCaptureId });
  else if (summary.notes) showEditor();
  else {
    void dialog.showMessageBox({
      message: 'Aucun point enregistré.',
      detail: 'Pendant l’enregistrement, clique sur un élément puis parle : chaque clic suivi de paroles devient un point.',
    });
  }
}

// ——— Export ———

async function printHtml(htmlFile: string): Promise<Uint8Array> {
  const win = new BrowserWindow({ show: false });
  try {
    await win.loadFile(htmlFile);
    return await win.webContents.printToPDF({ landscape: true, pageSize: 'A4', printBackground: true, preferCSSPageSize: true });
  } finally {
    win.destroy();
  }
}

async function runExport(format: ExportFormat): Promise<ExportResult> {
  const session = store.get();
  if (!session || session.captures.length === 0) return { ok: false, error: 'Rien à exporter : aucune capture.' };
  const { pending, error } = dictation.unfinished();
  if (!autotest && (pending.length || error.length)) {
    const list = (labels: string[]) => labels.join(', ');
    const { response } = await dialog.showMessageBox({
      type: 'warning',
      message: 'Certaines dictées ne sont pas encore transcrites.',
      detail: [pending.length && `En cours : ${list(pending)}`, error.length && `En erreur : ${list(error)}`]
        .filter(Boolean)
        .join('\n'),
      buttons: ['Exporter quand même', 'Annuler'],
      defaultId: 1,
      cancelId: 1,
    });
    if (response === 1) return { ok: false, error: 'Export annulé.' };
  }
  try {
    await store.flush();
    const path = await exportSession({
      session,
      sessionDir: store.dir(session),
      outDir: exportDir(),
      format,
      printHtml,
      instructions: settings.get().instructions,
    });
    const copied = !autotest && format === 'pdf' && settings.get().copyPdf;
    if (copied) copyFileToClipboard(path);
    lastExport = path;
    // Barre flottante affichée : son message remplace l'ouverture du Finder.
    if (!autotest && !menubar.notifyExport({ format, file: basename(path), copied })) shell.showItemInFolder(path);
    return { ok: true, path };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/** Le PDF est aussi mis dans le presse-papiers, pour le coller directement dans le chat de l'IA (§6.1). */
function copyFileToClipboard(path: string) {
  // Format système brut : une référence de fichier, comme un copier depuis le Finder ou l'Explorateur.
  const [format, data] = isMac
    ? ['public.file-url', Buffer.from(pathToFileURL(path).href)]
    : ['FileNameW', Buffer.from(`${path}\0`, 'ucs2')];
  const raw = `electron application/osclipboard;format="${format}"`;
  void clipboard.write([new ClipboardItem({ [raw]: new Blob([data]) })]).catch(() => {});
}

async function exportFromMenu(format: ExportFormat) {
  const r = await runExport(format);
  if (!r.ok) void dialog.showMessageBox({ type: 'warning', message: r.error });
}

// ——— Icône, menu et barre flottante (§4.7) ———

async function menuState(): Promise<MenuState> {
  const session = store.get();
  const { pending, error } = dictation.unfinished();
  const recents = (await store.recent(4)).filter((r) => r.id !== session?.id).slice(0, 3);
  return {
    platform: isMac ? 'mac' : process.platform === 'win32' ? 'win' : 'other',
    session: session && {
      name: session.name,
      points: allAnnotations(session).length,
      screens: session.captures.length,
      createdAt: session.createdAt,
    },
    tablet: tablet?.isConnected() ?? false,
    pending: pending.length,
    errors: error.length,
    shortcut: shortcutLabel(settings.get().shortcut),
    video: { shortcut: shortcutLabel(VIDEO_SHORTCUT), since: video.isRecording() ? video.startedAt() : undefined },
    recents: recents.map(({ id, name, points, screens, updatedAt }) => ({ id, name, points, screens, updatedAt })),
    update: update?.version,
    license: license.view(),
  };
}

// ——— Mises à jour (app installée sur Mac ou Windows) ———

let update: Update | null = null;

async function lookForUpdate() {
  if (!app.isPackaged || !(isMac || process.platform === 'win32') || autotest) return;
  update = await checkForUpdate(app.getVersion());
  updateTrayMenu();
}

async function confirmUpdate() {
  if (!update) return;
  const { response } = await dialog.showMessageBox({
    message: `Mettre à jour VibeScreener vers la version ${update.version} ?`,
    detail:
      "L'app se ferme, se met à jour et se rouvre (environ une minute). Sessions et réglages sont conservés." +
      (isMac ? "\nL'app n'étant pas signée par Apple, macOS redemandera l'autorisation d'enregistrement de l'écran, le micro et l'Accessibilité (mode vidéo)." : ''),
    buttons: ['Mettre à jour', 'Plus tard'],
    defaultId: 0,
    cancelId: 1,
  });
  if (response !== 0) return;
  await store.flush();
  installUpdate(update, join(app.getPath('userData'), 'update.log'));
}

let lastExport: string | null = null;

/** Revérifie la clé auprès de Polar (au plus une fois par jour) et affiche le résultat. */
const checkLicense = () => void license.refresh().then(broadcastSettings);

function onMenuAction(a: MenuAction) {
  switch (a.type) {
    case 'capture':
      return startCapture();
    case 'video':
      return void toggleVideo();
    case 'editor':
      return showEditor();
    case 'sessions':
      showEditor();
      return editor?.webContents.send('editor:sessions');
    case 'export':
      return void exportFromMenu('pdf');
    case 'new-session':
      return void finishVideo().then(() => store.close());
    case 'pair':
      return showPairing();
    case 'claude-code':
      return showSettings('claude');
    case 'settings':
      return showSettings();
    case 'quit':
      return app.quit();
    case 'hide-bar':
      settings.update({ floatingBar: false });
      return broadcastSettings();
    case 'reveal':
      if (lastExport) shell.showItemInFolder(lastExport);
      return;
    case 'open-recent':
      return void finishVideo().then(() => store.open(a.id)).then(() => showEditor());
    case 'export-recent':
      return void finishVideo().then(() => store.open(a.id)).then(() => exportFromMenu('pdf'));
    case 'update':
      return void confirmUpdate();
    case 'license':
      return showSettings('license');
  }
}

const menubar = createMenubar({
  preload,
  loadPage,
  state: menuState,
  recording: () => recording || video.isRecording(),
  barEnabled: () => settings.get().floatingBar,
  onAction: onMenuAction,
});
const updateTrayMenu = () => menubar.refresh();

// ——— Appairage de la tablette (§5.1) ———

let pairingWindow: BrowserWindow | null = null;
// La fenêtre s'agrandit pour montrer la tablette connectée et le bouton « Révoquer ».
const pairingHeight = (connected: boolean) => (connected ? 510 : 410);
function showPairing() {
  if (!pairingWindow) {
    pairingWindow = new BrowserWindow({
      width: 720,
      height: pairingHeight(tablet?.isConnected() ?? false),
      useContentSize: true,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      title: 'Appairer une tablette',
      webPreferences: { preload },
    });
    pairingWindow.setContentProtection(true);
    pairingWindow.on('closed', () => (pairingWindow = null));
    loadPage(pairingWindow, 'pairing');
  }
  pairingWindow.show();
  if (isMac) app.focus({ steal: true });
}

// Correction d'erreur maximale : le logo posé au centre du code ne gêne pas la lecture.
ipcMain.handle('tablet:pairing', async (): Promise<PairingState> => {
  const url = tablet ? await tablet.pairUrl() : `${RELAY_URL}/#r=autotest`; // pas de tablette dans les autotests
  return {
    qr: await QRCode.toDataURL(url, { width: 416, margin: 0, errorCorrectionLevel: 'H' }),
    connected: tablet?.isConnected() ?? false,
  };
});

// ——— Réglages et premier lancement (§4.8, §4.9) ———

let settingsWindow: BrowserWindow | null = null;
function showSettings(tab?: SettingsTab) {
  if (!settingsWindow) {
    settingsWindow = new BrowserWindow({
      width: 760,
      height: 640,
      minWidth: 640,
      minHeight: 480,
      title: 'Réglages de VibeScreener',
      backgroundColor: '#F5F5F7',
      // macOS : titre et onglets dans une même barre d'outils.
      ...(isMac ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 16, y: 14 } } : {}),
      webPreferences: { preload },
    });
    settingsWindow.setContentProtection(true);
    settingsWindow.on('closed', () => (settingsWindow = null));
    loadPage(settingsWindow, 'settings');
    if (tab) settingsWindow.webContents.once('did-finish-load', () => settingsWindow?.webContents.send('settings:tab', tab));
  } else if (tab) settingsWindow.webContents.send('settings:tab', tab);
  settingsWindow.show();
  if (isMac) app.focus({ steal: true });
}

let welcomeWindow: BrowserWindow | null = null;
function showWelcome() {
  if (!welcomeWindow) {
    welcomeWindow = new BrowserWindow({
      width: 720,
      height: 520,
      useContentSize: true,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      title: 'Bienvenue dans VibeScreener',
      ...(isMac ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 16, y: 13 } } : {}),
      webPreferences: { preload },
    });
    welcomeWindow.setContentProtection(true);
    welcomeWindow.on('closed', () => (welcomeWindow = null));
    loadPage(welcomeWindow, 'welcome');
  }
  welcomeWindow.show();
  if (isMac) app.focus({ steal: true });
}

/** Autorisations système : enregistrement de l'écran (macOS seulement) et micro. */
function permissions() {
  const status = (kind: 'screen' | 'microphone') =>
    isMac || process.platform === 'win32' ? systemPreferences.getMediaAccessStatus(kind) : 'granted';
  return { screen: isMac ? status('screen') : 'granted', microphone: status('microphone') };
}

/** L'assistant s'ouvre au premier lancement, puis tant qu'une autorisation nécessaire manque
 *  (après une mise à jour, macOS oublie celles de l'app non signée). */
function setupNeeded() {
  const p = permissions();
  const { firstRunDone, commentMode } = settings.get();
  return !firstRunDone || p.screen !== 'granted' || (commentMode !== 'keyboard' && p.microphone !== 'granted');
}

function settingsState(): SettingsState {
  return {
    ...settings.view(),
    platform: isMac ? 'mac' : process.platform === 'win32' ? 'win' : 'other',
    shortcutLabel: shortcutLabel(settings.get().shortcut),
    shortcutOk: shortcutRegistered,
    permissions: permissions(),
    modelPresent: transcriber.status().state !== 'missing' || settings.get().engine === 'api',
    whisper: transcriber.status(),
    tabletPaired: tablet?.isPaired() ?? false,
    tabletConnected: tablet?.isConnected() ?? false,
    mcp: mcpStatus,
    license: license.view(),
  };
}

function broadcastSettings() {
  const state = settingsState();
  settingsWindow?.webContents.send('settings:changed', state);
  welcomeWindow?.webContents.send('settings:changed', state);
  editor?.webContents.send('settings:changed', state);
  updateTrayMenu();
}

ipcMain.handle('settings:get', () => settingsState());
ipcMain.on('settings:open', (_e, tab?: SettingsTab) => showSettings(tab));
ipcMain.on('clipboard:write', (_e, text: string) => clipboard.writeText(text));
ipcMain.handle('settings:update', async (_e, patch: Partial<Settings>) => {
  const before = settings.get();
  if (patch.shortcut && patch.shortcut !== before.shortcut && !registerShortcut(patch.shortcut)) {
    registerShortcut(before.shortcut);
    return { ok: false, error: `${shortcutLabel(patch.shortcut)} est déjà pris par une autre application.` };
  }
  const after = settings.update(patch);
  // Contexte du projet : il s'applique aussi à la session ouverte (historique compris, ⌘Z ne le défait pas).
  if (after.context !== before.context) store.update((s) => (s.context = after.context || undefined), { patchHistory: true });
  if (patch.openAtLogin !== undefined && !autotest) app.setLoginItemSettings({ openAtLogin: patch.openAtLogin });
  if (after.language !== before.language || after.glossary !== before.glossary) void transcriber.restart().then(broadcastSettings);
  broadcastSettings();
  return { ok: true };
});
ipcMain.handle('settings:api-key', (_e, key: string) => {
  settings.setApiKey(key);
  broadcastSettings();
});
ipcMain.handle('settings:choose-export-dir', async () => {
  const r = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'], defaultPath: settings.get().exportDir });
  return r.canceled ? undefined : r.filePaths[0];
});
ipcMain.handle('settings:download-model', async (e) => {
  try {
    await mkdir(modelDir, { recursive: true });
    let last = -1;
    await downloadFile(MODEL_URL, join(modelDir, MODEL_FILE), (done, total) => {
      const pct = total ? Math.floor((done / total) * 100) : 0;
      if (pct !== last) e.sender.send('settings:download-progress', (last = pct));
    });
    await transcriber.restart();
    broadcastSettings();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});
ipcMain.handle('settings:permission', async (_e, kind: 'screen' | 'microphone') => {
  if (kind === 'microphone' && isMac && (await systemPreferences.askForMediaAccess('microphone'))) return broadcastSettings();
  if (kind === 'screen') await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } }).catch(() => {});
  const pane = kind === 'screen' ? 'Privacy_ScreenCapture' : 'Privacy_Microphone';
  void shell.openExternal(
    isMac ? `x-apple.systempreferences:com.apple.preference.security?${pane}` : 'ms-settings:privacy-microphone',
  );
  broadcastSettings();
});
ipcMain.handle('tablet:revoke', async () => {
  await tablet?.revoke();
  broadcastSettings();
});
ipcMain.on('tablet:pair', () => showPairing());
ipcMain.handle('license:activate', async (_e, key: string) => {
  const r = await license.activate(key);
  broadcastSettings();
  return r;
});
ipcMain.on('license:open', (_e, page: 'buy' | 'portal') => void shell.openExternal(page === 'buy' ? `${SITE_URL}/#tarifs` : polar.portal));

// ——— Fenêtre de mesures du lot 0 ———

function showPoc() {
  if (!pocWindow) {
    pocWindow = new BrowserWindow({ width: 560, height: 760, title: 'VibeScreener — mesures', webPreferences: { preload } });
    pocWindow.setContentProtection(true);
    pocWindow.on('closed', () => (pocWindow = null));
    loadPage(pocWindow, 'poc');
  }
  pocWindow.show();
}

async function transcribe(wav: Uint8Array) {
  const server = transcriber.server();
  if (!server) throw new Error('Whisper local indisponible : ' + JSON.stringify(transcriber.status()));
  const { text, ms } = await server.transcribe(wav);
  return { text, whisperMs: ms, audioMs: wavDurationMs(wav) };
}

// ——— IPC ———

ipcMain.handle('session:get', () => store.get());
ipcMain.handle('annotation:add', (_e, captureId: string, geometry: Geometry) => store.addAnnotation(captureId, geometry));
ipcMain.on('annotation:update', (_e, id: string, patch: { text?: string; geometry?: Geometry }) =>
  store.update(
    (s) => {
      const found = findAnnotation(s, id);
      if (!found) return;
      Object.assign(found.annotation, patch, { updatedAt: new Date().toISOString() });
    },
    // La frappe dans un même commentaire ne fait qu'une étape d'annulation.
    { undoable: true, coalesceKey: patch.text !== undefined ? `text:${id}` : undefined },
  ),
);
ipcMain.on('annotation:delete', (_e, id: string) =>
  store.update(
    (s) => {
      for (const c of s.captures) c.annotations = c.annotations.filter((a) => a.id !== id);
    },
    { undoable: true },
  ),
);
ipcMain.on('annotation:discard', (_e, id: string) => store.discard(id));
ipcMain.on('session:update', (_e, patch: Pick<Session, 'name'>) =>
  store.update((s) => Object.assign(s, patch), { undoable: true, coalesceKey: `session:${Object.keys(patch).join()}` }),
);
// Écran supprimé avec ses points ; son image reste sur le disque pour que ⌘Z le fasse revenir.
ipcMain.on('capture:delete', (_e, id: string) =>
  store.update((s) => (s.captures = s.captures.filter((c) => c.id !== id)), { undoable: true }),
);
// Toutes les sessions (éditeur) : ouvrir, ou mettre à la corbeille après confirmation.
ipcMain.handle('sessions:list', () => store.recent(Infinity));
ipcMain.handle('session:open', (_e, id: string) => store.open(id));
ipcMain.handle('session:trash', async (_e, id: string) => {
  const target = (await store.recent(Infinity)).find((r) => r.id === id);
  const dir = join(store.sessionsDir, id);
  if (!target || dirname(dir) !== store.sessionsDir) return false;
  const { response } = await dialog.showMessageBox({
    type: 'warning',
    message: `Mettre la session « ${target.name} » à la corbeille ?`,
    detail: 'Ses captures et ses commentaires partent avec elle. Elle reste récupérable depuis la corbeille.',
    buttons: ['Mettre à la corbeille', 'Annuler'],
    defaultId: 1,
    cancelId: 1,
  });
  if (response !== 0) return false;
  if (store.get()?.id === id) await store.close();
  await shell.trashItem(dir).catch((err) => dialog.showMessageBox({ type: 'warning', message: `Mise à la corbeille impossible : ${err}` }));
  updateTrayMenu();
  return true;
});
// Remarques générales : une liste, chaque remarque tapée ou dictée comme un commentaire de point.
ipcMain.handle('note:add', () => store.addNote());
ipcMain.on('note:update', (_e, id: string, text: string) =>
  store.update(
    (s) => {
      const n = s.notes?.find((x) => x.id === id);
      if (n) Object.assign(n, { text, updatedAt: new Date().toISOString() });
    },
    { undoable: true, coalesceKey: `text:${id}` },
  ),
);
ipcMain.on('note:delete', (_e, id: string) => store.update((s) => (s.notes = s.notes?.filter((n) => n.id !== id)), { undoable: true }));
ipcMain.on('sketch:delete', (_e, annotationId: string, sketchId: string) =>
  store.update(
    (s) => {
      const a = findAnnotation(s, annotationId)?.annotation;
      if (a) a.sketches = a.sketches.filter((k) => k.id !== sketchId);
    },
    { undoable: true },
  ),
);
ipcMain.on('inspiration:capture', (_e, id: string) => {
  editor?.hide();
  inspirationFor = id;
});
ipcMain.on('inspiration:import', (_e, id: string, png: Uint8Array) => void store.addInspiration(id, png));
ipcMain.on('inspiration:delete', (_e, annotationId: string, inspirationId: string) =>
  store.update(
    (s) => {
      const a = findAnnotation(s, annotationId)?.annotation;
      if (a) a.inspirations = a.inspirations?.filter((k) => k.id !== inspirationId);
    },
    { undoable: true },
  ),
);
ipcMain.on('editor:selection', (_e, annotationId: string | null) => tablet?.setFocus(annotationId));
ipcMain.handle('tablet:status', () => tablet?.isConnected() ?? false);
ipcMain.on('session:undo', () => store.undo());
ipcMain.on('session:redo', () => store.redo());
ipcMain.handle('dictation:available', () => transcriber.available());
ipcMain.on('dictation:submit', (_e, id: string, samples: Float32Array) => void dictation.submit(id, encodeWav(samples)));
ipcMain.on('dictation:retry', (_e, id: string) => dictation.retry(id));
ipcMain.on('dictation:recording', (_e, on: boolean) => {
  recording = on;
  updateTrayMenu();
});
ipcMain.handle('session:export', (_e, format: ExportFormat) => runExport(format));
ipcMain.handle('shortcut:status', () => ({ accelerator: settings.get().shortcut, registered: shortcutRegistered }));
ipcMain.handle('whisper:status', () => transcriber.status());
ipcMain.handle('dictee:transcribe', (_e, samples: Float32Array) => transcribe(encodeWav(samples)));
ipcMain.handle('dictee:sample', async () =>
  transcribe(new Uint8Array(await readFile(join(app.getAppPath(), 'fixtures', 'dictee-fr.wav')))),
);
ipcMain.on('capture:start', () => startCapture());

// ——— Test de bout en bout sans interaction ———

async function runEditorAutotest() {
  const out = process.env.PASTILLE_AUTOTEST_OUT ?? join(app.getPath('userData'), 'autotest');
  await mkdir(out, { recursive: true });
  const { session } = await createFakeSession(store.sessionsDir);
  await writeFile(join(app.getPath('userData'), 'state.json'), JSON.stringify({ currentSessionId: session.id }));
  await store.restore();

  await transcriber.restart();
  editor = createEditor();
  await new Promise<void>((r) => editor!.webContents.once('did-finish-load', () => r()));
  const first = session.captures[0]!;
  const target = first.annotations[0]!;
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // Ouvre le point #1 : la dictée démarre seule, le faux micro « parle » pendant ~6 s, puis Entrée.
  // Le micro met un temps variable à s'ouvrir : les 6 s comptent à partir du premier son reçu.
  showEditor({ captureId: first.id, annotationId: target.id, openBubble: true, dictate: true });
  for (let i = 0; i < 100 && !recording; i++) await wait(100);
  await wait(2500);
  await writeFile(join(out, 'editor.png'), (await editor.webContents.capturePage()).toPNG());
  await wait(3500);
  editor.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' });
  let dictated = '';
  // Jusqu'à 2 min : le runner Windows de la CI met ~40 s à transcrire (moins d'1 s sur M1 Pro).
  for (let i = 0; i < 1200 && !dictated; i++) {
    await wait(100);
    const a = store.get() && findAnnotation(store.get()!, target.id)?.annotation;
    if (a?.transcription === 'done' || a?.transcription === 'error') dictated = `${a.transcription} : ${a.text}`;
  }

  // Claude Code par le serveur MCP : l'écran 1 doit arriver avec sa capture, ses zooms, le croquis et l'inspiration.
  const mcpUrl = await mcp.listen(0);
  mcpStatus = { url: mcpUrl };
  const post = async (body: unknown) =>
    (await (await fetch(mcpUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json()) as {
      result?: { content: { type: string }[] };
    };
  await post({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-06-18', clientInfo: { name: 'autotest' } } });
  const reply = await post({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'voir_ecran', arguments: { ecran: 1 } } });
  const mcpImages = reply.result?.content.filter((c) => c.type === 'image').length ?? 0;

  const results = { whisper: transcriber.status().state, dictated, pdf: await runExport('pdf'), markdown: await runExport('markdown'), pptx: await runExport('pptx'), mcpImages };

  // Liste de toutes les sessions, par-dessus l'éditeur, puis refermée (Échap).
  editor.webContents.send('editor:sessions');
  await wait(600);
  await writeFile(join(out, 'sessions.png'), (await editor.webContents.capturePage()).toPNG());
  editor.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
  // Onglet « Remarques générales » du panneau de droite.
  await wait(300);
  await editor.webContents.executeJavaScript(`document.querySelectorAll('[role="tab"]')[1].click()`);
  await wait(300);
  await writeFile(join(out, 'editor-notes.png'), (await editor.webContents.capturePage()).toPNG());

  showSettings();
  await new Promise<void>((r) => settingsWindow!.webContents.once('did-finish-load', () => r()));
  await wait(1000);
  await writeFile(join(out, 'settings.png'), (await settingsWindow!.webContents.capturePage()).toPNG());
  settingsWindow!.webContents.send('settings:tab', 'claude');
  await wait(400);
  await writeFile(join(out, 'settings-claude.png'), (await settingsWindow!.webContents.capturePage()).toPNG());
  settingsWindow!.webContents.send('settings:tab', 'license');
  await wait(400);
  await writeFile(join(out, 'settings-license.png'), (await settingsWindow!.webContents.capturePage()).toPNG());
  await photographScreens(out);
  console.log('AUTOTEST', JSON.stringify({ out, ...results }));
}

/** Photos des autres fenêtres, dans des fenêtres de test (rien n'est cliqué). */
async function photographScreens(out: string) {
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  async function photo(name: string, page: Page, width: number, height: number, prepare?: (win: BrowserWindow) => Promise<void>, hash?: string) {
    const win = new BrowserWindow({ width, height, useContentSize: true, webPreferences: { preload } });
    loadPage(win, page, hash);
    await new Promise<void>((r) => win.webContents.once('did-finish-load', () => r()));
    await wait(600);
    await prepare?.(win);
    await writeFile(join(out, `${name}.png`), (await win.webContents.capturePage()).toPNG());
    win.destroy();
  }
  const move = (win: BrowserWindow, x: number, y: number) => win.webContents.sendInputEvent({ type: 'mouseMove', x, y });

  for (const step of [1, 2, 3]) await photo(`welcome-${step}`, 'welcome', 720, 520, undefined, String(step));
  await photo('pairing', 'pairing', 720, pairingHeight(false));
  await photo('menu', 'menu', 330, 560);
  await photo('bar', 'bar', 640, 64);
  await photo('bar-open', 'bar', 640, 64, async (win) => {
    move(win, 320, 32);
    await wait(300);
  });
  await photo('bar-export', 'bar', 640, 64, async (win) => {
    win.webContents.send('bar:export', { format: 'pdf', file: 'vibescreener-revue-2026-10-06-10h30-20261006-1452.pdf', copied: true });
    await wait(300);
  });
  await photo('overlay', 'overlay', 1280, 800, async (win) => {
    const img = (await editor!.webContents.capturePage()).resize({ width: 1280, height: 800 }); // un écran à capturer
    const session = store.get()!;
    win.webContents.send('overlay:show', { jpeg: img.toJPEG(80), session: session.name, screen: 6, nextNumber: 21 });
    await wait(300);
    win.webContents.send('overlay:windows', [{ x: 300, y: 96, width: 900, height: 620, app: 'Google Chrome', title: 'Tableau de bord' }]);
    move(win, 760, 300);
    await wait(300);
  });
  // Capture de l'inspiration du point #3 : pas de pastille fantôme, rappel du point visé.
  await photo('overlay-inspiration', 'overlay', 1280, 800, async (win) => {
    const img = (await editor!.webContents.capturePage()).resize({ width: 1280, height: 800 });
    win.webContents.send('overlay:show', { jpeg: img.toJPEG(80), session: store.get()!.name, screen: 6, nextNumber: 21, inspiration: 3 });
    await wait(300);
    win.webContents.send('overlay:windows', [{ x: 300, y: 96, width: 900, height: 620, app: 'Google Chrome', title: 'Exemple — Tarifs' }]);
    move(win, 760, 300);
    await wait(300);
  });
}

async function runTabletAutotest() {
  const { session } = await createFakeSession(store.sessionsDir);
  await writeFile(join(app.getPath('userData'), 'state.json'), JSON.stringify({ currentSessionId: session.id }));
  await store.restore();
  await tablet!.start();
  console.log('PAIR', await tablet!.pairUrl());
  const target = session.captures[0]!.annotations[0]!;
  const before = target.sketches.length; // la session factice a déjà un croquis sur ce point
  tablet!.setFocus(target.id);
  for (let i = 0; i < 1800; i++) {
    await new Promise((r) => setTimeout(r, 100));
    const a = findAnnotation(store.get()!, target.id)?.annotation;
    if (a && a.sketches.length > before) {
      console.log('AUTOTEST', JSON.stringify({ sketch: join(store.dir(store.get()!), a.sketches.at(-1)!.png), connected: tablet!.isConnected() }));
      await new Promise((r) => setTimeout(r, 500));
      return;
    }
  }
  console.log('AUTOTEST', JSON.stringify({ sketch: null }));
}

// ——— Démarrage ———

/** macOS : menu de l'app (visible avec l'icône du Dock). Édition garde copier, coller et annuler dans les champs ;
 *  hors d'un champ, l'éditeur intercepte ⌘Z lui-même pour annuler dans la session. */
function appMenu() {
  return Menu.buildFromTemplate([
    {
      label: 'VibeScreener',
      submenu: [
        { role: 'about', label: 'À propos de VibeScreener' },
        { type: 'separator' },
        { label: 'Réglages…', accelerator: 'Command+,', click: () => showSettings() },
        { type: 'separator' },
        { role: 'hide', label: 'Masquer VibeScreener' },
        { role: 'quit', label: 'Quitter VibeScreener' },
      ],
    },
    {
      label: 'Édition',
      submenu: [
        { role: 'undo', label: 'Annuler' },
        { role: 'redo', label: 'Rétablir' },
        { type: 'separator' },
        { role: 'cut', label: 'Couper' },
        { role: 'copy', label: 'Copier' },
        { role: 'paste', label: 'Coller' },
        { role: 'selectAll', label: 'Tout sélectionner' },
      ],
    },
    {
      label: 'Fenêtre',
      role: 'window',
      submenu: [
        { role: 'minimize', label: 'Réduire' },
        { role: 'close', label: 'Fermer' },
      ],
    },
  ]);
}

let capture: ReturnType<typeof createCapture>;
let quitting = false;

if (!autotest && !app.requestSingleInstanceLock()) app.quit();
// « VibeScreener.exe --quit » : install.ps1 ferme proprement l'app avant de la remplacer.
app.on('second-instance', (_e, argv) => (argv.includes('--quit') ? app.quit() : showEditor()));
app.on('window-all-closed', () => {
  // L'app reste active sans fenêtre : icône de la barre de menus (zone de notification sous Windows).
});
app.on('before-quit', (e) => {
  if (quitting) return;
  e.preventDefault();
  quitting = true;
  void finishVideo()
    .then(() => store.flush())
    .finally(() => app.quit());
});
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  clicks.stop();
  tablet?.stop();
  transcriber.stop();
  mcp.close();
});

void app.whenReady().then(async () => {
  if (isMac) {
    Menu.setApplicationMenu(appMenu());
    if (!app.isPackaged) app.dock?.setIcon(join(app.getAppPath(), 'build', 'icon.png')); // l'app installée a la sienne
  }
  // Windows : sans cela, chaque fenêtre porte le menu anglais par défaut d'Electron (File, Edit…).
  else Menu.setApplicationMenu(null);

  // Images de session servies par pastille://session/<id>/<chemin>, sans sortir du dossier des sessions.
  protocol.handle('pastille', (request) => {
    const url = new URL(request.url);
    const file = normalize(join(store.sessionsDir, decodeURIComponent(url.pathname)));
    if (url.host !== 'session' || !file.startsWith(store.sessionsDir + sep)) return new Response(null, { status: 403 });
    return net.fetch(pathToFileURL(file).href);
  });

  // Micro autorisé pour nos propres pages (macOS demande en plus son accord système).
  electronSession.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(permission === 'media'));
  if (isMac) console.log('Enregistrement de l’écran :', systemPreferences.getMediaAccessStatus('screen'));

  await store.restore();
  capture = createCapture({
    preload,
    loadPage,
    onCapture,
    onCancel: () => {
      // Échap pendant une inspiration : retour au point, rien n'est joint.
      const target = inspirationTarget();
      if (target) showEditor({ captureId: target.capture.id, annotationId: target.annotation.id, openBubble: true });
    },
    info: () => {
      const session = store.get();
      return {
        session: session?.name ?? 'Nouvelle revue',
        screen: (session?.captures.length ?? 0) + 1,
        nextNumber: (session ? allAnnotations(session).length : 0) + 1,
        inspiration: inspirationTarget()?.annotation.number,
      };
    },
    onError: (message) => {
      reportCapture({ ok: false, error: message });
      if (!autotest) void dialog.showMessageBox({ type: 'warning', message });
    },
  });

  if (autotest === 'tablet') {
    await runTabletAutotest();
    app.quit();
    return;
  }

  if (autotest === 'editor') {
    await runEditorAutotest();
    app.quit();
    return;
  }

  if (autotest === 'capture') {
    // Mesure automatique : 5 captures, clic simulé au centre de l'écran principal.
    await new Promise((r) => setTimeout(r, 2000));
    for (let i = 0; i < 5; i++) {
      await capture.start();
      await new Promise((r) => setTimeout(r, 300));
      capture.autoPick();
      while (captureResults.length <= i) await new Promise((r) => setTimeout(r, 50));
      if (!captureResults[i]?.ok) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    app.quit();
    return;
  }

  mcpStatus = await mcp.listen(MCP_PORT).then(
    (url) => ({ url }),
    (err: NodeJS.ErrnoException) => ({
      error:
        err.code === 'EADDRINUSE'
          ? `Le port ${MCP_PORT} est déjà pris (une autre copie de VibeScreener ?) : Claude Code ne peut pas se connecter.`
          : `Serveur pour Claude Code indisponible : ${err.message}`,
    }),
  );
  if (!registerShortcut(settings.get().shortcut)) {
    void dialog.showMessageBox({
      type: 'warning',
      message: `Le raccourci ${shortcutLabel(settings.get().shortcut)} est déjà pris par une autre application.`,
      detail: 'Choisis-en un autre dans les réglages. Les captures restent possibles depuis l’icône de VibeScreener.',
    });
  }
  try {
    if (!globalShortcut.register(VIDEO_SHORTCUT, () => void toggleVideo())) throw new Error();
  } catch {
    void dialog.showMessageBox({
      type: 'warning',
      message: `Le raccourci ${shortcutLabel(VIDEO_SHORTCUT)} du mode vidéo est déjà pris par une autre application.`,
      detail: 'Le mode vidéo reste disponible depuis l’icône de VibeScreener.',
    });
  }
  // Écran branché ou débranché : les flux filmés ne correspondent plus, l'enregistrement s'arrête.
  const stopOnDisplayChange = () => video.isRecording() && void stopVideo();
  screen.on('display-added', stopOnDisplayChange);
  screen.on('display-removed', stopOnDisplayChange);
  menubar.start();
  void lookForUpdate();
  checkLicense();
  // L'app reste lancée des jours ; la clé n'est revérifiée qu'une fois par jour.
  setInterval(() => {
    void lookForUpdate();
    checkLicense();
  }, 6 * 3600_000);
  if (process.env.PASTILLE_POC) showPoc(); // fenêtre de mesures du lot 0, hors du menu
  editor = createEditor(); // préchargé pour s'ouvrir sans attendre après une capture
  app.on('activate', () => showEditor()); // macOS : clic sur l'icône du Dock
  void transcriber.restart().then(() => {
    // Assistant de premier lancement (§4.9), rouvert si une autorisation manque. Sinon, un modèle manquant ouvre les réglages.
    if (setupNeeded()) showWelcome();
    else if (settings.get().engine === 'local' && transcriber.status().state === 'missing') showSettings('transcription');
  });
  dictation.resume();
  void tablet?.start();
});
