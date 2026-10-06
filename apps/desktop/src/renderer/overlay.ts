// Overlay de capture : affiche l'écran figé. Clic = fenêtre sous le curseur (encadrée au survol),
// glisser = zone, ⇧ + clic = dernière zone, Échap = annuler.

const frozen = document.getElementById('frozen') as HTMLImageElement;
const zone = document.getElementById('zone') as HTMLDivElement;
const hover = document.getElementById('hover') as HTMLDivElement;
const DRAG_THRESHOLD = 4;

let url: string | null = null;
let start: { x: number; y: number } | null = null;
let windows: { x: number; y: number; width: number; height: number }[] = [];

window.pastille.onOverlayWindows((rects) => (windows = rects));

function showHover(x: number, y: number) {
  const r = windows.find((w) => x >= w.x && y >= w.y && x < w.x + w.width && y < w.y + w.height);
  if (!r) return void (hover.style.display = 'none');
  Object.assign(hover.style, { display: 'block', left: `${r.x}px`, top: `${r.y}px`, width: `${r.width}px`, height: `${r.height}px` });
}

window.pastille.onOverlayShow(async ({ jpeg }) => {
  if (url) URL.revokeObjectURL(url);
  url = URL.createObjectURL(new Blob([jpeg as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' }));
  frozen.src = url;
  await frozen.decode();
  start = null;
  windows = [];
  zone.style.display = 'none';
  hover.style.display = 'none';
  window.pastille.overlayReady();
});

function rectFrom(e: MouseEvent) {
  const s = start!;
  return {
    x: Math.min(s.x, e.clientX),
    y: Math.min(s.y, e.clientY),
    w: Math.abs(e.clientX - s.x),
    h: Math.abs(e.clientY - s.y),
  };
}

window.addEventListener('mousedown', (e) => {
  if (e.button === 0) start = { x: e.clientX, y: e.clientY };
});

window.addEventListener('mousemove', (e) => {
  if (!start) return showHover(e.clientX, e.clientY);
  const r = rectFrom(e);
  if (r.w < DRAG_THRESHOLD && r.h < DRAG_THRESHOLD) return;
  hover.style.display = 'none';
  Object.assign(zone.style, { display: 'block', left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
});

window.addEventListener('mouseup', (e) => {
  if (!start || e.button !== 0) return;
  const r = rectFrom(e);
  start = null;
  if (r.w < DRAG_THRESHOLD && r.h < DRAG_THRESHOLD)
    window.pastille.overlayPick({ kind: 'click', x: e.clientX, y: e.clientY, shift: e.shiftKey });
  else window.pastille.overlayPick({ kind: 'zone', ...r });
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.pastille.overlayPick({ kind: 'cancel' });
});
