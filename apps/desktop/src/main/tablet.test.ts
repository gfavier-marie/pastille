import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { Message } from '@pastille/shared';

const relay = vi.hoisted(() => ({ messages: [] as Message[], receive: (_msg: Message) => {} }));
vi.mock('@pastille/shared', async (importOriginal) => ({
  ...await importOriginal<typeof import('@pastille/shared')>(),
  connectLink: (opts: { onMessage: (msg: Message) => void }) => {
    relay.receive = opts.onMessage;
    return { send: async (msg: Message) => { relay.messages.push(msg); }, close: () => {} };
  },
}));

import { createSessionStore } from './session-store.ts';
import { createTablet } from './tablet.ts';

describe('dessin sur tablette pendant la vidéo', () => {
  it('attend le point actif, garde le croquis sur ce point et conserve le comportement habituel à l’arrêt', async () => {
    relay.messages = [];
    const dataDir = await mkdtemp(join(tmpdir(), 'pastille-tablet-'));
    const store = createSessionStore(dataDir);
    const capture = await store.addCapture(new Uint8Array([1]), { width: 800, height: 600, scaleFactor: 1 });
    const id = store.addAnnotation(capture.id, { kind: 'point', x: 0.5, y: 0.5 });
    const tablet = createTablet({ dataDir, store, relayUrl: 'https://relay.example.com', onStatus: () => {} });
    const sketch = (sketchId: string, annotationId = ''): Message => ({ type: 'sketch', sketchId, annotationId, png: Buffer.from('png').toString('base64'), strokes: '{"strokes":[]}' });
    try {
      await tablet.pairUrl();
      tablet.setFocus(null, false); // un nouveau clic vidéo attend encore sa parole ou son dessin
      expect(relay.messages.at(-1)).toEqual({ type: 'focus_none', lastNumber: undefined });
      relay.receive(sketch('too-early'));
      await new Promise((r) => setTimeout(r, 20));
      expect(store.get()!.captures[0]!.annotations[0]!.sketches).toEqual([]);

      tablet.setFocus(id, false);
      await new Promise((r) => setTimeout(r, 20));
      expect(relay.messages.at(-1)).toMatchObject({ type: 'focus', annotationId: id, number: 1 });
      relay.receive(sketch('video-drawing', id));
      for (let i = 0; i < 20 && !store.get()!.captures[0]!.annotations[0]!.sketches.length; i++) await new Promise((r) => setTimeout(r, 5));
      const a = store.get()!.captures[0]!.annotations[0]!;
      expect(a.sketches.map((s) => s.id)).toEqual(['video-drawing']);
      expect(await readFile(join(store.dir(store.get()!), a.sketches[0]!.strokes), 'utf8')).toBe('{"strokes":[]}');
      expect(relay.messages).toContainEqual({ type: 'sketch_ack', sketchId: 'video-drawing', number: 1 });

      tablet.setFocus(null); // hors vidéo : comme avant, un croquis sans sélection rejoint le dernier point
      expect(relay.messages.at(-1)).toEqual({ type: 'focus_none', lastNumber: 1 });
      relay.receive(sketch('after-video'));
      for (let i = 0; i < 20 && store.get()!.captures[0]!.annotations[0]!.sketches.length < 2; i++) await new Promise((r) => setTimeout(r, 5));
      expect(store.get()!.captures[0]!.annotations[0]!.sketches.map((s) => s.id)).toEqual(['video-drawing', 'after-video']);
    } finally {
      tablet.stop();
      await store.flush();
    }
  });
});
