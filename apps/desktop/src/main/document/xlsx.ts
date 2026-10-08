// Rendu d'un classeur Excel en grille, à partir du classeur lu par @silurus/ooxml en mode Node (la
// bibliothèque ne dessine les feuilles que dans un navigateur). Chaque feuille est découpée en
// morceaux qui deviennent des pages : valeurs affichées, styles simples, fusions, en-têtes A, B, C… et
// 1, 2, 3… Les graphiques et images posés sur les feuilles ne sont pas dessinés.

import { createCanvas, type SKRSContext2D } from '@napi-rs/canvas';
import { materializeXlsxWorkbook } from '@silurus/ooxml/node';
import { T } from '../../texts/index.ts';
import { colName, type CellGrid, type TextRun } from './anchor.ts';
import { officeError, prepareFonts } from './office.ts';
import { MAX_PAGES, type OpenedDocument } from './open.ts';

type Workbook = Awaited<ReturnType<typeof materializeXlsxWorkbook>>;
type Sheet = Workbook['worksheets'][number];
type Styles = Workbook['workbookIndex']['styles'];
type Cell = Sheet['rows'][number]['cells'][number];

const SCALE = 2;
const HEAD_W = 40, HEAD_H = 20; // en-têtes de lignes et de colonnes (pixels à 1×)
const MAX_W = 1200, MAX_H = 1000; // taille d'un morceau de feuille (pixels à 1×)
const MIN_W = 640; // largeur minimale des colonnes d'une feuille (dix colonnes par défaut)
const PAD = 3;
const round = (v: number) => Math.round(v * 10000) / 10000;

/** Morceau de feuille : lignes et colonnes de r0 à r1 et de c0 à c1 (à partir de 1, comme dans Excel). */
export type Tile = { ws: Sheet; r0: number; r1: number; c0: number; c1: number };
export const tileRange = (t: Tile) => `${colName(t.c0 - 1)}${t.r0}:${colName(t.c1 - 1)}${t.r1}`;

// ——— Tailles ———

/** Largeur d'une colonne (à partir de 1) en pixels : largeur Excel en caractères de 7 px, marges comprises. */
function colPx(ws: Sheet, c: number) {
  if (ws.colHidden?.[c]) return 0;
  const set = ws.colWidths[c] ?? ws.colWidthRanges?.find((r) => c >= r.min && c <= r.max)?.width;
  return set !== undefined ? Math.trunc(set * 7 + 0.5) : Math.round(ws.defaultColWidth * 7 + 5);
}

function rowPx(ws: Sheet, r: number, row?: Sheet['rows'][number]) {
  if (row?.hidden) return 0;
  return Math.round((ws.rowHeights[r] ?? row?.height ?? ws.defaultRowHeight) * (4 / 3));
}

const hasValue = (c: Cell) => c.value.type !== 'empty';

/**
 * Morceaux d'une feuille : sa zone utilisée (cellules qui ont une valeur) découpée en blocs d'au plus
 * MAX_W × MAX_H pixels ; seuls les blocs qui contiennent une valeur sont gardés, au plus `limit`.
 */
