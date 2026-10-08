// Copie commentée d'un PDF : chaque point devient une note PDF native (Aperçu, Acrobat) dont
// l'apparence est la pastille numérotée ; une zone, un rectangle ; une flèche, une ligne fléchée.

import {
  appendBezierCurve,
  beginText,
  closePath,
  endText,
  fill,
  fillAndStroke,
  lineTo,
  moveText,
  moveTo,
  PDFDocument,
  PDFHexString,
  PDFName,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  setFillingRgbColor,
  setFontAndSize,
  setLineCap,
  setLineJoin,
  setLineWidth,
  setStrokingRgbColor,
  showText,
  StandardFonts,
  stroke,
  LineCapStyle,
  LineJoinStyle,
  type PDFFont,
  type PDFOperator,
  type PDFPage,
} from 'pdf-lib';
import { PIN_COLOR, type Geometry } from '@pastille/shared';
import { toPdfSpace } from './anchor.ts';

export type PdfComment = { page: number; number: number; geometry: Geometry; text: string };

const AUTHOR = 'VibeScreener';
const K = 0.5523; // arc de cercle en courbe de Bézier
const hex = parseInt(PIN_COLOR.slice(1), 16);
const ORANGE = [(hex >> 16) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255] as const;

const pdfDate = (d: Date) => `D:${d.toISOString().replace(/[-:T]/g, '').slice(0, 14)}Z`;

/** Cercle de centre (cx, cy) et de rayon r, en quatre courbes. */
function circle(cx: number, cy: number, r: number): PDFOperator[] {
  const k = r * K;
  return [
    moveTo(cx + r, cy),
    appendBezierCurve(cx + r, cy + k, cx + k, cy + r, cx, cy + r),
    appendBezierCurve(cx - k, cy + r, cx - r, cy + k, cx - r, cy),
    appendBezierCurve(cx - r, cy - k, cx - k, cy - r, cx, cy - r),
    appendBezierCurve(cx + k, cy - r, cx + r, cy - k, cx + r, cy),
    closePath(),
  ];
}

/** Goutte de la pastille (comme render.ts) : carré de côté 2r arrondi, pointe en bas à gauche sur (x, y). */
function drop(x: number, y: number, r: number): PDFOperator[] {
  const t = r / 4, k = r * K, s = 2 * r;
  return [
    moveTo(x + t, y),
    lineTo(x + r, y),
    appendBezierCurve(x + r + k, y, x + s, y + r - k, x + s, y + r),
    appendBezierCurve(x + s, y + r + k, x + r + k, y + s, x + r, y + s),
    appendBezierCurve(x + r - k, y + s, x, y + r + k, x, y + r),
    lineTo(x, y + t),
    appendBezierCurve(x, y + t * (1 - K), x + t * (1 - K), y, x + t, y),
    closePath(),
  ];
}

/** Pastille orange bordée de blanc, numéro centré en Helvetica gras. */
function badge(shape: PDFOperator[], cx: number, cy: number, r: number, n: number, font: PDFFont): PDFOperator[] {
  const label = String(n);
  const size = r * (label.length > 2 ? 0.72 : label.length > 1 ? 0.85 : 0.92);
  const w = font.widthOfTextAtSize(label, size);
  return [
    setFillingRgbColor(...ORANGE),
    setStrokingRgbColor(1, 1, 1),
    setLineWidth(Math.max(1, r / 6.5)),
    ...shape,
    fillAndStroke(),
    setFillingRgbColor(1, 1, 1),
    beginText(),
    setFontAndSize('F1', size),
    moveText(cx - w / 2, cy - size * 0.35),
    showText(font.encodeText(label)),
    endText(),
  ];
}

