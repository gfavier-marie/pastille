// Serveur MCP local pour Claude Code (§11) : liste les sessions, lit une revue et montre ses
// écrans (capture annotée, zooms, croquis, inspirations), en lecture seule. Sous-ensemble du transport
// « Streamable HTTP » : sans état, une réponse JSON par requête, sur 127.0.0.1 uniquement.
// Aucun import d'Electron ici : testable et lançable avec node.

import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { loadImage } from '@napi-rs/canvas';
import { allAnnotations, isSkippedPage, upgradeSession, type Session } from '@pastille/shared';
import { T } from '../texts/index.ts';
import { loadTextMap } from './document/anchor.ts';
import { cropJpeg, inspirationJpeg, position, screenJpeg, screenTitle, sourceLabel } from './export/build.ts';
import type { SessionStore } from './session-store.ts';

export const MCP_PORT = Number(process.env.PASTILLE_MCP_PORT) || 3917;
const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26'];
const MAX_BODY = 1024 * 1024;

type Json = Record<string, unknown>;
type Content = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string };
type ToolResult = { content: Content[]; isError?: boolean };
type Message = { id?: string | number | null; method?: string; params?: Json };

// Pas d'outputSchema : avec un résultat structuré, Claude Code ne montre plus les images comme des images.
// Noms d'outils et de paramètres fixes (Claude Code et les habitudes des utilisateurs en dépendent), descriptions traduites.
function tools() {
  const M = T.mcp;
  const session = { type: 'string', description: M.sessionParam };
  return [
    { name: 'lister_sessions', description: M.listTool, inputSchema: { type: 'object', properties: {} } },
    { name: 'lire_revue', description: M.reviewTool, inputSchema: { type: 'object', properties: { session } } },
    {
      name: 'voir_ecran',
      description: M.screenTool,
      inputSchema: {
        type: 'object',
        properties: { session, ecran: { type: 'integer', minimum: 1, description: M.screenParam } },
        required: ['ecran'],
      },
    },
  ];
}

/** Erreur à montrer telle quelle à l'IA (session introuvable, écran hors limites). */
class ToolError extends Error {}

const text = (t: string): Content => ({ type: 'text', text: t });
const image = (data: Uint8Array, mimeType: string): Content => ({ type: 'image', data: Buffer.from(data).toString('base64'), mimeType });
const comment = (t: string) => t.trim().replace(/\s*\n\s*/g, ' ') || T.exports.noComment;

