// Outils communs aux dictionnaires : plateforme, pluriels et dates selon la langue.
// Aucun import d'Electron ni du DOM : utilisables dans le processus principal comme dans les fenêtres.

/** Node a aussi un `navigator` (« Node.js/22 ») : le processus principal regarde la plateforme. */
export const isMac =
  typeof process !== 'undefined' && !!process.platform ? process.platform === 'darwin' : typeof navigator !== 'undefined' && navigator.userAgent.includes('Mac');

/** « 1 point », « 2 points » selon les règles de la langue (le français met 0 au singulier, l'anglais au pluriel). */
export function pluralFor(locale: string) {
  const rules = new Intl.PluralRules(locale);
  return (n: number, one: string, many = `${one}s`) => `${n} ${rules.select(n) === 'one' ? one : many}`;
}

/** Jours écoulés depuis la date, en jours calendaires (0 aujourd'hui, 1 hier). */
export const daysAgo = (iso: string) =>
  Math.round((new Date().setHours(0, 0, 0, 0) - new Date(iso).setHours(0, 0, 0, 0)) / 86_400_000);

export const minutesAgo = (iso: string) => Math.floor((Date.now() - Date.parse(iso)) / 60_000);

/** « 3 oct. », « Oct 3 »… */
export const shortDate = (locale: string, iso: string) => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(new Date(iso));

/** « 09:05 », « 9:05 AM »… */
export const clock = (locale: string, iso: string) => new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

/** « 6 octobre 2026 à 10:30 », « October 6, 2026 at 10:30 AM »… */
export const longDate = (locale: string, iso: string) => new Date(iso).toLocaleString(locale, { dateStyle: 'long', timeStyle: 'short' });

const pad = (n: number) => String(n).padStart(2, '0');
/** « 2026-10-06 », pour les noms de session. */
export const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** Heure et minutes sur deux chiffres, séparées par `sep` (« 09h05 », « 09:05 »). */
export const hhmm = (d: Date, sep: string) => `${pad(d.getHours())}${sep}${pad(d.getMinutes())}`;
