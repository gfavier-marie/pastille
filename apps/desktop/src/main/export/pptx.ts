// Rendu PowerPoint, pour présenter la revue à des humains : titre, remarques générales, récapitulatif,
// une diapo par écran (capture annotée), puis une diapo par point (commentaire, zoom, croquis).

import { join } from 'node:path';
import { loadImage } from '@napi-rs/canvas';
import PptxGenJS from 'pptxgenjs';
import { PIN_COLOR } from '@pastille/shared';
import type { ExportDoc } from './build.ts';

const W = 13.333; // 16:9, en pouces
const H = 7.5;
const PIN = PIN_COLOR.slice(1);
const FONT = 'Helvetica Neue';
const MUTED = '71717A';

type Box = { x: number; y: number; w: number; h: number };

/** Image centrée dans une boîte sans déformation (proportions lues dans le fichier). */
async function fitted(path: string, box: Box) {
  const img = await loadImage(path);
  const k = Math.min(box.w / img.width, box.h / img.height);
  const w = img.width * k, h = img.height * k;
  return { path, x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h, line: { color: 'D4D4D8', width: 0.5 } };
}

/** `dir` : dossier où buildExport a écrit les images (chemins relatifs du document). */
export async function toPptx(doc: ExportDoc, dir: string): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.title = doc.name;
  pptx.author = 'VibeScreener';

  const title = pptx.addSlide();
  title.addText(doc.name, { x: 0.8, y: 2.4, w: W - 1.6, h: 1, fontFace: FONT, fontSize: 36, bold: true });
  title.addText(`${doc.date} · ${doc.screens.length} écran(s) · ${doc.points.length} point(s)`, {
    x: 0.8, y: 3.4, w: W - 1.6, h: 0.5, fontFace: FONT, fontSize: 18, color: MUTED,
  });
  if (doc.context) title.addText(doc.context, { x: 0.8, y: 4.1, w: W - 1.6, h: 1, fontFace: FONT, fontSize: 16 });

  if (doc.notes.length) {
    const notes = pptx.addSlide();
    notes.addText('Remarques générales', { x: 0.5, y: 0.3, w: W - 1, h: 0.6, fontFace: FONT, fontSize: 24, bold: true });
    notes.addText(
      doc.notes.map((text) => ({ text, options: { bullet: true, breakLine: true } })),
      { x: 0.5, y: 1.1, w: W - 1, h: H - 1.6, fontFace: FONT, fontSize: 18, valign: 'top', fit: 'shrink', paraSpaceAfter: 8 },
    );
  }

  const summary = pptx.addSlide();
  summary.addText('Récapitulatif', { x: 0.5, y: 0.3, w: W - 1, h: 0.6, fontFace: FONT, fontSize: 24, bold: true });
  const header = ['#', 'Écran', 'Commentaire', 'Croquis'].map((text) => ({ text, options: { bold: true, fill: { color: 'F4F4F5' } } }));
  summary.addTable(
    [header, ...doc.points.map((p) => [`#${p.number}`, String(p.screen), p.text || '—', p.sketches.length ? 'oui' : 'non'].map((text) => ({ text })))],
    {
      x: 0.5, y: 1.1, w: W - 1, colW: [0.8, 0.9, W - 1 - 0.8 - 0.9 - 1.1, 1.1],
      fontFace: FONT, fontSize: 12, border: { type: 'solid', pt: 0.5, color: 'E4E4E7' },
      autoPage: true, autoPageRepeatHeader: true, autoPageSlideStartY: 0.5,
    },
  );

  for (const s of doc.screens) {
    const screen = pptx.addSlide();
    screen.addText(s.title, { x: 0.5, y: 0.25, w: W - 1, h: 0.6, fontFace: FONT, fontSize: 22, bold: true });
    screen.addImage(await fitted(join(dir, s.image), { x: 0.5, y: 1, w: W - 1, h: H - 1.4 }));

    for (const p of s.points) {
      const slide = pptx.addSlide();
      slide.addText(`#${p.number}`, { x: 0.5, y: 0.4, w: 2, h: 0.8, fontFace: FONT, fontSize: 40, bold: true, color: PIN });
      slide.addText(s.title, { x: 2.3, y: 0.5, w: W - 2.8, h: 0.6, fontFace: FONT, fontSize: 14, color: MUTED });
      slide.addText(p.text || '(sans commentaire)', {
        x: 0.5, y: 1.4, w: 5.6, h: 4.6, fontFace: FONT, fontSize: 24, valign: 'top', italic: !p.text,
      });
      slide.addText(`Position : ${p.position}`, { x: 0.5, y: H - 1, w: 5.6, h: 0.4, fontFace: FONT, fontSize: 11, color: MUTED });
      const images = [p.crop, ...p.sketches];
      const boxH = (H - 2) / images.length - 0.15;
      for (const [i, img] of images.entries()) {
        slide.addImage(await fitted(join(dir, img), { x: 6.5, y: 1.4 + i * (boxH + 0.15), w: W - 7, h: boxH }));
      }
    }
  }

  return (await pptx.write({ outputType: 'nodebuffer' })) as Buffer;
}
