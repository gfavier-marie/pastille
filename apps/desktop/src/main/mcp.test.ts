import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFakeSession } from './export/fixture.ts';
import { createMcp } from './mcp.ts';
import { createSessionStore } from './session-store.ts';

type Result = { content: { type: string; text?: string; mimeType?: string }[]; isError?: boolean };

describe('serveur MCP', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pastille-mcp-'));
  const store = createSessionStore(root);
  // Deux sessions : une ancienne (fermée) et l'ouverte.
  const { session: older } = await createFakeSession(store.sessionsDir, 1);
  const { session } = await createFakeSession(store.sessionsDir);
  await writeFile(join(root, 'state.json'), JSON.stringify({ currentSessionId: session.id }));
  await store.restore();
  const mcp = createMcp({ store });

  let id = 0;
  const call = async (name: string, args: Record<string, unknown> = {}) =>
    ((await mcp.handle({ id: ++id, method: 'tools/call', params: { name, arguments: args } })) as { result: Result }).result;
  const textOf = (r: Result) => r.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n');

  it('négocie la version et liste les trois outils', async () => {
    const init = (await mcp.handle({ id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } })) as { result: Record<string, unknown> };
    expect(init.result.protocolVersion).toBe('2025-06-18');
    expect(init.result.instructions).toContain('voir_ecran');
    const future = (await mcp.handle({ id: 2, method: 'initialize', params: { protocolVersion: '2099-01-01' } })) as { result: Record<string, unknown> };
    expect(future.result.protocolVersion).toBe('2025-11-25');
    const list = (await mcp.handle({ id: 3, method: 'tools/list' })) as { result: { tools: { name: string }[] } };
    expect(list.result.tools.map((t) => t.name)).toEqual(['lister_sessions', 'lire_revue', 'voir_ecran']);
    expect(await mcp.handle({ method: 'notifications/initialized' })).toBeNull();
    expect(await mcp.handle({ id: 4, method: 'resources/list' })).toMatchObject({ error: { code: -32601 } });
  });

  it('liste les sessions et signale celle qui est ouverte', async () => {
    const text = textOf(await call('lister_sessions'));
    expect(text).toContain(`id : ${session.id} (ouverte dans VibeScreener)`);
    expect(text).toContain(`id : ${older.id}`);
    expect(text).toContain('20 points');
  });

  it('lit la revue ouverte par défaut', async () => {
    const text = textOf(await call('lire_revue'));
    expect(text).toContain('Ce document liste 20 retours');
    expect(text).toContain('Contexte : Back-office React');
    expect(text).toContain('## Écran 3 — Google Chrome — Paramètres');
    expect(text).toMatch(/- #9 · Paramètres : le bouton 1 .* · x \d+, y \d+ sur 1600 × 1000/);
    expect(text).toMatch(/- #1 · .* · 1 croquis/);
    expect(text).toContain('voir_ecran avec ecran de 1 à 5');
  });

  it('lit une autre session par son id', async () => {
    const text = textOf(await call('lire_revue', { session: older.id }));
    expect(text).toContain('Ce document liste 5 retours');
    expect((await call('lire_revue', { session: '../secret' })).isError).toBe(true);
    expect((await call('lire_revue', { session: 'inconnue' })).isError).toBe(true);
  });

  it("montre un écran : capture, zooms et croquis", async () => {
    const r = await call('voir_ecran', { ecran: 1 });
    expect(r.isError).toBeUndefined();
    expect(r.content.filter((c) => c.type === 'image').map((c) => c.mimeType)).toEqual([
      'image/jpeg', // capture annotée
      'image/jpeg', // zoom #1
      'image/png', // croquis de #1
      'image/jpeg',
      'image/jpeg',
      'image/jpeg',
    ]);
    expect(textOf(r)).toContain('### #1\nTableau de bord : le bouton 1');
    const missing = await call('voir_ecran', { ecran: 9 });
    expect(missing.isError).toBe(true);
    expect(textOf(missing)).toContain('a 5 écrans');
  });

  describe('en HTTP', () => {
    let url = '';
    beforeAll(async () => {
      url = await mcp.listen(0);
    });
    afterAll(() => mcp.close());

    const post = (body: unknown, headers: Record<string, string> = {}) =>
      fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

    it('répond en JSON aux requêtes, 202 aux notifications', async () => {
      const res = await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25' } });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('application/json');
      expect(((await res.json()) as { result: { serverInfo: { name: string } } }).result.serverInfo.name).toBe('vibescreener');
      expect((await post({ jsonrpc: '2.0', method: 'notifications/initialized' })).status).toBe(202);
      expect((await fetch(url)).status).toBe(405);
    });

    it('refuse les pages web', async () => {
      expect((await post({ jsonrpc: '2.0', id: 1, method: 'ping' }, { Origin: 'https://exemple.com' })).status).toBe(403);
    });
  });
});
