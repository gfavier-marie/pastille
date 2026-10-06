// Processus principal : toute la logique vit ici, les fenêtres ne font qu'afficher.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync, mkdirSync, mkdtempSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, normalize, sep } from 'node:path';
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
  net,
  protocol,
  session as electronSession,
  shell,
  systemPreferences,
} from 'electron';
import { allAnnotations, findAnnotation, newNote, type Annotation, type Geometry, type Session } from '@pastille/shared';
import type { CaptureResult, EditorFocus, ExportFormat, ExportResult, MenuAction, MenuState, PairingState, SettingsState, SettingsTab } from '../ipc.ts';
import { createCapture, type CapturedImage } from './capture.ts';
import { createDictation } from './dictation.ts';
import { createMenubar } from './menubar.ts';
import { exportSession } from './export/index.ts';
import { createFakeSession } from './export/fixture.ts';
import { createMcp, MCP_PORT } from './mcp.ts';
import { createSessionStore } from './session-store.ts';
import { createTablet } from './tablet.ts';
import QRCode from 'qrcode';
import { encodeWav, wavDurationMs } from './wav.ts';
import { createSettings, type Settings } from './settings.ts';
import { createTranscriber } from './transcriber.ts';
import { downloadFile, MODEL_FILE, MODEL_URL } from './whisper.ts';

const isMac = process.platform === 'darwin';
const repoRoot = join(app.getAppPath(), '..', '..');
const preload = join(import.meta.dirname, '../preload/index.cjs');
// Relais de la tablette : local en développement, l'URL du Worker déployé sinon (PASTILLE_RELAY).
const RELAY_URL = process.env.PASTILLE_RELAY ?? 'http://localhost:8787';
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
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'pastille', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

type Page = 'editor' | 'poc' | 'overlay' | 'settings' | 'menu' | 'bar' | 'welcome' | 'pairing';
function loadPage(win: BrowserWindow, page: Page, hash = '') {
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl) void win.loadURL(`${devUrl}/${page}.html${hash && `#${hash}`}`);
  else void win.loadFile(join(import.meta.dirname, '../renderer', `${page}.html`), { hash });
}

const store = createSessionStore(app.getPath('userData'), (s) => {
  editor?.webContents.send('session:changed', s);
  updateTrayMenu();
  tablet?.refresh();
});
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
const settings = createSettings(app.getPath('userData'), app.getPath('documents'));
const exportDir = () => (autotest ? join(app.getPath('userData'), 'exports') : settings.get().exportDir);
const modelDir = join(app.getPath('userData'), 'models');
// Serveur MCP pour Claude Code : son adresse, ou l'erreur affichée dans les réglages.
const mcp = createMcp({ store, instructions: () => settings.get().instructions });
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
let recording = false; // une dictée est en cours dans l'éditeur

/** « CommandOrControl+Shift+2 » → « ⇧⌘2 » ou « Ctrl+Shift+2 ». */
function shortcutLabel(accelerator: string) {
  if (!isMac) return accelerator.replace('CommandOrControl', 'Ctrl').replace('CmdOrCtrl', 'Ctrl');
  const symbols: Record<string, string> = { CommandOrControl: '⌘', CmdOrCtrl: '⌘', Command: '⌘', Cmd: '⌘', Shift: '⇧', Alt: '⌥', Option: '⌥', Control: '⌃', Ctrl: '⌃' };
  const order = '⌃⌥⇧⌘'; // ordre des menus de macOS
  const keys = accelerator.split('+').map((k) => symbols[k] ?? k);
  return keys.sort((a, b) => (order.indexOf(a) + 1 || 9) - (order.indexOf(b) + 1 || 9)).join('');
}

/** Raccourci global ; s'il est déjà pris, l'ancien est gardé et l'échec signalé (§4.2). */
function registerShortcut(accelerator: string): boolean {
  globalShortcut.unregisterAll();
  try {
    shortcutRegistered = globalShortcut.register(accelerator, () => startCapture());
  } catch {
    shortcutRegistered = false;
  }
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
  // Fermer cache la fenêtre : elle reste prête pour la prochaine capture.
  win.on('close', (e) => {
    if (!quitting) {
      e.preventDefault();
      win.hide();
    }
  });
  loadPage(win, 'editor');
  return win;
}

function showEditor(focus?: EditorFocus) {
  editor ??= createEditor();
  if (focus) editor.webContents.send('editor:focus', focus);
  editor.show();
  if (isMac) app.focus({ steal: true });
  editor.focus();
}

// ——— Captures ———

function startCapture() {
  welcomeWindow?.webContents.send('welcome:shortcut');
  // Le micro chauffe pendant que l'utilisateur vise : la dictée démarre sans délai au clic.
  editor?.webContents.send('editor:prepare-mic');
  void capture.start();
}

async function onCapture(c: CapturedImage) {
  const capture = await store.addCapture(c.png, {
    width: c.width,
    height: c.height,
    scaleFactor: c.scaleFactor,
    source: { app: c.app, windowTitle: c.title, displayId: c.displayId },
  });
  let annotationId: string | undefined;
  if (c.point) annotationId = addAnnotation(capture.id, { kind: 'point', ...c.point });
  showEditor({ captureId: capture.id, annotationId, openBubble: !!annotationId });
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

function addAnnotation(captureId: string, geometry: Geometry): string {
  const now = new Date().toISOString();
  const annotation: Annotation = {
    id: crypto.randomUUID(),
    number: 0,
    geometry,
    text: '',
    input: 'typed',
    transcription: 'none',
    sketches: [],
    createdAt: now,
    updatedAt: now,
  };
  store.update((s) => s.captures.find((c) => c.id === captureId)?.annotations.push(annotation), { undoable: true });
  return annotation.id;
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
    recents: recents.map(({ id, name, points, screens, updatedAt }) => ({ id, name, points, screens, updatedAt })),
  };
}

