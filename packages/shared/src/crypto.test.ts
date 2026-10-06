import { describe, expect, it } from 'vitest';
import { fromBase64Url, importKey, newPairing, toBase64Url } from './crypto.ts';
import { decodeMessage, encodeMessage, type Message } from './protocol.ts';

describe('chiffrement et protocole', () => {
  it('base64url aller-retour', () => {
    const bytes = crypto.getRandomValues(new Uint8Array(33));
    expect(fromBase64Url(toBase64Url(bytes))).toEqual(bytes);
    expect(toBase64Url(bytes)).not.toMatch(/[+/=]/);
  });

  it('un message chiffré se relit avec la même clé', async () => {
    const key = await importKey(newPairing().key);
    const msg: Message = { type: 'focus', annotationId: 'a1', number: 12, text: 'Bouton trop petit' };
    const sealed = await encodeMessage(key, msg);
    expect(new TextDecoder().decode(sealed)).not.toContain('Bouton');
    expect(await decodeMessage(key, sealed)).toEqual(msg);
  });

  it('refuse une autre clé ou un message altéré', async () => {
    const key = await importKey(newPairing().key);
    const other = await importKey(newPairing().key);
    const sealed = await encodeMessage(key, { type: 'focus_none' });
    await expect(decodeMessage(other, sealed)).rejects.toThrow();
    sealed[sealed.length - 1]! ^= 1;
    await expect(decodeMessage(key, sealed)).rejects.toThrow();
  });
});
