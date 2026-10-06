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

export const PIN_COLOR = '#e5484d';
const SELECTED_COLOR = '#0a84ff';
const FONT = 'bold {size}px -apple-system, "Segoe UI", "Helvetica Neue", Arial, sans-serif';

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
  const color = selected ? SELECTED_COLOR : PIN_COLOR;
  const g = a.geometry;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, r / 5);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  if (g.kind === 'zone') {
    ctx.beginPath();
    ctx.rect(X(g.x), Y(g.y), g.w * view.width, g.h * view.height);
    ctx.stroke();
  } else if (g.kind === 'arrow') {
    const x1 = X(g.x1), y1 = Y(g.y1), x2 = X(g.x2), y2 = Y(g.y2);
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const head = r * 1.2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - head * Math.cos(angle - 0.45), y2 - head * Math.sin(angle - 0.45));
    ctx.lineTo(x2 - head * Math.cos(angle + 0.45), y2 - head * Math.sin(angle + 0.45));
    ctx.closePath();
    ctx.fill();
  }

  const [px, py] = pinPosition(g, view);
  ctx.fillStyle = color;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(1.5, r / 7);
  ctx.beginPath();
  ctx.arc(px, py, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  const label = String(a.number);
  ctx.fillStyle = '#ffffff';
  ctx.font = FONT.replace('{size}', String(Math.round(r * (label.length > 2 ? 0.8 : 1.05))));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, px, py + r * 0.05);
  ctx.restore();
}

/** Où se trouve la pastille numérotée : le point, le coin d'une zone, le départ d'une flèche. */
export function pinPosition(g: Geometry, view: View): [number, number] {
  if (g.kind === 'point') return [view.x + g.x * view.width, view.y + g.y * view.height];
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
