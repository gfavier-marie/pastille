// Lecture et écriture d'un paquet Office (Word, Excel, PowerPoint : une archive zip de fichiers XML),
// pour y ajouter des commentaires sans toucher au reste : parties, relations et types de contenu.

import { posix } from 'node:path';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import JSZip from 'jszip';

const DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
export const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

export type Rel = { id: string; type: string; target: string };

/** Enfants éléments d'un nœud, éventuellement filtrés par nom local (« p » pour « w:p », quel que soit le préfixe). */
export function children(node: Node, name?: string): Element[] {
  const list: Element[] = [];
  for (let n = node.firstChild; n; n = n.nextSibling) if (n.nodeType === 1 && (!name || (n as Element).localName === name)) list.push(n as Element);
  return list;
}

export function child(node: Node, name: string): Element | undefined {
  return children(node, name)[0];
}

/** Élément créé dans le même espace de noms que son nom qualifié (« w:comment ») et ses attributs. */
export function element(doc: Document, ns: string, name: string, attrs: Record<string, string> = {}, ...kids: (Node | string)[]): Element {
  const el = doc.createElementNS(ns, name);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  for (const k of kids) el.appendChild(typeof k === 'string' ? doc.createTextNode(k) : k);
  return el;
}

export async function openPackage(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes);
  const docs = new Map<string, Document>();

  /** Partie XML lue une fois ; les modifications sont écrites par save(). */
  async function read(path: string): Promise<Document | undefined> {
    if (docs.has(path)) return docs.get(path);
    const file = zip.file(path);
    if (!file) return undefined;
    const doc = new DOMParser().parseFromString(await file.async('string'), 'text/xml');
    docs.set(path, doc);
    return doc;
  }

  /** Nouvelle partie XML (texte complet), relue ensuite comme les autres. */
  function create(path: string, xml: string): Document {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    docs.set(path, doc);
    return doc;
  }

  const relsPath = (part: string) => posix.join(posix.dirname(part), '_rels', `${posix.basename(part)}.rels`);
  /** Chemin dans l'archive d'une cible de relation, relative à la partie source. */
  const resolve = (part: string, target: string) => (target.startsWith('/') ? target.slice(1) : posix.normalize(posix.join(posix.dirname(part), target)));

  async function rels(part: string): Promise<Rel[]> {
    const doc = await read(relsPath(part));
    if (!doc) return [];
    return children(doc.documentElement!, 'Relationship').map((r) => ({
      id: r.getAttribute('Id')!,
      type: r.getAttribute('Type')!,
      target: resolve(part, r.getAttribute('Target')!),
    }));
  }

  /** Ajoute une relation de `part` vers `target` (chemin dans l'archive) ; renvoie son identifiant. */
  async function addRel(part: string, type: string, target: string): Promise<string> {
    const path = relsPath(part);
    const doc = (await read(path)) ?? create(path, `${DECLARATION}<Relationships xmlns="${REL_NS}"></Relationships>`);
    const ids = new Set(children(doc.documentElement!, 'Relationship').map((r) => r.getAttribute('Id')));
    let n = ids.size + 1;
    while (ids.has(`rId${n}`)) n++;
    const relative = posix.relative(posix.dirname(part), target);
    doc.documentElement!.appendChild(element(doc, REL_NS, 'Relationship', { Id: `rId${n}`, Type: type, Target: relative }));
    return `rId${n}`;
  }

  async function contentTypes() {
    return (await read('[Content_Types].xml'))!;
  }

  /** Type de contenu d'une nouvelle partie (« /word/comments.xml »). */
  async function override(path: string, type: string) {
    const doc = await contentTypes();
    const part = `/${path}`;
    if (children(doc.documentElement!, 'Override').some((o) => o.getAttribute('PartName') === part)) return;
    doc.documentElement!.appendChild(element(doc, doc.documentElement!.namespaceURI!, 'Override', { PartName: part, ContentType: type }));
  }

  /** Type de contenu par extension (« vml »), s'il manque. */
  async function defaultType(ext: string, type: string) {
    const doc = await contentTypes();
    if (children(doc.documentElement!, 'Default').some((d) => d.getAttribute('Extension')?.toLowerCase() === ext)) return;
    doc.documentElement!.insertBefore(element(doc, doc.documentElement!.namespaceURI!, 'Default', { Extension: ext, ContentType: type }), doc.documentElement!.firstChild);
  }

  /** Nom libre dans l'archive : « ppt/comments/modernComment1.xml », puis 2… */
  function freePath(pattern: (n: number) => string) {
    for (let n = 1; ; n++) if (!zip.file(pattern(n)) && !docs.has(pattern(n))) return pattern(n);
  }

  async function save(): Promise<Uint8Array> {
    const serializer = new XMLSerializer();
    for (const [path, doc] of docs) {
      const xml = serializer.serializeToString(doc);
      zip.file(path, xml.startsWith('<?xml') ? xml : DECLARATION + xml);
    }
    return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  }

  return { zip, read, create, rels, addRel, override, defaultType, freePath, resolve, save, writeText: (path: string, text: string) => zip.file(path, text) };
}

export type Package = Awaited<ReturnType<typeof openPackage>>;

/** Date ISO sans millisecondes (« 2026-10-08T12:00:00Z »), comme Word. */
export const isoDate = (d: Date) => `${d.toISOString().slice(0, 19)}Z`;
