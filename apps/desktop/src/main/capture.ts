// Capture d'écran : un overlay par écran, préchargé et caché ; au raccourci on fige
// tous les écrans, on affiche l'image figée, puis on recadre selon le clic ou la zone.

import {
  app,
  BrowserWindow,
  desktopCapturer,
  ipcMain,
  screen,
  type Display,
  type NativeImage,
  type Rectangle,
} from 'electron';
import { openWindows, type Result as WindowInfo } from 'get-windows';
import type { OverlayPick, OverlayShow, OverlayWindow } from '../ipc.ts';

type Overlay = { display: Display; win: BrowserWindow; ready?: () => void };

type Pending = {
  t0: number;
  frozen: Map<number, NativeImage>;
  windows: Promise<WindowInfo[]>;
  windowsMs: Promise<number>;
  hidden: BrowserWindow[]; // nos fenêtres masquées pendant la capture
  inspiration: boolean; // capture de l'inspiration d'un point : une zone est toujours recadrée
  timings: { captureMs: number; overlayMs: number };
};

export type CapturedImage = {
  png: Buffer;
  width: number; // pixels physiques
  height: number;
  scaleFactor: number;
  displayId: string;
  target: 'window' | 'screen' | 'zone';
  app?: string;
  title?: string;
  point?: { x: number; y: number }; // normalisé 0–1, pour un clic
  zone?: { x: number; y: number; w: number; h: number }; // normalisé 0–1, zone glissée montrée sur la fenêtre (sans ⌥)
  timings: { captureMs: number; windowsMs: number; overlayMs: number; pickToSavedMs: number };
};

export type CaptureOptions = {
  preload: string;
  loadPage: (win: BrowserWindow, page: 'overlay') => void;
  onCapture: (c: CapturedImage) => Promise<void>;
  onCancel: () => void; // Échap dans l'overlay
  onError: (message: string) => void;
  /** Ce que l'overlay annonce : session en cours, numéro de l'écran et du prochain point. */
  info: () => Omit<OverlayShow, 'jpeg'>;
};

