import { beforeEach, describe, expect, it, vi } from 'vitest';

const rename = vi.fn();
vi.mock('node:fs/promises', () => ({ rename }));
const { renameRetry } = await import('./rename.ts');

const fail = (code: string) => Object.assign(new Error(code), { code });

describe('renameRetry', () => {
  beforeEach(() => {
    rename.mockReset();
  });

  it('réessaie tant que le fichier est occupé (Windows)', async () => {
    rename.mockRejectedValueOnce(fail('EPERM')).mockRejectedValueOnce(fail('EBUSY')).mockResolvedValueOnce(undefined);
    await renameRetry('a.tmp', 'a');
    expect(rename).toHaveBeenCalledTimes(3);
  });

  it('abandonne tout de suite sur une autre erreur', async () => {
    rename.mockRejectedValue(fail('ENOENT'));
    await expect(renameRetry('a.tmp', 'a')).rejects.toThrow('ENOENT');
    expect(rename).toHaveBeenCalledTimes(1);
  });
});
