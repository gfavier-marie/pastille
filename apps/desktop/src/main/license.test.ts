import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createLicense } from './license.ts';

const DAY = 86_400_000;
const polar = { api: 'https://polar.test', org: 'org-1' };

/** Licence sur un dossier neuf, avec une horloge réglable et une fausse API Polar. */
async function setup(answer: (endpoint: string, body: Record<string, string>) => Response | Promise<Response>) {
  const dir = await mkdtemp(join(tmpdir(), 'pastille-license-'));
  const clock = { t: Date.parse('2026-10-06T10:00:00Z') };
  const calls: string[] = [];
  const fakeFetch = (async (url: string, init: RequestInit) => {
    const endpoint = url.split('/').at(-1)!;
    calls.push(endpoint);
    return answer(endpoint, JSON.parse(init.body as string));
  }) as typeof fetch;
  const make = () => createLicense({ dataDir: dir, trialDays: 14, polar, now: () => clock.t, fetch: fakeFetch });
  return { make, clock, calls };
}

const json = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status });
const granted = () => json(200, { id: 'activation-1' });

describe('licence', () => {
  it("compte les jours d'essai depuis le premier lancement, puis bloque les captures", async () => {
    const { make, clock } = await setup(granted);
    const license = make();
    expect(license.view()).toEqual({ state: 'trial', daysLeft: 14, key: '' });
    clock.t += 13 * DAY;
    expect(make().view()).toMatchObject({ state: 'trial', daysLeft: 1 }); // relu sur le disque
    clock.t += 2 * DAY;
    expect(license.view()).toMatchObject({ state: 'expired', daysLeft: 0 });
    expect(license.canCapture()).toBe(false);
  });

  it('active une clé : elle est envoyée à Polar avec un nom anonyme, et débloque la capture', async () => {
    let sent: Record<string, string> = {};
    const { make, clock } = await setup((_e, body) => ((sent = body), granted()));
    const license = make();
    clock.t += 20 * DAY;
    expect(await license.activate('  VIBE-ABCD-1A2B  ')).toEqual({ ok: true });
    expect(sent).toMatchObject({ key: 'VIBE-ABCD-1A2B', organization_id: 'org-1' });
    expect(sent.label).toMatch(/^Mac [0-9a-f]{8}$/);
    expect(make().view()).toMatchObject({ state: 'licensed', key: '••••1A2B' });
    expect(license.canCapture()).toBe(true);
  });

  it('explique un refus de Polar sans rien enregistrer', async () => {
    const { make } = await setup((e) => (e === 'activate' ? json(403, { detail: 'License key activation limit reached' }) : granted()));
    const license = make();
    const r = await license.activate('VIBE-1');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/nombre maximal/);
    expect(license.view().state).toBe('trial');
  });

  it("revérifie la clé une fois par jour et retire la licence quand Polar la révoque", async () => {
    let revoked = false;
    const { make, clock, calls } = await setup((e) => (e === 'validate' && revoked ? json(404) : granted()));
    const license = make();
    await license.activate('VIBE-1');
    await license.refresh(); // moins d'un jour : pas d'appel
    expect(calls).toEqual(['activate']);
    revoked = true; // abonnement résilié
    clock.t += DAY + 1;
    await license.refresh();
    expect(calls).toEqual(['activate', 'validate']);
    expect(license.view().state).toBe('revoked');
    expect(license.canCapture()).toBe(false);
  });

  it('garde la licence 30 jours sans réponse de Polar, puis demande une vérification', async () => {
    let offline = false;
    const { make, clock } = await setup(() => (offline ? Promise.reject(new TypeError('fetch failed')) : granted()));
    const license = make();
    await license.activate('VIBE-1');
    offline = true;
    clock.t += 10 * DAY;
    await license.refresh();
    expect(license.view().state).toBe('licensed');
    clock.t += 30 * DAY;
    await license.refresh();
    expect(license.view().state).toBe('unverified');
    expect(license.canCapture()).toBe(false);
    offline = false;
    await license.refresh(); // de retour en ligne
    expect(license.view().state).toBe('licensed');
  });

  it("une erreur passagère de Polar ne change rien", async () => {
    let failing = false;
    const { make, clock } = await setup((e) => (e === 'validate' && failing ? json(500) : granted()));
    const license = make();
    await license.activate('VIBE-1');
    failing = true;
    clock.t += 2 * DAY;
    await license.refresh();
    expect(license.view().state).toBe('licensed');
  });
});
