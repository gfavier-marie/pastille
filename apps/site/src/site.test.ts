import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LANGS } from '../../../packages/shared/src/lang.ts';
import { PAGES, render } from '../build.ts';
import { de } from './i18n/de.ts';
import { en } from './i18n/en.ts';
import { es } from './i18n/es.ts';
import { fr } from './i18n/fr.ts';
import { it as itDict } from './i18n/it.ts';

const template = (page: string) => readFileSync(join(import.meta.dirname, page), 'utf8');

describe('site', () => {
  it('produit chaque page dans chaque langue, sans marqueur restant', () => {
    expect(PAGES).toHaveLength(5);
    for (const lang of LANGS)
      for (const page of PAGES) {
        const html = render(template(page), page, lang);
        expect(html).toContain(`<html lang="${lang}">`);
        expect(html).toContain('hreflang="x-default"');
        // Liens internes dans la langue de la page
        if (lang !== 'fr') expect(html).toContain(`href="/${lang}/mentions-legales"`);
      }
  });

  // Textes identiques au français acceptés : noms propres et mots transparents ; les « [À COMPLÉTER …] » restent en français.
  const SAME = new Set(['Applique la revue VibeScreener', 'FAQ', 'Total', 'Point 1', 'Point 2', '· 1 point', '· 2 points', '· 3 points', '30 pages', '{n} point', '{n} points', 'Point {n} · {label}', '● vibescreener · lire_revue — {ecrans} · {demandes}', '✓ #{n} {page} · {texte}', 'Questions', 'Date', 'Client', 'Points', 'Point', 'Interface', 'Application', 'Site', 'Licence', 'Composant', 'Description',
    '17 min', '2 min 35', '{a} min', '{a} min {b}', '{a} s', '{a} h', '{a} h {b}', 'PDF, Markdown, PowerPoint']);
  const flat = (o: unknown, path = ''): [string, string][] =>
    typeof o === 'string' ? [[path, o]] : o && typeof o === 'object' ? Object.entries(o).flatMap(([k, v]) => flat(v, path ? `${path}.${k}` : k)) : [];
  const source = new Map(flat(fr));
  it.each([['en', en], ['es', es], ['de', de], ['it', itDict]] as const)('%s : tout est traduit', (_lang, dict) => {
    const same = flat(dict).filter(([path, text]) => source.get(path) === text && /[a-zà-ÿ]{3}/i.test(text.replace(/<[^>]*>|&\w+;|\[À COMPLÉTER[^\]]*\]/g, '')) && !SAME.has(text));
    expect(same.map(([path]) => path)).toEqual([]);
  });
});
