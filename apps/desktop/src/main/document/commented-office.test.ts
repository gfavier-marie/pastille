import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { materializeXlsxWorksheet } from '@silurus/ooxml/node';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import type { Geometry } from '@pastille/shared';
import { exportSession } from '../export/index.ts';
import { createSessionStore } from '../session-store.ts';
import { loadTextMap, type TextRun } from './anchor.ts';
import { createSampleDocx, createSamplePptx, createSampleXlsx } from './fixture.ts';
import { openDocx, openPptx } from './office.ts';
import { createDocuments, type OpenedDocument } from './open.ts';
import { openXlsx } from './xlsx.ts';

const openers: Record<string, (b: Uint8Array) => Promise<OpenedDocument>> = { docx: openDocx, pptx: openPptx, xlsx: openXlsx };

type Center = (page: number, start: string, keep?: (run: TextRun) => boolean) => Promise<Geometry>;
type Place = (center: Center) => Promise<[number, Geometry, string][]>;

/** Document factice ouvert en session, points posés par `place`, copie commentée exportée et dézippée. */
async function commentedCopy(name: string, bytes: Uint8Array, place: Place) {
  const root = await mkdtemp(join(tmpdir(), 'pastille-copy-'));
  const store = createSessionStore(root);
  const documents = createDocuments({ store, open: (b, format) => openers[format]!(b) });
  await writeFile(join(root, name), bytes);
  await documents.importDocument(join(root, name), () => {});
  const s = store.get()!;
  const dir = store.dir(s);
  // Centre du premier morceau de texte qui commence ainsi, sur une page donnée (à partir de 0).
  const center: Center = async (page, start, keep = () => true) => {
    const run = (await loadTextMap(dir, s.captures[page]!))!.runs.find((r) => r.t.startsWith(start) && keep(r))!;
    return { kind: 'point', x: run.x + run.w / 2, y: run.y + run.h / 2 };
  };
  for (const [page, geometry, comment] of await place(center)) {
    const id = store.addAnnotation(s.captures[page]!.id, geometry);
    store.update((x) => (x.captures[page]!.annotations.find((a) => a.id === id)!.text = comment));
  }
  const outDir = await mkdtemp(join(tmpdir(), 'pastille-out-'));
  const path = await exportSession({ session: store.get()!, sessionDir: dir, outDir, format: 'document', printHtml: async () => new Uint8Array() });
  const copy = new Uint8Array(await readFile(path));
  const doc = s.captures[0]!.source!.document!;
  const original = new Uint8Array(await readFile(join(dir, 'documents', `${doc.id}.${doc.format}`)));
  return { path, outDir, copy, zip: await JSZip.loadAsync(copy), original };
}

const read = async (zip: JSZip, path: string) => (await zip.file(path)?.async('string')) ?? '';
const count = (xml: string, pattern: RegExp) => xml.match(pattern)?.length ?? 0;

