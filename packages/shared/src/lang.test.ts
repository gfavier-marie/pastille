import { describe, expect, it } from 'vitest';
import { pickLang } from './lang.ts';

describe('pickLang', () => {
  it('prend la première langue traduite, l’anglais sinon', () => {
    expect(pickLang(['fr-CA', 'en-US'])).toBe('fr');
    expect(pickLang(['zh-Hans-FR', 'de_DE'])).toBe('de');
    expect(pickLang(['IT'])).toBe('it');
    expect(pickLang(['pt-BR'])).toBe('en');
    expect(pickLang([])).toBe('en');
  });
});
