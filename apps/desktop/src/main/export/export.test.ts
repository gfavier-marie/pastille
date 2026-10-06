import { existsSync } from 'node:fs';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadImage } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { buildExport } from './build.ts';
import { createFakeSession } from './fixture.ts';
import { exportSession } from './index.ts';
import { toPdfHtml } from './pdf-html.ts';

describe('export', () => {
  it('produit les images et un Markdown complet', async () => {
    const { session, dir: sessionDir } = await createFakeSession(await mkdtemp(join(tmpdir(), 'pastille-sessions-')));
    const outDir = await mkdtemp(join(tmpdir(), 'pastille-out-'));
    const dir = await exportSession({ session, sessionDir, outDir, format: 'markdown', printHtml: async () => new Uint8Array() });

    const md = await readFile(join(dir, 'revue.md'), 'utf8');
    expect(md).toContain('Ce document liste 20 retours');
    expect(md).toContain('**Contexte** : Back-office React');
    expect(md).toContain('## Écran 3 — Google Chrome — Paramètres');
    for (let n = 1; n <= 20; n++) {
      expect(md).toContain(`### #${n}\n`);
      expect(existsSync(join(dir, `images/point-${n}.jpg`))).toBe(true);
    }
    // La numérotation suit l'ordre des écrans : #9 est le 1er point de l'écran 3.
    expect(md).toMatch(/### #9\n\nParamètres : le bouton 1 /);
    // Captures limitées à 2000 px, zooms d'environ 600 × 400.
    const crop = await loadImage(join(dir, 'images/point-1.jpg'));
    expect([crop.width, crop.height]).toEqual([600, 400]);
  });

  it('le HTML du PDF contient le récapitulatif avant les écrans', async () => {
    const { session, dir: sessionDir } = await createFakeSession(await mkdtemp(join(tmpdir(), 'pastille-sessions-')), 2);
    const doc = await buildExport(session, sessionDir, await mkdtemp(join(tmpdir(), 'pastille-out-')));
    const html = toPdfHtml(doc);
    expect(html.indexOf('Récapitulatif')).toBeLessThan(html.indexOf('class="screen"'));
    expect(html.match(/class="point"/g)).toHaveLength(10);
  });
});
