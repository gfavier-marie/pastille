// Textes des fenêtres : la langue arrive dans l'adresse de la page (?lang=en), posée par le processus principal.

import { isLang } from '@pastille/shared';
import { setLang, T } from '../texts/index.ts';

const lang = new URLSearchParams(location.search).get('lang');
if (isLang(lang)) setLang(lang);
document.documentElement.lang = T.lang;
// Titre des fenêtres à barre de titre ; Electron le reprend de la page.
const page = location.pathname.split('/').pop()?.replace('.html', '');
if (page === 'pairing' || page === 'welcome' || page === 'settings') document.title = T.main.windows[page];

export { T };
