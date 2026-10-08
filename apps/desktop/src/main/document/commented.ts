// Export « copie commentée » : pour chaque document de la session, une copie de l'original où les
// points sont écrits au format du document (notes PDF, commentaires Word et PowerPoint, notes Excel).
// L'original copié dans la session n'est jamais modifié.

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import type { Annotation, Capture, DocumentPage, Geometry, Session } from '@pastille/shared';
import { T } from '../../texts/index.ts';
import { anchorOf, cellAt, cellRef, loadTextMap, targetRuns, type TextMap, type TextRun } from './anchor.ts';
import { writeCommentedDocx, type ParagraphRef } from './commented-docx.ts';
import { writeCommentedPdf } from './commented-pdf.ts';
import { writeCommentedPptx } from './commented-pptx.ts';
import { writeCommentedXlsx } from './commented-xlsx.ts';

/** « #3 — texte », avec la mention des croquis et inspirations qui ne peuvent pas entrer dans le document. */
export function commentText(a: Annotation): string {
  const E = T.exports;
  const text = a.text.trim() || E.noComment;
  const extras = [a.sketches.length && E.sketchCount(a.sketches.length), a.inspirations?.length && E.inspirationCount(a.inspirations.length)].filter(Boolean);
  return `#${a.number} — ${text}${extras.length ? ` (${E.seeExport(extras.join(', '))})` : ''}`;
}

/** « rapport (commenté).pdf », puis « rapport (commenté 2).pdf » : un fichier existant n'est jamais remplacé. */
function freeName(dir: string, name: string) {
  const ext = extname(name), stem = name.slice(0, name.length - ext.length);
  for (let i = 1; ; i++) {
    const file = join(dir, `${stem} (${T.exports.commented(i)})${ext}`);
    if (!existsSync(file)) return file;
  }
}

/** Point de départ d'une annotation : le point, le coin d'une zone, le départ d'une flèche. */
const origin = (g: Geometry) => (g.kind === 'point' ? { x: g.x, y: g.y } : g.kind === 'zone' ? { x: g.x, y: g.y } : { x: g.x1, y: g.y1 });

/** Paragraphes Word visés (premier et dernier) : ceux du texte visé, sinon le plus proche sur la page. */
function paragraphsOf(g: Geometry, map: TextMap | undefined): ParagraphRef[] {
  if (!map) return [];
  let runs = targetRuns(g, map).filter((r) => r.p);
  if (!runs.length) {
    const { x, y } = origin(g);
    const nearest = map.runs.filter((r) => r.p).sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0];
    runs = nearest ? [nearest] : [];
  }
  // Texte de chaque paragraphe sur la page : il sert à retrouver le paragraphe dans le fichier.
  const ref = (run: TextRun): ParagraphRef => ({
    id: run.pid,
    path: run.p,
    text: map.runs.filter((r) => r.p === run.p).map((r) => r.t).join(''),
  });
  return runs.length ? [ref(runs[0]!), ref(runs.at(-1)!)] : [];
}

type Point = { capture: Capture; doc: DocumentPage; annotation: Annotation; map?: TextMap };

/** Copie commentée d'un document, au format de l'original. */
async function writeCopy(format: DocumentPage['format'], original: Uint8Array, points: Point[], now?: Date): Promise<Uint8Array> {
  const text = (p: Point) => commentText(p.annotation);
  if (format === 'pdf')
    return writeCommentedPdf(
      original,
      points.map((p) => ({ page: p.doc.page, number: p.annotation.number, geometry: p.annotation.geometry, text: text(p) })),
      now,
    );
  if (format === 'docx')
    return writeCommentedDocx(
      original,
      points.map((p) => ({
        number: p.annotation.number,
        text: text(p),
        refs: paragraphsOf(p.annotation.geometry, p.map),
        where: T.editor.docLabel('docx', p.doc.page), // rappelé si le paragraphe n'est pas retrouvé
      })),
      now,
    );
  if (format === 'pptx')
    return writeCommentedPptx(original, points.map((p) => ({ slide: p.doc.page, number: p.annotation.number, text: text(p), ...origin(p.annotation.geometry) })), now);
  return writeCommentedXlsx(
    original,
    points.flatMap((p) => {
      const grid = p.map?.grid;
      if (!grid) return [];
      const { x, y } = origin(p.annotation.geometry);
      const anchor = anchorOf(p.annotation.geometry, p.map);
      const cells = anchor && 'cells' in anchor ? anchor.cells : '';
      const cell = cellRef(cellAt(grid, x, y));
      // Une zone ou une flèche est notée sur sa première cellule, avec la plage visée.
      return [{ sheet: grid.sheet, cell, number: p.annotation.number, text: cells && cells !== cell ? `${text(p)} (${cells})` : text(p) }];
    }),
  );
}

/** Écrit les copies commentées dans `outDir` ; renvoie le chemin de la première. */
export async function writeCommented(opts: { session: Session; sessionDir: string; outDir: string; now?: Date }): Promise<string> {
  const docs = new Map<string, { doc: DocumentPage; points: Point[] }>();
  for (const capture of opts.session.captures) {
    const doc = capture.source?.document;
    if (!doc) continue;
    const entry = docs.get(doc.id) ?? { doc, points: [] };
    docs.set(doc.id, entry);
    const map = capture.annotations.length && doc.format !== 'pdf' ? await loadTextMap(opts.sessionDir, capture) : undefined;
    for (const annotation of capture.annotations) entry.points.push({ capture, doc, annotation, map });
  }
  const written: string[] = [];
  await mkdir(opts.outDir, { recursive: true });
  for (const { doc, points } of docs.values()) {
    if (!points.length) continue;
    const original = new Uint8Array(await readFile(join(opts.sessionDir, 'documents', `${doc.id}.${doc.format}`)));
    let copy: Uint8Array;
    try {
      copy = await writeCopy(doc.format, original, points, opts.now);
    } catch (err) {
      if ((err as Error)?.name === 'EncryptedPDFError') throw new Error(T.main.document.protectedPdf(doc.name));
      throw err;
    }
    const file = freeName(opts.outDir, doc.name);
    await writeFile(file, copy);
    written.push(file);
  }
  if (!written.length) throw new Error(T.main.document.nothingToWrite);
  return written[0]!;
}
