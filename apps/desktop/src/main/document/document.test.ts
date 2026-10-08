import { existsSync } from 'node:fs';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadImage } from '@napi-rs/canvas';
import { degrees, PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import type { Geometry } from '@pastille/shared';
import { buildExport } from '../export/build.ts';
import { exportSession } from '../export/index.ts';
import { createMcp } from '../mcp.ts';
import { createSessionStore } from '../session-store.ts';
import { anchorText, loadTextMap, toPdfSpace } from './anchor.ts';
import { createSamplePdf, SAMPLE_LINES } from './fixture.ts';
import { createDocuments, DocumentError } from './open.ts';
import { openPdf } from './pdf.ts';

// La phrase de la page 1 commence à x = 50 pt, ligne de base à 760 pt du bas (page de 595 × 842 pt).
const onSentence: Geometry = { kind: 'point', x: 0.2, y: (842 - 765) / 842 };

async function setup(maxPages?: number) {
  const root = await mkdtemp(join(tmpdir(), 'pastille-doc-'));
  const store = createSessionStore(root);
  const file = join(root, 'rapport.pdf');
  await writeFile(file, await createSamplePdf());
  const progress: unknown[] = [];
  const documents = createDocuments({ store, open: (bytes) => openPdf(bytes), maxPages, onProgress: (p) => progress.push(p) });
  return { root, store, file, documents, progress };
}

describe('documents', { timeout: 30_000 }, () => {
  it('ouvre un PDF en session : une capture par page, original copié, carte du texte écrite', async () => {
    const { store, file, documents, progress } = await setup();
    let first = '';
    expect(await documents.importDocument(file, (id) => (first = id))).toEqual({ pages: 3, truncated: false });
    const s = store.get()!;
    const dir = store.dir(s);
    expect(s.name).toBe('rapport');
    expect(s.captures).toHaveLength(3);
    expect(first).toBe(s.captures[0]!.id);
    const doc = s.captures[0]!.source!.document!;
    expect(doc).toMatchObject({ name: 'rapport.pdf', format: 'pdf', page: 1, pages: 3 });
    expect(s.captures[2]!.source!.document!.id).toBe(doc.id);
    expect(existsSync(join(dir, 'documents', `${doc.id}.pdf`))).toBe(true);
    // A4 à 144 ppp ; la page tournée est en paysage.
    expect([s.captures[0]!.width, s.captures[0]!.height]).toEqual([1190, 1684]);
    expect([s.captures[2]!.width, s.captures[2]!.height]).toEqual([1684, 1190]);
    expect((await loadImage(join(dir, s.captures[0]!.image))).width).toBe(1190);
    expect(progress.at(-2)).toEqual({ name: 'rapport.pdf', done: 3, total: 3 });
    expect(progress.at(-1)).toBeNull();

    const map = await loadTextMap(dir, s.captures[0]!);
    // Point sur la phrase : la ligne entière, sans la colonne voisine ni la ligne au-dessus.
    expect(anchorText(onSentence, map)).toBe(SAMPLE_LINES[0]);
    expect(anchorText({ kind: 'point', x: 0.5, y: 0.6 }, map)).toBeUndefined();
    expect(anchorText({ kind: 'zone', x: 0.05, y: 0.02, w: 0.9, h: 0.1 }, map)).toBe(`Page 1 ${SAMPLE_LINES[0]} Note`);
    // Page tournée : le texte reste trouvé.
    const turned = await loadTextMap(dir, s.captures[2]!);
    expect(turned!.runs.map((r) => r.t)).toContain(SAMPLE_LINES[2]);
  });

  it('garde une session vide, ferme une session commencée', async () => {
    const { store, file, documents } = await setup();
    const empty = await store.ensure();
    await documents.importDocument(file, () => {});
    expect(store.get()!.id).toBe(empty.id);
    expect(store.get()!.name).toBe('rapport');
    await documents.importDocument(file, () => {});
    expect(store.get()!.id).not.toBe(empty.id);
    expect(store.get()!.captures).toHaveLength(3);
  });

  it('refuse les anciens formats et plafonne les pages', async () => {
    const { store, file, documents } = await setup(2);
    await expect(documents.importDocument('/tmp/budget.xls', () => {})).rejects.toThrow(DocumentError);
    await expect(documents.importDocument('/tmp/budget.xls', () => {})).rejects.toThrow(/budget\.xls/);
    await expect(documents.importDocument('/tmp/photo.heic', () => {})).rejects.toThrow(DocumentError);
    await writeFile(file + '.bad.pdf', 'pas un PDF');
    await expect(documents.importDocument(file + '.bad.pdf', () => {})).rejects.toThrow(DocumentError);
    expect(store.get()).toBeNull(); // un échec ne crée pas de session
    expect(await documents.importDocument(file, () => {})).toEqual({ pages: 2, truncated: true });
    expect(store.get()!.captures).toHaveLength(2);
  });

  it('exports et MCP : pages sans point sautées, texte visé cité', async () => {
    const { store, file, documents } = await setup();
    await documents.importDocument(file, () => {});
    const s = store.get()!;
    const id = store.addAnnotation(s.captures[0]!.id, onSentence);
    store.update((x) => (x.captures[0]!.annotations.find((a) => a.id === id)!.text = 'Mettre 15 %'));

    const doc = await buildExport(store.get()!, store.dir(s), await mkdtemp(join(tmpdir(), 'pastille-out-')));
    expect(doc.screens.map((x) => x.title)).toEqual(['Page 1 / 3 — rapport.pdf']);
    expect(doc.points[0]!.position).toContain(`texte visé : « ${SAMPLE_LINES[0]} »`);

    const mcp = createMcp({ store });
    const r = (await mcp.handle({ id: 1, method: 'tools/call', params: { name: 'lire_revue', arguments: {} } })) as {
      result: { content: { text: string }[] };
    };
    const text = r.result.content[0]!.text;
    expect(text).toContain('## Page 1 / 3 — rapport.pdf');
    expect(text).not.toContain('Page 2 / 3');
    expect(text).toContain('voir_ecran avec ecran = 1.');
  });

  it('copie commentée : notes PDF natives, original intact, nom libre', async () => {
    const { store, file, documents } = await setup();
    await documents.importDocument(file, () => {});
    const s = store.get()!;
    const [p1, , p3] = s.captures;
    store.addAnnotation(p1!.id, onSentence);
    store.addAnnotation(p1!.id, { kind: 'zone', x: 0.1, y: 0.2, w: 0.3, h: 0.1 });
    store.addAnnotation(p3!.id, { kind: 'arrow', x1: 0.2, y1: 0.2, x2: 0.6, y2: 0.5 });
    store.update((x) => {
      x.captures[0]!.annotations[0]!.text = 'Mettre 15 %';
      x.captures[0]!.annotations[0]!.sketches = [{ id: 'k', png: '', strokes: '', createdAt: '' }];
    });
    const outDir = await mkdtemp(join(tmpdir(), 'pastille-out-'));
    const opts = { session: store.get()!, sessionDir: store.dir(s), outDir, format: 'document' as const, printHtml: async () => new Uint8Array() };
    const path = await exportSession(opts);
    expect(path).toBe(join(outDir, 'rapport (commenté).pdf'));
    expect(await exportSession(opts)).toBe(join(outDir, 'rapport (commenté 2).pdf'));

    const copy = await PDFDocument.load(await readFile(path));
    const annots = (n: number) => {
      const list = copy.getPage(n).node.lookupMaybe(PDFName.of('Annots'), PDFArray);
      return (list?.asArray() ?? []).map((ref) => copy.context.lookup(ref, PDFDict));
    };
    const subtype = (d: PDFDict) => d.get(PDFName.of('Subtype'))!.toString();
    const contents = (d: PDFDict) => (d.lookup(PDFName.of('Contents')) as PDFHexString).decodeText();
    expect(annots(0).map(subtype)).toEqual(['/Text', '/Square']);
    expect(annots(1)).toEqual([]);
    expect(annots(2).map(subtype)).toEqual(['/Line']);
    expect(contents(annots(0)[0]!)).toBe("#1 — Mettre 15 % (1 croquis dans l'export VibeScreener)");
    expect(contents(annots(2)[0]!)).toBe('#3 — (sans commentaire)');
    // La pointe de la goutte est sur le point visé : coin bas gauche de la note, à la marge d'un trait près.
    const rect = annots(0)[0]!.lookup(PDFName.of('Rect'), PDFArray).asArray().map((v) => Number(v.toString()));
    expect(0.2 * 595 - rect[0]!).toBeGreaterThan(0);
    expect(0.2 * 595 - rect[0]!).toBeLessThan(3);
    expect(765 - rect[1]!).toBeGreaterThan(0);
    expect(765 - rect[1]!).toBeLessThan(3);
    // L'original de la session n'a pas bougé.
    const original = await PDFDocument.load(await readFile(join(store.dir(s), 'documents', `${p1!.source!.document!.id}.pdf`)));
    expect(original.getPage(0).node.lookupMaybe(PDFName.of('Annots'), PDFArray)?.size() ?? 0).toBe(0);
  });

  it('coordonnées de page vers PDF : mêmes résultats que pdf.js, rotations comprises', async () => {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const lib = await PDFDocument.create();
    for (const angle of [0, 90, 180, 270]) {
      const page = lib.addPage([400, 600]);
      page.setCropBox(20, 30, 300, 500);
      page.setRotation(degrees(angle));
    }
    const task = pdfjs.getDocument({ data: await lib.save() });
    const pdf = await task.promise;
    for (let i = 1; i <= 4; i++) {
      const page = await pdf.getPage(i);
      const vp = page.getViewport({ scale: 1 });
      for (const [u, v] of [
        [0.1, 0.2],
        [0.7, 0.9],
      ] as const) {
        const [ex, ey] = vp.convertToPdfPoint(u * vp.width, v * vp.height);
        const [x, y] = toPdfSpace(u, v, { x: 20, y: 30, width: 300, height: 500 }, page.rotate);
        expect(x).toBeCloseTo(ex, 6);
        expect(y).toBeCloseTo(ey, 6);
      }
    }
    await task.destroy();
  });
});
