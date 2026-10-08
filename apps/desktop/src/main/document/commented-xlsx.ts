// Copie commentée d'un Excel : chaque point devient une note sur la cellule visée (triangle rouge,
// texte au survol), le format que toutes les versions d'Excel affichent.

import { children, element, openPackage, R_NS, type Package } from './ooxml.ts';

const S = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const COMMENTS_TYPE = `${R_NS}/comments`;
const VML_TYPE = `${R_NS}/vmlDrawing`;
const COMMENTS_CT = 'application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml';
const VML_CT = 'application/vnd.openxmlformats-officedocument.vmlDrawing';
const AUTHOR = 'VibeScreener';
// Éléments d'une feuille qui suivent legacyDrawing, dans l'ordre imposé par le schéma.
const AFTER_LEGACY_DRAWING = ['legacyDrawingHF', 'drawingHF', 'picture', 'oleObjects', 'controls', 'webPublishItems', 'tableParts', 'extLst'];

/** `cell` : référence de la cellule (« B12 ») sur la feuille `sheet`. */
export type XlsxComment = { sheet: string; cell: string; number: number; text: string };

/** « B12 » → colonne et ligne à partir de 0. */
function position(ref: string): [number, number] {
  const [, letters, digits] = /^([A-Z]+)(\d+)$/.exec(ref)!;
  const col = [...letters!].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  return [col, Number(digits) - 1];
}

/** Forme VML d'une note (masquée, affichée au survol), comme Excel l'écrit. */
function noteShape(id: number, ref: string, z: number) {
  const [col, row] = position(ref);
  return `<v:shape id="_x0000_s${id}" type="#_x0000_t202" style="position:absolute;margin-left:59.25pt;margin-top:1.5pt;width:144pt;height:72pt;z-index:${z};visibility:hidden" fillcolor="#ffffe1" o:insetmode="auto"><v:fill color2="#ffffe1"/><v:shadow on="t" color="black" obscured="t"/><v:path o:connecttype="none"/><v:textbox style="mso-direction-alt:auto"><div style="text-align:left"></div></v:textbox><x:ClientData ObjectType="Note"><x:MoveWithCells/><x:SizeWithCells/><x:Anchor>${col + 1}, 15, ${row}, 2, ${col + 3}, 15, ${row + 4}, 16</x:Anchor><x:AutoFill>False</x:AutoFill><x:Row>${row}</x:Row><x:Column>${col}</x:Column></x:ClientData></v:shape>`;
}

/** Dessin VML neuf, avec le modèle de forme des notes ; `block` : bloc d'identifiants de formes (1024 par dessin). */
const newVml = (block: number) =>
  `<xml xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><o:shapelayout v:ext="edit"><o:idmap v:ext="edit" data="${block}"/></o:shapelayout><v:shapetype id="_x0000_t202" coordsize="21600,21600" o:spt="202" path="m,l,21600r21600,l21600,xe"><v:stroke joinstyle="miter"/><v:path gradientshapeok="t" o:connecttype="rect"/></v:shapetype></xml>`;

async function sheetPaths(pkg: Package) {
  const main = (await pkg.rels('')).find((r) => r.type.endsWith('/officeDocument'))?.target ?? 'xl/workbook.xml';
  const book = (await pkg.read(main))!;
  const rels = await pkg.rels(main);
  const sheets = children(book.documentElement!, 'sheets')[0];
  return new Map(
    children(sheets ?? book.documentElement!, 'sheet').map((s) => [s.getAttribute('name')!, rels.find((r) => r.id === (s.getAttributeNS(R_NS, 'id') || s.getAttribute('r:id')))?.target]),
  );
}

