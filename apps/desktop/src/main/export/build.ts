// Moteur d'export commun : prépare une fois le contenu et les images (captures
// annotées, zooms autour de chaque point, croquis, inspirations), que les rendus PDF,
// Markdown et PowerPoint se contentent de mettre en forme.

import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createCanvas, loadImage, type Image, type SKRSContext2D } from '@napi-rs/canvas';
import { allAnnotations, bounds, drawAnnotations, isSkippedPage, type Annotation, type Capture, type Ctx2D, type Inspiration, type Session } from '@pastille/shared';
import { T } from '../../texts/index.ts';
import { anchorText, loadTextMap, type TextMap } from '../document/anchor.ts';

const MAX_SCREEN_WIDTH = 2000;
const CROP_W = 600;
const CROP_H = 400;
const CROP_MARGIN = 60; // pixels source autour d'une zone ou d'une flèche
const JPEG_QUALITY = 80;

export type ExportPoint = {
  number: number;
  text: string;
  kind: Annotation['geometry']['kind'];
  screen: number;
  crop: string; // chemin relatif au dossier d'export
  sketches: string[];
  inspirations: { image: string; source?: string }[];
  position: string;
};

export type ExportScreen = { index: number; title: string; image: string; width: number; height: number; points: ExportPoint[] };

export type ExportDoc = {
  name: string;
  date: string;
  context?: string;
  notes: string[]; // remarques générales non vides
  instructions: string;
  screens: ExportScreen[];
  points: ExportPoint[];
};

export function screenTitle(index: number, capture: Capture): string {
  const doc = capture.source?.document;
  if (doc) return T.exports.page(doc.page, doc.pages, doc.name);
  return [T.exports.screen(index), capture.source?.app, capture.source?.windowTitle].filter(Boolean).join(' — ');
}

/** « Google Chrome — Tarifs » : d'où vient une inspiration capturée sur une fenêtre. */
export function sourceLabel(source: Inspiration['source']): string | undefined {
  return [source?.app, source?.windowTitle].filter(Boolean).join(' — ') || undefined;
}

/**
 * Position lisible en pixels de la capture (« x 120, y 340 sur 1600 × 1000 »), précédée du texte
 * visé pour une page de document (`map` : sa carte du texte).
 */
export function position(a: Annotation, c: Capture, map?: TextMap): string {
  const X = (v: number) => Math.round(v * c.width), Y = (v: number) => Math.round(v * c.height);
  const E = T.exports, size = E.on(c.width, c.height);
  const g = a.geometry;
  const pixels =
    g.kind === 'point'
      ? E.point(X(g.x), Y(g.y), size)
      : g.kind === 'zone'
        ? E.zone(X(g.x), Y(g.y), X(g.w), Y(g.h), size)
        : E.arrow(X(g.x1), Y(g.y1), X(g.x2), Y(g.y2), size);
  const anchor = anchorText(g, map);
  return anchor ? `${E.anchor(anchor)} · ${pixels}` : pixels;
}

/** Région source (pixels) du zoom : 600 × 400 autour du point, ou la boîte de l'annotation + marge, au ratio 3:2. */
export function cropRegion(a: Annotation, c: Capture) {
  const b = bounds(a.geometry);
  const bx = b.x * c.width, by = b.y * c.height, bw = b.w * c.width, bh = b.h * c.height;
  let w = Math.max(CROP_W, bw + 2 * CROP_MARGIN);
  let h = Math.max(CROP_H, bh + 2 * CROP_MARGIN);
  if (w / h > CROP_W / CROP_H) h = (w * CROP_H) / CROP_W;
  else w = (h * CROP_W) / CROP_H;
  w = Math.min(w, c.width);
  h = Math.min(h, c.height);
  const x = Math.min(Math.max(0, bx + bw / 2 - w / 2), c.width - w);
  const y = Math.min(Math.max(0, by + bh / 2 - h / 2), c.height - h);
  return { x, y, w, h };
}

function renderJpeg(width: number, height: number, draw: (ctx: SKRSContext2D) => void, quality = JPEG_QUALITY) {
  const canvas = createCanvas(Math.round(width), Math.round(height));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  draw(ctx);
  return canvas.encode('jpeg', quality);
}

