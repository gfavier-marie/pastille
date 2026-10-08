// Copie commentée d'un PowerPoint : chaque point devient un commentaire « moderne » (PowerPoint 365,
// web) posé sur la diapositive à l'endroit du point.

import { randomUUID } from 'node:crypto';
import { child, children, element, openPackage, R_NS } from './ooxml.ts';

const P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const P188 = 'http://schemas.microsoft.com/office/powerpoint/2018/8/main';
const PC = 'http://schemas.microsoft.com/office/powerpoint/2013/main/command';
const AUTHORS_TYPE = 'http://schemas.microsoft.com/office/2018/10/relationships/authors';
const COMMENTS_TYPE = 'http://schemas.microsoft.com/office/2018/10/relationships/comments';
const AUTHORS_CT = 'application/vnd.ms-powerpoint.authors+xml';
const COMMENTS_CT = 'application/vnd.ms-powerpoint.comments+xml';
const COMMENT_EXT = '{6950BFC3-D8DA-4A85-94F7-54DA5524770B}';
const CREATION_EXT = '{BB962C8B-B14F-4D97-AF65-F5344CB8AC3E}';
const AUTHOR = 'VibeScreener';

/** `slide` : rang de la diapositive (à partir de 1) ; x, y : position du point (0–1 de la diapositive). */
export type PptxComment = { slide: number; number: number; text: string; x: number; y: number };

const guid = () => `{${randomUUID().toUpperCase()}}`;

export async function writeCommentedPptx(original: Uint8Array, comments: PptxComment[], now = new Date()): Promise<Uint8Array> {
  const pkg = await openPackage(original);
  const main = (await pkg.rels('')).find((r) => r.type.endsWith('/officeDocument'))?.target ?? 'ppt/presentation.xml';
  const pres = (await pkg.read(main))!;
  const root = pres.documentElement!;
  const size = child(root, 'sldSz');
  const cx = Number(size?.getAttribute('cx') ?? 12192000), cy = Number(size?.getAttribute('cy') ?? 6858000);
  const rels = await pkg.rels(main);
  // Diapositives dans l'ordre de la présentation : identifiant et partie.
  const slides = children(child(root, 'sldIdLst') ?? root, 'sldId').map((s) => ({
    id: s.getAttribute('id')!,
    path: rels.find((r) => r.id === (s.getAttributeNS(R_NS, 'id') || s.getAttribute('r:id')))?.target,
  }));

  // Auteur « VibeScreener » dans la liste des auteurs (créée s'il n'y en a pas).
  let authorsPath = rels.find((r) => r.type === AUTHORS_TYPE)?.target;
  if (!authorsPath) {
    authorsPath = pkg.freePath((n) => (n === 1 ? 'ppt/authors.xml' : `ppt/authors${n}.xml`));
    pkg.create(authorsPath, `<p188:authorLst xmlns:a="${A}" xmlns:r="${R_NS}" xmlns:p188="${P188}"></p188:authorLst>`);
    await pkg.addRel(main, AUTHORS_TYPE, authorsPath);
    await pkg.override(authorsPath, AUTHORS_CT);
  }
  const authors = (await pkg.read(authorsPath))!;
  let authorId = children(authors.documentElement!, 'author').find((a) => a.getAttribute('name') === AUTHOR)?.getAttribute('id');
  if (!authorId) {
    authorId = guid();
    authors.documentElement!.appendChild(element(authors, P188, 'p188:author', { id: authorId, name: AUTHOR, initials: 'VS', userId: AUTHOR, providerId: 'None' }));
  }

  for (const c of comments) {
    const slide = slides[c.slide - 1];
    if (!slide?.path) continue;
    const doc = (await pkg.read(slide.path))!;
    const sld = doc.documentElement!;
    // Liste des commentaires de la diapositive, reliée par une extension de la diapositive.
    let listPath = (await pkg.rels(slide.path)).find((r) => r.type === COMMENTS_TYPE)?.target;
    if (!listPath) {
      listPath = pkg.freePath((n) => `ppt/comments/modernComment_${slide.id}_${n}.xml`);
      pkg.create(listPath, `<p188:cmLst xmlns:a="${A}" xmlns:r="${R_NS}" xmlns:p188="${P188}"></p188:cmLst>`);
      const relId = await pkg.addRel(slide.path, COMMENTS_TYPE, listPath);
      await pkg.override(listPath, COMMENTS_CT);
      let extLst = child(sld, 'extLst');
      if (!extLst) extLst = sld.appendChild(element(doc, P, 'p:extLst'));
      const rel = element(doc, P188, 'p188:commentRel');
      rel.setAttributeNS(R_NS, 'r:id', relId);
      extLst.appendChild(element(doc, P, 'p:ext', { uri: COMMENT_EXT }, rel));
    }
    const list = (await pkg.read(listPath))!;
    // Identifiant de création de la diapositive (extension p14:creationId), sinon un nombre quelconque.
    const creation = children(child(sld, 'extLst') ?? sld, 'ext').find((e) => e.getAttribute('uri') === CREATION_EXT);
    const cId = (creation && child(creation, 'creationId')?.getAttribute('val')) || String(100000000 + Math.floor(Math.random() * 899999999));

    const monikers = element(list, PC, 'pc:sldMkLst', {}, element(list, PC, 'pc:docMk'), element(list, PC, 'pc:sldMk', { cId, sldId: slide.id }));
    const body = element(list, P188, 'p188:txBody', {}, element(list, A, 'a:bodyPr'), element(list, A, 'a:lstStyle'));
    for (const line of c.text.split('\n')) body.appendChild(element(list, A, 'a:p', {}, element(list, A, 'a:r', {}, element(list, A, 'a:t', {}, line))));
    list.documentElement!.appendChild(
      element(
        list,
        P188,
        'p188:cm',
        { id: guid(), authorId, created: now.toISOString() },
        monikers,
        element(list, P188, 'p188:pos', { x: String(Math.round(c.x * cx)), y: String(Math.round(c.y * cy)) }),
        body,
      ),
    );
  }
  return pkg.save();
}
