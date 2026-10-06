// Processus principal. Lot 0 : POC capture et dictée, avec une fenêtre de mesures.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { app, BrowserWindow, globalShortcut, ipcMain, session, systemPreferences } from 'electron';
import type { CaptureResult, WhisperStatus } from '../ipc.ts';
import { createCapture } from './capture.ts';
import { encodeWav, wavDurationMs } from './wav.ts';
import { findModel, findWhisperBin, startWhisperServer, UI_PROMPT, type WhisperServer } from './whisper.ts';

const repoRoot = join(app.getAppPath(), '..', '..');
const preload = join(import.meta.dirname, '../preload/index.cjs');
const SHORTCUT = 'CommandOrControl+Shift+2';
const autotest = process.env.PASTILLE_AUTOTEST === 'capture';

function loadPage(win: BrowserWindow, page: 'poc' | 'overlay') {
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl) void win.loadURL(`${devUrl}/${page}.html`);
  else void win.loadFile(join(import.meta.dirname, '../renderer', `${page}.html`));
}

let pocWindow: BrowserWindow | null = null;
let whisper: WhisperServer | null = null;
let whisperStatus: WhisperStatus = { state: 'loading' };
let shortcutRegistered = false;

async function startWhisper() {
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

void app.whenReady().then(async () => {
  // Micro autorisé pour nos propres pages (macOS demande en plus son accord système).
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(permission === 'media'));
  if (process.platform === 'darwin') {
    await systemPreferences.askForMediaAccess('microphone');
    console.log('Enregistrement de l’écran :', systemPreferences.getMediaAccessStatus('screen'));
  }

  const results: CaptureResult[] = [];
  const capture = createCapture({
    preload,
    loadPage,
    outDir: join(repoRoot, 'poc-output'),
    onResult: (r) => {
      results.push(r);
      console.log('CAPTURE', JSON.stringify(r));
      pocWindow?.webContents.send('capture:result', r);
    },
  });

  shortcutRegistered = globalShortcut.register(SHORTCUT, () => void capture.start());
  ipcMain.on('capture:start', () => void capture.start());
  ipcMain.handle('shortcut:status', () => ({ accelerator: SHORTCUT, registered: shortcutRegistered }));
  ipcMain.handle('whisper:status', () => whisperStatus);
  ipcMain.handle('dictee:transcribe', (_e, samples: Float32Array) => transcribe(encodeWav(samples)));
  ipcMain.handle('dictee:sample', async () =>
    transcribe(new Uint8Array(await readFile(join(app.getAppPath(), 'fixtures', 'dictee-fr.wav')))),
  );

  if (autotest) {
    // Mesure automatique : 5 captures, clic simulé au centre de l'écran principal.
    await new Promise((r) => setTimeout(r, 2000));
    for (let i = 0; i < 5; i++) {
      await capture.start();
      await new Promise((r) => setTimeout(r, 300));
      capture.autoPick();
      while (results.length <= i) await new Promise((r) => setTimeout(r, 50));
      if (!results[i]?.ok) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    app.quit();
    return;
  }

  pocWindow = new BrowserWindow({
    width: 560,
    height: 760,
    title: 'Pastille — POC',
    webPreferences: { preload },
  });
  pocWindow.setContentProtection(true);
  pocWindow.on('closed', () => app.quit());
  loadPage(pocWindow, 'poc');

  void startWhisper();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  whisper?.stop();
});
