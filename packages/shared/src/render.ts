// Seule fonction de rendu des annotations (pastilles, zones, flèches), utilisée
// par l'éditeur, les exports et le fond de la PWA. Canvas 2D uniquement, pour
// tourner aussi bien dans le navigateur que dans Node (@napi-rs/canvas).

import type { Annotation, Geometry } from './model.ts';

/** Sous-ensemble du contexte 2D utilisé ici (commun au navigateur et à @napi-rs/canvas). */
export type Ctx2D = {
  save(): void;
  restore(): void;
  beginPath(): void;
  closePath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, r: number, start: number, end: number): void;
  arcTo(x1: number, y1: number, x2: number, y2: number, r: number): void;
  rect(x: number, y: number, w: number, h: number): void;
  fill(): void;
  stroke(): void;
  fillText(text: string, x: number, y: number): void;
  measureText(text: string): { width: number };
  fillStyle: unknown;
  strokeStyle: unknown;
  lineWidth: number;
  lineJoin: unknown;
  lineCap: unknown;
  font: string;
  textAlign: unknown;
  textBaseline: unknown;
};

/** Passage des coordonnées normalisées (0–1 de l'image) aux pixels de sortie. */
export type View = { x: number; y: number; width: number; height: number };

export const PIN_COLOR = '#D63A0C';
const FONT = 'bold {size}px -apple-system, "Segoe UI", "Helvetica Neue", Arial, sans-serif';
const HALO_GAP = 6; // écart entre la pastille sélectionnée et son halo, à r = 13

/** « #D63A0C » + opacité → « rgba(…) ». */
function rgba(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export function drawAnnotations(
  ctx: Ctx2D,
  annotations: Annotation[],
  view: View,
  opts: { radius: number; selectedId?: string },
): void {
  for (const a of annotations) drawOne(ctx, a, view, opts.radius, a.id === opts.selectedId);
}

function drawOne(ctx: Ctx2D, a: Annotation, view: View, r: number, selected: boolean) {
  const X = (x: number) => view.x + x * view.width;
  const Y = (y: number) => view.y + y * view.height;
  const g = a.geometry;
  const width = Math.max(2, r / 6.5);
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  if (g.kind === 'zone') {
    // Fond teinté, trait accent bordé de blanc pour rester lisible sur toutes les interfaces.
    ctx.beginPath();
    ctx.rect(X(g.x), Y(g.y), g.w * view.width, g.h * view.height);
    ctx.fillStyle = rgba(PIN_COLOR, 0.08);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = width + 2;
    ctx.stroke();
    ctx.strokeStyle = PIN_COLOR;
    ctx.lineWidth = width;
    ctx.stroke();
  } else if (g.kind === 'arrow') {
    const x1 = X(g.x1), y1 = Y(g.y1), x2 = X(g.x2), y2 = Y(g.y2);
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const head = r * 1.1;
    const shaft = () => {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.moveTo(x2 - head * Math.cos(angle - 0.6), y2 - head * Math.sin(angle - 0.6));
      ctx.lineTo(x2, y2);
      ctx.lineTo(x2 - head * Math.cos(angle + 0.6), y2 - head * Math.sin(angle + 0.6));
    };
    shaft();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = width * 2 + 1;
    ctx.stroke();
    shaft();
    ctx.strokeStyle = PIN_COLOR;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  // Pastille : goutte dont la pointe (coin bas-gauche) touche le pixel visé pour un point,
  // ronde et centrée sur le coin d'une zone ou le départ d'une flèche.
  const [cx, cy] = pinPosition(g, view, r);
  const shape = (grow: number) => {
    ctx.beginPath();
    if (g.kind === 'point') pinPath(ctx, cx - r - grow, cy - r - grow, (r + grow) * 2, r / 4 + grow / 3);
    else ctx.arc(cx, cy, r + grow, 0, Math.PI * 2);
  };
  if (selected) {
    shape((HALO_GAP * r) / 13);
    ctx.strokeStyle = rgba(PIN_COLOR, 0.5);
    ctx.lineWidth = Math.max(1.5, r / 6.5);
    ctx.stroke();
  }
  shape(0);
  ctx.fillStyle = PIN_COLOR;
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(1.5, r / 6.5);
  ctx.stroke();

  const label = String(a.number);
  ctx.fillStyle = '#ffffff';
  ctx.font = FONT.replace('{size}', String(Math.round(r * (label.length > 2 ? 0.72 : label.length > 1 ? 0.85 : 0.92))));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, cx, cy + r * 0.05);
  ctx.restore();
}

/** Carré de côté `size` aux coins arrondis en cercle, sauf le coin bas-gauche (rayon `tip`). */
function pinPath(ctx: Ctx2D, x: number, y: number, size: number, tip: number) {
  const r = size / 2;
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + size, y, x + size, y + size, r);
  ctx.arcTo(x + size, y + size, x, y + size, r);
  ctx.arcTo(x, y + size, x, y, tip);
  ctx.arcTo(x, y, x + size, y, r);
  ctx.closePath();
}

/**
 * Centre de la pastille numérotée, pour un rayon r : au-dessus à droite du point visé
 * (la pointe de la goutte est sur le point), sur le coin d'une zone, au départ d'une flèche.
 */
export function pinPosition(g: Geometry, view: View, r: number): [number, number] {
  if (g.kind === 'point') return [view.x + g.x * view.width + r, view.y + g.y * view.height - r];
  if (g.kind === 'zone') return [view.x + g.x * view.width, view.y + g.y * view.height];
  return [view.x + g.x1 * view.width, view.y + g.y1 * view.height];
}

/** Boîte englobante normalisée d'une annotation (pour le recadrage des exports). */
export function bounds(g: Geometry): { x: number; y: number; w: number; h: number } {
  if (g.kind === 'point') return { x: g.x, y: g.y, w: 0, h: 0 };
  if (g.kind === 'zone') return { x: g.x, y: g.y, w: g.w, h: g.h };
  const x = Math.min(g.x1, g.x2), y = Math.min(g.y1, g.y2);
  return { x, y, w: Math.abs(g.x2 - g.x1), h: Math.abs(g.y2 - g.y1) };
}
