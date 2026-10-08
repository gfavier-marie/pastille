// Copie commentée d'un Word : chaque point devient un commentaire Word (dans la marge) autour du
// paragraphe visé, retrouvé grâce à la carte du texte de la page (identifiant, chemin, texte).

import { child, children, element, isoDate, openPackage } from './ooxml.ts';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const COMMENTS_TYPE = `${REL}/comments`;
const COMMENTS_CT = 'application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml';

/** Paragraphe visé : identifiant Word (w14:paraId), chemin dans le modèle de la bibliothèque, texte affiché sur la page. */
export type ParagraphRef = { id?: string; path?: string; text: string };
/** `refs` : premier et dernier paragraphes visés ; `where` (« Page 3 ») est ajouté au texte si aucun n'est retrouvé. */
export type DocxComment = { number: number; text: string; refs: ParagraphRef[]; where: string };

const W14 = 'http://schemas.microsoft.com/office/word/2010/wordml';
/** Texte comparable : sans espaces ni casse (un mot coupé par la mise en page reste trouvé). */
const squash = (t: string) => t.replace(/\s+/g, '').toLowerCase();

/** Blocs d'un conteneur (corps, cellule) : paragraphes et tableaux, contrôles de contenu dépliés. */
function blocks(container: Element): Element[] {
  return children(container).flatMap((el) => {
    if (el.localName === 'p' || el.localName === 'tbl') return [el];
    if (el.localName === 'sdt') {
      const content = child(el, 'sdtContent');
      return content ? blocks(content) : [];
    }
    return el.localName === 'customXml' ? blocks(el) : [];
  });
}

/** Paragraphe au chemin donné : index dans le corps, puis ligne, cellule et bloc pour chaque tableau traversé. */
export function paragraphAt(body: Element, path: string): Element | undefined {
  const steps = path.split('.').map(Number);
  let node = blocks(body)[steps[0]!];
  for (let i = 1; node?.localName === 'tbl' && i + 2 < steps.length; i += 3) {
    const row = children(node, 'tr')[steps[i]!];
    const cell = row && children(row, 'tc')[steps[i + 1]!];
    node = cell && blocks(cell)[steps[i + 2]!];
  }
  return node?.localName === 'p' ? node : undefined;
}

export async function writeCommentedDocx(original: Uint8Array, comments: DocxComment[], now = new Date()): Promise<Uint8Array> {
  const pkg = await openPackage(original);
  const main = (await pkg.rels('')).find((r) => r.type.endsWith('/officeDocument'))?.target ?? 'word/document.xml';
  const doc = (await pkg.read(main))!;
  const body = doc.getElementsByTagNameNS(W, 'body')[0]!;
  // Paragraphes du corps dans l'ordre du document, et leur texte.
  const paragraphs = Array.from(body.getElementsByTagNameNS(W, 'p'));
  const order = new Map(paragraphs.map((p, i) => [p, i]));
  const texts = new Map(paragraphs.map((p) => [p, squash(Array.from(p.getElementsByTagNameNS(W, 't')).map((t) => t.textContent ?? '').join(''))]));

  /**
   * Paragraphe visé : par son identifiant Word ; sinon par son chemin si le texte concorde (la bibliothèque
   * compte aussi des sauts de section et de page, qui décalent les chemins) ; sinon le paragraphe qui contient
   * ce texte, au plus près de l'endroit indiqué par le chemin.
   */
  function resolve(ref: ParagraphRef): Element | undefined {
    const byId = ref.id && paragraphs.find((p) => (p.getAttributeNS(W14, 'paraId') || p.getAttribute('w14:paraId')) === ref.id);
    if (byId) return byId;
    const wanted = squash(ref.text);
    const byPath = ref.path ? paragraphAt(body, ref.path) : undefined;
    if (byPath && texts.get(byPath)!.includes(wanted)) return byPath;
    if (!wanted) return byPath;
    const hint = byPath ? order.get(byPath)! : 0;
    return paragraphs.filter((p) => texts.get(p)!.includes(wanted)).sort((a, b) => Math.abs(order.get(a)! - hint) - Math.abs(order.get(b)! - hint))[0];
  }

  // Partie des commentaires : celle du document s'il en a déjà, sinon une nouvelle.
  const existing = (await pkg.rels(main)).find((r) => r.type === COMMENTS_TYPE);
  let path = existing?.target;
  if (!path) {
    path = pkg.freePath((n) => (n === 1 ? 'word/comments.xml' : `word/comments${n}.xml`));
    pkg.create(path, `<w:comments xmlns:w="${W}"></w:comments>`);
    await pkg.addRel(main, COMMENTS_TYPE, path);
    await pkg.override(path, COMMENTS_CT);
  }
  const part = (await pkg.read(path))!;
  const list = part.documentElement!;
  const used = [...children(list, 'comment'), ...Array.from(doc.getElementsByTagNameNS(W, 'commentRangeStart'))].map((c) => Number(c.getAttributeNS(W, 'id') || c.getAttribute('w:id')));
  let next = Math.max(-1, ...used.filter(Number.isFinite)) + 1;

  const firstParagraph = blocks(body).find((b) => b.localName === 'p');
  for (const c of comments) {
    // Plage dans l'ordre du document, même si la lecture à l'écran (deux colonnes) l'inverse.
    const found = c.refs.map(resolve).filter((p): p is Element => !!p).sort((a, b) => order.get(a)! - order.get(b)!);
    const first = found[0] ?? firstParagraph;
    const last = found.at(-1) ?? first;
    if (!first || !last) continue;
    const id = String(next++);
    // Du début du premier paragraphe (après ses propriétés) à la fin du dernier.
    const props = child(first, 'pPr');
    first.insertBefore(element(doc, W, 'w:commentRangeStart', { 'w:id': id }), props ? props.nextSibling : first.firstChild);
    last.appendChild(element(doc, W, 'w:commentRangeEnd', { 'w:id': id }));
    last.appendChild(element(doc, W, 'w:r', {}, element(doc, W, 'w:commentReference', { 'w:id': id })));

    const text = found.length ? c.text : `${c.text} (${c.where})`;
    const comment = element(part, W, 'w:comment', { 'w:id': id, 'w:author': 'VibeScreener', 'w:date': isoDate(now), 'w:initials': 'VS' });
    text.split('\n').forEach((line, i) => {
      const run = element(part, W, 'w:r', {}, element(part, W, 'w:t', { 'xml:space': 'preserve' }, line));
      comment.appendChild(i === 0 ? element(part, W, 'w:p', {}, element(part, W, 'w:r', {}, element(part, W, 'w:annotationRef')), run) : element(part, W, 'w:p', {}, run));
    });
    list.appendChild(comment);
  }
  return pkg.save();
}
