// Export d'une session : PDF (pour l'IA en chat) ou dossier Markdown (pour l'IA qui lit des fichiers).

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { slugify, stamp, type Session } from '@pastille/shared';
import { T } from '../../texts/index.ts';
import { buildExport } from './build.ts';
import { toMarkdown } from './markdown.ts';
import { toPdfHtml } from './pdf-html.ts';
import { toPptx } from './pptx.ts';

export type ExportFormat = 'pdf' | 'markdown' | 'pptx';

// Plusieurs assistants IA plafonnent les PDF acceptés : au-delà, le PDF est découpé en parties (§6.3).
export const MAX_PDF_PAGES = 100;
export const MAX_PDF_BYTES = 30 * 1024 * 1024;

const pageCount = (pdf: Uint8Array) => Buffer.from(pdf).toString('latin1').match(/\/Type\s*\/Page[^s]/g)?.length ?? 0;

/** Imprime une page HTML en PDF. Fourni par le processus Electron (webContents.printToPDF). */
export type PrintHtml = (htmlFile: string) => Promise<Uint8Array>;

export function exportBaseName(session: Session, now = new Date()): string {
  return `vibescreener-${slugify(session.name)}-${stamp(now)}`;
}

/** Renvoie le chemin du fichier PDF (le premier s'il est découpé) ou PowerPoint, ou du dossier Markdown créé. */
export async function exportSession(opts: {
  session: Session;
  sessionDir: string;
  outDir: string;
  format: ExportFormat;
  printHtml: PrintHtml;
  instructions?: string; // modèle du texte d'instructions, {N} = nombre de retours
}): Promise<string> {
  const { session, sessionDir, outDir, format } = opts;
  const base = exportBaseName(session);
  await mkdir(outDir, { recursive: true });

  if (format === 'markdown') {
    const dir = join(outDir, base);
    const doc = await buildExport(session, sessionDir, dir, opts.instructions);
    await writeFile(join(dir, `${T.exports.reviewFile}.md`), toMarkdown(doc));
    return dir;
  }

  const work = await mkdtemp(join(tmpdir(), 'pastille-export-'));
  try {
    const doc = await buildExport(session, sessionDir, work, opts.instructions);
    if (format === 'pptx') {
      const file = join(outDir, `${base}.pptx`);
      await writeFile(file, await toPptx(doc, work));
      return file;
    }
    const print = async (name: string, content: string) => {
      const html = join(work, name);
      await writeFile(html, content);
      return opts.printHtml(html);
    };
    const pdf = await print('index.html', toPdfHtml(doc));
    const parts = Math.min(
      doc.screens.length,
      Math.max(Math.ceil(pageCount(pdf) / MAX_PDF_PAGES), Math.ceil(pdf.byteLength / MAX_PDF_BYTES)),
    );
    if (parts <= 1) {
      const file = join(outDir, `${base}.pdf`);
      await writeFile(file, pdf);
      return file;
    }
    const files: string[] = [];
    const size = Math.ceil(doc.screens.length / parts);
    for (let i = 0; i < parts; i++) {
      const screens = doc.screens.slice(i * size, (i + 1) * size);
      if (!screens.length) continue;
      const file = join(outDir, `${base}-${T.exports.partFile(i + 1, parts)}.pdf`);
      await writeFile(file, await print(`partie-${i + 1}.html`, toPdfHtml(doc, { index: i + 1, total: parts, screens })));
      files.push(file);
    }
    return files[0]!;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
