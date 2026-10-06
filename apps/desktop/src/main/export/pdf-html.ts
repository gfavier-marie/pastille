// Page HTML imprimée en PDF : texte réel (jamais rasterisé), A4 paysage,
// récapitulatif complet avant les images, un point jamais coupé entre deux pages.

import { PIN_COLOR } from '@pastille/shared';
import { INSPIRATION_NOTE, type ExportDoc, type ExportScreen } from './build.ts';

/** Partie d'un PDF découpé : le récapitulatif reste complet, seuls les écrans changent. */
export type PdfPart = { index: number; total: number; screens: ExportScreen[] };

const esc = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const multiline = (text: string) => esc(text).replace(/\n/g, '<br>');
const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;
const yesNo = (list: unknown[]) => (list.length ? 'oui' : 'non');

/** Logo de l'app (le même que dans l'interface) : pastille pleine, pointe en bas à gauche. */
const LOGO = `<svg class="logo" viewBox="0 0 28 28" aria-hidden="true"><path d="M14 2a12 12 0 1 1 0 24H2V14A12 12 0 0 1 14 2z" fill="${PIN_COLOR}"/><circle cx="14" cy="14" r="4.2" fill="#fff"/></svg>`;

/** Numéro d'un point, en pastille comme sur les captures. */
const pin = (n: number) => `<span class="pin">#${n}</span>`;

const CSS = `
@page { size: A4 landscape; margin: 12mm 14mm; }
* { box-sizing: border-box; }
body { margin: 0; font: 10.5pt/1.5 -apple-system, "Segoe UI", "Helvetica Neue", Arial, sans-serif; color: #18181b; }
.brand { display: flex; align-items: center; gap: 2.5mm; padding-bottom: 4mm; margin-bottom: 7mm; border-bottom: 0.4mm solid ${PIN_COLOR}; }
.brand .logo { width: 8mm; height: 8mm; }
.brand .name { font-size: 12pt; font-weight: 700; letter-spacing: -0.01em; }
.brand .date { margin-left: auto; color: #71717a; font-size: 9.5pt; }
h1 { font-size: 22pt; line-height: 1.2; letter-spacing: -0.02em; margin: 0 0 1.5mm; }
.meta { color: #71717a; margin: 0 0 5mm; }
h2 { font-size: 8.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #71717a; margin: 8mm 0 2.5mm; }
.context { margin: 0; }
.context b { color: #71717a; font-weight: 600; }
.instructions { white-space: pre-wrap; margin: 0; background: #f4f4f5; padding: 3.5mm 4.5mm; border-radius: 2mm; color: #3f3f46; }
.notes { margin: 0; padding-left: 6mm; }
.notes li { margin: 0 0 1.5mm; padding-left: 1mm; }
.notes li::marker { color: ${PIN_COLOR}; font-weight: 700; }
table { border-collapse: collapse; width: 100%; }
th, td { text-align: left; vertical-align: top; padding: 2mm 2.5mm; border-bottom: 0.25mm solid #e4e4e7; }
th { font-size: 8.5pt; font-weight: 600; color: #71717a; border-bottom-color: #a1a1aa; }
td.n { width: 16mm; }
td.s, th.s { width: 16mm; color: #71717a; }
td.i, th.i { width: 20mm; color: #71717a; }
tr { break-inside: avoid; }
.pin {
  display: inline-block; min-width: 8mm; padding: 0.4mm 1.8mm; border-radius: 3mm 3mm 3mm 0.8mm;
  background: ${PIN_COLOR}; color: #fff; font-weight: 700; font-size: 9pt; text-align: center; font-variant-numeric: tabular-nums;
}
.screen { break-before: page; }
.screen h2 { font-size: 13pt; text-transform: none; letter-spacing: -0.01em; color: #18181b; margin: 0 0 3mm; }
.screen > img { display: block; max-width: 100%; max-height: 160mm; margin: 0 auto; border-radius: 1.5mm; border: 0.25mm solid #d4d4d8; }
.point { break-inside: avoid; display: flow-root; padding: 4mm 0; border-top: 0.25mm solid #e4e4e7; }
.point:first-of-type { margin-top: 4mm; }
.point .text { overflow: hidden; }
.point .pin { font-size: 13pt; min-width: 13mm; padding: 0.8mm 2.5mm; border-radius: 4.5mm 4.5mm 4.5mm 1mm; }
.point .comment { font-size: 15pt; line-height: 1.4; margin: 2.5mm 0 3mm; }
.point .pos { color: #a1a1aa; font-size: 8.5pt; }
.point .images { float: right; margin-left: 6mm; }
.point .images img { display: inline-block; vertical-align: top; max-width: 75mm; max-height: 50mm; margin-left: 3mm; border-radius: 1.5mm; border: 0.25mm solid #d4d4d8; }
.point .inspirations { clear: both; padding-top: 3mm; }
.point .inspirations .note { color: #71717a; font-size: 9pt; margin-bottom: 2mm; }
.point .inspirations b { color: #18181b; }
.point figure { display: inline-block; vertical-align: top; max-width: 100%; margin: 0 4mm 2mm 0; }
.point figure img { display: block; max-width: 100%; max-height: 85mm; border-radius: 1.5mm; border: 0.25mm solid #d4d4d8; }
.point figcaption { color: #a1a1aa; font-size: 8.5pt; margin-top: 1mm; }
`;

