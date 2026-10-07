// Site statique en cinq langues : chaque page de src/ est un modèle dont les textes ({{groupe.clé}})
// viennent de src/i18n. Le français reste à la racine, les autres langues sont dans /en/, /es/, /de/
// et /it/, sous les mêmes noms de pages et avec les mêmes ancres. Polices, images, style.css et
// _redirects (public/) sont copiés tels quels. Usage : node build.ts → dist/, servi par wrangler.
//
// Marqueurs des modèles :
//   {{groupe.clé}}     texte du dictionnaire (HTML permis)
//   {{json:groupe}}    groupe entier en JSON, pour le script de la page
//   {{len:groupe.clé}} nombre de caractères du texte (pas des animations de frappe)
//   {{lang}}, {{root}} langue de la page et préfixe des liens internes ("" ou "/en")
//   {{head}}           canonical, hreflang, og:url / og:locale, script de langue
//   {{switcher}}       sélecteur de langue ({{switcher:up}} : ouvert vers le haut, sur fond clair)
//   {{legalNote}}      mention « la version française fait foi » des pages légales traduites

import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { LANG_NAMES, LANGS, type Lang } from '../../packages/shared/src/lang.ts';
import { de } from './src/i18n/de.ts';
import { en } from './src/i18n/en.ts';
import { es } from './src/i18n/es.ts';
import { fr, type Texts } from './src/i18n/fr.ts';
import { it } from './src/i18n/it.ts';

const SITE = 'https://vibescreener.dev';
const DICTS: Record<Lang, Texts> = { fr, en, es, de, it };
const OG_LOCALES: Record<Lang, string> = { fr: 'fr_FR', en: 'en_US', es: 'es_ES', de: 'de_DE', it: 'it_IT' };
const here = import.meta.dirname;
const dist = join(here, 'dist');

const prefix = (lang: Lang) => (lang === 'fr' ? '' : `/${lang}`);

/** Texte du dictionnaire ; une clé inconnue arrête le build. */
function lookup(t: Texts, path: string): unknown {
  const value = path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], t);
  if (value === undefined) throw new Error(`Clé inconnue : ${path}`);
  return value;
}

/** Caractères visibles : sans balises, une entité comptant pour un. */
const visibleLength = (html: string) => [...html.replace(/<[^>]*>/g, '').replace(/&#?\w+;/g, '_')].length;

/** Langue : un clic dans le sélecteur mémorise le choix ; sur une page française, un navigateur
 *  dans une autre langue est redirigé vers sa traduction (anglais si elle n'existe pas), robots exclus. */
function langScript(lang: Lang) {
  const redirect =
    lang !== 'fr'
      ? ''
      : `if (/bot|crawl|spider|slurp|preview|lighthouse/i.test(navigator.userAgent)) return;
  var choix = null;
  try { choix = localStorage.getItem('vs-lang'); } catch (e) {}
  var nav = ((navigator.languages && navigator.languages[0]) || navigator.language || 'fr').slice(0, 2).toLowerCase();
  var cible = choix || (${JSON.stringify(LANGS)}.indexOf(nav) >= 0 ? nav : 'en');
  if (cible !== 'fr' && ${JSON.stringify(LANGS)}.indexOf(cible) > 0) location.replace('/' + cible + location.pathname + location.search + location.hash);`;
  return `<script>
(function () {
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('.langs a');
    if (a) try { localStorage.setItem('vs-lang', a.hreflang); } catch (err) {}
    document.querySelectorAll('.langs[open]').forEach(function (d) { if (!d.contains(e.target)) d.open = false; });
  });
  ${redirect}
})();
</script>`;
}

function head(lang: Lang, path: string, page: string) {
  const url = (l: Lang) => `${SITE}${prefix(l)}${path}`;
  const lines = [
    `<link rel="canonical" href="${url(lang)}">`,
    ...LANGS.map((l) => `<link rel="alternate" hreflang="${l}" href="${url(l)}">`),
    `<link rel="alternate" hreflang="x-default" href="${url('en')}">`,
  ];
  if (page === 'index.html') {
    lines.push(`<meta property="og:url" content="${url(lang)}">`, `<meta property="og:locale" content="${OG_LOCALES[lang]}">`);
    for (const l of LANGS) if (l !== lang) lines.push(`<meta property="og:locale:alternate" content="${OG_LOCALES[l]}">`);
  }
  lines.push(langScript(lang));
  return lines.join('\n');
}

const GLOBE =
  '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="8" cy="8" r="6.5"></circle><path d="M1.5 8h13M8 1.5c1.8 1.9 2.7 4 2.7 6.5S9.8 12.6 8 14.5C6.2 12.6 5.3 10.5 5.3 8S6.2 3.4 8 1.5z"></path></svg>';

/** `up` : menu ouvert vers le haut, sur fond clair (pied de page de la landing). */
function switcher(lang: Lang, path: string, t: Texts, up = false) {
  const items = LANGS.map(
    (l) => `<li><a href="${prefix(l)}${path}" hreflang="${l}" lang="${l}"${l === lang ? ' aria-current="page"' : ''}>${LANG_NAMES[l]}</a></li>`,
  ).join('');
  return `<details class="langs${up ? ' langs-up' : ''}"><summary aria-label="${t.page.langs} (${LANG_NAMES[lang]})">${GLOBE}${lang.toUpperCase()}</summary><ul>${items}</ul></details>`;
}

export function render(template: string, page: string, lang: Lang) {
  const t = DICTS[lang];
  const path = page === 'index.html' ? '/' : `/${page.replace(/\.html$/, '')}`;
  const html = template
    .replace(/\{\{json:(\w+)\}\}/g, (_, group: string) => JSON.stringify(lookup(t, group)).replace(/</g, '\\u003c'))
    .replace(/\{\{len:([\w.]+)\}\}/g, (_, key: string) => String(visibleLength(String(lookup(t, key)))))
    .replace(/\{\{head\}\}/g, () => head(lang, path, page))
    .replace(/\{\{switcher(:up)?\}\}/g, (_, up?: string) => switcher(lang, path, t, !!up))
    .replace(/\{\{legalNote\}\}/g, () => (lang === 'fr' ? '' : `<p class="updated"><em>${t.page.legalNote}</em></p>`))
    .replace(/\{\{lang\}\}/g, lang)
    .replace(/\{\{(\w+\.\w+)\}\}/g, (_, key: string) => {
      const value = lookup(t, key);
      if (typeof value !== 'string') throw new Error(`${key} n'est pas un texte`);
      return value;
    })
    .replace(/\{\{root\}\}/g, prefix(lang)); // en dernier : les textes en contiennent aussi
  const left = html.match(/\{\{[^}]*\}\}/);
  if (left) throw new Error(`${lang}/${page} : marqueur non remplacé ${left[0]}`);
  return html;
}

export const PAGES = readdirSync(join(here, 'src')).filter((f) => f.endsWith('.html'));

if (process.argv[1] === import.meta.filename) {
  rmSync(dist, { recursive: true, force: true });
  cpSync(join(here, 'public'), dist, { recursive: true });
  for (const lang of LANGS) {
    const dir = join(dist, prefix(lang));
    mkdirSync(dir, { recursive: true });
    for (const page of PAGES) writeFileSync(join(dir, page), render(readFileSync(join(here, 'src', page), 'utf8'), page, lang));
  }
  console.log(`Site : ${PAGES.length} pages × ${LANGS.length} langues dans ${dist}`);
}
