// Serveur MCP local pour Claude Code (§11) : liste les sessions, lit une revue et montre ses
// écrans (capture annotée, zooms, croquis), en lecture seule. Sous-ensemble du transport
// « Streamable HTTP » : sans état, une réponse JSON par requête, sur 127.0.0.1 uniquement.
// Aucun import d'Electron ici : testable et lançable avec node.

import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { loadImage } from '@napi-rs/canvas';
import { allAnnotations, upgradeSession, type Session } from '@pastille/shared';
import { cropJpeg, DEFAULT_INSTRUCTIONS, position, screenJpeg, screenTitle } from './export/build.ts';
import type { SessionStore } from './session-store.ts';

export const MCP_PORT = Number(process.env.PASTILLE_MCP_PORT) || 3917;
const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26'];
const MAX_BODY = 1024 * 1024;

const SERVER_INSTRUCTIONS = `VibeScreener enregistre des revues d'interface : des captures d'écran où chaque retour est un point numéroté (#1 à #N) avec un commentaire, souvent dicté, et parfois un croquis.
Pour appliquer une revue au code : sans précision de l'utilisateur, prendre la session ouverte dans VibeScreener (choix par défaut), sinon la choisir avec lister_sessions. lire_revue donne tous les retours ; voir_ecran montre, écran par écran, la capture annotée, un zoom autour de chaque point et les croquis. Regarder chaque écran avant de modifier le code. Si un retour est ambigu, poser une question plutôt que deviner.`;

type Json = Record<string, unknown>;
type Content = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string };
type ToolResult = { content: Content[]; isError?: boolean };
type Message = { id?: string | number | null; method?: string; params?: Json };

const SESSION_PARAM = {
  type: 'string',
  description: 'Id de la session (voir lister_sessions). Par défaut : la session ouverte dans VibeScreener, sinon la plus récente.',
};

// Pas d'outputSchema : avec un résultat structuré, Claude Code ne montre plus les images comme des images.
const TOOLS = [
  {
    name: 'lister_sessions',
    description: 'Liste les sessions de revue récentes (nom, date, nombre de points, id), la plus récente d’abord.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'lire_revue',
    description:
      "Tous les retours d'une session, en texte : contexte, instructions, puis chaque point (numéro, écran, commentaire, position, croquis). Les images s'obtiennent avec voir_ecran.",
    inputSchema: { type: 'object', properties: { session: SESSION_PARAM } },
  },
  {
    name: 'voir_ecran',
    description:
      "Un écran d'une session : la capture avec ses points numérotés, puis pour chaque point son commentaire, un zoom autour de l'élément visé et ses croquis.",
    inputSchema: {
      type: 'object',
      properties: {
        session: SESSION_PARAM,
        ecran: { type: 'integer', minimum: 1, description: "Numéro de l'écran, de 1 au nombre d'écrans donné par lire_revue." },
      },
      required: ['ecran'],
    },
  },
];

/** Erreur à montrer telle quelle à l'IA (session introuvable, écran hors limites). */
class ToolError extends Error {}

const text = (t: string): Content => ({ type: 'text', text: t });
const image = (data: Uint8Array, mimeType: string): Content => ({ type: 'image', data: Buffer.from(data).toString('base64'), mimeType });
const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;
const dateFr = (iso: string) => new Date(iso).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' });
const comment = (t: string) => t.trim().replace(/\s*\n\s*/g, ' ') || '(sans commentaire)';

