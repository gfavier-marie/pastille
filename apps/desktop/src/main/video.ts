// Mode vidéo : pendant l'enregistrement, chaque clic fige l'image de l'écran d'avant le clic et ouvre
// un segment d'audio, clos au clic suivant ou à l'arrêt. Un segment où l'on a parlé devient un point
// à l'endroit cliqué ; sans parole, il ne laisse rien. Ce qui est dit avant le premier clic devient une
// remarque générale. Un point sur un écran presque inchangé rejoint la capture précédente.
// Sans import d'electron : testé avec des clics et des images factices.

import type { Geometry } from '@pastille/shared';
import { VOICE_RMS, type VideoCrop, type VideoImage } from '../ipc.ts';
import type { SessionStore } from './session-store.ts';

type Rect = { x: number; y: number; width: number; height: number };

/** Clic, relatif à son écran (DIP). */
export type VideoClick = {
  displayId: number;
  display: { width: number; height: number; scaleFactor: number }; // taille de l'écran en DIP
  x: number;
  y: number;
  at: number; // Date.now() du clic
};

/** Ce que vise le clic : la fenêtre sous le curseur, ou l'écran entier ; cadre relatif à l'écran (DIP). */
export type VideoTarget = { rect: Rect; app?: string; title?: string };

export type VideoDeps = {
  store: Pick<SessionStore, 'addCapture' | 'addAnnotation' | 'addNote'>;
  /** Dictée d'un point ou d'une remarque, mise dans la file de transcription. */
  submit: (commentId: string, samples: Float32Array) => Promise<void>;
  /** Fige la dernière image d'un écran ; renvoie son numéro. */
  freeze: (displayId: number) => number;
  /** Image figée recadrée (rectangle en 0–1 de l'écran), ou jetée (null). */
  crop: (frameId: number, rect: VideoCrop['rect']) => Promise<VideoImage | null>;
  /** Cible du clic, cherchée dès le clic. */
  target: (click: VideoClick) => Promise<VideoTarget>;
  log?: (entry: Record<string, unknown>) => void;
};

/** Résultat d'un enregistrement, pour l'éditeur. */
export type VideoSummary = { firstCaptureId?: string; points: number; notes: number };

const MIN_VOICED_CHUNKS = 3; // 300 ms de voix : le bruit d'un clic ne suffit pas
const PAD_CHUNKS = 5; // 500 ms gardés autour de la voix : les silences plus longs qu'1 s sont raccourcis
const PIXEL_DIFF = 24; // écart de gris (sur 255) d'un pixel de vignette qui a changé
const SAME_SCREEN_RATIO = 0.02; // moins de 2 % de la vignette changée : même écran

const rms = (chunk: Float32Array) => {
  let sum = 0;
  for (const v of chunk) sum += v * v;
  return Math.sqrt(sum / (chunk.length || 1));
};

/** Quelqu'un a parlé : assez de blocs de 100 ms au-dessus du seuil de la dictée. */
export function isVoiced(chunks: Float32Array[]): boolean {
  return chunks.filter((c) => rms(c) > VOICE_RMS).length >= MIN_VOICED_CHUNKS;
}

/** Audio sans ses longs silences (Whisper invente du texte sur le silence), en un seul bloc. */
export function trimSilence(chunks: Float32Array[]): Float32Array {
  const voiced = chunks.map((c) => rms(c) > VOICE_RMS);
  const kept = chunks.filter((_, i) => voiced.slice(Math.max(0, i - PAD_CHUNKS), i + PAD_CHUNKS + 1).includes(true));
  const out = new Float32Array(kept.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const c of kept) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

/** Deux vignettes en niveaux de gris presque identiques (case cochée, survol, texte tapé : même écran). */
export function sameScreen(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length || !a.length) return false;
  let changed = 0;
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i]! - b[i]!) > PIXEL_DIFF) changed++;
  return changed / a.length < SAME_SCREEN_RATIO;
}

const sameRect = (a: Rect, b: Rect) => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

type Segment = {
  click?: VideoClick & { frameId: number; target: Promise<VideoTarget> };
  chunks: Float32Array[];
};

export function createVideo(deps: VideoDeps) {
  let recording = false;
  let startedAt = 0;
  let segment: Segment = { chunks: [] };
  let chain = Promise.resolve();
  // Dernière capture créée par cet enregistrement : un point suivant peut la rejoindre.
  let last: { captureId: string; displayId: number; rect: Rect; thumb: Uint8Array } | null = null;
  let summary: VideoSummary = { points: 0, notes: 0 };

  async function finalize(s: Segment) {
    const samples = () => trimSilence(s.chunks);
    const voiced = isVoiced(s.chunks);
    const c = s.click;
    if (!c) {
      // Avant le premier clic : une remarque générale, si l'on a parlé.
      if (!voiced) return;
      const id = await deps.store.addNote();
      summary.notes++;
      return deps.submit(id, samples());
    }
    if (!voiced) {
      await deps.crop(c.frameId, null); // clic de navigation : rien n'est gardé
      return deps.log?.({ kept: false });
    }
    const t = await c.target;
    const d = c.display;
    const image = await deps.crop(c.frameId, { x: t.rect.x / d.width, y: t.rect.y / d.height, width: t.rect.width / d.width, height: t.rect.height / d.height });
    if (!image) return deps.log?.({ kept: false, error: 'image indisponible' });

    const reuse = !!last && last.displayId === c.displayId && sameRect(last.rect, t.rect) && sameScreen(last.thumb, image.thumb);
    let captureId = last?.captureId;
    if (!reuse || !captureId) {
      const capture = await deps.store.addCapture(image.png, {
        width: image.width,
        height: image.height,
        scaleFactor: d.scaleFactor,
        source: { app: t.app, windowTitle: t.title, displayId: String(c.displayId) },
      });
      captureId = capture.id;
      last = { captureId, displayId: c.displayId, rect: t.rect, thumb: image.thumb };
      summary.firstCaptureId ??= captureId;
    }
    const point: Geometry = { kind: 'point', x: clamp01((c.x - t.rect.x) / t.rect.width), y: clamp01((c.y - t.rect.y) / t.rect.height) };
    const id = deps.store.addAnnotation(captureId, point);
    summary.points++;
    deps.log?.({
      kept: true,
      sameScreen: reuse,
      clickToFrozenMs: image.frozenAt - c.at,
      frameAgeMs: Math.round(image.frameAgeMs),
      width: image.width,
      height: image.height,
      app: t.app,
    });
    return deps.submit(id, samples());
  }

  /** Les segments sont finalisés un par un, dans l'ordre des clics. */
  function close(s: Segment) {
    chain = chain.then(() => finalize(s)).catch((err) => deps.log?.({ error: String(err) }));
  }

  return {
    isRecording: () => recording,
    startedAt: () => startedAt,

    start() {
      recording = true;
      startedAt = Date.now();
      segment = { chunks: [] };
      last = null;
      summary = { points: 0, notes: 0 };
    },

    onAudio(chunk: Float32Array) {
      if (recording) segment.chunks.push(chunk);
    },

    onClick(click: VideoClick) {
      if (!recording) return;
      // Image et fenêtre visée tout de suite, avant que l'app cliquée ne change d'état.
      const frameId = deps.freeze(click.displayId);
      const target = deps.target(click);
      close(segment);
      segment = { click: { ...click, frameId, target }, chunks: [] };
    },

    /** Clôt le dernier segment et attend que tout soit enregistré. */
    async stop(): Promise<VideoSummary> {
      if (!recording) return summary;
      recording = false;
      close(segment);
      segment = { chunks: [] };
      await chain;
      return summary;
    },
  };
}
