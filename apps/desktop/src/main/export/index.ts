// Export d'une session : PDF (pour l'IA en chat) ou dossier Markdown (pour l'IA qui lit des fichiers).

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { slugify, stamp, type Session } from '@pastille/shared';
import { buildExport } from './build.ts';
import { toMarkdown } from './markdown.ts';
import { toPdfHtml } from './pdf-html.ts';

export type ExportFormat = 'pdf' | 'markdown';

/** Imprime une page HTML en PDF. Fourni par le processus Electron (webContents.printToPDF). */
export type PrintHtml = (htmlFile: string) => Promise<Uint8Array>;

export function exportBaseName(session: Session, now = new Date()): string {
  return `pastille-${slugify(session.name)}-${stamp(now)}`;
}

/** Renvoie le chemin du fichier PDF ou du dossier Markdown créé. */
export async function exportSession(opts: {
  session: Session;
  sessionDir: string;
  outDir: string;
  format: ExportFormat;
  printHtml: PrintHtml;
}): Promise<string> {
  const { session, sessionDir, outDir, format } = opts;
  const base = exportBaseName(session);
  await mkdir(outDir, { recursive: true });

  if (format === 'markdown') {
    const dir = join(outDir, base);
    const doc = await buildExport(session, sessionDir, dir);
    await writeFile(join(dir, 'revue.md'), toMarkdown(doc));
    return dir;
  }

  const work = await mkdtemp(join(tmpdir(), 'pastille-export-'));
  try {
    const doc = await buildExport(session, sessionDir, work);
    const html = join(work, 'index.html');
    await writeFile(html, toPdfHtml(doc));
    const file = join(outDir, `${base}.pdf`);
    await writeFile(file, await opts.printHtml(html));
    return file;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