/** `instructions` : texte d'instructions à l'IA pour une session (réglage, ou défaut adapté aux documents). */
export function createMcp(deps: { store: SessionStore; instructions?: (s: Session) => string; onClient?: () => void }) {
  const { store } = deps;
  let server: Server | null = null;
  let hosts: string[] = [];

  /** Sans id : la session ouverte, sinon la plus récente. */
  async function loadSession(id: unknown): Promise<{ session: Session; dir: string }> {
    const open = store.get();
    if (id === undefined || id === '') {
      if (open) return { session: open, dir: store.dir(open) };
      const [latest] = await store.recent(1);
      if (!latest) throw new ToolError(T.mcp.noSession);
      id = latest.id;
    }
    // Un id ne contient ni « / » ni « .. » : on ne sort pas du dossier des sessions.
    if (typeof id !== 'string' || !/^[\w-]+$/.test(id)) throw new ToolError(T.mcp.notFound(String(id)));
    if (open?.id === id) return { session: open, dir: store.dir(open) };
    const dir = join(store.sessionsDir, id);
    try {
      return { session: upgradeSession(JSON.parse(await readFile(join(dir, 'session.json'), 'utf8')) as Session), dir };
    } catch {
      throw new ToolError(T.mcp.notFoundList(id));
    }
  }

  async function listSessions(): Promise<string> {
    const list = await store.recent(20);
    if (!list.length) return T.mcp.noSessions;
    const openId = store.get()?.id;
    return [T.mcp.sessions, ...list.map((s) => T.mcp.sessionLine(s.name, T.exports.date(s.updatedAt), s.points, s.id, s.id === openId))].join('\n');
  }

  async function review({ session, dir }: { session: Session; dir: string }): Promise<string> {
    const M = T.mcp, E = T.exports;
    const total = allAnnotations(session).length;
    // Pages de document sans point sautées, comme dans les exports ; les numéros d'écran ne changent pas.
    const shown = [...session.captures.entries()].filter(([, c]) => !isSkippedPage(c));
    const lines = [`# ${session.name}`, '', `${E.date(session.createdAt)} · ${T.screens(shown.length)} · ${T.points(total)}`];
    if (session.context?.trim()) lines.push('', E.context + E.colon + session.context.trim());
    lines.push('', `## ${E.instructions}`, '', (deps.instructions?.(session) ?? T.instructions).replaceAll('{N}', String(total)));
    const untranscribed = allAnnotations(session).filter((a) => ['recording', 'pending', 'error'].includes(a.transcription));
    if (untranscribed.length) lines.push('', M.untranscribed(untranscribed.map((a) => `#${a.number}`).join(', ')));
    const notes = (session.notes ?? []).filter((n) => n.text.trim());
    if (notes.length) lines.push('', `## ${E.notes}`, '', ...notes.map((n) => `- ${comment(n.text)}`));
    for (const [i, c] of shown) {
      lines.push('', `## ${screenTitle(i + 1, c)}`, '');
      if (!c.annotations.length) lines.push(M.noPoints);
      const map = await loadTextMap(dir, c);
      for (const a of c.annotations) {
        const sketches = a.sketches.length ? ` · ${M.sketches(a.sketches.length)}` : '';
        const inspirations = a.inspirations?.length ? ` · ${M.inspirations(a.inspirations.length)}` : '';
        lines.push(`- #${a.number} · ${comment(a.text)} · ${position(a, c, map)}${sketches}${inspirations}`);
      }
    }
    if (shown.length === session.captures.length) {
      if (shown.length) lines.push('', M.seeScreens(shown.length));
    } else if (shown.length) lines.push('', M.seeScreensList(shown.map(([i]) => i + 1).join(', ')));
    return lines.join('\n');
  }

  async function screen({ session, dir }: { session: Session; dir: string }, ecran: unknown): Promise<Content[]> {
    const n = Number(ecran);
    const capture = Number.isInteger(n) ? session.captures[n - 1] : undefined;
    if (!capture) throw new ToolError(T.mcp.noScreen(String(ecran), session.name, session.captures.length));
    const E = T.exports;
    const img = await loadImage(join(dir, capture.image));
    const map = await loadTextMap(dir, capture);
    const content = [text(`## ${screenTitle(n, capture)} · ${T.points(capture.annotations.length)}`), image(await screenJpeg(img, capture), 'image/jpeg')];
    for (const a of capture.annotations) {
      content.push(text(`### #${a.number}\n${a.text.trim() || E.noComment}\n${E.position}${E.colon}${position(a, capture, map)}\n${T.mcp.zoom}`));
      content.push(image(await cropJpeg(img, capture, a), 'image/jpeg'));
      for (const [k, sketch] of a.sketches.entries()) {
        content.push(text(`${E.sketchOf(k + 1, a.number)}${E.colon.trimEnd()}`));
        content.push(image(await readFile(join(dir, sketch.png)), 'image/png'));
      }
      for (const [k, inspiration] of (a.inspirations ?? []).entries()) {
        const source = sourceLabel(inspiration.source);
        content.push(text(`${E.inspirationOf(k + 1, a.number)}${source ? ` (${source})` : ''}${E.colon}${E.inspirationNote}.`));
        content.push(image(await inspirationJpeg(await loadImage(join(dir, inspiration.image))), 'image/jpeg'));
      }
    }
    return content;
  }

  async function callTool(name: string, args: Json): Promise<ToolResult> {
    try {
      if (name === 'lister_sessions') return { content: [text(await listSessions())] };
      if (name === 'lire_revue') return { content: [text(await review(await loadSession(args.session)))] };
      return { content: await screen(await loadSession(args.session), args.ecran) };
    } catch (err) {
      return { content: [text(err instanceof ToolError ? err.message : T.mcp.error(String(err)))], isError: true };
    }
  }

  /** Un message JSON-RPC ; null pour une notification, qui n'attend pas de réponse. */
  async function handle(msg: Message): Promise<Json | null> {
    if (msg.id === undefined || msg.id === null) return null;
    const reply = (result: unknown) => ({ jsonrpc: '2.0', id: msg.id, result });
    const fail = (code: number, message: string) => ({ jsonrpc: '2.0', id: msg.id, error: { code, message } });
    switch (msg.method) {
      case 'initialize': {
        deps.onClient?.(); // un client (Claude Code) vient de se brancher
        const asked = String(msg.params?.protocolVersion);
        return reply({
          protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
          capabilities: { tools: {} },
          serverInfo: { name: 'vibescreener', version: '1.0.0' },
          instructions: T.mcp.instructions,
        });
      }
      case 'ping':
        return reply({});
      case 'tools/list':
        return reply({ tools: tools() });
      case 'tools/call': {
        const name = String(msg.params?.name);
        if (!tools().some((t) => t.name === name)) return fail(-32602, `Outil inconnu : ${name}`);
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
