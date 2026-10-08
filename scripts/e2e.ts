// Test de bout en bout : session factice (5 captures, 20 points), dictée sur le point #1
// par un faux micro qui joue l'échantillon, photo de l'éditeur, export PDF et Markdown, écran 1 lu par le
// serveur MCP ; puis un PDF, un Word, un PowerPoint et un Excel ouverts, commentés et exportés (copie commentée). Résultats dans e2e-output/ (editor.png, editor-notes.png, sessions.png, settings.png, settings-claude.png,
// settings-license.png, menu, barre, overlay normal et d'inspiration, assistant, appairage ; chemins des exports).
// Usage : pnpm e2e
// App installée (CI Windows) : PASTILLE_E2E_APP=…\VibeScreener.exe, avec PASTILLE_FAKE_AUDIO et
// PASTILLE_WHISPER_MODEL (l'échantillon et le modèle ne sont pas dans l'app).

import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const out = join(root, 'e2e-output');
const electron = createRequire(join(root, 'apps/desktop/package.json'))('electron') as unknown as string;
const [bin, args] = process.env.PASTILLE_E2E_APP ? [process.env.PASTILLE_E2E_APP, []] : [electron, [join(root, 'apps/desktop')]];
const log = execFileSync(bin, args, {
  // Interface en français par défaut (le runner Windows de la CI est en anglais) ;
  // PASTILLE_LANG=de pnpm e2e photographie les fenêtres et produit les exports dans une autre langue.
  env: { ...process.env, PASTILLE_AUTOTEST: 'editor', PASTILLE_AUTOTEST_OUT: out, PASTILLE_LANG: process.env.PASTILLE_LANG ?? 'fr' },
  encoding: 'utf8',
  timeout: 300_000,
});
const line = log.split('\n').find((l) => l.startsWith('AUTOTEST '));
if (!line) throw new Error(`Pas de résultat :\n${log}`);
const r = JSON.parse(line.slice(9)) as {
  dictated: string;
  pdf: { ok: boolean; path?: string };
  markdown: { ok: boolean; path?: string };
  mcpImages: number;
  documents: Record<string, { pages: number; pdf: boolean; copy: string | false }>;
};
console.log(`Éditeur : ${join(out, 'editor.png')}
Dictée sur #1 : ${r.dictated || 'ÉCHEC (rien transcrit)'}
PDF : ${r.pdf.path ?? 'ÉCHEC'}
Markdown : ${r.markdown.path ?? 'ÉCHEC'}
MCP, écran 1 : ${r.mcpImages} images (attendu : capture + 4 zooms + 1 croquis + 1 inspiration = 7)`);
// Documents ouverts dans l'app : pages rendues, export PDF et copie commentée (photos editor-pdf.png, -docx, -pptx, -xlsx).
for (const [name, d] of Object.entries(r.documents)) console.log(`Document ${name} : ${d.pages} pages, PDF ${d.pdf ? 'ok' : 'ÉCHEC'}, copie ${d.copy || 'ÉCHEC'}`);
const documentsOk = Object.keys(r.documents).length === 4 && Object.values(r.documents).every((d) => d.pages > 0 && d.pdf && d.copy);
// « padding » ne vient que de la dictée ; texte de départ (66 caractères) + une phrase, sans répétition en boucle.
const dictationOk = /^done : .*padding/i.test(r.dictated) && r.dictated.length < 250;
if (!r.pdf.ok || !r.markdown.ok || !dictationOk || r.mcpImages !== 7 || !documentsOk) process.exit(1);