export function createCapture(opts: CaptureOptions) {
  let overlays: Overlay[] = [];
  let pending: Pending | null = null;
  let lastZone: { displayId: number; rect: Rectangle; crop: boolean } | null = null; // pour ⇧ + clic, même mode

  function buildOverlays() {
    for (const o of overlays) o.win.destroy();
    overlays = screen.getAllDisplays().map((display) => {
      const win = new BrowserWindow({
        ...display.bounds,
        show: false,
        frame: false,
        resizable: false,
        movable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        enableLargerThanScreen: true,
        hasShadow: false,
        skipTaskbar: true,
        alwaysOnTop: true,
        backgroundColor: '#000000',
        // macOS 14+ refuse qu'une app se mette d'elle-même au premier plan : un panneau prend le
        // clavier (Échap) sans activer l'app, et le premier clic compte au lieu d'activer l'app.
        ...(process.platform === 'darwin' ? { type: 'panel' as const, acceptFirstMouse: true } : {}),
        webPreferences: { preload: opts.preload },
      });
      win.setAlwaysOnTop(true, 'screen-saver');
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      win.setContentProtection(true); // jamais dans nos propres captures
      opts.loadPage(win, 'overlay');
      return { display, win };
    });
  }

  const overlayOf = (senderId: number) => overlays.find((o) => o.win.webContents.id === senderId);

  ipcMain.on('overlay:ready', (e) => overlayOf(e.sender.id)?.ready?.());
  ipcMain.on('overlay:pick', (e, pick: OverlayPick) => {
    const o = overlayOf(e.sender.id);
    if (o) void finish(o, pick);
  });

  const rebuild = () => {
    if (!pending) buildOverlays();
  };
  screen.on('display-added', rebuild);
  screen.on('display-removed', rebuild);
  screen.on('display-metrics-changed', rebuild);
  buildOverlays();

  function showOverlay(o: Overlay, image: NativeImage, info: Omit<OverlayShow, 'jpeg'>): Promise<void> {
    return new Promise((resolve) => {
      o.ready = () => {
        o.ready = undefined;
        o.win.setBounds(o.display.bounds);
        o.win.show();
        o.win.moveTop();
        resolve();
      };
      // Curseur relatif à l'écran : l'overlay encadre la cible tout de suite, sans attendre un mouvement.
      const c = screen.getCursorScreenPoint();
      const cursor = { x: c.x - o.display.bounds.x, y: c.y - o.display.bounds.y };
      o.win.webContents.send('overlay:show', { ...info, cursor, jpeg: image.toJPEG(85) } satisfies OverlayShow);
    });
  }

  async function start(): Promise<void> {
    if (pending) return;
    const t0 = performance.now();
    const windows = openWindows({ accessibilityPermission: false, screenRecordingPermission: true }).catch(
      () => [] as WindowInfo[],
    );
    const windowsMs = windows.then(() => performance.now() - t0);

    // Nos fenêtres ne doivent jamais apparaître dans la capture.
    const hidden = BrowserWindow.getAllWindows().filter((w) => w.isVisible() && !w.isMinimized() && !overlays.some((o) => o.win === w));
    for (const w of hidden) w.hide();
    if (hidden.length) await new Promise((r) => setTimeout(r, 50)); // le temps que l'écran se redessine

    // Une seule requête pour tous les écrans, à la taille physique du plus grand.
    const displays = overlays.map((o) => o.display);
    const thumbnailSize = {
      width: Math.max(...displays.map((d) => Math.round(d.size.width * d.scaleFactor))),
      height: Math.max(...displays.map((d) => Math.round(d.size.height * d.scaleFactor))),
    };
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize }).catch(() => []);
    const captureMs = performance.now() - t0;

    const frozen = new Map<number, NativeImage>();
    overlays.forEach((o, i) => {
      const src = sources.find((s) => s.display_id === String(o.display.id)) ?? sources[i];
      if (src && !src.thumbnail.isEmpty()) frozen.set(o.display.id, src.thumbnail);
    });
    if (frozen.size < overlays.length) {
      for (const w of hidden) if (!w.isDestroyed()) w.showInactive();
      opts.onError(
        process.platform === 'darwin'
          ? "Capture impossible : autorise l'enregistrement de l'écran (Réglages Système > Confidentialité et sécurité), puis relance VibeScreener."
          : "Capture impossible : l'écran n'a pas pu être lu.",
      );
      return;
    }

    const info = opts.info();
    pending = { t0, frozen, windows, windowsMs, hidden, inspiration: info.inspiration !== undefined, timings: { captureMs, overlayMs: 0 } };
    await Promise.all(overlays.map((o) => showOverlay(o, frozen.get(o.display.id)!, info)));
    pending.timings.overlayMs = performance.now() - t0;

    // Le focus va à l'overlay sous le curseur, pour qu'Échap fonctionne.
    const cursor = screen.getCursorScreenPoint();
    const target = overlays.find((o) => o.display.id === screen.getDisplayNearestPoint(cursor).id);
    if (process.platform === 'darwin') app.focus({ steal: true });
    target?.win.focus();

    // Encadré au survol : chaque overlay reçoit les fenêtres de son écran, de l'avant vers l'arrière.
    void windows.then((list) => {
      if (pending?.t0 !== t0) return;
      for (const o of overlays) {
        const visible: OverlayWindow[] = [];
        for (const w of list.filter(isCandidate)) {
          const r = onDisplay(toDip(w.bounds), o.display);
          if (r) visible.push({ ...r, app: w.owner.name, title: w.title });
        }
        o.win.webContents.send('overlay:windows', visible);
      }
    });
  }

  async function finish(o: Overlay, pick: OverlayPick): Promise<void> {
    const p = pending;
    if (!p) return;
    pending = null;
    const tPick = performance.now();
    for (const ov of overlays) ov.win.hide();
    for (const w of p.hidden) if (!w.isDestroyed()) w.showInactive();
    if (pick.kind === 'cancel') return opts.onCancel();

    const d = o.display;
    const image = p.frozen.get(d.id)!;
    const size = image.getSize();
    const sx = size.width / d.bounds.width;
    const sy = size.height / d.bounds.height;
    const full: Rectangle = { x: 0, y: 0, width: d.bounds.width, height: d.bounds.height };

    // Zone glissée, ou la dernière (⇧ + clic) : recadrée avec ⌥, sinon montrée sur la fenêtre qui contient son centre.
    let zone: { rect: Rectangle; crop: boolean } | null = null;
    if (pick.kind === 'zone') {
      zone = { rect: { x: pick.x, y: pick.y, width: pick.w, height: pick.h }, crop: !!pick.crop };
      lastZone = { displayId: d.id, ...zone };
    } else if (pick.shift && lastZone?.displayId === d.id) zone = lastZone;

    let rect = full;
    let target: 'window' | 'screen' | 'zone' = 'screen';
    let hit: WindowInfo | undefined;
    if (zone && (zone.crop || p.inspiration)) {
      rect = zone.rect;
      target = 'zone';
    } else {
      // Fenêtre sous le clic, ou sous le centre de la zone ; à défaut, l'écran entier.
      const at = zone ? { x: zone.rect.x + zone.rect.width / 2, y: zone.rect.y + zone.rect.height / 2 } : pick;
      const gx = d.bounds.x + at.x;
      const gy = d.bounds.y + at.y;
      hit = (await p.windows).find((w) => {
        const b = toDip(w.bounds);
        return isCandidate(w) && gx >= b.x && gy >= b.y && gx < b.x + b.width && gy < b.y + b.height;
      });
      const inter = hit && onDisplay(toDip(hit.bounds), d);
      if (inter) {
        rect = inter;
        target = 'window';
      }
    }

    const px = {
      x: Math.round(rect.x * sx),
      y: Math.round(rect.y * sy),
      width: Math.round(rect.width * sx),
      height: Math.round(rect.height * sy),
    };
    const cropped = target === 'screen' ? image : image.crop(px);
    const realSize = cropped.getSize();
    const png = cropped.toPNG();

    await opts.onCapture({
      png,
      width: realSize.width,
      height: realSize.height,
      scaleFactor: d.scaleFactor,
      displayId: String(d.id),
      target,
      app: target === 'window' ? hit?.owner.name : undefined,
      title: target === 'window' ? hit?.title : undefined,
      point:
        pick.kind === 'click' && !zone && inside(pick, rect)
          ? { x: (pick.x - rect.x) / rect.width, y: (pick.y - rect.y) / rect.height }
          : undefined,
      zone: zone && target !== 'zone' ? relative(zone.rect, rect) : undefined,
      timings: { ...p.timings, windowsMs: await p.windowsMs, pickToSavedMs: performance.now() - tPick },
    });
  }

  /** Pour l'autotest : simule un clic au centre de l'écran principal. */
  function autoPick(): boolean {
    const o = overlays.find((ov) => ov.display.id === screen.getPrimaryDisplay().id) ?? overlays[0];
    if (!o || !pending) return false;
    void finish(o, { kind: 'click', x: o.display.bounds.width / 2, y: o.display.bounds.height / 2 });
    return true;
  }

  return { start, autoPick, isBusy: () => pending !== null };
}

