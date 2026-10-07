// Retour visuel de la vidéo : fenêtres transparentes, sans focus, qui laissent passer les clics
// sauf sous le bandeau, et partout tant que ⌘ / Ctrl est tenu : le clic pose alors un point sans atteindre l'app.
import { BrowserWindow, ipcMain, screen } from 'electron';
import type { VideoFeedback } from '../ipc.ts';

export function createVideoFeedback(opts: {
  preload: string;
  loadPage: (win: BrowserWindow, page: 'video-feedback') => void;
}) {
  let windows: { displayId: number; win: BrowserWindow; catching: boolean }[] = [];
  let state: VideoFeedback = null;
  let hoveredId: number | null = null;
  const fromWindow = (senderId: number) => windows.find(({ win }) => !win.isDestroyed() && win.webContents.id === senderId);

  // Seulement aux changements : l'état arrive dix fois par seconde avec le micro.
  function catchMouse() {
    for (const w of windows) {
      const catching = !!state?.armed || hoveredId === w.win.webContents.id;
      if (w.win.isDestroyed() || catching === w.catching) continue;
      w.catching = catching;
      w.win.setIgnoreMouseEvents(!catching, { forward: true });
    }
  }

  ipcMain.on('video:feedback-hover', (e, inside: boolean) => {
    if (!fromWindow(e.sender.id)) return;
    hoveredId = inside ? e.sender.id : hoveredId === e.sender.id ? null : hoveredId;
    catchMouse();
  });

  function stop() {
    state = null;
    hoveredId = null;
    for (const { win } of windows) if (!win.isDestroyed()) win.destroy();
    windows = [];
  }

  async function start() {
    stop();
    const displays = screen.getAllDisplays();
    windows = displays.map((d) => {
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
        // Panneau macOS, comme la capture : un ⌘ + clic n'active pas VibeScreener, l'app relue garde la main.
        ...(process.platform === 'darwin' ? { type: 'panel' as const, acceptFirstMouse: true } : {}),
        webPreferences: { preload: opts.preload, backgroundThrottling: false },
      });
      win.setIgnoreMouseEvents(true, { forward: true });
      win.setAlwaysOnTop(true, 'screen-saver');
      // Sans skipTransformProcessType, Electron cache l'icône du Dock dès la première vidéo.
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
      win.setContentProtection(true);
      return { displayId: d.id, win, catching: false };
    });
    await Promise.all(windows.map(({ win }, i) => new Promise<void>((resolve, reject) => {
      const d = displays[i]!;
      win.webContents.once('did-finish-load', () => {
        // Bandeau au-dessus du Dock ou de la barre des tâches.
        void win.webContents.insertCSS(`:root { --dock: ${Math.max(0, d.bounds.y + d.bounds.height - d.workArea.y - d.workArea.height)}px; }`);
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
      const shown = !!next && (!next.click || next.click.displayId === displayId);
      win.webContents.send('video:feedback', shown ? next : null);
      if (!shown && hoveredId === win.webContents.id) hoveredId = null;
    }
    catchMouse();
  }

  return { start, stop, update, pointerInControls: () => hoveredId !== null, owns: (senderId: number) => !!fromWindow(senderId), isWindow: (win: BrowserWindow) => windows.some((w) => w.win === win) };
}
