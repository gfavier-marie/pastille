// Export « copie commentée » : pour chaque document de la session, une copie de l'original
// où les points sont écrits au format du document. L'original copié dans la session n'est jamais modifié.

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import type { Annotation, DocumentPage, Session } from '@pastille/shared';
import { T } from '../../texts/index.ts';
import { writeCommentedPdf } from './commented-pdf.ts';

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

/** Écrit les copies commentées dans `outDir` ; renvoie le chemin de la première. */
export async function writeCommented(opts: { session: Session; sessionDir: string; outDir: string; now?: Date }): Promise<string> {
  const docs = new Map<string, { doc: DocumentPage; points: { page: number; annotation: Annotation }[] }>();
  for (const c of opts.session.captures) {
    const doc = c.source?.document;
    if (!doc) continue;
    const entry = docs.get(doc.id) ?? { doc, points: [] };
    docs.set(doc.id, entry);
    for (const a of c.annotations) entry.points.push({ page: doc.page, annotation: a });
  }
  const written: string[] = [];
  await mkdir(opts.outDir, { recursive: true });
  for (const { doc, points } of docs.values()) {
    if (!points.length) continue;
    const original = new Uint8Array(await readFile(join(opts.sessionDir, 'documents', `${doc.id}.${doc.format}`)));
    let copy: Uint8Array;
    if (doc.format === 'pdf') {
      try {
        copy = await writeCommentedPdf(
          original,
          points.map((p) => ({ page: p.page, number: p.annotation.number, geometry: p.annotation.geometry, text: commentText(p.annotation) })),
          opts.now,
        );
      } catch (err) {
        if ((err as Error)?.name === 'EncryptedPDFError') throw new Error(T.main.document.protectedPdf(doc.name));
        throw err;
      }
    } else continue; // Word, Excel et PowerPoint : lot suivant
    const file = freeName(opts.outDir, doc.name);
    await writeFile(file, copy);
    written.push(file);
  }
  if (!written.length) throw new Error(T.main.document.nothingToWrite);
  return written[0]!;
}