/** Zoom d'environ 600 × 400 autour d'une annotation, pastille dessinée (exports et fond de la tablette). */
export function cropJpeg(img: Image, capture: Capture, a: Annotation, quality = JPEG_QUALITY): Promise<Buffer> {
  const r = cropRegion(a, capture);
  const s = Math.min(1, CROP_W / r.w);
  return renderJpeg(
    r.w * s,
    r.h * s,
    (ctx) => {
      ctx.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, r.w * s, r.h * s);
      const view = { x: -r.x * s, y: -r.y * s, width: capture.width * s, height: capture.height * s };
      drawAnnotations(asCtx(ctx), [a], view, { radius: 16 });
    },
    quality,
  );
}

/** Capture entière avec toutes ses annotations, limitée à 2000 px de large (exports et MCP). */
export function screenJpeg(img: Image, capture: Capture): Promise<Buffer> {
  const scale = Math.min(1, MAX_SCREEN_WIDTH / capture.width);
  const W = capture.width * scale, H = capture.height * scale;
  return renderJpeg(W, H, (ctx) => {
    ctx.drawImage(img, 0, 0, W, H);
    drawAnnotations(asCtx(ctx), capture.annotations, { x: 0, y: 0, width: W, height: H }, { radius: Math.max(12, W / 90) });
  });
}

/** Inspiration entière, limitée à 2000 px de large comme les captures (exports et MCP). */
export function inspirationJpeg(img: Image): Promise<Buffer> {
  const scale = Math.min(1, MAX_SCREEN_WIDTH / img.width);
  const W = img.width * scale, H = img.height * scale;
  return renderJpeg(W, H, (ctx) => ctx.drawImage(img, 0, 0, W, H));
}

// Le contexte de @napi-rs/canvas suit l'API Canvas 2D du navigateur.
const asCtx = (ctx: SKRSContext2D) => ctx as unknown as Ctx2D;

/** Écrit les images dans `outDir/images/` et renvoie le contenu à mettre en forme. */
export async function buildExport(
  session: Session,
  sessionDir: string,
  outDir: string,
  instructionsTemplate = T.instructions,
): Promise<ExportDoc> {
  await mkdir(join(outDir, 'images'), { recursive: true });
  const total = allAnnotations(session).length;
  const screens: ExportScreen[] = [];

  for (const [i, capture] of session.captures.entries()) {
    // Les pages de document sans point sont sautées ; les numéros restent ceux de la session (voir_ecran).
    if (isSkippedPage(capture)) continue;
    const index = i + 1;
    const img = await loadImage(join(sessionDir, capture.image));
    const map = await loadTextMap(sessionDir, capture);
    const scale = Math.min(1, MAX_SCREEN_WIDTH / capture.width);
    const W = capture.width * scale, H = capture.height * scale;
    const image = `images/ecran-${index}.jpg`;
    await writeFile(join(outDir, image), await screenJpeg(img, capture));

    const points: ExportPoint[] = [];
    for (const a of capture.annotations) {
      const crop = `images/point-${a.number}.jpg`;
      await writeFile(join(outDir, crop), await cropJpeg(img, capture, a));

      const sketches: string[] = [];
      for (const [k, sketch] of a.sketches.entries()) {
        const file = `images/croquis-${a.number}${a.sketches.length > 1 ? `-${k + 1}` : ''}.png`;
        await copyFile(join(sessionDir, sketch.png), join(outDir, file));
        sketches.push(file);
      }
      const inspirations: ExportPoint['inspirations'] = [];
      for (const [k, inspiration] of (a.inspirations ?? []).entries()) {
        const file = `images/inspiration-${a.number}${a.inspirations!.length > 1 ? `-${k + 1}` : ''}.jpg`;
        await writeFile(join(outDir, file), await inspirationJpeg(await loadImage(join(sessionDir, inspiration.image))));
        inspirations.push({ image: file, source: sourceLabel(inspiration.source) });
      }
      points.push({
        number: a.number,
        text: a.text.trim(),
        kind: a.geometry.kind,
        screen: index,
        crop,
        sketches,
        inspirations,
        position: position(a, capture, map),
      });
    }
    screens.push({ index, title: screenTitle(index, capture), image, width: Math.round(W), height: Math.round(H), points });
  }

  return {
    name: session.name,
    date: T.exports.date(session.createdAt),
    context: session.context?.trim() || undefined,
    notes: (session.notes ?? []).map((n) => n.text.trim()).filter(Boolean),
    instructions: instructionsTemplate.replaceAll('{N}', String(total)),
    screens,
    points: screens.flatMap((s) => s.points),
  };
}