export async function writeCommentedXlsx(original: Uint8Array, comments: XlsxComment[]): Promise<Uint8Array> {
  const pkg = await openPackage(original);
  const paths = await sheetPaths(pkg);
  // Blocs d'identifiants VML (o:idmap data) déjà pris par les dessins du classeur : un nouveau dessin prend le suivant.
  let nextBlock = 1;
  for (const f of Object.keys(pkg.zip.files).filter((f) => f.toLowerCase().endsWith('.vml')))
    for (const m of (await pkg.zip.file(f)!.async('string')).matchAll(/data="([\d,\s]+)"/g)) for (const n of m[1]!.split(',')) nextBlock = Math.max(nextBlock, Number(n) + 1);

  const bySheet = new Map<string, XlsxComment[]>();
  for (const c of comments) bySheet.set(c.sheet, [...(bySheet.get(c.sheet) ?? []), c]);
  for (const [name, list] of bySheet) {
    const sheetPath = paths.get(name);
    if (!sheetPath) continue;
    const sheet = (await pkg.read(sheetPath))!;
    const rels = await pkg.rels(sheetPath);

    // Notes de la feuille : la partie existante, ou une nouvelle.
    let commentsPath = rels.find((r) => r.type === COMMENTS_TYPE)?.target;
    if (!commentsPath) {
      commentsPath = pkg.freePath((n) => `xl/comments${n}.xml`);
      pkg.create(commentsPath, `<comments xmlns="${S}"><authors></authors><commentList></commentList></comments>`);
      await pkg.addRel(sheetPath, COMMENTS_TYPE, commentsPath);
      await pkg.override(commentsPath, COMMENTS_CT);
    }
    const part = (await pkg.read(commentsPath))!;
    const authors = children(part.documentElement!, 'authors')[0]!;
    let authorId = children(authors, 'author').findIndex((a) => a.textContent === AUTHOR);
    if (authorId < 0) {
      authorId = children(authors, 'author').length;
      authors.appendChild(element(part, S, 'author', {}, AUTHOR));
    }
    const commentList = children(part.documentElement!, 'commentList')[0]!;

    // Dessin VML des notes (le texte est édité tel quel : le VML d'Excel n'est pas toujours du XML strict).
    let vmlPath = rels.find((r) => r.type === VML_TYPE)?.target;
    let vml = vmlPath ? await pkg.zip.file(vmlPath)!.async('string') : undefined;
    if (!vmlPath || vml === undefined) {
      vmlPath = pkg.freePath((n) => `xl/drawings/vmlDrawing${n}.vml`);
      vml = newVml(nextBlock++);
      const relId = await pkg.addRel(sheetPath, VML_TYPE, vmlPath);
      await pkg.defaultType('vml', VML_CT);
      const legacy = element(sheet, S, 'legacyDrawing');
      legacy.setAttributeNS(R_NS, 'r:id', relId);
      const root = sheet.documentElement!;
      const before = children(root).find((el) => AFTER_LEGACY_DRAWING.includes(el.localName!));
      root.insertBefore(legacy, before ?? null);
    }
    const ids = [...vml.matchAll(/_x0000_s(\d+)/g)].map((m) => Number(m[1]));
    const block = Number(/data="(\d+)/.exec(vml)?.[1] ?? 1);
    let nextId = Math.max(block * 1024, ...ids) + 1;
    let shapes = '';

    for (const c of list) {
      // Une cellule qui a déjà une note la garde : le commentaire s'ajoute à la suite.
      const current = children(commentList, 'comment').find((x) => x.getAttribute('ref') === c.cell);
      const run = element(part, S, 'r', {}, element(part, S, 't', { 'xml:space': 'preserve' }, current ? `\n\n${c.text}` : c.text));
      if (current) children(current, 'text')[0]?.appendChild(run);
      else {
        commentList.appendChild(element(part, S, 'comment', { ref: c.cell, authorId: String(authorId) }, element(part, S, 'text', {}, run)));
        shapes += noteShape(nextId, c.cell, nextId - block * 1024);
        nextId++;
      }
    }
    pkg.writeText(vmlPath, vml.replace(/<\/xml>\s*$/, `${shapes}</xml>`));
  }
  return pkg.save();
}
