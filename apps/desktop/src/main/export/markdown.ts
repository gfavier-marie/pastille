// Rendu Markdown : revue.md + images/, pour une IA qui lit directement les fichiers.

import type { ExportDoc } from './build.ts';

const cell = (text: string) => text.replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ') || '—';

export function toMarkdown(doc: ExportDoc): string {
  const lines = [
    `# ${doc.name}`,
    '',
    `${doc.date} · ${doc.screens.length} écran${doc.screens.length > 1 ? 's' : ''} · ${doc.points.length} point${doc.points.length > 1 ? 's' : ''}`,
  ];
  if (doc.context) lines.push('', `**Contexte** : ${doc.context}`);
  lines.push('', '## Instructions', '', doc.instructions);
  if (doc.notes) lines.push('', '## Remarques générales', '', doc.notes);
  lines.push('', '## Récapitulatif', '');
  lines.push('| # | Écran | Commentaire | Croquis |', '| --- | --- | --- | --- |');
  for (const p of doc.points) lines.push(`| #${p.number} | ${p.screen} | ${cell(p.text)} | ${p.sketches.length ? 'oui' : 'non'} |`);

  for (const s of doc.screens) {
    lines.push('', `## ${s.title}`, '', `![${s.title}](${s.image})`);
    for (const p of s.points) {
      lines.push('', `### #${p.number}`, '', p.text || '_(sans commentaire)_', '', `![Zoom sur #${p.number}](${p.crop})`);
      for (const [i, sketch] of p.sketches.entries()) lines.push('', `![Croquis ${i + 1} de #${p.number}](${sketch})`);
      lines.push('', `Position : ${p.position}`);
    }
  }
  return lines.join('\n') + '\n';
}