export function toPdfHtml(doc: ExportDoc, part?: PdfPart): string {
  const summary = doc.points
    .map(
      (p) =>
        `<tr><td class="n">${pin(p.number)}</td><td class="s">${p.screen}</td><td>${multiline(p.text) || '—'}</td><td class="s">${yesNo(p.sketches)}</td><td class="i">${yesNo(p.inspirations)}</td></tr>`,
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
      ${pin(p.number)}
      <div class="comment">${multiline(p.text) || '<em>(sans commentaire)</em>'}</div>
      <div class="pos">Position : ${esc(p.position)}</div>
    </div>
    ${
      p.inspirations.length
        ? `<div class="inspirations">
      <div class="note"><b>Inspiration</b> : ${INSPIRATION_NOTE}.</div>
      ${p.inspirations
        .map(
          (k, i) =>
            `<figure><img src="${k.image}" alt="Inspiration ${i + 1} de #${p.number}">${k.source ? `<figcaption>${esc(k.source)}</figcaption>` : ''}</figure>`,
        )
        .join('')}
    </div>`
        : ''
    }
  </div>`,
    )
    .join('')}
</section>`,
    )
    .join('');

  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>${esc(doc.name)}</title><style>${CSS}</style></head>
<body>
<header class="brand">${LOGO}<span class="name">VibeScreener</span><span class="date">${esc(doc.date)}</span></header>
<h1>${esc(doc.name)}${part ? ` — partie ${part.index}/${part.total}` : ''}</h1>
<p class="meta">${plural(doc.screens.length, 'écran')} · ${plural(doc.points.length, 'point')}${
    part ? ` · cette partie : écrans ${part.screens[0]!.index} à ${part.screens.at(-1)!.index}` : ''
  }</p>
${doc.context ? `<p class="context"><b>Contexte</b> ${multiline(doc.context)}</p>` : ''}
<h2>Instructions</h2>
<div class="instructions">${esc(doc.instructions)}</div>
${doc.notes.length ? `<h2>Remarques générales</h2>\n<ol class="notes">${doc.notes.map((n) => `<li>${multiline(n)}</li>`).join('')}</ol>` : ''}
<h2>Récapitulatif</h2>
<table><thead><tr><th>#</th><th class="s">Écran</th><th>Commentaire</th><th class="s">Croquis</th><th class="i">Inspiration</th></tr></thead><tbody>${summary}</tbody></table>
${screens}
</body></html>`;
}
