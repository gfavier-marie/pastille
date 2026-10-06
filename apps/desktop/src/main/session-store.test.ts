import { existsSync } from 'node:fs';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Session } from '@pastille/shared';
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
