// Messages échangés entre le desktop et la tablette via le relais (cahier des charges §8.3).

import { open, seal } from './crypto.ts';

export const MAX_MESSAGE_BYTES = 1024 * 1024;

export type Message =
  | { type: 'hello'; role: 'desktop' | 'tablet'; ack?: boolean } // ack : réponse à un hello
  | { type: 'ping'; id: number; t: number }
  | { type: 'pong'; id: number; t: number }
  // desktop → tablette
  | { type: 'focus'; annotationId: string; number: number; text: string; background?: string /* JPEG base64 */ }
  | { type: 'focus_none' }
  | { type: 'sketch_ack'; sketchId: string; number: number }
  // tablette → desktop
  | { type: 'sketch'; annotationId: string; sketchId: string; png: string /* base64 */; strokes: string };

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function encodeMessage(key: CryptoKey, msg: Message): Promise<Uint8Array<ArrayBuffer>> {
  return seal(key, new Uint8Array(encoder.encode(JSON.stringify(msg))));
}

export async function decodeMessage(key: CryptoKey, data: Uint8Array<ArrayBuffer>): Promise<Message> {
  return JSON.parse(decoder.decode(await open(key, data))) as Message;
}
