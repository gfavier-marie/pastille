import { describe, expect, it } from 'vitest';
import type { Annotation, Capture } from './model.ts';
import { defaultSessionName, findAnnotation, findComment, newNote, newSession, renumber, slugify, stamp, upgradeSession } from './session.ts';

const annotation = (id: string): Annotation => ({
  id,
  number: 0,
  geometry: { kind: 'point', x: 0.5, y: 0.5 },
  text: '',
  input: 'typed',
  transcription: 'none',
  sketches: [],
  createdAt: '',
  updatedAt: '',
});
const capture = (id: string, ids: string[]): Capture => ({
  id,
  createdAt: '',
  image: `captures/${id}.png`,
  width: 100,
  height: 100,
  scaleFactor: 2,
  annotations: ids.map(annotation),
});

describe('session', () => {
  it('nom par défaut et horodatage', () => {
    const d = new Date(2026, 9, 6, 9, 5);
    expect(defaultSessionName(d)).toBe('Revue 2026-10-06 09h05');
    expect(stamp(d)).toBe('20261006-0905');
  });

  it('numérote en continu sur toutes les captures', () => {
    const s = newSession(new Date());
    s.captures = [capture('c1', ['a', 'b']), capture('c2', ['c'])];
    renumber(s);
    expect(s.captures.flatMap((c) => c.annotations.map((a) => `${a.id}${a.number}`))).toEqual(['a1', 'b2', 'c3']);
  });

  it('recalcule après suppression sans changer les identifiants', () => {
    const s = newSession(new Date());
    s.captures = [capture('c1', ['a', 'b']), capture('c2', ['c'])];
    s.captures[0]!.annotations.splice(0, 1);
    renumber(s);
    expect(findAnnotation(s, 'c')?.annotation.number).toBe(2);
    expect(findAnnotation(s, 'b')?.annotation.number).toBe(1);
    expect(findAnnotation(s, 'a')).toBeUndefined();
  });

  it('slug de nom de fichier', () => {
    expect(slugify('Revue 2026-10-06 12h30 — Écran « Accueil »')).toBe('revue-2026-10-06-12h30-ecran-accueil');
    expect(slugify('!!!')).toBe('revue');
  });

  it('remarques générales : ancien texte unique repris en liste, retrouvées comme un commentaire', () => {
    const old = { ...newSession(new Date(2026, 9, 6)), notes: '  Marges irrégulières ' } as unknown as Parameters<typeof upgradeSession>[0];
    expect(upgradeSession(old).notes).toMatchObject([{ text: 'Marges irrégulières', transcription: 'none' }]);
    const empty = { ...newSession(new Date(2026, 9, 6)), notes: ' ' } as unknown as Parameters<typeof upgradeSession>[0];
    expect(upgradeSession(empty).notes).toEqual([]);
    const s = newSession(new Date(2026, 9, 6));
    s.notes = [newNote()];
    expect(findComment(s, s.notes[0]!.id)).toBe(s.notes[0]);
  });
});