describe('copie commentée Office', () => {
  it('Word : commentaires dans la marge, autour des paragraphes visés', async () => {
    const { path, outDir, copy, zip, original } = await commentedCopy('rapport.docx', await createSampleDocx(), async (center) => [
      [0, await center(0, 'Le'), 'Mettre 15 %'],
      [1, await center(1, 'Sud', (r) => r.p?.split('.').length === 4), 'Vérifier ce chiffre'], // cellule du tableau, page 2
      [2, { kind: 'point', x: 0.5, y: 0.9 }, 'Page presque vide'], // aucun texte sous le point
    ]);
    expect(path).toBe(join(outDir, 'rapport (commenté).docx'));
    const comments = await read(zip, 'word/comments.xml');
    expect(count(comments, /<w:comment /g)).toBe(3);
    expect(comments).toContain('#1 — Mettre 15 %');
    expect(comments).toContain('w:author="VibeScreener"');
    expect(await read(zip, '[Content_Types].xml')).toContain('/word/comments.xml');
    expect(await read(zip, 'word/_rels/document.xml.rels')).toContain('relationships/comments');
    const body = await read(zip, 'word/document.xml');
    expect(count(body, /<w:commentRangeStart /g)).toBe(3);
    expect(count(body, /<w:commentReference /g)).toBe(3);
    // #1 entoure la phrase de tête ; #2 la cellule « Sud » du tableau.
    expect(body).toMatch(/<w:commentRangeStart w:id="0"\/><w:r>.{0,200}Le chiffre d'affaires.{0,200}<w:commentRangeEnd w:id="0"\/>/s);
    expect(body).toMatch(/<w:tc>(?:(?!<\/w:tc>).)*w:commentRangeStart w:id="1"(?:(?!<\/w:tc>).)*>Sud</s);
    // La copie se relit ; l'original n'a pas bougé.
    expect((await openDocx(copy)).pages).toBe(3);
    expect(await read(await JSZip.loadAsync(original), 'word/document.xml')).not.toContain('commentRangeStart');
  });

  it('PowerPoint : commentaires modernes à l’endroit du point', async () => {
    const { zip, copy } = await commentedCopy('deck.pptx', await createSamplePptx(), async () => [
      [0, { kind: 'point', x: 0.25, y: 0.5 }, 'Agrandir le graphique'],
      [0, { kind: 'zone', x: 0.6, y: 0.3, w: 0.3, h: 0.3 }, 'Couleur trop vive'],
      [1, { kind: 'point', x: 0.1, y: 0.2 }, 'Ajouter une date'],
    ]);
    const authors = await read(zip, 'ppt/authors.xml');
    expect(authors).toContain('name="VibeScreener"');
    const names = Object.keys(zip.files).filter((f) => f.startsWith('ppt/comments/modernComment_'));
    expect(names).toHaveLength(2);
    const first = await read(zip, names.sort()[0]!);
    expect(count(first, /<p188:cm /g)).toBe(2);
    expect(first).toContain(`<p188:pos x="${Math.round(0.25 * 12192000)}" y="${Math.round(0.5 * 6858000)}"/>`);
    expect(first).toContain('#1 — Agrandir le graphique');
    expect(first).toMatch(/<pc:sldMk cId="\d+" sldId="256"\/>/);
    const slide1 = await read(zip, 'ppt/slides/slide1.xml');
    expect(slide1).toContain('{6950BFC3-D8DA-4A85-94F7-54DA5524770B}');
    expect(slide1).toMatch(/<p188:commentRel [^>]*r:id="rId\d+"/);
    const types = await read(zip, '[Content_Types].xml');
    expect(types).toContain('application/vnd.ms-powerpoint.comments+xml');
    expect(types).toContain('application/vnd.ms-powerpoint.authors+xml');
    expect((await openPptx(copy)).pages).toBe(2);
  });

  it('Excel : notes sur les cellules visées', async () => {
    const { zip, copy } = await commentedCopy('budget.xlsx', await createSampleXlsx(), async (center) => [
      [0, await center(0, '100'), 'Chiffre à vérifier'],
      [0, await center(0, 'Magasin 3'), 'Fermé en mars'],
      [3, await center(3, 'Chiffres'), 'À mettre à jour'], // feuille « Notes »
    ]);
    const comments = await read(zip, 'xl/comments1.xml');
    expect(comments).toContain('<comment ref="C2" authorId="0">');
    expect(comments).toContain('#1 — Chiffre à vérifier');
    expect(comments).toContain('<comment ref="B4"');
    const vml = await read(zip, 'xl/drawings/vmlDrawing1.vml');
    expect(count(vml, /ObjectType="Note"/g)).toBe(2);
    expect(vml).toContain('<x:Row>1</x:Row><x:Column>2</x:Column>');
    const sheet = await read(zip, 'xl/worksheets/sheet1.xml');
    // legacyDrawing après pageMargins, comme l'impose le schéma.
    expect(sheet).toMatch(/<pageMargins [^>]*\/><legacyDrawing [^>]*r:id="rId\d+"\/><\/worksheet>/);
    expect(await read(zip, '[Content_Types].xml')).toContain('Extension="vml"');
    expect(await read(zip, 'xl/comments2.xml')).toContain('<comment ref="A2"');
    // La bibliothèque relit les notes de la copie.
    expect((await materializeXlsxWorksheet(copy, 0)).commentRefs).toEqual(expect.arrayContaining(['C2', 'B4']));
  });
});
