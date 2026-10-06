// Processus principal : toute la logique vit ici, les fenêtres ne font qu'afficher.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, normalize, sep } from 'node:path';
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
  nativeImage,
  net,
  protocol,
  session as electronSession,
  shell,
  systemPreferences,
  Tray,
} from 'electron';
import { allAnnotations, findAnnotation, type Annotation, type Geometry, type Session } from '@pastille/shared';
import type { CaptureResult, EditorFocus, ExportFormat, ExportResult, SettingsState } from '../ipc.ts';
import { createCapture, type CapturedImage } from './capture.ts';
import { createDictation } from './dictation.ts';
import { exportSession } from './export/index.ts';
import { createFakeSession } from './export/fixture.ts';
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
if (autotest === 'editor') {
  // Faux micro qui joue l'échantillon de dictée : la chaîne micro → Whisper → commentaire est testée sans personne.
  app.commandLine.appendSwitch('use-fake-device-for-media-stream');
  app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
  app.commandLine.appendSwitch('use-file-for-fake-audio-capture', join(app.getAppPath(), 'fixtures', 'dictee-fr.wav'));
  app.commandLine.appendSwitch('disable-features', 'AudioServiceOutOfProcess'); // sinon le bac à sable audio ne lit pas le fichier
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'pastille', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

type Page = 'editor' | 'poc' | 'overlay' | 'settings';
function loadPage(win: BrowserWindow, page: Page) {
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl) void win.loadURL(`${devUrl}/${page}.html`);
  else void win.loadFile(join(import.meta.dirname, '../renderer', `${page}.html`));
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
        updateTrayMenu();
      },
    });
const settings = createSettings(app.getPath('userData'), app.getPath('documents'));
const exportDir = () => (autotest ? join(app.getPath('userData'), 'exports') : settings.get().exportDir);
const modelDir = join(app.getPath('userData'), 'models');
const transcriber = createTranscriber({
  binDirs: app.isPackaged ? [join(process.resourcesPath, 'whisper')] : [join(repoRoot, 'vendor', 'whisper')],
  modelDirs: app.isPackaged ? [modelDir] : [modelDir, join(repoRoot, 'models')],
  settings,
});

let editor: BrowserWindow | null = null;
let pocWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
// La file attend que le modèle soit chargé ; sans moteur, la dictée passe en erreur (audio conservé).
const dictation = createDictation(store, (wav) => transcriber.transcribe(wav));
let shortcutRegistered = false;
let recording = false; // une dictée est en cours dans l'éditeur

/** « CommandOrControl+Shift+2 » → « ⌘⇧2 » ou « Ctrl+Shift+2 ». */
function shortcutLabel(accelerator: string) {
  if (!isMac) return accelerator.replace('CommandOrControl', 'Ctrl').replace('CmdOrCtrl', 'Ctrl');
  const symbols: Record<string, string> = { CommandOrControl: '⌘', CmdOrCtrl: '⌘', Command: '⌘', Cmd: '⌘', Shift: '⇧', Alt: '⌥', Option: '⌥', Control: '⌃', Ctrl: '⌃' };
  return accelerator.split('+').map((k) => symbols[k] ?? k).join('');
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
    title: 'Pastille',
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
    const list = (nums: number[]) => nums.map((n) => `#${n}`).join(', ');
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
    if (!autotest) shell.showItemInFolder(path);
    if (!autotest && format === 'pdf') copyFileToClipboard(path);
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

// ——— Icône et menu (§4.7) ———

let recentSessions: Awaited<ReturnType<typeof store.recent>> = [];
let trayTimer: ReturnType<typeof setTimeout> | null = null;

/** Menu et état de l'icône ; regroupé pour ne pas reconstruire le menu à chaque frappe. */
function updateTrayMenu() {
  if (trayTimer) return;
  trayTimer = setTimeout(() => {
    trayTimer = null;
    void store.recent().then((list) => {
      recentSessions = list;
      buildTrayMenu();
    });
  }, 300);
}

function buildTrayMenu() {
  if (!tray) return;
  const session = store.get();
  const count = session?.captures.reduce((n, c) => n + c.annotations.length, 0) ?? 0;
  const { pending } = dictation.unfinished();
  // État de l'icône (§4.7) : nombre de points, transcriptions en cours, tablette.
  if (isMac) tray.setTitle(session ? `${count}${pending.length ? ' …' : ''}` : '');
  tray.setToolTip(
    [
      session ? `Pastille — ${session.name} (${count} points)` : 'Pastille',
      pending.length ? `${pending.length} transcription(s) en cours` : '',
      tablet?.isConnected() ? 'tablette connectée' : '',
    ]
      .filter(Boolean)
      .join(' · '),
  );
  const others = recentSessions.filter((r) => r.id !== session?.id);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: session ? `${session.name} · ${count} points` : 'Aucune session ouverte', enabled: false },
      { type: 'separator' },
      { label: `Nouvelle capture (${shortcutLabel(settings.get().shortcut)})`, click: () => startCapture() },
      { label: 'Nouvelle session', click: () => void store.close() },
      { label: "Ouvrir l'éditeur", click: () => showEditor() },
      {
        label: 'Sessions récentes',
        enabled: others.length > 0,
        submenu: others.map((r) => ({
          label: `${r.name} · ${r.points} points`,
          click: () => void store.open(r.id).then(() => showEditor()),
        })),
      },
      { type: 'separator' },
      { label: 'Exporter le PDF', enabled: !!session, click: () => void exportFromMenu('pdf') },
      { label: 'Exporter en Markdown', enabled: !!session, click: () => void exportFromMenu('markdown') },
      { label: 'Exporter en PowerPoint', enabled: !!session, click: () => void exportFromMenu('pptx') },
      { type: 'separator' },
      { label: tablet?.isConnected() ? 'Tablette connectée' : 'Appairer une tablette (QR)', click: () => void showPairing() },
      { label: 'Réglages…', click: () => showSettings() },
      { label: 'Mesures (POC)', click: () => showPoc() },
      { type: 'separator' },
      { label: 'Quitter', role: 'quit' },
    ]),
  );
}

