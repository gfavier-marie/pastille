// Ouvrir un document dans l'app : comme la vidéo, il devient une session ordinaire. Chaque page
// rendue est une capture, l'original est copié dans la session pour la copie commentée.
// Sans import d'Electron : le rendu est fourni par l'appelant, testable avec une fausse page.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import type { DocumentFormat, DocumentPage } from '@pastille/shared';
import { T } from '../../texts/index.ts';
import type { SessionStore } from '../session-store.ts';
import { textMapPath, type TextMap } from './anchor.ts';

/** Erreur à montrer telle quelle à l'utilisateur (format refusé, fichier protégé ou illisible). */
export class DocumentError extends Error {}

export type RenderedPage = { png: Uint8Array; width: number; height: number; map: TextMap; sheet?: string; range?: string };
export type OpenedDocument = { pages: number; render(index: number): Promise<RenderedPage>; close(): Promise<void> };
export type DocumentOpener = (bytes: Uint8Array, format: DocumentFormat) => Promise<OpenedDocument>;
export type DocumentProgress = { name: string; done: number; total: number } | null;

/** Extensions ouvertes et leur format : modèles et fichiers à macros se lisent comme les autres. */
const FORMATS: Record<string, DocumentFormat> = {
  pdf: 'pdf',
  docx: 'docx', docm: 'docx', dotx: 'docx',
  xlsx: 'xlsx', xlsm: 'xlsx', xltx: 'xlsx',
  pptx: 'pptx', pptm: 'pptx', potx: 'pptx',
};
export const DOCUMENT_EXTENSIONS = Object.keys(FORMATS);
const LEGACY = ['doc', 'xls', 'ppt', 'dot', 'xlt', 'pot', 'pps'];
export const MAX_PAGES = 200;

/** Format d'un fichier d'après son extension ; une erreur lisible s'il n'est pas pris en charge. */
export function documentFormat(path: string): DocumentFormat {
  const ext = extname(path).slice(1).toLowerCase();
  if (FORMATS[ext]) return FORMATS[ext];
  if (LEGACY.includes(ext)) throw new DocumentError(T.main.document.legacy(basename(path)));
  throw new DocumentError(T.main.document.unsupported(basename(path)));
}

export function createDocuments(deps: {
  store: Pick<SessionStore, 'get' | 'close' | 'ensure' | 'update' | 'addCapture' | 'dir'>;
  open: DocumentOpener;
  maxPages?: number;
  onProgress?: (p: DocumentProgress) => void;
}) {
  const { store } = deps;
  const maxPages = deps.maxPages ?? MAX_PAGES;
  let busy = false;

  /**
   * Rend les pages une à une dans une session nommée d'après le fichier : une nouvelle, sauf si la
   * session ouverte est vide. `onFirstPage` montre la page 1 sans attendre les suivantes.
   */
  async function importDocument(path: string, onFirstPage: (captureId: string) => void) {
    const format = documentFormat(path);
    if (busy) throw new DocumentError(T.main.document.busy);
    busy = true;
    const name = basename(path);
    try {
      const bytes = new Uint8Array(await readFile(path));
      // Le fichier est lu et ouvert avant de toucher à la session : un échec ne laisse rien derrière lui.
      const doc = await deps.open(bytes, format);
      const total = Math.min(doc.pages, maxPages);
      const id = crypto.randomUUID();
      let sessionId: string | undefined;
      try {
        for (let i = 0; i < total; i++) {
          const page = await doc.render(i);
          if (i === 0) {
            const open = store.get();
            if (open && (open.captures.length || open.notes?.some((n) => n.text.trim()))) await store.close();
            const s = await store.ensure();
            sessionId = s.id;
            store.update((x) => (x.name = basename(path, extname(path))), { patchHistory: true });
            await mkdir(join(store.dir(s), 'documents'), { recursive: true });
            await writeFile(join(store.dir(s), 'documents', `${id}.${format}`), bytes);
          } else if (store.get()?.id !== sessionId) break; // autre session ouverte entre-temps : l'import s'arrête
          const document: DocumentPage = { id, name, format, page: i + 1, pages: total, ...(page.sheet ? { sheet: page.sheet, range: page.range } : {}) };
          const capture = await store.addCapture(page.png, { width: page.width, height: page.height, scaleFactor: 2, source: { document } });
          await writeFile(join(store.dir(store.get()!), textMapPath(capture)), JSON.stringify(page.map));
          if (i === 0) onFirstPage(capture.id);
          deps.onProgress?.({ name, done: i + 1, total });
          await new Promise((r) => setImmediate(r)); // le processus principal respire entre deux pages
        }
      } finally {
        await doc.close();
      }
      return { pages: total, truncated: doc.pages > total };
    } finally {
      busy = false;
      deps.onProgress?.(null);
    }
  }

  return { importDocument, isBusy: () => busy };
}
