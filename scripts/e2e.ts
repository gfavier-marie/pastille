// Test de bout en bout : session factice (5 captures, 20 points), dictée sur le point #1
// par un faux micro qui joue l'échantillon, photo de l'éditeur, export PDF et Markdown, écran 1 lu par le
// serveur MCP. Résultats dans e2e-output/ (editor.png, sessions.png, settings.png, menu, barre, overlay,
// assistant, appairage ; chemins des exports).
// Usage : pnpm e2e

import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const out = join(root, 'e2e-output');
const electron = createRequire(join(root, 'apps/desktop/package.json'))('electron') as unknown as string;
const log = execFileSync(electron, [join(root, 'apps/desktop')], {
  env: { ...process.env, PASTILLE_AUTOTEST: 'editor', PASTILLE_AUTOTEST_OUT: out },
  encoding: 'utf8',
  timeout: 120_000,
});
const line = log.split('\n').find((l) => l.startsWith('AUTOTEST '));
if (!line) throw new Error(`Pas de résultat :\n${log}`);
const r = JSON.parse(line.slice(9)) as {
  dictated: string;
  pdf: { ok: boolean; path?: string };
  markdown: { ok: boolean; path?: string };
  mcpImages: number;
};
console.log(`Éditeur : ${join(out, 'editor.png')}
Dictée sur #1 : ${r.dictated || 'ÉCHEC (rien transcrit)'}
PDF : ${r.pdf.path ?? 'ÉCHEC'}
Markdown : ${r.markdown.path ?? 'ÉCHEC'}
MCP, écran 1 : ${r.mcpImages} images (attendu : capture + 4 zooms + 1 croquis = 6)`);
const dictationOk = /^done : .*padding/i.test(r.dictated); // « padding » ne vient que de la dictée
if (!r.pdf.ok || !r.markdown.ok || !dictationOk || r.mcpImages !== 6) process.exit(1);