function createTray() {
  const icon = nativeImage.createFromPath(join(app.getAppPath(), 'resources', isMac ? 'trayTemplate.png' : 'tray.png'));
  if (isMac) icon.setTemplateImage(true);
  tray = new Tray(icon);
  updateTrayMenu();
}

// ——— Appairage de la tablette (§5.1) ———

let pairingWindow: BrowserWindow | null = null;
async function showPairing() {
  const url = await tablet!.pairUrl();
  const qr = await QRCode.toDataURL(url, { width: 360, margin: 1 });
  const html = `<!doctype html><meta charset="utf-8"><title>Appairer une tablette</title>
<body style="font:14px -apple-system,'Segoe UI',sans-serif;text-align:center;padding:20px;margin:0">
<h2 style="margin:0 0 12px">Appairer une tablette</h2>
<img src="${qr}" width="300" height="300" alt="QR code d'appairage">
<p>Scanne ce code avec l'appareil photo de la tablette.<br>La PWA s'ouvre déjà liée à cet ordinateur ;<br>ajoute-la à l'écran d'accueil.</p>
<p style="color:#888;font-size:11px;word-break:break-all">${url.replace(/&k=.*/, '&k=…')}</p></body>`;
  pairingWindow?.destroy();
  pairingWindow = new BrowserWindow({ width: 420, height: 560, title: 'Appairer une tablette', resizable: false });
  pairingWindow.setContentProtection(true);
  pairingWindow.on('closed', () => (pairingWindow = null));
  void pairingWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

// ——— Réglages et premier lancement (§4.8, §4.9) ———

let settingsWindow: BrowserWindow | null = null;
function showSettings() {
  if (!settingsWindow) {
    settingsWindow = new BrowserWindow({ width: 640, height: 780, title: 'Réglages de Pastille', webPreferences: { preload } });
    settingsWindow.setContentProtection(true);
    settingsWindow.on('closed', () => (settingsWindow = null));
    loadPage(settingsWindow, 'settings');
  }
  settingsWindow.show();
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
  };
}

function broadcastSettings() {
  const state = settingsState();
  settingsWindow?.webContents.send('settings:changed', state);
  editor?.webContents.send('settings:changed', state);
  updateTrayMenu();
}

ipcMain.handle('settings:get', () => settingsState());
ipcMain.handle('settings:update', async (_e, patch: Partial<Settings>) => {
  const before = settings.get();
  if (patch.shortcut && patch.shortcut !== before.shortcut && !registerShortcut(patch.shortcut)) {
    registerShortcut(before.shortcut);
    return { ok: false, error: `${shortcutLabel(patch.shortcut)} est déjà pris par une autre application.` };
  }
  const after = settings.update(patch);
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
ipcMain.on('tablet:pair', () => void showPairing());

// ——— Fenêtre de mesures du lot 0 ———

function showPoc() {
  if (!pocWindow) {
    pocWindow = new BrowserWindow({ width: 560, height: 760, title: 'Pastille — mesures', webPreferences: { preload } });
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

  const results = { dictated, pdf: await runExport('pdf'), markdown: await runExport('markdown'), pptx: await runExport('pptx') };

  showSettings();
  await new Promise<void>((r) => settingsWindow!.webContents.once('did-finish-load', () => r()));
  await wait(1000);
  await writeFile(join(out, 'settings.png'), (await settingsWindow!.webContents.capturePage()).toPNG());
  console.log('AUTOTEST', JSON.stringify({ out, ...results }));
}

async function runTabletAutotest() {
  const { session } = await createFakeSession(store.sessionsDir);
  await writeFile(join(app.getPath('userData'), 'state.json'), JSON.stringify({ currentSessionId: session.id }));
  await store.restore();
  await tablet!.start();
  console.log('PAIR', await tablet!.pairUrl());
  const target = session.captures[0]!.annotations[0]!;
  tablet!.setFocus(target.id);
  for (let i = 0; i < 1800; i++) {
    await new Promise((r) => setTimeout(r, 100));
    const a = findAnnotation(store.get()!, target.id)?.annotation;
    if (a?.sketches.length) {
      console.log('AUTOTEST', JSON.stringify({ sketch: join(store.dir(store.get()!), a.sketches[0]!.png), connected: tablet!.isConnected() }));
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

  if (!registerShortcut(settings.get().shortcut)) {
    void dialog.showMessageBox({
      type: 'warning',
      message: `Le raccourci ${shortcutLabel(settings.get().shortcut)} est déjà pris par une autre application.`,
      detail: 'Choisis-en un autre dans les réglages. Les captures restent possibles depuis l’icône de Pastille.',
    });
  }
  createTray();
  editor = createEditor(); // préchargé pour s'ouvrir sans attendre après une capture
  void transcriber.restart().then(() => {
    // Premier lancement (§4.9), ou modèle absent : l'assistant s'ouvre.
    if (!settings.get().firstRunDone || transcriber.status().state === 'missing') showSettings();
  });
  dictation.resume();
  void tablet?.start();
  if (isMac) void systemPreferences.askForMediaAccess('microphone');
});
