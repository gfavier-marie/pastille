import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildExport } from '../export/build.ts';
import { createSessionStore } from '../session-store.ts';
import { anchorOf, cellAt, type TextMap } from './anchor.ts';
import { createSampleDocx, createSamplePptx, createSampleXlsx, DOCX_FIRST, DOCX_TITLE } from './fixture.ts';
import { openDocx, openPptx } from './office.ts';
import { createDocuments, DocumentError, documentFormat, type OpenedDocument } from './open.ts';
import { formatNumber, openXlsx } from './xlsx.ts';

/** Centre de la boîte du premier morceau dont le texte commence ainsi. */
function centerOf(map: TextMap, start: string) {
  const r = map.runs.find((x) => x.t.startsWith(start))!;
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

describe('documents Office', { timeout: 30_000 }, () => {
  it('Word : pages A4, texte et paragraphe d’origine de chaque morceau', async () => {
    const doc = await openDocx(await createSampleDocx());
    expect(doc.pages).toBeGreaterThanOrEqual(3); // le nombre exact dépend des polices installées
    const page = await doc.render(0);
    expect([page.width, page.height]).toEqual([1191, 1684]);
    const title = page.map.runs.find((r) => r.t.startsWith('Rapport'))!;
    expect(title.p).toBe('0');
    const first = centerOf(page.map, "Le");
    expect(anchorOf({ kind: 'point', ...first }, page.map)).toEqual({ text: DOCX_FIRST });
    expect(anchorOf({ kind: 'zone', x: 0, y: 0, w: 1, h: title.y + title.h + 0.001 }, page.map)).toEqual({ text: DOCX_TITLE });
    // Le tableau (paragraphe d'une cellule : tableau, ligne, cellule, paragraphe), sur l'une des pages suivantes.
    const cells = [];
    for (let i = 1; i < doc.pages; i++) cells.push(...(await doc.render(i)).map.runs.filter((r) => r.p?.split('.').length === 4));
    expect(cells[0]!.p).toMatch(/^\d+\.0\.0\.0$/);
    await doc.close();
  });

  it('PowerPoint : diapositives 16:9, texte de chaque forme', async () => {
    const doc = await openPptx(await createSamplePptx());
    expect(doc.pages).toBe(2);
    const slide = await doc.render(0);
    expect([slide.width, slide.height]).toEqual([1920, 1080]);
    const title = centerOf(slide.map, 'Résultats');
    expect(anchorOf({ kind: 'point', ...title }, slide.map)).toEqual({ text: 'Résultats du trimestre' });
    expect((await doc.render(1)).map.runs.map((r) => r.t)).toContain('Ouvrir deux magasins à Lyon');
    await doc.close();
  });

  it('Excel : feuilles découpées en morceaux, cellule et valeur visées', async () => {
    const doc = await openXlsx(await createSampleXlsx());
    expect(doc.pages).toBe(4); // Ventes : 120 lignes en trois morceaux ; Notes : un
    const first = await doc.render(0);
    expect([first.sheet, first.range]).toEqual(['Ventes', 'A1:J50']);
    expect(first.map.grid).toMatchObject({ sheet: 'Ventes', col0: 0, row0: 0 });
    const c2 = centerOf(first.map, '100');
    expect(cellAt(first.map.grid!, c2.x, c2.y)).toEqual([2, 1]);
    expect(anchorOf({ kind: 'point', ...c2 }, first.map)).toEqual({ cells: 'C2', sheet: 'Ventes', text: '100' });
    const g2 = centerOf(first.map, '20');
    expect(anchorOf({ kind: 'zone', x: c2.x, y: c2.y, w: g2.x - c2.x, h: 0.05 }, first.map)).toMatchObject({ cells: expect.stringMatching(/^C2:G\d+$/) });
    // Deuxième morceau : la numérotation des lignes continue.
    const second = await doc.render(1);
    expect(second.range).toBe('A51:J100');
    const p = centerOf(second.map, 'Magasin 50');
    expect(anchorOf({ kind: 'point', ...p }, second.map)).toMatchObject({ cells: 'B51' });
    expect((await doc.render(3)).sheet).toBe('Notes');
  });

  it('formats de nombres Excel courants', () => {
    expect(formatNumber(0.2, '0%', 'fr')).toBe('20%');
    expect(formatNumber(1234.5, '#,##0.00', 'en')).toBe('1,234.50');
    expect(formatNumber(1234.5, '#,##0.00 [$€-40C]', 'fr')).toBe('1\u202f234,50 €');
    expect(formatNumber(-5, '#,##0;(#,##0)', 'en')).toBe('(5)');
    expect(formatNumber(-5, '0.0', 'en')).toBe('-5.0');
    expect(formatNumber(1 / 3, 'General', 'en')).toBe('0.3333333333');
    expect(formatNumber(46000, 'dd/mm/yyyy', 'fr')).toBe('09/12/2025');
  });

  it('ouvre chaque format en session ; les anciens formats sont refusés', async () => {
    expect(documentFormat('a.DOCX')).toBe('docx');
    expect(documentFormat('modele.potx')).toBe('pptx');
    expect(documentFormat('macros.xlsm')).toBe('xlsx');
    expect(() => documentFormat('vieux.ppt')).toThrow(DocumentError);
    const root = await mkdtemp(join(tmpdir(), 'pastille-office-'));
    const store = createSessionStore(root);
    const openers: Record<string, (b: Uint8Array) => Promise<OpenedDocument>> = { docx: openDocx, pptx: openPptx, xlsx: openXlsx };
    const documents = createDocuments({ store, open: (bytes, format) => openers[format]!(bytes) });
    const file = join(root, 'budget.xlsx');
    await writeFile(file, await createSampleXlsx());
    await documents.importDocument(file, () => {});
    const s = store.get()!;
    expect(s.captures.map((c) => c.source?.document?.range)).toEqual(['A1:J50', 'A51:J100', 'A101:J120', 'A1:J2']);
    const id = store.addAnnotation(s.captures[1]!.id, { kind: 'point', x: 0.2, y: 0.03 });
    store.update((x) => (x.captures[1]!.annotations.find((a) => a.id === id)!.text = 'Vérifier ce magasin'));
    const doc = await buildExport(store.get()!, store.dir(s), await mkdtemp(join(tmpdir(), 'pastille-out-')));
    expect(doc.screens[0]!.title).toBe('Feuille Ventes (A51:J100) — budget.xlsx');
    expect(doc.points[0]!.position).toMatch(/^cellule B51 de la feuille Ventes \(« Magasin 50 »\)/);
  });
});
