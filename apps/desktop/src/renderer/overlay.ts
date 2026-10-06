// Overlay de capture : affiche l'écran figé. Clic = cible sous le curseur,
// glisser = zone, Échap = annuler.

const frozen = document.getElementById('frozen') as HTMLImageElement;
const zone = document.getElementById('zone') as HTMLDivElement;
const DRAG_THRESHOLD = 4;

let url: string | null = null;
let start: { x: number; y: number } | null = null;

window.pastille.onOverlayShow(async ({ jpeg }) => {
  if (url) URL.revokeObjectURL(url);
  url = URL.createObjectURL(new Blob([jpeg as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' }));
  frozen.src = url;
  await frozen.decode();
  start = null;
  zone.style.display = 'none';
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
  if (!start) return;
  const r = rectFrom(e);
  if (r.w < DRAG_THRESHOLD && r.h < DRAG_THRESHOLD) return;
  Object.assign(zone.style, { display: 'block', left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
});

window.addEventListener('mouseup', (e) => {
  if (!start || e.button !== 0) return;
  const r = rectFrom(e);
  start = null;
  if (r.w < DRAG_THRESHOLD && r.h < DRAG_THRESHOLD) window.pastille.overlayPick({ kind: 'click', x: e.clientX, y: e.clientY });
  else window.pastille.overlayPick({ kind: 'zone', ...r });
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.pastille.overlayPick({ kind: 'cancel' });
});
