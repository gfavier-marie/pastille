// Langue courante de l'interface. `T` est une liaison vivante : chaque lecture voit la langue choisie
// par setLang. Le processus principal lit donc T au moment de l'appel, jamais dans une constante de module.

import type { Lang } from '@pastille/shared';
import { de } from './de.ts';
import { en } from './en.ts';
import { es } from './es.ts';
import { fr, type Texts } from './fr.ts';
import { it } from './it.ts';

export type { Texts };

export const DICTS: Record<Lang, Texts> = { fr, en, es, de, it };

export let T: Texts = fr;

export function setLang(lang: Lang) {
  T = DICTS[lang];
}
