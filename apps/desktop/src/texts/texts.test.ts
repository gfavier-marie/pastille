import { describe, expect, it } from 'vitest';
import { LANGS } from '@pastille/shared';
import { DICTS } from './index.ts';

// Textes identiques au français acceptés : noms propres et mots transparents.
const SAME = new Set([
  'VibeScreener', 'Claude Code', 'Whisper large-v3-turbo', 'Whisper local', 'Transcription', 'Capture', 'Mode', 'Export',
  'Microphone', 'Sessions', 'Points', 'Point', 'point', 'Inspiration', 'Position', 'Instructions', 'Clic', '⇧ Clic', 'clic', 'Ctrl',
]);

/** Chaque texte fixe avec son chemin (les fonctions, écrites à la main pour chaque langue, sont laissées de côté). */
function flat(o: unknown, path = ''): [string, string][] {
  if (typeof o === 'string') return [[path, o]];
  if (o && typeof o === 'object') return Object.entries(o).flatMap(([k, v]) => flat(v, path ? `${path}.${k}` : k));
  return [];
}

describe('dictionnaires', () => {
  const fr = new Map(flat(DICTS.fr));
  it.each(LANGS.filter((l) => l !== 'fr'))('%s : tout est traduit', (lang) => {
    const untranslated = flat(DICTS[lang]).filter(([path, text]) => fr.get(path) === text && /[a-z]{2}/i.test(text) && !SAME.has(text));
    expect(untranslated).toEqual([]);
  });

  it('nom de session dans chaque langue', () => {
    const d = new Date(2026, 9, 6, 9, 5);
    expect(DICTS.fr.sessionName(d)).toBe('Revue 2026-10-06 09h05');
    expect(DICTS.en.sessionName(d)).toBe('Review 2026-10-06 09:05');
  });
});
