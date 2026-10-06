import { describe, expect, it } from 'vitest';
import { audioContextFor } from './whisper.ts';

describe('audioContextFor', () => {
  it('multiples de 256, au moins 768, au plus 1500 (30 s)', () => {
    expect(audioContextFor(5_000)).toBe(768);
    expect(audioContextFor(12_000)).toBe(1024);
    expect(audioContextFor(15_000)).toBe(1280);
    expect(audioContextFor(60_000)).toBe(1500);
  });
});
