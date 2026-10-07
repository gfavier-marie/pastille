// Langues de l'interface (app, PWA, site) : le français d'origine et quatre traductions.

export const LANGS = ['fr', 'en', 'es', 'de', 'it'] as const;
export type Lang = (typeof LANGS)[number];

/** Chaque langue dans sa propre langue, pour les sélecteurs. */
export const LANG_NAMES: Record<Lang, string> = { fr: 'Français', en: 'English', es: 'Español', de: 'Deutsch', it: 'Italiano' };

export const isLang = (value: unknown): value is Lang => LANGS.includes(value as Lang);

/** Première langue gérée parmi les préférences (« fr-CA », « de_DE »…), l'anglais sinon. */
export function pickLang(preferred: readonly string[]): Lang {
  for (const tag of preferred) {
    const code = tag.slice(0, 2).toLowerCase();
    if (isLang(code)) return code;
  }
  return 'en';
}
