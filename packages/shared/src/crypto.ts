// Chiffrement de bout en bout desktop ↔ tablette : AES-GCM 256 bits (WebCrypto,
// disponible dans Node comme dans le navigateur). Le relais ne voit que du chiffré.

const IV_BYTES = 12;

export function toBase64Url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const s = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** Identifiant de room et clé, tirés au hasard à l'appairage (encodés en base64url pour le QR). */
export function newPairing(): { roomId: string; key: string } {
  return {
    roomId: toBase64Url(crypto.getRandomValues(new Uint8Array(16))),
    key: toBase64Url(crypto.getRandomValues(new Uint8Array(32))),
  };
}

export function importKey(key: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', fromBase64Url(key), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/** Message chiffré = IV (12 octets) + texte chiffré. */
export async function seal(key: CryptoKey, plain: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain));
  const out = new Uint8Array(IV_BYTES + cipher.length);
  out.set(iv);
  out.set(cipher, IV_BYTES);
  return out;
}

/** Lève une erreur si le message a été altéré ou chiffré avec une autre clé. */
export async function open(key: CryptoKey, sealed: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const iv = sealed.subarray(0, IV_BYTES);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, sealed.subarray(IV_BYTES));
  return new Uint8Array(plain);
}
