import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkForUpdate, isNewer, updateCommand, updateOutcome } from './updater.ts';

describe('mises à jour', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('compare les versions nombre par nombre', () => {
    expect(isNewer('0.3.0', '0.2.0')).toBe(true);
    expect(isNewer('0.10.0', '0.9.2')).toBe(true);
    expect(isNewer('0.2.0', '0.2.0')).toBe(false);
    expect(isNewer('0.1.9', '0.2.0')).toBe(false);
  });

  it('propose une version plus récente, rien sinon, et signale un échec au lieu de l’effacer', async () => {
    const latest = (version: string, status = 200) => vi.fn(async () => new Response(JSON.stringify({ version }), { status }));
    vi.stubGlobal('fetch', latest('0.10.0'));
    expect(await checkForUpdate('0.9.1')).toEqual({ version: '0.10.0' });
    vi.stubGlobal('fetch', latest('0.9.1'));
    expect(await checkForUpdate('0.9.1')).toBeNull();
    vi.stubGlobal('fetch', latest('0.10.0', 500));
    await expect(checkForUpdate('0.9.1')).rejects.toThrow('500');
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('fetch failed'))));
    await expect(checkForUpdate('0.9.1')).rejects.toThrow();
  });

  it('donne la commande d’installation du site et le terminal de la plateforme', () => {
    expect(updateCommand('darwin')).toEqual({ command: 'curl -fsSL https://vibescreener.dev/install.sh | sh', terminal: 'Terminal' });
    expect(updateCommand('win32')).toEqual({ command: 'irm https://vibescreener.dev/install.ps1 | iex', terminal: 'PowerShell' });
  });

  it('juge la mise à jour au lancement suivant', () => {
    expect(updateOutcome('', '0.9.1')).toBeNull();
    expect(updateOutcome('0.10.0', '0.10.0')).toBe('done');
    expect(updateOutcome('0.10.0', '0.10.1')).toBe('done');
    expect(updateOutcome('0.10.0', '0.9.1')).toBe('failed');
  });
});