/** Ajoute les commentaires à une copie du PDF ; l'original passé n'est pas modifié. */
export async function writeCommentedPdf(original: Uint8Array, comments: PdfComment[], now = new Date()): Promise<Uint8Array> {
  const doc = await PDFDocument.load(original, { updateMetadata: false });
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const ctx = doc.context;
  const date = PDFHexString.fromText(pdfDate(now));

  function add(page: PDFPage, c: PdfComment) {
    const box = page.getCropBox();
    const rotate = ((page.getRotation().angle % 360) + 360) % 360;
    const P = (x: number, y: number) => toPdfSpace(x, y, box, rotate);
    // L'apparence est dessinée dans le repère de la page telle qu'affichée (tournée), y vers le haut ;
    // sa matrice la remet dans celui du fichier : la pastille reste droite sur une page tournée.
    const turned = rotate % 180 !== 0;
    const Wd = turned ? box.height : box.width, Hd = turned ? box.width : box.height;
    const D = (x: number, y: number): [number, number] => [x * Wd, (1 - y) * Hd];
    const r = Math.max(6, Math.min(box.width, box.height) * 0.014);
    const lw = Math.max(1.5, r / 4);
    const g = c.geometry;
    // Forme de l'annotation : sous-type, points à englober et dessin (repère affiché, relatif au coin de l'apparence).
    type At = (x: number, y: number) => readonly [number, number];
    let shape: { subtype: string; xs: number[]; ys: number[]; ops: (at: At) => PDFOperator[]; extra: (rect: number[]) => Record<string, unknown> };

    if (g.kind === 'point') {
      // La pointe de la goutte touche le point visé ; la pastille est au-dessus à droite.
      const [x, y] = D(g.x, g.y);
      shape = {
        subtype: 'Text',
        xs: [x, x + 2 * r],
        ys: [y, y + 2 * r],
        ops: (at) => {
          const [ox, oy] = at(x, y);
          return badge(drop(ox, oy, r), ox + r, oy + r, r, c.number, font);
        },
        extra: () => ({ Name: 'Comment', Open: false }),
      };
    } else if (g.kind === 'zone') {
      // La pastille ronde est sur le coin de départ de la zone (haut gauche à l'écran) ; RD isole le rectangle.
      const [ax, ay] = D(g.x, g.y), [bx, by] = D(g.x + g.w, g.y + g.h);
      const x0 = Math.min(ax, bx), y0 = Math.min(ay, by), x1 = Math.max(ax, bx), y1 = Math.max(ay, by);
      // Rectangle de la zone dans le repère du fichier, pour RD.
      const corners = [P(g.x, g.y), P(g.x + g.w, g.y + g.h)];
      const zx0 = Math.min(corners[0]![0], corners[1]![0]), zy0 = Math.min(corners[0]![1], corners[1]![1]);
      const zx1 = Math.max(corners[0]![0], corners[1]![0]), zy1 = Math.max(corners[0]![1], corners[1]![1]);
      shape = {
        subtype: 'Square',
        xs: [x0, x1, ax - r, ax + r],
        ys: [y0, y1, ay - r, ay + r],
        ops: (at) => {
          const [rx, ry] = at(x0, y0), [cx, cy] = at(ax, ay);
          return [setStrokingRgbColor(...ORANGE), setLineWidth(lw), rectangle(rx, ry, x1 - x0, y1 - y0), stroke(), ...badge(circle(cx, cy, r), cx, cy, r, c.number, font)];
        },
        extra: (rect) => ({ RD: [zx0 - rect[0]!, zy0 - rect[1]!, rect[2]! - zx1, rect[3]! - zy1], BS: { W: lw } }),
      };
    } else {
      const [x1, y1] = D(g.x1, g.y1), [x2, y2] = D(g.x2, g.y2);
      const angle = Math.atan2(y2 - y1, x2 - x1), head = r * 1.1;
      shape = {
        subtype: 'Line',
        xs: [x1 - r, x1 + r, x2 - r, x2 + r],
        ys: [y1 - r, y1 + r, y2 - r, y2 + r],
        ops: (at) => {
          const [sx, sy] = at(x1, y1), [ex, ey] = at(x2, y2);
          return [
            setStrokingRgbColor(...ORANGE),
            setLineWidth(lw),
            setLineCap(LineCapStyle.Round),
            setLineJoin(LineJoinStyle.Round),
            moveTo(sx, sy),
            lineTo(ex, ey),
            moveTo(ex - head * Math.cos(angle - 0.6), ey - head * Math.sin(angle - 0.6)),
            lineTo(ex, ey),
            lineTo(ex - head * Math.cos(angle + 0.6), ey - head * Math.sin(angle + 0.6)),
            stroke(),
            ...badge(circle(sx, sy, r), sx, sy, r, c.number, font),
          ];
        },
        extra: () => ({ L: [...P(g.x1, g.y1), ...P(g.x2, g.y2)], LE: [PDFName.of('None'), PDFName.of('OpenArrow')], BS: { W: lw } }),
      };
    }

    // Boîte de l'apparence dans le repère affiché (marge d'un trait : rien n'est rogné), puis Rect dans
    // le repère du fichier : les coins de cette boîte ramenés dans la page.
    const bx0 = Math.min(...shape.xs) - lw, by0 = Math.min(...shape.ys) - lw;
    const bx1 = Math.max(...shape.xs) + lw, by1 = Math.max(...shape.ys) + lw;
    const at: At = (x, y) => [x - bx0, y - by0];
    const pdfCorners = [
      [bx0, by0],
      [bx1, by0],
      [bx0, by1],
      [bx1, by1],
    ].map(([x, y]) => P(x! / Wd, 1 - y! / Hd));
    const rect = [Math.min(...pdfCorners.map((p) => p[0])), Math.min(...pdfCorners.map((p) => p[1])), Math.max(...pdfCorners.map((p) => p[0])), Math.max(...pdfCorners.map((p) => p[1]))];
    const cos = Math.round(Math.cos((rotate * Math.PI) / 180)), sin = Math.round(Math.sin((rotate * Math.PI) / 180));
    const appearance = ctx.formXObject([pushGraphicsState(), ...shape.ops(at), popGraphicsState()], {
      BBox: [0, 0, bx1 - bx0, by1 - by0],
      Matrix: [cos, sin, -sin, cos, 0, 0],
      Resources: { Font: { F1: font.ref } },
    });
    const annot = ctx.obj({
      Type: 'Annot',
      Subtype: shape.subtype,
      Rect: rect,
      Contents: PDFHexString.fromText(c.text),
      T: PDFHexString.fromText(AUTHOR),
      NM: PDFHexString.fromText(`vibescreener-${c.number}`),
      M: date,
      CreationDate: date,
      C: [...ORANGE],
      F: 4, // imprimée
      AP: { N: ctx.register(appearance) },
      ...shape.extra(rect),
    });
    page.node.addAnnot(ctx.register(annot));
  }

  const pages = doc.getPages();
  for (const c of comments) {
    const page = pages[c.page - 1];
    if (page) add(page, c);
  }
  return doc.save();
}
