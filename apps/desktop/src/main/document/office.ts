// Rendu de Word et PowerPoint par @silurus/ooxml (mode Node) dans le processus principal, avec le
// canvas des exports : une image par page ou diapositive et la carte de son texte. Excel : xlsx.ts.

import { existsSync } from 'node:fs';
import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import { openDocxDocument, openPptxPresentation, type DocxPageRenderOptions, type NodeCanvasFactory } from '@silurus/ooxml/node';
import { T } from '../../texts/index.ts';
import type { TextRun } from './anchor.ts';
import { DocumentError, type OpenedDocument } from './open.ts';

const MAX_SIDE = 2400;
const SLIDE_WIDTH = 1920;
const round = (v: number) => Math.round(v * 10000) / 10000;
type DocxRun = Parameters<NonNullable<DocxPageRenderOptions['onTextRun']>>[0];

export const canvasFactory = {
  createCanvas: (w: number, h: number) => createCanvas(Math.max(1, Math.round(w)), Math.max(1, Math.round(h))),
  loadImage: (bytes: ArrayBuffer | Uint8Array) => loadImage(Buffer.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes))),
} as unknown as NodeCanvasFactory;

// Polices Office : celles de Word quand il est installé (Mac), sinon des polices système proches.
// Windows a déjà Calibri, Cambria, Segoe… dans ses polices système.
const OFFICE_FONTS = ['Word', 'PowerPoint', 'Excel'].map((app) => `/Applications/Microsoft ${app}.app/Contents/Resources/DFonts`);
const SUBSTITUTES: [string, string[]][] = [
  ['Arial', ['Calibri', 'Calibri Light', 'Aptos', 'Aptos Display', 'Aptos Narrow', 'Segoe UI', 'Segoe UI Light', 'Candara', 'Corbel', 'Tahoma', 'Verdana']],
  ['Times New Roman', ['Cambria', 'Constantia', 'Book Antiqua', 'Garamond']],
  ['Courier New', ['Consolas', 'Lucida Console']],
];
let fontsReady = false;

export function prepareFonts() {
  if (fontsReady) return;
  fontsReady = true;
  const dir = process.platform === 'darwin' ? OFFICE_FONTS.find((d) => existsSync(d)) : undefined;
  if (dir) GlobalFonts.loadFontsFromDir(dir);
  for (const [target, names] of SUBSTITUTES) for (const name of names) if (!GlobalFonts.has(name)) GlobalFonts.setAlias(target, name);
}

/** Erreur de la bibliothèque → message lisible (fichier protégé, ancien format, autre chose qu'un fichier Office). */
export function officeError(err: unknown): DocumentError {
  const code = (err as { code?: string })?.code;
  if (code === 'encrypted' || code === 'invalid-password' || code === 'unsupported-encryption') return new DocumentError(T.main.document.encrypted);
  return new DocumentError(T.main.document.unreadable(String((err as Error)?.message ?? err)));
}

const encode = (canvas: unknown) => (canvas as { encode(format: 'png'): Promise<Buffer> }).encode('png');

export async function openDocx(bytes: Uint8Array): Promise<OpenedDocument> {
  prepareFonts();
  const doc = await openDocxDocument(bytes, { factory: canvasFactory }).catch((err) => Promise.reject(officeError(err)));
  return {
    pages: doc.pageCount,
    async render(index) {
      const size = doc.pageSize(index);
      const width = Math.round(Math.min(size.widthPt * 2, (MAX_SIDE * size.widthPt) / Math.max(size.widthPt, size.heightPt)));
      const raw: DocxRun[] = [];
      const canvas = (await doc.renderPage(index, { width, onTextRun: (r) => raw.push(r) })) as unknown as { width: number; height: number };
      const W = canvas.width, H = canvas.height;
      // Le paragraphe d'origine n'est gardé que pour le corps : un commentaire Word s'y ancre.
      const runs: TextRun[] = raw
        .filter((r) => r.text.trim())
        .map((r) => ({
          t: r.text,
          x: round(r.x / W),
          y: round(r.y / H),
          w: round(r.w / W),
          h: round(r.h / H),
          ...(r.source?.story === 'body' ? { p: r.source.path.join('.') } : {}),
        }));
      return { png: await encode(canvas), width: W, height: H, map: { runs } };
    },
    close: () => doc.close(),
  };
}

type Shape = { x?: number; y?: number; width?: number; height?: number; textBody?: { paragraphs?: { runs?: { text?: string }[] }[] } | null; children?: Shape[] };

/** Texte de chaque forme d'une diapositive (groupes compris), avec sa boîte. */
function shapeRuns(elements: Shape[], slideW: number, slideH: number): TextRun[] {
  const runs: TextRun[] = [];
  const visit = (el: Shape) => {
    const text = (el.textBody?.paragraphs ?? []).map((p) => (p.runs ?? []).map((r) => r.text ?? '').join('')).join('\n');
    if (text.trim() && el.width && el.height)
      runs.push({ t: text, x: round((el.x ?? 0) / slideW), y: round((el.y ?? 0) / slideH), w: round(el.width / slideW), h: round(el.height / slideH), block: true });
    for (const child of el.children ?? []) visit(child);
  };
  elements.forEach(visit);
  return runs;
}

export async function openPptx(bytes: Uint8Array): Promise<OpenedDocument> {
  prepareFonts();
  const pres = await openPptxPresentation(bytes).catch((err) => Promise.reject(officeError(err)));
  // Les diapositives arrivent dans l'ordre, une seule fois : l'import les demande dans cet ordre.
  const slides = pres.slides();
  const width = SLIDE_WIDTH, height = Math.round((SLIDE_WIDTH * pres.slideHeight) / pres.slideWidth);
  return {
    pages: pres.slideCount,
    async render() {
      const next = await slides.next();
      if (next.done) throw new DocumentError(T.main.document.unreadable('slide'));
      const canvas = createCanvas(width, height);
      await pres.renderSlide(canvas as never, next.value, { width, dpr: 1, factory: canvasFactory });
      const runs = shapeRuns((next.value as unknown as { elements: Shape[] }).elements, pres.slideWidth, pres.slideHeight);
      return { png: await canvas.encode('png'), width, height, map: { runs } };
    },
    close: () => pres.close(),
  };
}
