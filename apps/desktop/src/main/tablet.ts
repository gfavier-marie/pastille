// Tablette (§5, §8.3) : appairage mémorisé, envoi du point actif, réception des croquis.
// Le desktop se connecte au relais en sortie ; tout est chiffré avec la clé du QR.

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadImage, type Image } from '@napi-rs/canvas';
import {
  allAnnotations,
  connectLink,
  findAnnotation,
  newPairing,
  relaySocketUrl,
  type Link,
  type Message,
  type Sketch,
} from '@pastille/shared';
import { cropJpeg } from './export/build.ts';
import type { SessionStore } from './session-store.ts';

const PING_EVERY_MS = 5_000;
const PRESENCE_TIMEOUT_MS = 15_000;
const MAX_BACKGROUND_BYTES = 200_000;

type Pairing = { roomId: string; key: string };

export function createTablet(opts: {
  dataDir: string;
  relayUrl: string;
  store: SessionStore;
  onStatus: (connected: boolean) => void;
}) {
  const pairingPath = join(opts.dataDir, 'pairing.json');
  let pairing: Pairing | null = null;
  let link: Link | null = null;
  let focusId: string | null = null;
  let lastSeen = 0;
  let connected = false;
  let pingId = 0;
  let imageCache: { path: string; img: Image } | null = null;

  function setConnected(value: boolean) {
    if (value === connected) return;
    connected = value;
    opts.onStatus(value);
  }

  function seen() {
    lastSeen = Date.now();
    setConnected(true);
  }

  async function background(annotationId: string): Promise<string | undefined> {
    const session = opts.store.get();
    const found = session && findAnnotation(session, annotationId);
    if (!session || !found) return undefined;
    const path = join(opts.store.dir(session), found.capture.image);
    if (imageCache?.path !== path) imageCache = { path, img: await loadImage(path) };
    for (const quality of [70, 50, 35]) {
      const jpeg = await cropJpeg(imageCache.img, found.capture, found.annotation, quality);
      if (jpeg.byteLength <= MAX_BACKGROUND_BYTES) return jpeg.toString('base64');
    }
    return undefined;
  }

  /** Point actif → tablette. Le fond n'est envoyé que lorsque le point change. */
  async function sendFocus(withBackground: boolean) {
    if (!link) return;
    const session = opts.store.get();
    const a = session && focusId ? findAnnotation(session, focusId)?.annotation : undefined;
    if (!a) {
      const last = session ? allAnnotations(session).sort((x, y) => x.createdAt.localeCompare(y.createdAt)).at(-1) : undefined;
      return link.send({ type: 'focus_none', lastNumber: last?.number });
    }
    const bg = withBackground ? await background(a.id).catch(() => undefined) : undefined;
    await link.send({ type: 'focus', annotationId: a.id, number: a.number, text: a.text.slice(0, 120), background: bg });
  }

  async function receiveSketch(msg: Extract<Message, { type: 'sketch' }>) {
    const session = opts.store.get();
    if (!session) return;
    // Croquis envoyé sans point actif : il rejoint le dernier point créé.
    const target = msg.annotationId
      ? findAnnotation(session, msg.annotationId)?.annotation
      : allAnnotations(session).sort((x, y) => x.createdAt.localeCompare(y.createdAt)).at(-1);
    if (!target) return;
    const dir = join(opts.store.dir(session), 'sketches');
    await mkdir(dir, { recursive: true });
    const sketch: Sketch = {
      id: msg.sketchId,
      png: `sketches/${msg.sketchId}.png`,
      strokes: `sketches/${msg.sketchId}.json`,
      createdAt: new Date().toISOString(),
    };
    await writeFile(join(opts.store.dir(session), sketch.png), Buffer.from(msg.png, 'base64'));
    await writeFile(join(opts.store.dir(session), sketch.strokes), msg.strokes);
    opts.store.update(
      (s) => {
        const a = findAnnotation(s, target.id)?.annotation;
        if (a && !a.sketches.some((k) => k.id === sketch.id)) a.sketches.push({ ...sketch });
      },
      { patchHistory: true },
    );
    await link?.send({ type: 'sketch_ack', sketchId: msg.sketchId, number: target.number });
  }

  function connect() {
    if (!pairing) return;
    link?.close();
    link = connectLink({
      url: relaySocketUrl(opts.relayUrl, pairing.roomId),
      key: pairing.key,
      role: 'desktop',
      onStatus: (s) => s !== 'open' && setConnected(false),
      onMessage(msg) {
        if (msg.type !== 'hello' || msg.role === 'tablet') seen();
        if (msg.type === 'hello' && msg.role === 'tablet') void sendFocus(true); // reconnexion : on renvoie le point actif
        if (msg.type === 'ping') void link?.send({ type: 'pong', id: msg.id, t: msg.t });
        if (msg.type === 'sketch') void receiveSketch(msg);
      },
    });
  }

  // Présence : la tablette répond aux pings ; sans réponse, elle est considérée déconnectée.
  const timer = setInterval(() => {
    if (!link) return;
    void link.send({ type: 'ping', id: ++pingId, t: Date.now() });
    if (Date.now() - lastSeen > PRESENCE_TIMEOUT_MS) setConnected(false);
  }, PING_EVERY_MS);

  return {
    async start() {
      if (existsSync(pairingPath)) pairing = JSON.parse(await readFile(pairingPath, 'utf8')) as Pairing;
      connect();
    },
    /** Lien du QR code ; l'appairage est créé une fois puis mémorisé. */
    async pairUrl(): Promise<string> {
      if (!pairing) {
        pairing = newPairing();
        await mkdir(opts.dataDir, { recursive: true });
        await writeFile(pairingPath, JSON.stringify(pairing));
        connect();
      }
      return `${opts.relayUrl.replace(/\/$/, '')}/#r=${pairing.roomId}&k=${pairing.key}`;
    },
    setFocus(annotationId: string | null) {
      const changed = annotationId !== focusId;
      focusId = annotationId;
      void sendFocus(changed);
    },
    /** La session a changé (texte, numérotation) : le bandeau de la tablette suit. */
    refresh() {
      void sendFocus(false);
    },
    isConnected: () => connected,
    stop() {
      clearInterval(timer);
      link?.close();
    },
  };
}
