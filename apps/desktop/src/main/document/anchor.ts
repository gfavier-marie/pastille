// Carte du texte d'une page de document et texte visé par un point. La carte est écrite à
// l'ouverture, à côté de l'image (captures/<id>.json) : l'ancrage ne relance aucun rendu.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Capture, Geometry } from '@pastille/shared';

/** Morceau de texte et sa boîte, en coordonnées normalisées 0–1 de l'image de la page. */
export type TextRun = { t: string; x: number; y: number; w: number; h: number };
export type TextMap = { runs: TextRun[] };

const LINE_MAX = 160;
const ZONE_MAX = 300;
const NEAR = 0.02; // un point posé à côté d'une ligne la vise encore

export const textMapPath = (capture: Capture) => capture.image.replace(/\.png$/, '.json');

/** Carte d'une page de document ; rien pour une capture d'écran ou une carte illisible. */
export async function loadTextMap(sessionDir: string, capture: Capture): Promise<TextMap | undefined> {
  if (!capture.source?.document) return undefined;
  try {
    return JSON.parse(await readFile(join(sessionDir, textMapPath(capture)), 'utf8')) as TextMap;
  } catch {
    return undefined;
  }
}

const clean = (text: string, max: number) => {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
};
const cy = (r: TextRun) => r.y + r.h / 2;

/** Distance d'un point à la boîte d'un morceau (0 dedans). */
function distance(r: TextRun, x: number, y: number) {
  const dx = Math.max(r.x - x, 0, x - (r.x + r.w));
  const dy = Math.max(r.y - y, 0, y - (r.y + r.h));
  return Math.hypot(dx, dy);
}

/** Ligne de texte sous un point (ou tout près) : les morceaux voisins à la même hauteur, sans sauter de colonne. */
function lineAt(map: TextMap, x: number, y: number): string | undefined {
  const runs = map.runs.filter((r) => r.t.trim());
  let best: TextRun | undefined;
  for (const r of runs) if (!best || distance(r, x, y) < distance(best, x, y)) best = r;
  if (!best || distance(best, x, y) > NEAR) return undefined;
  const same = runs.filter((r) => Math.abs(cy(r) - cy(best)) < best.h / 2).sort((a, b) => a.x - b.x);
  // On s'arrête à un grand blanc : deux colonnes à la même hauteur ne font pas une ligne.
  const gap = best.h * 3;
  let from = same.indexOf(best), to = from;
  while (from > 0 && same[from]!.x - (same[from - 1]!.x + same[from - 1]!.w) < gap) from--;
  while (to < same.length - 1 && same[to + 1]!.x - (same[to]!.x + same[to]!.w) < gap) to++;
  return clean(same.slice(from, to + 1).map((r) => r.t).join(' '), LINE_MAX) || undefined;
}

/** Texte contenu dans une zone, ligne par ligne. */
function textIn(map: TextMap, g: { x: number; y: number; w: number; h: number }): string | undefined {
  const inside = map.runs.filter((r) => {
    const cx = r.x + r.w / 2;
    return r.t.trim() && cx >= g.x && cx <= g.x + g.w && cy(r) >= g.y && cy(r) <= g.y + g.h;
  });
  // Ordre de lecture : par ligne (hauteurs proches), puis de gauche à droite.
  inside.sort((a, b) => (Math.abs(cy(a) - cy(b)) < Math.min(a.h, b.h) / 2 ? a.x - b.x : cy(a) - cy(b)));
  return clean(inside.map((r) => r.t).join(' '), ZONE_MAX) || undefined;
}

/** Texte visé : la ligne sous un point, le texte d'une zone, la ligne au départ d'une flèche. */
export function anchorText(g: Geometry, map: TextMap | undefined): string | undefined {
  if (!map) return undefined;
  if (g.kind === 'point') return lineAt(map, g.x, g.y);
  if (g.kind === 'zone') return textIn(map, g) ?? lineAt(map, g.x + g.w / 2, g.y + g.h / 2);
  return lineAt(map, g.x1, g.y1);
}

/**
 * Coordonnées normalisées de l'image d'une page (0–1, origine en haut à gauche) → espace PDF
 * (points, origine en bas à gauche), selon la boîte affichée et la rotation de la page.
 */
export function toPdfSpace(
  x: number,
  y: number,
  box: { x: number; y: number; width: number; height: number },
  rotate: number,
): [number, number] {
  const { x: x0, y: y0, width: w, height: h } = box;
  switch (((rotate % 360) + 360) % 360) {
    case 90:
      return [x0 + y * w, y0 + x * h];
    case 180:
      return [x0 + w - x * w, y0 + y * h];
    case 270:
      return [x0 + w - y * w, y0 + h - x * h];
    default:
      return [x0 + x * w, y0 + h - y * h];
  }
}
