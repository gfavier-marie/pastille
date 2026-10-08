// Rendu d'un PDF par pdf.js dans le processus principal, avec le canvas des exports
// (@napi-rs/canvas) : une image par page et la carte de son texte.

import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { T } from '../../texts/index.ts';
import type { TextRun } from './anchor.ts';
import { DocumentError, type OpenedDocument } from './open.ts';

const MAX_SIDE = 2400; // pixels du plus grand côté (A4 à 144 ppp : 1190 × 1684)
const round = (v: number) => Math.round(v * 10000) / 10000;

export async function openPdf(bytes: Uint8Array): Promise<OpenedDocument> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  // Polices standard, CMaps, décodeurs et profils lus sur le disque (polices non incorporées, textes asiatiques, scans).
  // pdf.js exige un « / » final, même sous Windows (« C:\…\standard_fonts/ » se lit très bien).
  const root = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'));
  const dir = (name: string) => `${join(root, name)}/`;
  const task = pdfjs.getDocument({
    data: bytes.slice(), // pdf.js garde le tampon qu'on lui donne
    standardFontDataUrl: dir('standard_fonts'),
    cMapUrl: dir('cmaps'),
    cMapPacked: true,
    wasmUrl: dir('wasm'), // images JPEG 2000 et JBIG2 (scans)
    iccUrl: dir('iccs'),
    verbosity: pdfjs.VerbosityLevel.ERRORS,
  });
  let pdf: Awaited<typeof task.promise>;
  try {
    pdf = await task.promise;
  } catch (err) {
    await task.destroy();
    if ((err as Error)?.name === 'PasswordException') throw new DocumentError(T.main.document.encrypted);
    throw new DocumentError(T.main.document.unreadable(String((err as Error)?.message ?? err)));
  }

  return {
    pages: pdf.numPages,
    async render(index) {
      const page = await pdf.getPage(index + 1);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(2, MAX_SIDE / Math.max(base.width, base.height)) });
      const width = Math.round(viewport.width), height = Math.round(viewport.height);
      const canvas = createCanvas(width, height);
      await page.render({ canvas: canvas as unknown as HTMLCanvasElement, viewport, background: '#ffffff' }).promise;
      const png = await canvas.encode('png');

      // Boîte de chaque morceau de texte : ligne de base, sens d'écriture et hauteur de police
      // passés par la matrice de la page (rotations comprises).
      const runs: TextRun[] = [];
      for (const item of (await page.getTextContent()).items) {
        if (!('str' in item) || !item.str.trim()) continue;
        const [a, b, c, d, e, f] = pdfjs.Util.transform(viewport.transform, item.transform) as number[];
        const len = Math.hypot(a!, b!) || 1;
        const run = (item.width * viewport.scale) / len;
        const xs = [e!, e! + a! * run, e! + c!, e! + a! * run + c!];
        const ys = [f!, f! + b! * run, f! + d!, f! + b! * run + d!];
        const x = Math.min(...xs), y = Math.min(...ys);
        runs.push({ t: item.str, x: round(x / width), y: round(y / height), w: round((Math.max(...xs) - x) / width), h: round((Math.max(...ys) - y) / height) });
      }
      page.cleanup();
      return { png, width, height, map: { runs } };
    },
    close: () => task.destroy(),
  };
}