let lastExport: string | null = null;

function onMenuAction(a: MenuAction) {
  switch (a.type) {
    case 'capture':
      return startCapture();
    case 'editor':
      return showEditor();
    case 'export':
      return void exportFromMenu('pdf');
    case 'new-session':
      return void store.close();
    case 'pair':
      return showPairing();
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
      return void store.open(a.id).then(() => showEditor());
    case 'export-recent':
      return void store.open(a.id).then(() => exportFromMenu('pdf'));
  }
}

const menubar = createMenubar({
  preload,
  loadPage,
  state: menuState,
  recording: () => recording,
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

function settingsState(): SettingsState {
  const permission = (kind: 'screen' | 'microphone') =>
    isMac || process.platform === 'win32' ? systemPreferences.getMediaAccessStatus(kind) : 'granted';
  return {
    ...settings.view(),
    platform: isMac ? 'mac' : process.platform === 'win32' ? 'win' : 'other',
    shortcutLabel: shortcutLabel(settings.get().shortcut),
    shortcutOk: shortcutRegistered,
    permissions: { screen: isMac ? permission('screen') : 'granted', microphone: permission('microphone') },
    modelPresent: transcriber.status().state !== 'missing' || settings.get().engine === 'api',
    whisper: transcriber.status(),
    tabletPaired: tablet?.isPaired() ?? false,
    tabletConnected: tablet?.isConnected() ?? false,
    mcp: mcpStatus,
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
ipcMain.handle('settings:update', async (_e, patch: Partial<Settings>) => {
  const before = settings.get();
  if (patch.shortcut && patch.shortcut !== before.shortcut && !registerShortcut(patch.shortcut)) {
    registerShortcut(before.shortcut);
    return { ok: false, error: `${shortcutLabel(patch.shortcut)} est déjà pris par une autre application.` };
  }
  const after = settings.update(patch);
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
ipcMain.handle('annotation:add', (_e, captureId: string, geometry: Geometry) => addAnnotation(captureId, geometry));
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
ipcMain.on('session:update', (_e, patch: Pick<Session, 'name' | 'context'>) =>
  store.update((s) => Object.assign(s, patch), { undoable: true, coalesceKey: `session:${Object.keys(patch).join()}` }),
);
// Remarques générales : une liste, chaque remarque tapée ou dictée comme un commentaire de point.
ipcMain.handle('note:add', () => {
  const note = newNote();
  store.update((s) => (s.notes = [...(s.notes ?? []), note]), { undoable: true });
  return note.id;
});
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
  showEditor({ captureId: first.id, annotationId: target.id, openBubble: true });
  await wait(2500);
  await writeFile(join(out, 'editor.png'), (await editor.webContents.capturePage()).toPNG());
  await wait(3500);
  editor.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' });
  let dictated = '';
  for (let i = 0; i < 300 && !dictated; i++) {
    await wait(100);
    const a = store.get() && findAnnotation(store.get()!, target.id)?.annotation;
    if (a?.transcription === 'done' || a?.transcription === 'error') dictated = `${a.transcription} : ${a.text}`;
  }

  // Claude Code par le serveur MCP : l'écran 1 doit arriver avec sa capture, ses zooms et le croquis.
  const mcpUrl = await mcp.listen(0);
  mcpStatus = { url: mcpUrl };
  const call = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'voir_ecran', arguments: { ecran: 1 } } };
  const reply = (await (await fetch(mcpUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(call) })).json()) as {
    result?: { content: { type: string }[] };
  };
  const mcpImages = reply.result?.content.filter((c) => c.type === 'image').length ?? 0;

  const results = { whisper: transcriber.status().state, dictated, pdf: await runExport('pdf'), markdown: await runExport('markdown'), pptx: await runExport('pptx'), mcpImages };

  showSettings();
  await new Promise<void>((r) => settingsWindow!.webContents.once('did-finish-load', () => r()));
  await wait(1000);
  await writeFile(join(out, 'settings.png'), (await settingsWindow!.webContents.capturePage()).toPNG());
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

let capture: ReturnType<typeof createCapture>;
let quitting = false;

if (!autotest && !app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => showEditor());
app.on('window-all-closed', () => {
  // Application de barre de menus : elle reste active sans fenêtre.
});
app.on('before-quit', (e) => {
  if (quitting) return;
  e.preventDefault();
  quitting = true;
  void store.flush().finally(() => app.quit());
});
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  tablet?.stop();
  transcriber.stop();
  mcp.close();
});

void app.whenReady().then(async () => {
  if (isMac) app.dock?.hide();

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
    info: () => {
      const session = store.get();
      return {
        session: session?.name ?? 'Nouvelle revue',
        screen: (session?.captures.length ?? 0) + 1,
        nextNumber: (session ? allAnnotations(session).length : 0) + 1,
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
  menubar.start();
  if (process.env.PASTILLE_POC) showPoc(); // fenêtre de mesures du lot 0, hors du menu
  editor = createEditor(); // préchargé pour s'ouvrir sans attendre après une capture
  void transcriber.restart().then(() => {
    // Premier lancement (§4.9) : l'assistant s'ouvre. Plus tard, un modèle manquant ouvre les réglages.
    if (!settings.get().firstRunDone) showWelcome();
    else if (settings.get().engine === 'local' && transcriber.status().state === 'missing') showSettings('transcription');
  });
  dictation.resume();
  void tablet?.start();
  if (isMac) void systemPreferences.askForMediaAccess('microphone');
});
