import { describe, expect, it } from 'vitest';
import { audioContextFor, looksRepeated } from './whisper.ts';

describe('audioContextFor', () => {
  it('multiples de 256, au moins 768, au plus 1500 (30 s)', () => {
    expect(audioContextFor(5_000)).toBe(768);
    expect(audioContextFor(12_000)).toBe(1024);
    expect(audioContextFor(15_000)).toBe(1280);
    expect(audioContextFor(60_000)).toBe(1500);
  });
});

describe('looksRepeated', () => {
  it('repère un texte trop long pour la durée (Whisper en boucle)', () => {
    const phrase = 'Sur ce bouton, mets un border-radius de 8 px, plus de padding, et un header plus haut. ';
    expect(looksRepeated(phrase.trim(), 5_800)).toBe(false);
    expect(looksRepeated(phrase.repeat(9).trim(), 5_800)).toBe(true);
    expect(looksRepeated('', 500)).toBe(false);
  });
});
