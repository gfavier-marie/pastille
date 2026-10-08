// Documents factices pour les tests : un PDF de trois pages (la troisième tournée d'un quart de tour),
// un Word de deux pages avec un tableau, un PowerPoint de deux diapositives et un Excel de deux feuilles.

import JSZip from 'jszip';
import { degrees, PDFDocument, StandardFonts } from 'pdf-lib';
import PptxGenJS from 'pptxgenjs';

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

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const REL = 'http://schemas.openxmlformats.org/package/2006/relationships';

const para = (text: string, size = 22, bold = false) =>
  `<w:p><w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>${bold ? '<w:b/>' : ''}<w:sz w:val="${size}"/></w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;

export const DOCX_TITLE = 'Rapport annuel 2026';
export const DOCX_FIRST = "Le chiffre d'affaires a progressé de 12 % sur l'exercice.";

/** Word : titre, phrase de tête, 40 paragraphes (deux pages), tableau, saut de page, annexe. */
export async function createSampleDocx(): Promise<Uint8Array> {
  const filler = Array.from({ length: 40 }, (_, i) =>
    para(`Paragraphe ${i + 1}. Les ventes de la région ${i % 4 === 0 ? 'Nord' : 'Sud'} évoluent selon les saisons, avec des écarts expliqués dans l'annexe.`),
  );
  const cell = (t: string) => `<w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/></w:tcPr>${para(t)}</w:tc>`;
  const table = `<w:tbl><w:tblPr><w:tblW w:w="9000" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:insideH w:val="single" w:sz="4"/></w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="3000"/><w:gridCol w:w="3000"/><w:gridCol w:w="3000"/></w:tblGrid>${[
    ['Région', 'CA', 'Évolution'],
    ['Nord', '1,2 M€', '+8 %'],
    ['Sud', '0,9 M€', '+15 %'],
  ]
    .map((row) => `<w:tr>${row.map(cell).join('')}</w:tr>`)
    .join('')}</w:tbl>`;
  const body = [
    para(DOCX_TITLE, 48, true),
    para(DOCX_FIRST),
    ...filler,
    table,
    '<w:p><w:r><w:br w:type="page"/></w:r></w:p>',
    para('Annexe', 32, true),
    para('Détail des écarts par région.'),
  ].join('');
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
  );
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${REL}"><Relationship Id="rId1" Type="${R}/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W}" xmlns:r="${R}"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`,
  );
  return zip.generateAsync({ type: 'uint8array' });
}

/**
 * Word à pièges : saut de section après le 2ᵉ paragraphe, paragraphe cible avec un identifiant Word
 * (w14:paraId), saut de page au milieu d'un paragraphe. La bibliothèque compte ces sauts comme des blocs.
 */
export async function createSectionsDocx(): Promise<Uint8Array> {
  const W14 = 'http://schemas.microsoft.com/office/word/2010/wordml';
  const sect = '<w:sectPr><w:type w:val="nextPage"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>';
  const run = (t: string) => `<w:r><w:t xml:space="preserve">${esc(t)}</w:t></w:r>`;
  const body = [
    `<w:p>${run('Introduction du rapport')}</w:p>`,
    `<w:p><w:pPr>${sect}</w:pPr>${run('Fin de la première section')}</w:p>`,
    `<w:p w14:paraId="22222222">${run('Paragraphe cible sur la deuxième page')}</w:p>`,
    `<w:p>${run('Texte avant le saut')}<w:r><w:br w:type="page"/></w:r>${run('texte après le saut')}</w:p>`,
    `<w:p>${run('Dernier paragraphe du document')}</w:p>`,
  ].join('');
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
  );
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${REL}"><Relationship Id="rId1" Type="${R}/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W}" xmlns:r="${R}" xmlns:w14="${W14}"><w:body>${body}${sect.replace('<w:type w:val="nextPage"/>', '')}</w:body></w:document>`,
  );
  return zip.generateAsync({ type: 'uint8array' });
}

