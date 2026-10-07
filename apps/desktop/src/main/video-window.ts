// Fenêtre cachée du mode vidéo, vue du processus principal : elle filme chaque écran (pour figer
// l'image d'avant un clic) et écoute le micro. Les images figées attendent ici d'être recadrées ou jetées.

import { BrowserWindow, desktopCapturer, ipcMain, screen } from 'electron';
import type { VideoCrop, VideoImage, VideoSource } from '../ipc.ts';
import { T } from '../texts/index.ts';

export type VideoWindowOptions = {
  preload: string;
  loadPage: (win: BrowserWindow, page: 'video') => void;
  onAudio: (chunk: Float32Array) => void;
};

export function createVideoWindow(opts: VideoWindowOptions) {
  let win: BrowserWindow | null = null;
  let started: ((error?: string) => void) | null = null;
  let nextFrame = 1;
  const waiting = new Map<number, (image: VideoImage | null) => void>();

  const fromWindow = (sender: Electron.WebContents) => !!win && !win.isDestroyed() && sender === win.webContents;
  ipcMain.on('video:started', (e, error?: string) => fromWindow(e.sender) && started?.(error));
  ipcMain.on('video:audio', (e, chunk: Float32Array) => fromWindow(e.sender) && opts.onAudio(chunk));
  ipcMain.on('video:cropped', (_e, frameId: number, image: VideoImage | null) => {
    waiting.get(frameId)?.(image);
    waiting.delete(frameId);
  });

  /** Ouvre un flux par écran et le micro ; rejette avec un message à montrer. */
  async function start(): Promise<void> {
    stop();
    const displays = screen.getAllDisplays();
    // Pas de vignettes : seuls les identifiants des écrans servent.
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } }).catch(() => []);
    const list: VideoSource[] = [];
    displays.forEach((d, i) => {
      const src = sources.find((s) => s.display_id === String(d.id)) ?? sources[i];
      if (src) list.push({ displayId: d.id, sourceId: src.id, width: Math.round(d.size.width * d.scaleFactor), height: Math.round(d.size.height * d.scaleFactor) });
    });
    if (list.length < displays.length) {
      throw new Error(process.platform === 'darwin' ? T.main.video.denied : T.main.video.unreadable);
    }

    const w = new BrowserWindow({
      show: false,
      width: 320,
      height: 200,
      skipTaskbar: true,
      // Cachée pendant tout l'enregistrement : rien ne doit y être ralenti.
      webPreferences: { preload: opts.preload, backgroundThrottling: false },
    });
    w.setContentProtection(true);
    win = w;
    opts.loadPage(w, 'video');
    await new Promise<void>((r) => w.webContents.once('did-finish-load', () => r()));
    const error = await new Promise<string | undefined>((resolve) => {
      started = resolve;
      w.webContents.send('video:start', list);
      setTimeout(() => resolve(T.main.video.noResponse), 15_000);
    });
    started = null;
    if (error) {
      stop();
      throw new Error(T.main.video.failed(error));
    }
  }

  /** Fige la dernière image d'un écran ; renvoie son numéro, à recadrer ou jeter ensuite. */
  function freeze(displayId: number): number {
    const frameId = nextFrame++;
    if (win && !win.isDestroyed()) win.webContents.send('video:freeze', { frameId, displayId });
    return frameId;
  }

  /** Image figée recadrée (rectangle en 0–1 de l'écran), ou jetée (null). */
  function crop(frameId: number, rect: VideoCrop['rect']): Promise<VideoImage | null> {
    if (!win || win.isDestroyed()) return Promise.resolve(null);
    const w = win;
    return new Promise((resolve) => {
      waiting.set(frameId, resolve);
      w.webContents.send('video:crop', { frameId, rect } satisfies VideoCrop);
    });
  }

  /** Ferme la fenêtre : flux et micro s'arrêtent avec elle. */
  function stop() {
    if (win && !win.isDestroyed()) win.destroy();
    win = null;
    for (const resolve of waiting.values()) resolve(null);
    waiting.clear();
  }

  return { start, freeze, crop, stop };
}
