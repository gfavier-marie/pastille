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
    expect(md).toContain('## Remarques générales\n\nLes marges sont irrégulières');
    expect(md).toContain('## Écran 3 — Google Chrome — Paramètres');
    expect(md).toMatch(/\| #1 \| 1 \| .* \| oui \|/);
    expect(md).toContain('![Croquis 1 de #1](images/croquis-1.png)');
    expect(existsSync(join(dir, 'images/croquis-1.png'))).toBe(true);
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
    expect(html).toContain('<h2>Remarques générales</h2>\n<p>Les marges sont irrégulières');
    expect(html.match(/class="point"/g)).toHaveLength(10);
  });

  it('produit un PowerPoint : titre, remarques, récapitulatif, 5 écrans, 20 points', async () => {
    const { session, dir: sessionDir } = await createFakeSession(await mkdtemp(join(tmpdir(), 'pastille-sessions-')));
    const outDir = await mkdtemp(join(tmpdir(), 'pastille-out-'));
    const file = await exportSession({ session, sessionDir, outDir, format: 'pptx', printHtml: async () => new Uint8Array() });
    expect(file).toMatch(/\.pptx$/);
    const zip = await readFile(file);
    const slides = new Set(zip.toString('latin1').match(/ppt\/slides\/slide\d+\.xml/g));
    expect(slides.size).toBeGreaterThanOrEqual(1 + 1 + 1 + 5 + 20);
  });

  it('découpe le PDF au-delà de 100 pages, récapitulatif complet dans chaque partie', async () => {
    const { session, dir: sessionDir } = await createFakeSession(await mkdtemp(join(tmpdir(), 'pastille-sessions-')));
    const outDir = await mkdtemp(join(tmpdir(), 'pastille-out-'));
    const htmls: string[] = [];
    // Faux PDF : 50 pages par écran (5 écrans → 250 pages → 3 parties).
    const printHtml = async (file: string) => {
      const html = await readFile(file, 'utf8');
      htmls.push(html);
      return new TextEncoder().encode('/Type /Page\n'.repeat(50 * (html.match(/class="screen"/g)?.length ?? 0)));
    };
    const first = await exportSession({ session, sessionDir, outDir, format: 'pdf', printHtml });
    expect(first).toMatch(/-partie-1-sur-3\.pdf$/);
    const parts = htmls.slice(1);
    expect(parts).toHaveLength(3);
    expect(parts.map((h) => h.match(/class="screen"/g)?.length)).toEqual([2, 2, 1]);
    for (const h of parts) expect(h.match(/<tr><td>#/g)).toHaveLength(20);
    expect(parts[2]).toContain('partie 3/3');
  });
});
