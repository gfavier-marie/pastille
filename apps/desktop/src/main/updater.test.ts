import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkForUpdate, installerCommand, isNewer, updateFiles, updateOutcome } from './updater.ts';

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

  it('télécharge l’installeur de la version et le script de la plateforme', () => {
    const mac = updateFiles('darwin', '0.10.0', '/u');
    expect(mac.installer.url).toMatch(/\/v0\.10\.0\/VibeScreener-arm64\.dmg$/);
    expect(mac.script.url).toMatch(/\/install\.sh$/);
    const win = updateFiles('win32', '0.10.0', 'C:\\u');
    expect(win.installer.url).toMatch(/\/v0\.10\.0\/VibeScreener-Setup\.exe$/);
    expect(win.script.url).toMatch(/\/install\.ps1$/);
  });

  it('passe les chemins par l’environnement, jamais dans la commande', () => {
    const files = { installer: "C:\\Users\\Jérôme d'Arc\\update\\VibeScreener-Setup.exe", script: "C:\\Users\\Jérôme d'Arc\\update\\install.ps1" };
    const win = installerCommand('win32', files);
    expect(win.args.join(' ')).not.toContain('Jérôme');
    expect(win.env).toEqual({ PASTILLE_SCRIPT: files.script, PASTILLE_EXE_FILE: files.installer });
    const mac = installerCommand('darwin', { installer: '/a b/VibeScreener-arm64.dmg', script: '/a b/install.sh' });
    expect(mac).toEqual({ cmd: '/bin/sh', args: ['/a b/install.sh'], env: { PASTILLE_DMG_FILE: '/a b/VibeScreener-arm64.dmg' } });
  });

  it('juge la mise à jour au lancement suivant', () => {
    expect(updateOutcome('', '0.9.1')).toBeNull();
    expect(updateOutcome('0.10.0', '0.10.0')).toBe('done');
    expect(updateOutcome('0.10.0', '0.10.1')).toBe('done');
    expect(updateOutcome('0.10.0', '0.9.1')).toBe('failed');
  });
});