export function createMcp(deps: { store: SessionStore; instructions?: () => string }) {
  const { store } = deps;
  let server: Server | null = null;
  let hosts: string[] = [];

  /** Sans id : la session ouverte, sinon la plus récente. */
  async function loadSession(id: unknown): Promise<{ session: Session; dir: string }> {
    const open = store.get();
    if (id === undefined || id === '') {
      if (open) return { session: open, dir: store.dir(open) };
      const [latest] = await store.recent(1);
      if (!latest) throw new ToolError('Aucune session : faire d’abord une capture avec VibeScreener.');
      id = latest.id;
    }
    // Un id ne contient ni « / » ni « .. » : on ne sort pas du dossier des sessions.
    if (typeof id !== 'string' || !/^[\w-]+$/.test(id)) throw new ToolError(`Session « ${String(id)} » introuvable.`);
    if (open?.id === id) return { session: open, dir: store.dir(open) };
    const dir = join(store.sessionsDir, id);
    try {
      return { session: upgradeSession(JSON.parse(await readFile(join(dir, 'session.json'), 'utf8')) as Session), dir };
    } catch {
      throw new ToolError(`Session « ${id} » introuvable : voir lister_sessions.`);
    }
  }

  async function listSessions(): Promise<string> {
    const list = await store.recent(20);
    if (!list.length) return 'Aucune session pour l’instant.';
    const openId = store.get()?.id;
    return [
      'Sessions, la plus récente d’abord :',
      ...list.map(
        (s) =>
          `- ${s.name} · modifiée le ${dateFr(s.updatedAt)} · ${plural(s.points, 'point')} · id : ${s.id}${s.id === openId ? ' (ouverte dans VibeScreener)' : ''}`,
      ),
    ].join('\n');
  }

  function review(session: Session): string {
    const total = allAnnotations(session).length;
    const lines = [`# ${session.name}`, '', `${dateFr(session.createdAt)} · ${plural(session.captures.length, 'écran')} · ${plural(total, 'point')}`];
    if (session.context?.trim()) lines.push('', `Contexte : ${session.context.trim()}`);
    lines.push('', '## Instructions', '', (deps.instructions?.() ?? DEFAULT_INSTRUCTIONS).replaceAll('{N}', String(total)));
    const untranscribed = allAnnotations(session).filter((a) => ['recording', 'pending', 'error'].includes(a.transcription));
    if (untranscribed.length)
      lines.push('', `Attention : dictée pas encore transcrite pour ${untranscribed.map((a) => `#${a.number}`).join(', ')} ; le commentaire peut être incomplet.`);
    const notes = (session.notes ?? []).filter((n) => n.text.trim());
    if (notes.length) lines.push('', '## Remarques générales', '', ...notes.map((n) => `- ${comment(n.text)}`));
    for (const [i, c] of session.captures.entries()) {
      lines.push('', `## ${screenTitle(i + 1, c)}`, '');
      if (!c.annotations.length) lines.push('(aucun point)');
      for (const a of c.annotations) {
        const sketches = a.sketches.length ? ` · ${a.sketches.length} croquis` : '';
        lines.push(`- #${a.number} · ${comment(a.text)} · ${position(a, c)}${sketches}`);
      }
    }
    if (session.captures.length)
      lines.push('', `Pour voir la capture annotée, le zoom de chaque point et les croquis : voir_ecran avec ecran de 1 à ${session.captures.length}.`);
    return lines.join('\n');
  }

  async function screen({ session, dir }: { session: Session; dir: string }, ecran: unknown): Promise<Content[]> {
    const n = Number(ecran);
    const capture = Number.isInteger(n) ? session.captures[n - 1] : undefined;
    if (!capture) throw new ToolError(`Écran ${String(ecran)} inexistant : la session « ${session.name} » a ${plural(session.captures.length, 'écran')}.`);
    const img = await loadImage(join(dir, capture.image));
    const content = [text(`## ${screenTitle(n, capture)} · ${plural(capture.annotations.length, 'point')}`), image(await screenJpeg(img, capture), 'image/jpeg')];
    for (const a of capture.annotations) {
      content.push(text(`### #${a.number}\n${a.text.trim() || '(sans commentaire)'}\nPosition : ${position(a, capture)}\nZoom sur l'élément visé :`));
      content.push(image(await cropJpeg(img, capture, a), 'image/jpeg'));
      for (const [k, sketch] of a.sketches.entries()) {
        content.push(text(`Croquis ${k + 1} de #${a.number} :`));
        content.push(image(await readFile(join(dir, sketch.png)), 'image/png'));
      }
    }
    return content;
  }

  async function callTool(name: string, args: Json): Promise<ToolResult> {
    try {
      if (name === 'lister_sessions') return { content: [text(await listSessions())] };
      if (name === 'lire_revue') return { content: [text(review((await loadSession(args.session)).session))] };
      return { content: await screen(await loadSession(args.session), args.ecran) };
    } catch (err) {
      return { content: [text(err instanceof ToolError ? err.message : `Erreur de VibeScreener : ${String(err)}`)], isError: true };
    }
  }

  /** Un message JSON-RPC ; null pour une notification, qui n'attend pas de réponse. */
  async function handle(msg: Message): Promise<Json | null> {
    if (msg.id === undefined || msg.id === null) return null;
    const reply = (result: unknown) => ({ jsonrpc: '2.0', id: msg.id, result });
    const fail = (code: number, message: string) => ({ jsonrpc: '2.0', id: msg.id, error: { code, message } });
    switch (msg.method) {
      case 'initialize': {
        const asked = String(msg.params?.protocolVersion);
        return reply({
          protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
          capabilities: { tools: {} },
          serverInfo: { name: 'vibescreener', version: '1.0.0' },
          instructions: SERVER_INSTRUCTIONS,
        });
      }
      case 'ping':
        return reply({});
      case 'tools/list':
        return reply({ tools: TOOLS });
      case 'tools/call': {
        const name = String(msg.params?.name);
        if (!TOOLS.some((t) => t.name === name)) return fail(-32602, `Outil inconnu : ${name}`);
        return reply(await callTool(name, (msg.params?.arguments ?? {}) as Json));
      }
      default:
        return fail(-32601, `Méthode inconnue : ${msg.method}`);
    }
  }

  async function respond(req: IncomingMessage, res: ServerResponse) {
    const send = (status: number, body?: unknown) => {
      res.writeHead(status, body === undefined ? {} : { 'Content-Type': 'application/json' });
      res.end(body === undefined ? undefined : JSON.stringify(body));
    };
    // Une page web ne doit pas lire les revues : en-tête Origin (navigateur) ou Host étranger (rebinding DNS) refusés.
    if (req.headers.origin || !hosts.includes(req.headers.host ?? '')) return send(403);
    if (new URL(req.url ?? '/', 'http://localhost').pathname !== '/mcp') return send(404);
    if (req.method !== 'POST') return send(405); // ni flux SSE ni session à fermer
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req as AsyncIterable<Buffer>) {
      if ((size += chunk.length) > MAX_BODY) return send(413);
      chunks.push(chunk);
    }
    let msg: unknown;
    try {
      msg = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      return send(400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON invalide' } });
    }
    if (typeof msg !== 'object' || msg === null || Array.isArray(msg))
      return send(400, { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Requête invalide' } });
    const reply = await handle(msg as Message);
    return reply ? send(200, reply) : send(202);
  }

  /** Démarre le serveur ; renvoie son adresse (port 0 : un port libre au hasard). */
  function listen(port = MCP_PORT): Promise<string> {
    return new Promise((resolve, reject) => {
      const s = createServer((req, res) => void respond(req, res).catch(() => res.destroy()));
      s.once('error', reject);
      s.listen(port, '127.0.0.1', () => {
        const actual = (s.address() as AddressInfo).port;
        hosts = [`127.0.0.1:${actual}`, `localhost:${actual}`];
        server = s;
        resolve(`http://127.0.0.1:${actual}/mcp`);
      });
    });
  }

  function close() {
    server?.closeAllConnections();
    server?.close();
    server = null;
  }

  return { handle, listen, close };
}