/** Fenêtres visées par un clic : pas les nôtres, pas les minuscules (icônes, menus). */
function isCandidate(w: WindowInfo): boolean {
  const b = toDip(w.bounds);
  return w.owner.processId !== process.pid && b.width > 40 && b.height > 40;
}

/** Partie d'un rectangle global visible sur un écran, en coordonnées relatives à cet écran. */
function onDisplay(r: Rectangle, d: Display): Rectangle | null {
  return intersect(
    { ...r, x: r.x - d.bounds.x, y: r.y - d.bounds.y },
    { x: 0, y: 0, width: d.bounds.width, height: d.bounds.height },
  );
}

/** Zone en coordonnées 0–1 de l'image capturée, bornée à celle-ci. */
function relative(z: Rectangle, r: Rectangle) {
  const i = intersect(z, r);
  return i ? { x: (i.x - r.x) / r.width, y: (i.y - r.y) / r.height, w: i.width / r.width, h: i.height / r.height } : undefined;
}

const inside = (p: { x: number; y: number }, r: Rectangle) =>
  p.x >= r.x && p.y >= r.y && p.x <= r.x + r.width && p.y <= r.y + r.height;

/** Les bornes de get-windows sont en pixels physiques sous Windows, en points sous macOS. */
function toDip(b: Rectangle): Rectangle {
  return process.platform === 'win32' ? screen.screenToDipRect(null, b) : b;
}

function intersect(a: Rectangle, b: Rectangle): Rectangle | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const w = Math.min(a.x + a.width, b.x + b.width) - x;
  const h = Math.min(a.y + a.height, b.y + b.height) - y;
  return w > 0 && h > 0 ? { x, y, width: w, height: h } : null;
}
