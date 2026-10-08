// Carte du texte d'une page de document et ce que vise un point. La carte est écrite à
// l'ouverture, à côté de l'image (captures/<id>.json) : l'ancrage ne relance aucun rendu.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Capture, Geometry } from '@pastille/shared';

/**
 * Morceau de texte et sa boîte, en coordonnées normalisées 0–1 de l'image de la page.
 * `p` : paragraphe Word d'origine (chemin dans le modèle de la bibliothèque, « 42.2.2.0 » pour une cellule de tableau),
 * `pid` : son identifiant Word (w14:paraId), quand le fichier en a ;
 * `block` : texte d'une forme ou d'une cellule, jamais réuni à ses voisins en une ligne.
 */
export type TextRun = { t: string; x: number; y: number; w: number; h: number; p?: string; pid?: string; block?: true };

/** Grille d'une page de feuille Excel : bords des colonnes et des lignes (0–1), première colonne et ligne (0 = A, 1). */
export type CellGrid = { sheet: string; col0: number; row0: number; xs: number[]; ys: number[]; merges?: [number, number, number, number][] };

export type TextMap = { runs: TextRun[]; grid?: CellGrid };

/** Ce que vise un point : un passage de texte, ou des cellules d'une feuille (et la valeur de la première). */
export type Anchor = { text: string } | { cells: string; sheet: string; text?: string };

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

/** Morceau sous le point (le plus petit s'ils se recouvrent), ou le plus proche à moins de NEAR. */
function runAt(map: TextMap, x: number, y: number): TextRun | undefined {
  let best: TextRun | undefined;
  for (const r of map.runs) {
    if (!r.t.trim()) continue;
    const d = distance(r, x, y), bd = best ? distance(best, x, y) : Infinity;
    if (d < bd || (d === 0 && bd === 0 && r.w * r.h < best!.w * best!.h)) best = r;
  }
  return best && distance(best, x, y) <= NEAR ? best : undefined;
}

/** Ligne de texte sous un point : les morceaux voisins à la même hauteur, sans sauter de colonne. */
function lineAt(map: TextMap, x: number, y: number): TextRun[] {
  const best = runAt(map, x, y);
  if (!best) return [];
  if (best.block) return [best];
  const same = map.runs.filter((r) => !r.block && r.t.trim() && Math.abs(cy(r) - cy(best)) < best.h / 2).sort((a, b) => a.x - b.x);
  // On s'arrête à un grand blanc : deux colonnes à la même hauteur ne font pas une ligne.
  const gap = best.h * 3;
  let from = same.indexOf(best), to = from;
  while (from > 0 && same[from]!.x - (same[from - 1]!.x + same[from - 1]!.w) < gap) from--;
  while (to < same.length - 1 && same[to + 1]!.x - (same[to]!.x + same[to]!.w) < gap) to++;
  return same.slice(from, to + 1);
}

/** Morceaux contenus dans une zone, dans l'ordre de lecture. */
function runsIn(map: TextMap, g: { x: number; y: number; w: number; h: number }): TextRun[] {
  const inside = map.runs.filter((r) => {
    const cx = r.x + r.w / 2;
    return r.t.trim() && cx >= g.x && cx <= g.x + g.w && cy(r) >= g.y && cy(r) <= g.y + g.h;
  });
  // Par ligne (hauteurs proches), puis de gauche à droite.
  return inside.sort((a, b) => (Math.abs(cy(a) - cy(b)) < Math.min(a.h, b.h) / 2 ? a.x - b.x : cy(a) - cy(b)));
}

/** Texte de morceaux dans l'ordre de lecture : sans espace entre deux morceaux qui se touchent (un mot coupé). */
function join_(runs: TextRun[], max: number) {
  let text = '';
  runs.forEach((r, i) => {
    const prev = runs[i - 1];
    const touching = prev && Math.abs(cy(r) - cy(prev)) < prev.h / 2 && r.x - (prev.x + prev.w) < prev.h * 0.15;
    text += !prev || touching || /\s$/.test(text) || /^\s/.test(r.t) ? r.t : ` ${r.t}`;
  });
  return clean(text, max) || undefined;
}

/** Morceaux visés : la ligne sous un point, le texte d'une zone (ou sa ligne centrale), la ligne au départ d'une flèche. */
export function targetRuns(g: Geometry, map: TextMap): TextRun[] {
  if (g.kind === 'point') return lineAt(map, g.x, g.y);
  if (g.kind === 'zone') {
    const inside = runsIn(map, g);
    return inside.length ? inside : lineAt(map, g.x + g.w / 2, g.y + g.h / 2);
  }
  return lineAt(map, g.x1, g.y1);
}

// ——— Cellules d'une feuille Excel ———

/** « A », « Z », « AA » pour l'index de colonne 0, 25, 26. */
export function colName(c: number): string {
  let s = '';
  for (let n = c + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** Cellule sous un point (colonne et ligne à partir de 0) ; une cellule fusionnée renvoie son coin haut gauche. */
export function cellAt(grid: CellGrid, x: number, y: number): [number, number] {
  const index = (edges: number[], v: number) => {
    for (let i = 0; i < edges.length - 1; i++) if (v < edges[i + 1]!) return i;
    return edges.length - 2;
  };
  const col = grid.col0 + index(grid.xs, x), row = grid.row0 + index(grid.ys, y);
  const merge = grid.merges?.find(([c0, r0, c1, r1]) => col >= c0 && col <= c1 && row >= r0 && row <= r1);
  return merge ? [merge[0], merge[1]] : [col, row];
}

export const cellRef = ([col, row]: [number, number]) => `${colName(col)}${row + 1}`;

/** Ce que vise une annotation : cellules sur une feuille, sinon le texte (ligne, zone, départ de flèche). */
export function anchorOf(g: Geometry, map: TextMap | undefined): Anchor | undefined {
  if (!map) return undefined;
  const grid = map.grid;
  if (grid) {
    const sheet = grid.sheet;
    if (g.kind === 'point') {
      const ref = cellRef(cellAt(grid, g.x, g.y));
      return { cells: ref, sheet, text: valueAt(map, grid, g.x, g.y) };
    }
    if (g.kind === 'zone') {
      const [c0, r0] = cellAt(grid, g.x, g.y), [c1, r1] = cellAt(grid, g.x + g.w, g.y + g.h);
      const from = cellRef([Math.min(c0, c1), Math.min(r0, r1)]), to = cellRef([Math.max(c0, c1), Math.max(r0, r1)]);
      return { cells: from === to ? from : `${from}:${to}`, sheet };
    }
    return { cells: `${cellRef(cellAt(grid, g.x1, g.y1))} → ${cellRef(cellAt(grid, g.x2, g.y2))}`, sheet, text: valueAt(map, grid, g.x1, g.y1) };
  }
  const text = join_(targetRuns(g, map), g.kind === 'zone' ? ZONE_MAX : LINE_MAX);
  return text ? { text } : undefined;
}

/** Valeur affichée de la cellule sous un point. */
function valueAt(map: TextMap, grid: CellGrid, x: number, y: number): string | undefined {
  const [col, row] = cellAt(grid, x, y);
  const run = map.runs.find((r) => cellAt(grid, r.x + r.w / 2, r.y + r.h / 2).join() === [col, row].join());
  return run ? clean(run.t, LINE_MAX) : undefined;
}

/** Texte visé, sans les cellules (exports des pages de PDF, Word et PowerPoint). */
export function anchorText(g: Geometry, map: TextMap | undefined): string | undefined {
  const a = anchorOf(g, map);
  return a && 'text' in a && !('cells' in a) ? a.text : undefined;
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
