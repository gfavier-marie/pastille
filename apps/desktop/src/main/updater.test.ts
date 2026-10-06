import { describe, expect, it } from 'vitest';
import { isNewer } from './updater.ts';

describe('mises à jour', () => {
  it('compare les versions nombre par nombre', () => {
    expect(isNewer('0.3.0', '0.2.0')).toBe(true);
    expect(isNewer('0.10.0', '0.9.2')).toBe(true);
    expect(isNewer('0.2.0', '0.2.0')).toBe(false);
    expect(isNewer('0.1.9', '0.2.0')).toBe(false);
  });
});