export function tilesOf(ws: Sheet, limit = Infinity): Tile[] {
  const filled: [number, number][] = [];
  for (const row of ws.rows) for (const c of row.cells) if (hasValue(c)) filled.push([c.row, c.col]);
  if (!filled.length) return [];
  const maxRow = Math.max(...filled.map(([r]) => r));
  // Une feuille étroite garde une dizaine de colonnes : le texte y déborde sur les cellules vides, comme dans Excel.
  let maxCol = Math.max(...filled.map(([, c]) => c));
  for (let width = Array.from({ length: maxCol }, (_, i) => colPx(ws, i + 1)).reduce((a, b) => a + b, 0); width < MIN_W && maxCol < 16384; ) width += colPx(ws, ++maxCol);
  const rows = new Map(ws.rows.map((r) => [r.index, r]));
  const cut = (last: number, size: (i: number) => number, max: number) => {
    const spans: [number, number][] = [];
    for (let start = 1; start <= last; ) {
      let end = start, total = size(start);
      while (end < last && total + size(end + 1) <= max) total += size(++end);
      spans.push([start, end]);
      start = end + 1;
    }
    return spans;
  };
  const rowSpans = cut(maxRow, (r) => rowPx(ws, r, rows.get(r)), MAX_H);
  const colSpans = cut(maxCol, (c) => colPx(ws, c), MAX_W);
  /** Bloc qui contient l'index (recherche dichotomique). */
  const spanOf = (spans: [number, number][], v: number) => {
    let lo = 0, hi = spans.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (spans[mid]![1] < v) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const keys = [...new Set(filled.map(([r, c]) => spanOf(rowSpans, r) * colSpans.length + spanOf(colSpans, c)))].sort((a, b) => a - b);
  return keys.slice(0, limit).map((k) => {
    const [r0, r1] = rowSpans[Math.floor(k / colSpans.length)]!, [c0, c1] = colSpans[k % colSpans.length]!;
    return { ws, r0, r1, c0, c1 };
  });
}

// ——— Valeurs affichées ———

const BUILTIN: Record<number, string> = {
  0: 'General', 1: '0', 2: '0.00', 3: '#,##0', 4: '#,##0.00', 9: '0%', 10: '0.00%', 11: '0.00E+00', 12: '# ?/?', 13: '# ??/??',
  14: 'dd/mm/yyyy', 15: 'd-mmm-yy', 16: 'd-mmm', 17: 'mmm-yy', 18: 'h:mm AM/PM', 19: 'h:mm:ss AM/PM', 20: 'h:mm', 21: 'h:mm:ss',
  22: 'dd/mm/yyyy h:mm', 37: '#,##0 ;(#,##0)', 38: '#,##0 ;(#,##0)', 39: '#,##0.00;(#,##0.00)', 40: '#,##0.00;(#,##0.00)',
  45: 'mm:ss', 46: '[h]:mm:ss', 47: 'mm:ss.0', 48: '##0.0E+0', 49: '@',
};

/** Format « Standard » : dix chiffres significatifs au plus, notation scientifique aux extrêmes. */
function general(v: number, locale: string) {
  if (v !== 0 && (Math.abs(v) >= 1e11 || Math.abs(v) < 1e-9)) return v.toExponential(4).toUpperCase();
  return new Intl.NumberFormat(locale, { maximumSignificantDigits: 10, useGrouping: false }).format(v);
}

/** Valeur numérique mise en forme selon un code de format Excel (sous-ensemble courant : décimales, milliers, %, dates, devises). */
export function formatNumber(n: number, code: string, locale: string, date1904 = false): string {
  // Sections « positif;négatif;zéro » : la section des négatifs s'affiche sans le signe moins.
  const sections = code.split(/;(?=(?:[^"]*"[^"]*")*[^"]*$)/);
  let fmt = sections[0]!, sign = n < 0 ? '-' : '';
  if (n < 0 && sections[1]) [fmt, sign] = [sections[1], ''];
  else if (n === 0 && sections[2]) fmt = sections[2];
  let v = Math.abs(n);
  const bare = fmt.replace(/"[^"]*"|\\.|\[[^\]]*\]|_.|\*./g, '');
  if (!bare.trim() || /^\s*general\s*$/i.test(bare)) return sign + general(v, locale);
  if (bare.trim() === '@') return String(n);
  if (/[ydhs]/i.test(bare) || (/m/i.test(bare) && !/[0#?]/.test(bare))) {
    const date = new Date(Date.UTC(1899, 11, 30) + (date1904 ? 1462 : 0) * 86_400_000 + Math.round(n * 86_400_000));
    const hasTime = /[hs]/i.test(bare), hasDate = /[yd]/i.test(bare) || (/m/i.test(bare) && !hasTime);
    const parts = [
      hasDate && new Intl.DateTimeFormat(locale, { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date),
      hasTime && new Intl.DateTimeFormat(locale, { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', ...(/s/i.test(bare) ? { second: '2-digit' } : {}) }).format(date),
    ];
    return parts.filter(Boolean).join(' ');
  }
  if (bare.includes('%')) v *= 100;
  const pattern = bare.match(/[#0?][#0?,.]*/)?.[0] ?? '0';
  const decimals = (pattern.split('.')[1] ?? '').replace(/[^0#?]/g, '').length;
  const number = /E\+/i.test(bare)
    ? v.toExponential(decimals).toUpperCase()
    : new Intl.NumberFormat(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: /[#0?],[#0?]/.test(pattern) }).format(v);
  // Le reste du format est du texte : devises ([$€-40C]), chaînes entre guillemets, caractères échappés.
  const literal = fmt
    .replace(/\[\$([^\]-]*)[^\]]*\]/g, '$1')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/"([^"]*)"/g, '$1')
    .replace(/\\(.)/g, '$1')
    .replace(/_./g, ' ')
    .replace(/\*./g, '')
    .replace(/E\+0+/i, '');
  return sign + literal.replace(/[#0?][#0?,.]*/, number).trim();
}

/** Texte affiché dans une cellule. */
function cellText(cell: Cell, styles: Styles, strings: readonly { text: string }[], date1904: boolean): string {
  const v = cell.value;
  if (v.type === 'text') return v.text;
  if (v.type === 'shared') return strings[v.si]?.text ?? '';
  if (v.type === 'bool') return v.bool ? 'TRUE' : 'FALSE';
  if (v.type === 'error') return v.error;
  if (v.type !== 'number') return '';
  const id = styles.cellXfs[cell.styleIndex ?? 0]?.numFmtId ?? 0;
  const code = styles.numFmts.find((f) => f.numFmtId === id)?.formatCode ?? BUILTIN[id] ?? 'General';
  return formatNumber(v.number, code, T.lang, date1904);
}

// ——— Dessin ———

function wrap(ctx: SKRSContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > width) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  return lines;
}

/** Image d'un morceau de feuille et sa carte : cellules (grille) et texte de chaque cellule. */
export async function renderTile(tile: Tile, wb: Workbook) {
  const { ws, r0, r1, c0, c1 } = tile;
  const styles = wb.workbookIndex.styles;
  const strings = wb.workbookIndex.sharedStrings ?? [];
  const date1904 = !!(wb.workbookIndex.workbook as { date1904?: boolean }).date1904;
  const rows = new Map(ws.rows.map((r) => [r.index, r]));
  const xs = [HEAD_W], ys = [HEAD_H];
  for (let c = c0; c <= c1; c++) xs.push(xs.at(-1)! + colPx(ws, c));
  for (let r = r0; r <= r1; r++) ys.push(ys.at(-1)! + rowPx(ws, r, rows.get(r)));
  const W = xs.at(-1)!, H = ys.at(-1)!;
  const canvas = createCanvas(W * SCALE, H * SCALE);
  const ctx = canvas.getContext('2d');
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  const X = (c: number) => xs[Math.min(Math.max(c, c0), c1 + 1) - c0]!;
  const Y = (r: number) => ys[Math.min(Math.max(r, r0), r1 + 1) - r0]!;
  const merges = ws.mergeCells.filter((m) => m.right >= c0 && m.left <= c1 && m.bottom >= r0 && m.top <= r1);
  const mergeOf = (r: number, c: number) => merges.find((m) => r >= m.top && r <= m.bottom && c >= m.left && c <= m.right);
  const cellAt = (r: number, c: number) => rows.get(r)?.cells.find((x) => x.col === c);
  const xfOf = (cell: Cell | undefined, c: number) =>
    styles.cellXfs[cell?.styleIndex ?? ws.colStyleRanges?.find((s) => c >= s.min && c <= s.max)?.styleIndex ?? 0];

  // Quadrillage, sous les fonds de cellule comme dans Excel.
  if (ws.showGridlines !== false) {
    ctx.strokeStyle = '#E1E4E8';
    ctx.lineWidth = 1 / SCALE;
    ctx.beginPath();
    for (const x of xs) ctx.moveTo(x, HEAD_H), ctx.lineTo(x, H);
    for (const y of ys) ctx.moveTo(HEAD_W, y), ctx.lineTo(W, y);
    ctx.stroke();
  }

  const runs: TextRun[] = [];
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const merge = mergeOf(r, c);
      // Une cellule fusionnée est dessinée une fois, depuis son coin haut gauche (ou le bord du morceau).
      if (merge && (r !== Math.max(merge.top, r0) || c !== Math.max(merge.left, c0))) continue;
      const cell = merge ? cellAt(merge.top, merge.left) : cellAt(r, c);
      const xf = xfOf(cell, c);
      const x = X(merge ? merge.left : c), y = Y(merge ? merge.top : r);
      const w = (merge ? X(merge.right + 1) : X(c + 1)) - x, h = (merge ? Y(merge.bottom + 1) : Y(r + 1)) - y;
      if (!w || !h) continue;
      const fill = xf && styles.fills[xf.fillId];
      if (fill?.patternType === 'solid' && fill.fgColor) {
        ctx.fillStyle = fill.fgColor;
        ctx.fillRect(x, y, w, h);
      } else if (merge) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x + 0.5, y + 0.5, w - 1, h - 1); // pas de quadrillage à l'intérieur d'une fusion
      }
      const border = xf && styles.borders[xf.borderId];
      for (const [edge, x1, y1, x2, y2] of [
        [border?.top, x, y, x + w, y],
        [border?.bottom, x, y + h, x + w, y + h],
        [border?.left, x, y, x, y + h],
        [border?.right, x + w, y, x + w, y + h],
      ] as const) {
        if (!edge?.style || edge.style === 'none') continue;
        ctx.strokeStyle = edge.color ?? '#000000';
        ctx.lineWidth = edge.style === 'thick' ? 3 : edge.style.startsWith('medium') ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }

      if (!cell || !hasValue(cell)) continue;
      const text = cellText(cell, styles, strings, date1904);
      if (!text) continue;
      const font = xf && styles.fonts[xf.fontId];
      const size = ((font?.size ?? ws.defaultFontSize ?? 11) * 4) / 3;
      ctx.font = `${font?.italic ? 'italic ' : ''}${font?.bold ? 'bold ' : ''}${size}px "${font?.name ?? ws.defaultFontFamily ?? 'Calibri'}", Arial, sans-serif`;
      ctx.fillStyle = font?.color ?? '#000000';
      const numeric = cell.value.type === 'number';
      const align = xf?.alignH && xf.alignH !== 'general' ? xf.alignH : numeric ? 'right' : cell.value.type === 'text' || cell.value.type === 'shared' ? 'left' : 'center';
      // Un texte aligné à gauche déborde sur les cellules vides qui suivent, comme dans Excel.
      let room = w;
      if (align === 'left' && !xf?.wrapText && !merge) for (let n = c + 1; n <= c1 && !(cellAt(r, n) && hasValue(cellAt(r, n)!)); n++) room += X(n + 1) - X(n);
      const lines = xf?.wrapText ? wrap(ctx, text, w - 2 * PAD) : [text];
      const lineH = size * 1.2;
      const top = xf?.alignV === 'top' ? y + PAD : xf?.alignV === 'center' ? y + (h - lines.length * lineH) / 2 : y + h - PAD - lines.length * lineH;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, room, h);
      ctx.clip();
      ctx.textBaseline = 'top';
      ctx.textAlign = align === 'right' ? 'right' : align === 'center' || align === 'centerContinuous' ? 'center' : 'left';
      const tx = ctx.textAlign === 'right' ? x + w - PAD : ctx.textAlign === 'center' ? x + w / 2 : x + PAD;
      lines.forEach((line, i) => ctx.fillText(line, tx, top + i * lineH + size * 0.1));
      ctx.restore();
      runs.push({ t: text, x: round(x / W), y: round(y / H), w: round(w / W), h: round(h / H), block: true });
    }
  }

  // En-têtes de colonnes (A, B, C…) et de lignes (1, 2, 3…).
  ctx.fillStyle = '#F3F4F6';
  ctx.fillRect(0, 0, W, HEAD_H);
  ctx.fillRect(0, 0, HEAD_W, H);
  ctx.strokeStyle = '#D1D5DB';
  ctx.lineWidth = 1 / SCALE;
  ctx.beginPath();
  ctx.moveTo(0, HEAD_H), ctx.lineTo(W, HEAD_H), ctx.moveTo(HEAD_W, 0), ctx.lineTo(HEAD_W, H);
  for (const x of xs) ctx.moveTo(x, 0), ctx.lineTo(x, HEAD_H);
  for (const y of ys) ctx.moveTo(0, y), ctx.lineTo(HEAD_W, y);
  ctx.stroke();
  ctx.fillStyle = '#4B5563';
  ctx.font = '11px Arial, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  for (let c = c0; c <= c1; c++) if (X(c + 1) - X(c) > 8) ctx.fillText(colName(c - 1), (X(c) + X(c + 1)) / 2, HEAD_H / 2);
  for (let r = r0; r <= r1; r++) if (Y(r + 1) - Y(r) > 6) ctx.fillText(String(r), HEAD_W / 2, (Y(r) + Y(r + 1)) / 2);

  const grid: CellGrid = {
    sheet: ws.name,
    col0: c0 - 1,
    row0: r0 - 1,
    xs: xs.map((x) => round(x / W)),
    ys: ys.map((y) => round(y / H)),
    ...(merges.length ? { merges: merges.map((m) => [m.left - 1, m.top - 1, m.right - 1, m.bottom - 1] as [number, number, number, number]) } : {}),
  };
  return { png: await canvas.encode('png'), width: W * SCALE, height: H * SCALE, map: { runs, grid } };
}

export async function openXlsx(bytes: Uint8Array): Promise<OpenedDocument> {
  prepareFonts();
  const wb = await materializeXlsxWorkbook(bytes).catch((err) => Promise.reject(officeError(err)));
  // Feuilles visibles et non vides ; un classeur vide garde sa première feuille.
  const sheets = wb.worksheets.filter((ws, i) => !wb.workbookIndex.workbook.sheets[i]?.visibility && !ws.isChartSheet && !ws.isDialogSheet);
  // Au plus une page de plus que le plafond : l'import sait ainsi que le classeur a été tronqué.
  let tiles: Tile[] = [];
  for (const ws of sheets) if (tiles.length <= MAX_PAGES) tiles = tiles.concat(tilesOf(ws, MAX_PAGES + 1 - tiles.length));
  if (!tiles.length && sheets[0]) tiles = [{ ws: sheets[0], r0: 1, r1: 20, c0: 1, c1: 8 }];
  return {
    pages: tiles.length,
    async render(index) {
      const tile = tiles[index]!;
      return { ...(await renderTile(tile, wb)), sheet: tile.ws.name, range: tileRange(tile) };
    },
    close: async () => {},
  };
}