/** PowerPoint : deux diapositives 16:9, titre, texte, forme et graphique. */
export async function createSamplePptx(): Promise<Uint8Array> {
  const p = new PptxGenJS();
  p.layout = 'LAYOUT_WIDE';
  const s1 = p.addSlide();
  s1.addText('Résultats du trimestre', { x: 0.5, y: 0.4, w: 12, h: 1, fontSize: 36, bold: true, color: '1F2937' });
  s1.addText("Le chiffre d'affaires progresse de 12 %", { x: 0.5, y: 1.8, w: 7, h: 0.8, fontSize: 20 });
  s1.addShape(p.ShapeType.rect, { x: 8, y: 2, w: 4.5, h: 3, fill: { color: 'D63A0C' } });
  s1.addChart(p.ChartType.bar, [{ name: 'CA', labels: ['T1', 'T2', 'T3'], values: [10, 12, 15] }], { x: 0.5, y: 3, w: 6, h: 4 });
  const s2 = p.addSlide();
  s2.addText('Prochaines étapes', { x: 0.5, y: 0.4, w: 12, h: 1, fontSize: 36, bold: true });
  s2.addText('Ouvrir deux magasins à Lyon', { x: 0.5, y: 2, w: 10, h: 0.8, fontSize: 24 });
  return new Uint8Array((await p.write({ outputType: 'nodebuffer' })) as Buffer);
}

const S = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const colName = (c: number) => {
  let s = '';
  for (let n = c + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

/** Styles : 0 normal, 1 en-tête gras sur fond gris, 2 pourcentage. */
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="${S}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE5E7EB"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="9" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>`;

/** Excel : feuille « Ventes » de 120 lignes × 7 colonnes (en-tête, textes, nombres, pourcentages), feuille « Notes » courte. */
export async function createSampleXlsx(): Promise<Uint8Array> {
  const cellXml = (r: number, c: number, v: string | number) => {
    const ref = `${colName(c)}${r + 1}`, style = r === 0 ? ' s="1"' : c === 6 ? ' s="2"' : '';
    return typeof v === 'number' ? `<c r="${ref}"${style}><v>${v}</v></c>` : `<c r="${ref}"${style} t="inlineStr"><is><t>${esc(v)}</t></is></c>`;
  };
  const sheet = (rows: (string | number)[][]) =>
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${S}" xmlns:r="${R}"><sheetData>${rows
      .map((row, r) => `<row r="${r + 1}">${row.map((v, c) => cellXml(r, c, v)).join('')}</row>`)
      .join('')}</sheetData><pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>`;
  const ventes = [
    ['Région', 'Magasin', 'T1', 'T2', 'T3', 'Total', 'Évolution'],
    ...Array.from({ length: 119 }, (_, i) => [i % 2 ? 'Sud' : 'Nord', `Magasin ${i + 1}`, 100 + i, 110 + i, 120 + i, 330 + 3 * i, 0.2]),
  ];
  const notes = [['Remarque'], ['Chiffres provisoires']];
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
  );
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${REL}"><Relationship Id="rId1" Type="${R}/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  zip.file(
    'xl/workbook.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="${S}" xmlns:r="${R}"><sheets><sheet name="Ventes" sheetId="1" r:id="rId1"/><sheet name="Notes" sheetId="2" r:id="rId2"/></sheets></workbook>`,
  );
  zip.file(
    'xl/_rels/workbook.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${REL}"><Relationship Id="rId1" Type="${R}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${R}/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="${R}/styles" Target="styles.xml"/></Relationships>`,
  );
  zip.file('xl/worksheets/sheet1.xml', sheet(ventes));
  zip.file('xl/worksheets/sheet2.xml', sheet(notes));
  zip.file('xl/styles.xml', STYLES);
  return zip.generateAsync({ type: 'uint8array' });
}
