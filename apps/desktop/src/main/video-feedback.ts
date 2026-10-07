// Retour visuel de la vidéo : fenêtres transparentes, sans focus ni interception des clics.
import { BrowserWindow, screen } from 'electron';
import type { VideoFeedback } from '../ipc.ts';

export function createVideoFeedback(opts: {
  preload: string;
  loadPage: (win: BrowserWindow, page: 'video-feedback') => void;
}) {
  let windows: { displayId: number; win: BrowserWindow }[] = [];
  let state: VideoFeedback = null;

  function stop() {
    state = null;
    for (const { win } of windows) if (!win.isDestroyed()) win.destroy();
    windows = [];
  }

  async function start() {
    stop();
    windows = screen.getAllDisplays().map((d) => {
      const win = new BrowserWindow({
        ...d.bounds,
        show: false,
        frame: false,
        transparent: true,
        backgroundColor: '#00000000',
        hasShadow: false,
        focusable: false,
        resizable: false,
        movable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        enableLargerThanScreen: true,
        skipTaskbar: true,
        webPreferences: { preload: opts.preload, backgroundThrottling: false },
      });
      win.setIgnoreMouseEvents(true);
      win.setAlwaysOnTop(true, 'screen-saver');
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      win.setContentProtection(true);
      return { displayId: d.id, win };
    });
    await Promise.all(windows.map(({ win }) => new Promise<void>((resolve, reject) => {
      win.webContents.once('did-finish-load', () => {
        win.webContents.send('video:feedback', state);
        win.showInactive();
        resolve();
      });
      win.webContents.once('did-fail-load', (_e, _code, message) => reject(new Error(message)));
      opts.loadPage(win, 'video-feedback');
    })));
  }

  function update(next: VideoFeedback) {
    state = next;
    for (const { displayId, win } of windows) {
      if (win.isDestroyed()) continue;
      // Après un clic, seul son écran porte le point et la dictée ; avant, le micro est annoncé partout.
      win.webContents.send('video:feedback', next?.click && next.click.displayId !== displayId ? null : next);
    }
  }

  return { start, stop, update, isWindow: (win: BrowserWindow) => windows.some((w) => w.win === win) };
}
