// Capture d'écran : un overlay par écran, préchargé et caché ; au raccourci on fige
// tous les écrans, on affiche l'image figée, puis on recadre selon le clic.

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
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
import type { CaptureResult, OverlayPick } from '../ipc.ts';

type Overlay = { display: Display; win: BrowserWindow; ready?: () => void };

type Pending = {
  t0: number;
  frozen: Map<number, NativeImage>;
  windows: Promise<WindowInfo[]>;
  windowsMs: Promise<number>;
  hidden: BrowserWindow[]; // nos fenêtres masquées pendant la capture
  timings: { captureMs: number; overlayMs: number };
};

export type CaptureOptions = {
  preload: string;
  loadPage: (win: BrowserWindow, page: 'overlay') => void;
  outDir: string;
  onResult: (r: CaptureResult) => void;
};

export function createCapture(opts: CaptureOptions) {
  let overlays: Overlay[] = [];
  let pending: Pending | null = null;

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

  function showOverlay(o: Overlay, image: NativeImage): Promise<void> {
    return new Promise((resolve) => {
      o.ready = () => {
        o.ready = undefined;
        o.win.setBounds(o.display.bounds);
        o.win.show();
        o.win.moveTop();
        resolve();
      };
      o.win.webContents.send('overlay:show', { jpeg: image.toJPEG(85) });
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
    const hidden = BrowserWindow.getAllWindows().filter((w) => w.isVisible() && !overlays.some((o) => o.win === w));
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
      for (const w of hidden) w.showInactive();
      opts.onResult({
        ok: false,
        error:
          process.platform === 'darwin'
            ? "Capture impossible : autorise l'enregistrement de l'écran (Réglages Système > Confidentialité et sécurité), puis relance l'app."
            : "Capture impossible : l'écran n'a pas pu être lu.",
      });
      return;
    }

    pending = { t0, frozen, windows, windowsMs, hidden, timings: { captureMs, overlayMs: 0 } };
    await Promise.all(overlays.map((o) => showOverlay(o, frozen.get(o.display.id)!)));
    pending.timings.overlayMs = performance.now() - t0;

    // Le focus va à l'overlay sous le curseur, pour qu'Échap fonctionne.
    const cursor = screen.getCursorScreenPoint();
    const target = overlays.find((o) => o.display.id === screen.getDisplayNearestPoint(cursor).id);
    if (process.platform === 'darwin') app.focus({ steal: true });
    target?.win.focus();
  }

  async function finish(o: Overlay, pick: OverlayPick): Promise<void> {
    const p = pending;
    if (!p) return;
    pending = null;
    const tPick = performance.now();
    for (const ov of overlays) ov.win.hide();
    for (const w of p.hidden) w.showInactive();
    if (pick.kind === 'cancel') return;

    const d = o.display;
    const image = p.frozen.get(d.id)!;
    const size = image.getSize();
    const sx = size.width / d.bounds.width;
    const sy = size.height / d.bounds.height;
    const full: Rectangle = { x: 0, y: 0, width: d.bounds.width, height: d.bounds.height };

    let rect = full;
    let target: 'window' | 'screen' | 'zone' = 'screen';
    let hit: WindowInfo | undefined;
    if (pick.kind === 'zone') {
      rect = { x: pick.x, y: pick.y, width: pick.w, height: pick.h };
      target = 'zone';
    } else {
      const gx = d.bounds.x + pick.x;
      const gy = d.bounds.y + pick.y;
      hit = (await p.windows).find((w) => {
        if (w.owner.processId === process.pid) return false;
        const b = toDip(w.bounds);
        return b.width > 40 && b.height > 40 && gx >= b.x && gy >= b.y && gx < b.x + b.width && gy < b.y + b.height;
      });
      if (hit) {
        const b = toDip(hit.bounds);
        const inter = intersect({ ...b, x: b.x - d.bounds.x, y: b.y - d.bounds.y }, full);
        if (inter) {
          rect = inter;
          target = 'window';
        }
      }
    }

    const px = {
      x: Math.round(rect.x * sx),
      y: Math.round(rect.y * sy),
      width: Math.round(rect.width * sx),
      height: Math.round(rect.height * sy),
    };
    const cropped = target === 'screen' ? image : image.crop(px);
    const file = join(opts.outDir, `capture-${Date.now()}.png`);
    await mkdir(opts.outDir, { recursive: true });
    await writeFile(file, cropped.toPNG());
    const realSize = cropped.getSize();

    opts.onResult({
      ok: true,
      file,
      width: realSize.width,
      height: realSize.height,
      scaleFactor: d.scaleFactor,
      target,
      app: target === 'window' ? hit?.owner.name : undefined,
      title: target === 'window' ? hit?.title : undefined,
      point:
        pick.kind === 'click'
          ? { x: (pick.x - rect.x) / rect.width, y: (pick.y - rect.y) / rect.height }
          : undefined,
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
