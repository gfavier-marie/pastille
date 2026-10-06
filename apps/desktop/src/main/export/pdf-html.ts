// Page HTML imprimée en PDF : texte réel (jamais rasterisé), A4 paysage,
// récapitulatif complet avant les images, un point jamais coupé entre deux pages.

import type { ExportDoc, ExportScreen } from './build.ts';

/** Partie d'un PDF découpé : le récapitulatif reste complet, seuls les écrans changent. */
export type PdfPart = { index: number; total: number; screens: ExportScreen[] };

const esc = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const multiline = (text: string) => esc(text).replace(/\n/g, '<br>');

const CSS = `
@page { size: A4 landscape; margin: 12mm; }
* { box-sizing: border-box; }
body { margin: 0; font: 10.5pt/1.45 -apple-system, "Segoe UI", "Helvetica Neue", Arial, sans-serif; color: #111; }
h1 { font-size: 20pt; margin: 0 0 2mm; }
h2 { font-size: 14pt; margin: 6mm 0 3mm; }
.meta { color: #555; }
.instructions { white-space: pre-wrap; background: #f4f4f5; padding: 3mm 4mm; border-radius: 2mm; }
table { border-collapse: collapse; width: 100%; }
th, td { text-align: left; vertical-align: top; padding: 1.5mm 2mm; border-bottom: 0.3mm solid #ddd; }
th { background: #f4f4f5; }
tr { break-inside: avoid; }
.screen { break-before: page; }
.screen > img { display: block; max-width: 100%; max-height: 165mm; margin: 0 auto; border: 0.3mm solid #ccc; }
.point { break-inside: avoid; display: flow-root; padding: 2.5mm 0; border-top: 0.3mm solid #ddd; }
.point .text { overflow: hidden; }
.point .num { font-size: 22pt; font-weight: 700; color: #e5484d; }
.point .comment { font-size: 15pt; line-height: 1.35; margin: 1mm 0 3mm; }
.point .pos { color: #666; font-size: 9pt; }
.point .images { float: right; margin-left: 6mm; }
.point .images img { display: inline-block; vertical-align: top; max-width: 75mm; max-height: 50mm; margin-left: 3mm; border: 0.3mm solid #ccc; }
`;

export function toPdfHtml(doc: ExportDoc, part?: PdfPart): string {
  const summary = doc.points
    .map(
      (p) =>
        `<tr><td>#${p.number}</td><td>${p.screen}</td><td>${multiline(p.text) || '—'}</td><td>${p.sketches.length ? 'oui' : 'non'}</td></tr>`,
    )
    .join('');

  const screens = (part?.screens ?? doc.screens)
    .map(
      (s) => `
<section class="screen">
  <h2>${esc(s.title)}</h2>
  <img src="${s.image}" alt="${esc(s.title)}">
  ${s.points
    .map(
      (p) => `
  <div class="point">
    <div class="images">
      <img src="${p.crop}" alt="Zoom sur #${p.number}">
      ${p.sketches.map((k, i) => `<img src="${k}" alt="Croquis ${i + 1} de #${p.number}">`).join('')}
    </div>
    <div class="text">
      <div class="num">#${p.number}</div>
      <div class="comment">${multiline(p.text) || '<em>(sans commentaire)</em>'}</div>
      <div class="pos">Position : ${esc(p.position)}</div>
    </div>
  </div>`,
    )
    .join('')}
</section>`,
    )
    .join('');

  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>${esc(doc.name)}</title><style>${CSS}</style></head>
<body>
<h1>${esc(doc.name)}${part ? ` — partie ${part.index}/${part.total}` : ''}</h1>
<p class="meta">${esc(doc.date)} · ${doc.screens.length} écran(s) · ${doc.points.length} point(s)${
    part ? ` · cette partie : écrans ${part.screens[0]!.index} à ${part.screens.at(-1)!.index}` : ''
  }</p>
${doc.context ? `<p><b>Contexte :</b> ${multiline(doc.context)}</p>` : ''}
<h2>Instructions</h2>
<div class="instructions">${esc(doc.instructions)}</div>
<h2>Récapitulatif</h2>
<table><thead><tr><th>#</th><th>Écran</th><th>Commentaire</th><th>Croquis</th></tr></thead><tbody>${summary}</tbody></table>
${screens}
</body></html>`;
}
