// Processus principal : toute la logique vit ici, les fenêtres ne font qu'afficher.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, normalize, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  app,
  BrowserWindow,
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
import { findAnnotation, type Annotation, type Geometry, type Session } from '@pastille/shared';
import type { CaptureResult, EditorFocus, ExportFormat, ExportResult, WhisperStatus } from '../ipc.ts';
import { createCapture, type CapturedImage } from './capture.ts';
import { createDictation } from './dictation.ts';
import { exportSession } from './export/index.ts';
import { createFakeSession } from './export/fixture.ts';
import { createSessionStore } from './session-store.ts';
import { encodeWav, wavDurationMs } from './wav.ts';
import { findModel, findWhisperBin, startWhisperServer, UI_PROMPT, type WhisperServer } from './whisper.ts';

const isMac = process.platform === 'darwin';
const repoRoot = join(app.getAppPath(), '..', '..');
const preload = join(import.meta.dirname, '../preload/index.cjs');
const SHORTCUT = 'CommandOrControl+Shift+2';
// Tests sans interaction : « capture » (mesure de 5 captures) ou « editor » (session factice,
// photo de l'éditeur, exports PDF et Markdown). Données dans un dossier temporaire.
const autotest = process.env.PASTILLE_AUTOTEST as 'capture' | 'editor' | undefined;
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

type Page = 'editor' | 'poc' | 'overlay';
function loadPage(win: BrowserWindow, page: Page) {
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl) void win.loadURL(`${devUrl}/${page}.html`);
  else void win.loadFile(join(import.meta.dirname, '../renderer', `${page}.html`));
}

const store = createSessionStore(app.getPath('userData'), (s) => {
  editor?.webContents.send('session:changed', s);
  updateTrayMenu();
});
const exportDir = autotest ? join(app.getPath('userData'), 'exports') : join(app.getPath('documents'), 'Pastille');

let editor: BrowserWindow | null = null;
let pocWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let whisper: WhisperServer | null = null;
let whisperStatus: WhisperStatus = { state: 'loading' };
let whisperReady: Promise<void> = Promise.resolve();

// La file attend que le modèle soit chargé ; sans Whisper, la dictée passe en erreur (audio conservé).
const dictation = createDictation(store, async (wav) => {
  await whisperReady;
  if (!whisper) throw new Error('Transcription indisponible : ' + JSON.stringify(whisperStatus));
  return (await whisper.transcribe(wav)).text;
});
let shortcutRegistered = false;

// ——— Éditeur ———

function createEditor() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 800,
    minHeight: 500,
    show: false,
    title: 'Pastille',
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
    const path = await exportSession({ session, sessionDir: store.dir(session), outDir: exportDir, format, printHtml });
    if (!autotest) shell.showItemInFolder(path);
    return { ok: true, path };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

async function exportFromMenu(format: ExportFormat) {
  const r = await runExport(format);
  if (!r.ok) void dialog.showMessageBox({ type: 'warning', message: r.error });
}

// ——— Icône et menu (§4.7) ———

function updateTrayMenu() {
  if (!tray) return;
  const session = store.get();
  const count = session?.captures.reduce((n, c) => n + c.annotations.length, 0) ?? 0;
  tray.setToolTip(session ? `Pastille — ${session.name} (${count} points)` : 'Pastille');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: session ? `${session.name} · ${count} points` : 'Aucune session ouverte', enabled: false },
      { type: 'separator' },
      { label: `Nouvelle capture (${isMac ? '⌘⇧2' : 'Ctrl+Shift+2'})`, click: () => startCapture() },
      { label: 'Nouvelle session', click: () => void store.close() },
      { label: "Ouvrir l'éditeur", click: () => showEditor() },
      { label: 'Exporter le PDF', enabled: !!session, click: () => void exportFromMenu('pdf') },
      { label: 'Exporter en Markdown', enabled: !!session, click: () => void exportFromMenu('markdown') },
      { label: 'Appairer une tablette (QR) — lot 3', enabled: false },
      { label: 'Réglages — lot 4', enabled: false },
      { type: 'separator' },
      { label: 'Mesures (POC)', click: () => showPoc() },
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

function startWhisper() {
  whisperReady = loadWhisper();
}

async function loadWhisper() {
  const bin = findWhisperBin(repoRoot);
  const model = findModel(repoRoot);
  if (!bin || !model) {
    whisperStatus = { state: 'missing', detail: 'Lance « pnpm setup:whisper » (modèle et whisper-server).' };
    return;
  }
  try {
    whisper = await startWhisperServer({ bin, model, prompt: UI_PROMPT });
    whisperStatus = { state: 'ready', loadMs: whisper.loadMs };
  } catch (err) {
    whisperStatus = { state: 'error', detail: String(err) };
  }
}

async function transcribe(wav: Uint8Array) {
  if (!whisper) throw new Error('Transcription indisponible : ' + JSON.stringify(whisperStatus));
  const { text, ms } = await whisper.transcribe(wav);
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
ipcMain.on('session:undo', () => store.undo());
ipcMain.on('session:redo', () => store.redo());
ipcMain.handle('dictation:available', () => whisperStatus.state === 'loading' || whisperStatus.state === 'ready');
ipcMain.on('dictation:submit', (_e, id: string, samples: Float32Array) => void dictation.submit(id, encodeWav(samples)));
ipcMain.on('dictation:retry', (_e, id: string) => dictation.retry(id));
ipcMain.handle('session:export', (_e, format: ExportFormat) => runExport(format));
ipcMain.handle('shortcut:status', () => ({ accelerator: SHORTCUT, registered: shortcutRegistered }));
ipcMain.handle('whisper:status', () => whisperStatus);
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

  startWhisper();
  await whisperReady;
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

  const results = { dictated, pdf: await runExport('pdf'), markdown: await runExport('markdown') };
  console.log('AUTOTEST', JSON.stringify({ out, ...results }));
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
  whisper?.stop();
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
    onError: (message) => {
      reportCapture({ ok: false, error: message });
      if (!autotest) void dialog.showMessageBox({ type: 'warning', message });
    },
  });

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

  shortcutRegistered = globalShortcut.register(SHORTCUT, () => startCapture());
  if (!shortcutRegistered) {
    void dialog.showMessageBox({
      type: 'warning',
      message: `Le raccourci ${isMac ? '⌘⇧2' : 'Ctrl+Shift+2'} est déjà pris par une autre application.`,
      detail: 'Les captures restent possibles depuis l’icône de Pastille. Le choix du raccourci arrive avec les réglages.',
    });
  }
  createTray();
  editor = createEditor(); // préchargé pour s'ouvrir sans attendre après une capture
  startWhisper();
  dictation.resume();
  if (isMac) void systemPreferences.askForMediaAccess('microphone');
});
