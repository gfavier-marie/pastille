// Overlay de capture : affiche l'écran figé. Clic = fenêtre sous le curseur (encadrée au survol,
// le reste assombri), glisser = zone, ⇧ + clic = dernière zone, Échap = annuler.

import type { OverlayWindow } from '../ipc.ts';
import { T } from './texts.ts';

const $ = <E extends HTMLElement>(id: string) => document.getElementById(id) as E;
const frozen = $<HTMLImageElement>('frozen');
const zone = $<HTMLDivElement>('zone');
const hover = $<HTMLDivElement>('hover');
const label = $<HTMLDivElement>('label');
const ghost = $<HTMLDivElement>('ghost');
const hints = $<HTMLDivElement>('hints');
const DRAG_THRESHOLD = 4;

let url: string | null = null;
let start: { x: number; y: number } | null = null;
let windows: OverlayWindow[] = [];

window.pastille.onOverlayWindows((list) => (windows = list));

type Rect = { x: number; y: number; width: number; height: number };

function place(el: HTMLElement, r: Rect) {
  Object.assign(el.style, { display: 'block', left: `${r.x}px`, top: `${r.y}px`, width: `${r.width}px`, height: `${r.height}px` });
}

/** Étiquette au-dessus du cadre (ou dedans s'il touche le haut de l'écran), taille en pixels réels. */
function showLabel(r: Rect, name: string) {
  const dpr = window.devicePixelRatio || 1;
  label.querySelector('.name')!.textContent = name;
  label.querySelector('.size')!.textContent = `${Math.round(r.width * dpr)} × ${Math.round(r.height * dpr)} px`;
  label.style.display = 'flex';
  label.style.left = `${Math.max(8, r.x)}px`;
  label.style.top = `${r.y >= 40 ? r.y - 32 : r.y + 8}px`;
}

function showHover(x: number, y: number) {
  const w = windows.find((r) => x >= r.x && y >= r.y && x < r.x + r.width && y < r.y + r.height);
  // Hors de toute fenêtre, le clic capture l'écran entier.
  const r = w ?? { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight };
  place(hover, r);
  hover.style.borderRadius = w ? '10px' : '0';
  showLabel(r, w ? [w.app, w.title].filter(Boolean).join(' — ') || T.overlay.wholeScreen : T.overlay.wholeScreen);
  Object.assign(ghost.style, { display: 'flex', left: `${x}px`, top: `${y - 26}px` });
}

function showHints(nextNumber: number, session: string) {
  hints.replaceChildren();
  T.overlay.hints.forEach(([key, text], i) => {
    if (i) hints.append(document.createElement('i'));
    const item = document.createElement('span');
    const b = document.createElement('b');
    b.textContent = key;
    item.append(b, text.replace('{n}', String(nextNumber)));
    hints.append(item);
  });
  const chip = document.createElement('span');
  chip.className = 'session';
  chip.innerHTML =
    '<svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1a7 7 0 1 1 0 14H1V8a7 7 0 0 1 7-7z" fill="#FF6A3D"></path><circle cx="8" cy="8" r="2.4" fill="#1C1C1E"></circle></svg>';
  chip.append(session);
  hints.append(chip);
}

window.pastille.onOverlayShow(async ({ jpeg, nextNumber, session, screen }) => {
  if (url) URL.revokeObjectURL(url);
  url = URL.createObjectURL(new Blob([jpeg as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' }));
  frozen.src = url;
  await frozen.decode();
  start = null;
  windows = [];
  for (const el of [zone, hover, label, ghost]) el.style.display = 'none';
  ghost.textContent = String(nextNumber);
  showHints(nextNumber, T.overlay.screen(session, screen));
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
  ghost.style.display = 'none';
  const rect = { x: r.x, y: r.y, width: r.w, height: r.h };
  place(zone, rect);
  showLabel(rect, T.overlay.zone);
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
