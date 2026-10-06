import { existsSync } from 'node:fs';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findAnnotation, type Session } from '@pastille/shared';
import { createSessionStore } from './session-store.ts';

const meta = { width: 200, height: 100, scaleFactor: 2 };
const point = (x: number) => ({
  id: crypto.randomUUID(),
  number: 0,
  geometry: { kind: 'point' as const, x, y: 0.5 },
  text: `retour ${x}`,
  input: 'typed' as const,
  transcription: 'none' as const,
  sketches: [],
  createdAt: '',
  updatedAt: '',
});

describe('stockage des sessions', () => {
  it('crée la session à la première capture et la rouvre intacte', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pastille-'));
    const store = createSessionStore(root);
    expect(await store.restore()).toBeNull();

    const capture = await store.addCapture(new Uint8Array([1, 2, 3]), meta);
    store.update((s) => s.captures[0]!.annotations.push(point(0.1), point(0.2)));
    store.update((s) => (s.context = 'Back-office, React'));
    const session = store.get()!;
    expect(session.name).toMatch(/^Revue \d{4}-\d{2}-\d{2} \d{2}h\d{2}$/);
    expect(existsSync(join(store.dir(session), capture.image))).toBe(true);

    await store.flush();
    // Redémarrage : un nouveau store relit la même session.
    const again = createSessionStore(root);
    const restored = (await again.restore())!;
    expect(restored.id).toBe(session.id);
    expect(restored.captures[0]!.annotations.map((a) => a.number)).toEqual([1, 2]);
  });

  it('écrit de façon atomique avec anti-rebond', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pastille-'));
    const store = createSessionStore(root);
    await store.addCapture(new Uint8Array([0]), meta);
    for (let i = 0; i < 20; i++) store.update((s) => (s.name = `nom ${i}`));
    await new Promise((r) => setTimeout(r, 400));
    const file = join(store.dir(store.get()!), 'session.json');
    expect((JSON.parse(await readFile(file, 'utf8')) as Session).name).toBe('nom 19');
    expect(existsSync(file + '.tmp')).toBe(false);
  });

  it('« Nouvelle session » reprend le contexte de la précédente', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pastille-'));
    const store = createSessionStore(root);
    await store.ensure();
    store.update((s) => (s.context = 'Site vitrine'));
    const first = store.get()!.id;
    await store.close();
    expect(store.get()).toBeNull();
    const next = await store.ensure();
    expect(next.id).not.toBe(first);
    expect(next.context).toBe('Site vitrine');
  });
});

describe('annuler / rétablir', () => {
  it('annule une étape, regroupe la frappe, garde les captures et les transcriptions', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pastille-'));
    const store = createSessionStore(root);
    await store.addCapture(new Uint8Array([0]), meta);
    const a = point(0.1);
    store.update((s) => s.captures[0]!.annotations.push({ ...a, text: '' }), { undoable: true });
    for (const text of ['b', 'bo', 'bou']) {
      store.update((s) => (s.captures[0]!.annotations[0]!.text = text), { undoable: true, coalesceKey: `text:${a.id}` });
    }
    await store.addCapture(new Uint8Array([0]), meta); // non annulable
    // Comme le vrai code : on cherche l'annotation par id, absente de certains états de l'historique.
    store.update((s) => {
      const found = findAnnotation(s, a.id);
      if (found) found.annotation.transcription = 'done';
    }, { patchHistory: true });

    store.undo(); // toute la frappe d'un coup
    expect(store.get()!.captures[0]!.annotations[0]!.text).toBe('');
    expect(store.get()!.captures).toHaveLength(2);
    expect(store.get()!.captures[0]!.annotations[0]!.transcription).toBe('done');
    store.undo(); // le point
    expect(store.get()!.captures[0]!.annotations).toHaveLength(0);
    store.redo();
    store.redo();
    expect(store.get()!.captures[0]!.annotations[0]!.text).toBe('bou');
  });
});

describe('sessions récentes', () => {
  it('liste les sessions et en rouvre une', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pastille-'));
    const store = createSessionStore(root);
    await store.ensure();
    store.update((s) => (s.name = 'Ancienne'));
    const first = store.get()!.id;
    await store.close();
    await store.ensure();
    store.update((s) => (s.name = 'Récente'));
    await store.flush();
    expect((await store.recent()).map((r) => r.name)).toEqual(['Récente', 'Ancienne']);
    await store.open(first);
    expect(store.get()!.name).toBe('Ancienne');
  });
});
