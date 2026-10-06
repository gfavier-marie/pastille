import { describe, expect, it } from 'vitest';
import { encodeWav, wavDurationMs } from './wav.ts';

describe('encodeWav', () => {
  it('écrit un WAV PCM 16 bits mono à 16 kHz', () => {
    const wav = encodeWav(new Float32Array(16000)); // 1 s de silence
    const view = new DataView(wav.buffer);
    const text = (o: number) => String.fromCharCode(...wav.slice(o, o + 4));
    expect(text(0)).toBe('RIFF');
    expect(text(8)).toBe('WAVE');
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(wav.byteLength).toBe(44 + 32000);
    expect(wavDurationMs(wav)).toBe(1000);
  });

  it('borne les échantillons hors de [-1, 1]', () => {
    const view = new DataView(encodeWav(new Float32Array([2, -2])).buffer);
    expect(view.getInt16(44, true)).toBe(0x7fff);
    expect(view.getInt16(46, true)).toBe(-0x8000);
  });
});
