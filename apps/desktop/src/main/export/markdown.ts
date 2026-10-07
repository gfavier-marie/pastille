// Rendu Markdown : revue.md + images/, pour une IA qui lit directement les fichiers.

import { T } from '../../texts/index.ts';
import type { ExportDoc } from './build.ts';

const cell = (text: string) => text.replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ') || '—';

export function toMarkdown(doc: ExportDoc): string {
  const E = T.exports, C = E.columns;
  const yesNo = (list: unknown[]) => (list.length ? E.yes : E.no);
  const lines = [`# ${doc.name}`, '', `${doc.date} · ${T.screens(doc.screens.length)} · ${T.points(doc.points.length)}`];
  if (doc.context) lines.push('', `**${E.context}**${E.colon}${doc.context}`);
  lines.push('', `## ${E.instructions}`, '', doc.instructions);
  if (doc.notes.length) lines.push('', `## ${E.notes}`, '', ...doc.notes.map((n) => `- ${n.replace(/\s*\n\s*/g, ' ')}`));
  lines.push('', `## ${E.summary}`, '');
  lines.push(`| # | ${C.screen} | ${C.comment} | ${C.sketch} | ${C.inspiration} |`, '| --- | --- | --- | --- | --- |');
  for (const p of doc.points) lines.push(`| #${p.number} | ${p.screen} | ${cell(p.text)} | ${yesNo(p.sketches)} | ${yesNo(p.inspirations)} |`);

  for (const s of doc.screens) {
    lines.push('', `## ${s.title}`, '', `![${s.title}](${s.image})`);
    for (const p of s.points) {
      lines.push('', `### #${p.number}`, '', p.text || `_${E.noComment}_`, '', `![${E.zoomOn(p.number)}](${p.crop})`);
      for (const [i, sketch] of p.sketches.entries()) lines.push('', `![${E.sketchOf(i + 1, p.number)}](${sketch})`);
      for (const [i, k] of p.inspirations.entries()) {
        const name = E.inspirationOf(i + 1, p.number);
        lines.push('', `**${name}**${k.source ? ` (${k.source})` : ''}${E.colon}${E.inspirationNote}.`, '', `![${name}](${k.image})`);
      }
      lines.push('', `${E.position}${E.colon}${p.position}`);
    }
  }
  return lines.join('\n') + '\n';
}
