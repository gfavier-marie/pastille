// PDF factice pour les tests : trois pages A4 avec du texte ; la troisième est tournée d'un quart de tour.

import { degrees, PDFDocument, StandardFonts } from 'pdf-lib';

export const SAMPLE_LINES = ["Le chiffre d'affaires a progressé de 12 %", 'Les marges restent stables', 'Annexe : détail par région'];

export async function createSamplePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const [i, line] of SAMPLE_LINES.entries()) {
    const page = doc.addPage([595, 842]);
    page.drawText(`Page ${i + 1}`, { x: 50, y: 800, size: 10, font });
    page.drawText(line, { x: 50, y: 760, size: 18, font });
    page.drawText('Note', { x: 500, y: 760, size: 18, font }); // autre colonne, à la même hauteur
    if (i === 2) page.setRotation(degrees(90));
  }
  return doc.save();
}
