import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { newNote, type Annotation } from '@pastille/shared';
import { createDictation } from './dictation.ts';
import { createSessionStore } from './session-store.ts';

const annotation = (id: string, text = ''): Annotation => ({
  id,
  number: 0,
  geometry: { kind: 'point', x: 0.5, y: 0.5 },
  text,
  input: 'typed',
  transcription: 'none',
  sketches: [],
  createdAt: '',
  updatedAt: '',
});

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'pastille-'));
  const store = createSessionStore(root);
  await store.addCapture(new Uint8Array([0]), { width: 10, height: 10, scaleFactor: 1 });
  store.update((s) => s.captures[0]!.annotations.push(annotation('a'), annotation('b', 'Plus grand')));
  return { root, store, get: (id: string) => store.get()!.captures[0]!.annotations.find((x) => x.id === id)! };
}

const until = async (check: () => boolean) => {
  for (let i = 0; i < 100 && !check(); i++) await new Promise((r) => setTimeout(r, 10));
};

describe('file de transcription', () => {
  it('transcrit dans l’ordre et ajoute le texte à la fin du commentaire', async () => {
    const { store, get } = await setup();
    const order: string[] = [];
    const dictation = createDictation(store, async (wav) => {
      order.push(String(wav[0]));
      return wav[0] === 1 ? 'radius de 8 px' : 'et en rouge';
    });
    await dictation.submit('a', new Uint8Array([1]));
    await dictation.submit('b', new Uint8Array([2]));
    await until(() => get('b').transcription === 'done');
    expect(order).toEqual(['1', '2']);
    expect(get('a')).toMatchObject({ text: 'radius de 8 px', input: 'dictated', transcription: 'done' });
    expect(get('b')).toMatchObject({ text: 'Plus grand et en rouge', input: 'mixed' });
  });

  it('garde l’audio en cas d’erreur et permet de réessayer', async () => {
    const { store, get } = await setup();
    let fail = true;
    const dictation = createDictation(store, async () => {
      if (fail) throw new Error('whisper indisponible');
      return 'ok';
    });
    await dictation.submit('a', new Uint8Array([1]));
    await until(() => get('a').transcription === 'error');
    expect(dictation.unfinished()).toEqual({ pending: [], error: ['#1'] });
    fail = false;
    dictation.retry('a');
    await until(() => get('a').transcription === 'done');
    expect(get('a').text).toBe('ok');
  });

  it('reprend les dictées en attente après un redémarrage', async () => {
    const { root, store } = await setup();
    const blocked = createDictation(store, () => new Promise(() => {})); // ne répond jamais : « crash »
    await blocked.submit('a', new Uint8Array([1]));
    await store.flush();

    const again = createSessionStore(root);
    await again.restore();
    createDictation(again, async () => 'repris').resume();
    await until(() => again.get()!.captures[0]!.annotations[0]!.transcription === 'done');
    expect(again.get()!.captures[0]!.annotations[0]!.text).toBe('repris');
  });

  it('dicte aussi une remarque générale', async () => {
    const { store } = await setup();
    store.update((s) => (s.notes = [{ ...newNote(), text: 'Contraste' }]));
    const note = () => store.get()!.notes![0]!;
    const dictation = createDictation(store, async () => 'trop faible partout');
    await dictation.submit(note().id, new Uint8Array([1]));
    await until(() => note().transcription === 'done');
    expect(note()).toMatchObject({ text: 'Contraste trop faible partout', input: 'mixed' });
  });
});
