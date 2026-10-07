// Barre de menus (§4.7) : l'icône et son état, le menu en popover sous l'icône,
// et la barre flottante optionnelle (compteur, capture, export) pendant une session.

import { join } from 'node:path';
import { app, BrowserWindow, ipcMain, nativeImage, screen, Tray, type NativeImage } from 'electron';
import type { ExportNotice, MenuAction, MenuState } from '../ipc.ts';
import { T } from '../texts/index.ts';

const isMac = process.platform === 'darwin';
const POPOVER_WIDTH = 330;
const BAR = { width: 640, height: 64, bottom: 16 };

export type MenubarOptions = {
  preload: string;
  loadPage: (win: BrowserWindow, page: 'menu' | 'bar') => void;
  state: () => Promise<MenuState>;
  recording: () => boolean; // dictée en cours
  barEnabled: () => boolean; // réglage « barre flottante »
  onAction: (action: MenuAction) => void;
};

export function createMenubar(opts: MenubarOptions) {
  const images = new Map<string, NativeImage>();
  let tray: Tray | null = null;
  let iconName = '';
  let popover: BrowserWindow | null = null;
  let hiddenAt = 0; // le clic sur l'icône qui a fait perdre le focus ne doit pas rouvrir le menu
  let bar: BrowserWindow | null = null;
  let barReady = false;
  let last: MenuState | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function image(name: string) {
    let img = images.get(name);
    if (!img) {
      img = nativeImage.createFromPath(join(app.getAppPath(), 'resources', `${name}.png`));
      if (name.endsWith('Template')) img.setTemplateImage(true);
      images.set(name, img);
    }
    return img;
  }

  /** Icône selon l'état, par priorité : dictée (seule en couleur), erreur, transcriptions, repos. */
  function updateIcon(s: MenuState) {
    if (!tray) return;
    const name = !isMac
      ? 'tray'
      : opts.recording()
        ? 'trayRecording'
        : s.errors
          ? 'trayErrorTemplate'
          : s.pending
            ? 'trayPendingTemplate'
            : 'trayTemplate';
    if (name !== iconName) tray.setImage(image((iconName = name)));
    if (isMac) tray.setTitle(s.session ? String(s.session.points) : '');
    tray.setToolTip(
      [
        s.session ? T.main.tray.session(s.session.name, s.session.points) : 'VibeScreener',
        opts.recording() ? T.main.tray.recording : '',
        s.pending ? T.main.tray.pending(s.pending) : '',
        s.errors ? T.main.tray.errors(s.errors) : '',
        s.tablet ? T.main.tray.tablet : '',
      ]
        .filter(Boolean)
        .join(' · '),
    );
  }

  // ——— Popover ———

  function createPopover() {
    const win = new BrowserWindow({
      width: POPOVER_WIDTH,
      height: 520,
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      webPreferences: { preload: opts.preload },
    });
    win.setContentProtection(true);
    win.on('blur', () => {
      if (!win.isVisible()) return;
      win.hide();
      hiddenAt = Date.now();
    });
    // Fermée (⌘W, fin de l'app) : elle sera recréée au prochain clic sur l'icône.
    win.on('closed', () => (popover = null));
    opts.loadPage(win, 'menu');
    return win;
  }

  /** Sous l'icône sur macOS, au-dessus dans la zone de notification de Windows ; toujours dans l'écran. */
  function placePopover() {
    if (!tray || !popover) return;
    const b = tray.getBounds();
    const { height } = popover.getBounds();
    const area = screen.getDisplayNearestPoint({ x: b.x, y: b.y }).workArea;
    const x = Math.round(Math.min(Math.max(b.x + b.width / 2 - POPOVER_WIDTH / 2, area.x + 8), area.x + area.width - POPOVER_WIDTH - 8));
    const below = b.y < area.y + area.height / 2;
    const y = Math.round(below ? Math.max(b.y + b.height + 4, area.y + 4) : b.y - height - 4);
    popover.setPosition(x, y);
  }

  function togglePopover() {
    popover ??= createPopover();
    if (popover.isVisible()) return hidePopover();
    if (Date.now() - hiddenAt < 300) return;
    refresh();
    placePopover();
    popover.show();
    popover.focus();
  }

  function hidePopover() {
    if (popover?.isVisible()) popover.hide();
  }

  // ——— Barre flottante ———

  function createBar() {
    const area = screen.getPrimaryDisplay().workArea;
    const win = new BrowserWindow({
      width: BAR.width,
      height: BAR.height,
      x: Math.round(area.x + (area.width - BAR.width) / 2),
      y: area.y + area.height - BAR.height - BAR.bottom,
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      focusable: false,
      hasShadow: false,
      alwaysOnTop: true,
      webPreferences: { preload: opts.preload },
    });
    win.setAlwaysOnTop(true, 'floating');
    win.setVisibleOnAllWorkspaces(true, { skipTransformProcessType: true }); // sinon Electron fait clignoter le Dock
    win.setContentProtection(true);
    // Les zones transparentes laissent passer les clics ; la pilule les reprend au survol.
    win.setIgnoreMouseEvents(true, { forward: true });
    win.on('closed', () => {
      bar = null;
      barReady = false;
    });
    opts.loadPage(win, 'bar');
    win.once('ready-to-show', () => {
      barReady = true;
      updateBar();
    });
    return win;
  }

  function updateBar() {
    const visible = opts.barEnabled() && !!last?.session;
    if (visible) {
      bar ??= createBar();
      if (barReady && !bar.isVisible()) bar.showInactive();
    } else if (bar?.isVisible()) bar.hide();
  }

  ipcMain.on('bar:hover', (_e, inside: boolean) => bar?.setIgnoreMouseEvents(!inside, { forward: true }));
  ipcMain.on('menu:resize', (_e, height: number) => {
    if (!popover) return;
    popover.setSize(POPOVER_WIDTH, Math.ceil(height));
    placePopover();
  });
  ipcMain.handle('menu:state', () => opts.state());
  ipcMain.on('menu:action', (_e, action: MenuAction) => {
    hidePopover();
    opts.onAction(action);
  });

  /** État recalculé ; regroupé pour ne pas tout reconstruire à chaque frappe. */
  function refresh() {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      void opts.state().then((s) => {
        last = s;
        updateIcon(s);
        popover?.webContents.send('menu:state', s);
        bar?.webContents.send('menu:state', s);
        updateBar();
      });
    }, 150);
  }

  return {
    start() {
      tray = new Tray(image(isMac ? 'trayTemplate' : 'tray'));
      iconName = isMac ? 'trayTemplate' : 'tray';
      tray.on('click', togglePopover);
      tray.on('right-click', togglePopover);
      refresh();
    },
    refresh,
    hidePopover,
    /** Après un export : message dans la barre flottante si elle est affichée. Faux sinon. */
    notifyExport(notice: ExportNotice): boolean {
      if (!bar?.isVisible()) return false;
      bar.webContents.send('bar:export', notice);
      return true;
    },
  };
}
