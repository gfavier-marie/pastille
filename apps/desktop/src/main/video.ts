// Mode vidéo : pendant l'enregistrement, chaque ⌘ + clic (Ctrl + clic) fige l'image de l'écran et ouvre
// un segment d'audio, clos au clic suivant (de point ou de navigation) ou à l'arrêt. Un segment où l'on
// a parlé devient un point à l'endroit cliqué ; sans parole, il ne laisse rien. Ce qui est dit hors d'un
// point devient une remarque générale. Un point sur un écran presque inchangé rejoint la capture précédente.
// Sans import d'electron : testé avec des clics et des images factices.

import type { Geometry } from '@pastille/shared';
import { VOICE_RMS, type VideoCrop, type VideoFeedback, type VideoImage } from '../ipc.ts';
import type { SessionStore } from './session-store.ts';

type Rect = { x: number; y: number; width: number; height: number };

/** Clic, relatif à son écran (DIP). */
export type VideoClick = {
  displayId: number;
  display: { width: number; height: number; scaleFactor: number }; // taille de l'écran en DIP
  x: number;
  y: number;
  at: number; // Date.now() du clic
  geometry?: Geometry; // normalisée à l'écran : cadre ou flèche glissés
  crop?: boolean; // ⌥ / Alt : recadrer sur le cadre
  held?: boolean; // le glissement n'est pas encore terminé
};

/** Ce que vise le clic : la fenêtre sous le curseur, ou l'écran entier ; cadre relatif à l'écran (DIP). */
export type VideoTarget = { rect: Rect; app?: string; title?: string; at?: (point: { x: number; y: number }) => VideoTarget };

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
  nextNumber?: () => number;
  onPoint?: (point: VideoPoint | null) => void; // point actif pour la tablette
  onFeedback?: (state: VideoFeedback) => void;
  log?: (entry: Record<string, unknown>) => void;
};

export type VideoPoint = { annotationId: string; captureId: string; number: number };

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
  voicedChunks: number;
  point?: VideoPoint;
  saving?: Promise<VideoPoint | null>;
};

export function createVideo(deps: VideoDeps) {
  let recording = false;
  let startedAt = 0;
  let segment: Segment = { chunks: [], voicedChunks: 0 };
  const pending: Segment[] = [];
  let paused = false;
  let level = 0;
  let chain = Promise.resolve();
  // Dernière capture créée par cet enregistrement : un point suivant peut la rejoindre.
  let last: { captureId: string; displayId: number; rect: Rect; thumb: Uint8Array } | null = null;
  let summary: VideoSummary = { points: 0, notes: 0 };

  function number(s: Segment) {
    if (s.point) return s.point.number;
    const index = pending.indexOf(s);
    return (deps.nextNumber?.() ?? summary.points + 1) + (index < 0 ? pending.length : index);
  }

  function feedback() {
    if (!recording) return;
    const c = segment.click;
    deps.onFeedback?.({
      click: c ? { displayId: c.displayId, x: c.x, y: c.y, number: number(segment), at: c.at, geometry: c.geometry } : undefined,
      elapsedMs: Math.max(0, Date.now() - (c?.at ?? startedAt)),
      level,
      voiced: segment.voicedChunks >= MIN_VOICED_CHUNKS,
      kept: !!segment.point,
      paused,
    });
  }

  /** Crée le point dès qu'il sert (parole, dessin ou inspiration), sur l'image d'avant le clic. */
  async function persist(s: Segment): Promise<VideoPoint | null> {
    const c = s.click!;
    let t = await c.target;
    const d = c.display;
    const g = c.geometry ?? { kind: 'point', x: c.x / d.width, y: c.y / d.height };
    if (g.kind === 'zone' && !c.crop && t.at) t = t.at({ x: (g.x + g.w / 2) * d.width, y: (g.y + g.h / 2) * d.height });
    const rect = c.crop && g.kind === 'zone'
      ? { x: g.x * d.width, y: g.y * d.height, width: g.w * d.width, height: g.h * d.height }
      : t.rect;
    const image = await deps.crop(c.frameId, { x: rect.x / d.width, y: rect.y / d.height, width: rect.width / d.width, height: rect.height / d.height });
    if (!image) {
      deps.log?.({ kept: false, error: 'image indisponible' });
      return null;
    }

    const reuse = !!last && last.displayId === c.displayId && sameRect(last.rect, rect) && sameScreen(last.thumb, image.thumb);
    let captureId = last?.captureId;
    if (!reuse || !captureId) {
      const capture = await deps.store.addCapture(image.png, {
        width: image.width,
        height: image.height,
        scaleFactor: d.scaleFactor,
        source: { app: t.app, windowTitle: t.title, displayId: String(c.displayId) },
      });
      captureId = capture.id;
      last = { captureId, displayId: c.displayId, rect, thumb: image.thumb };
      summary.firstCaptureId ??= captureId;
    }
    const X = (x: number) => clamp01((x * d.width - rect.x) / rect.width);
    const Y = (y: number) => clamp01((y * d.height - rect.y) / rect.height);
    const geometry: Geometry = g.kind === 'point' ? { kind: 'point', x: X(g.x), y: Y(g.y) }
      : g.kind === 'arrow' ? { kind: 'arrow', x1: X(g.x1), y1: Y(g.y1), x2: X(g.x2), y2: Y(g.y2) }
      : { kind: 'zone', x: X(g.x), y: Y(g.y), w: X(g.x + g.w) - X(g.x), h: Y(g.y + g.h) - Y(g.y) };
    const n = deps.nextNumber?.() ?? summary.points + 1;
    const annotationId = deps.store.addAnnotation(captureId, geometry);
    summary.points++;
    deps.log?.({ kept: true, sameScreen: reuse, clickToFrozenMs: image.frozenAt - c.at, frameAgeMs: Math.round(image.frameAgeMs), width: image.width, height: image.height, app: t.app });
    return { annotationId, captureId, number: n };
  }

  function savePoint(s: Segment): Promise<VideoPoint | null> {
    if (s.saving) return s.saving;
    if (!s.click) return Promise.resolve(null);
    pending.push(s);
    s.saving = chain.then(() => persist(s)).then((point) => {
      if (point) s.point = point;
      return point;
    }).finally(() => {
      pending.splice(pending.indexOf(s), 1);
      if (recording && segment === s) deps.onPoint?.(s.point ?? null);
      feedback();
    });
    chain = s.saving.then(() => {}, (err) => deps.log?.({ error: String(err) }));
    return s.saving;
  }

  /** Images et transcriptions gardent l'ordre des clics. L'audio reste ouvert pendant un dessin. */
  function close(s: Segment) {
    const voiced = isVoiced(s.chunks);
    if (s.click && voiced) void savePoint(s);
    chain = chain.then(async () => {
      if (s.click) {
        if (s.point && voiced) await deps.submit(s.point.annotationId, trimSilence(s.chunks));
        else if (!s.saving) {
          await deps.crop(s.click.frameId, null);
          deps.log?.({ kept: false });
        }
      } else if (voiced) {
        const id = await deps.store.addNote();
        summary.notes++;
        await deps.submit(id, trimSilence(s.chunks));
      }
    }).catch((err) => deps.log?.({ error: String(err) }));
  }

  return {
    isRecording: () => recording,
    startedAt: () => startedAt,

    start() {
      recording = true;
      startedAt = Date.now();
      segment = { chunks: [], voicedChunks: 0 };
      pending.length = 0;
      paused = false;
      deps.onPoint?.(null);
      level = 0;
      last = null;
      summary = { points: 0, notes: 0 };
      feedback();
    },

    onAudio(chunk: Float32Array) {
      if (!recording || paused) return;
      segment.chunks.push(chunk);
      level = rms(chunk);
      if (level > VOICE_RMS) segment.voicedChunks++;
      if (segment.click && !segment.click.held && segment.voicedChunks >= MIN_VOICED_CHUNKS) void savePoint(segment);
      feedback();
    },

    onClick(click: VideoClick) {
      if (!recording || paused) return;
      // Image et fenêtre visée tout de suite, avant que l'app cliquée ne change d'état.
      const frameId = deps.freeze(click.displayId);
      const target = deps.target(click);
      close(segment);
      segment = { click: { ...click, frameId, target }, chunks: [], voicedChunks: 0 };
      level = 0;
      deps.onPoint?.(null);
      feedback();
    },

    /** Clic seul : on navigue. Le point en cours se termine ; une remarque générale continue. */
    onNavigate() {
      if (!recording || paused || !segment.click) return;
      close(segment);
      segment = { chunks: [], voicedChunks: 0 };
      level = 0;
      deps.onPoint?.(null);
      feedback();
    },

    onGesture(displayId: number, geometry: Geometry | undefined, crop: boolean, done: boolean) {
      const c = segment.click;
      if (!recording || paused || !c || c.displayId !== displayId || !c.held) return;
      c.geometry = geometry;
      c.crop = crop;
      if (done) {
        c.held = false;
        if (segment.voicedChunks >= MIN_VOICED_CHUNKS) void savePoint(segment);
      }
      feedback();
    },

    /** Joindre un dessin ou une inspiration garde aussi un point sans dictée. */
    currentPoint: () => recording ? savePoint(segment) : Promise.resolve(null),
    pause() { paused = true; level = 0; feedback(); },
    resume() { paused = false; feedback(); },

    /** Clôt le dernier segment et attend que tout soit enregistré. */
    async stop(): Promise<VideoSummary> {
      if (!recording) return summary;
      recording = false;
      paused = false;
      deps.onPoint?.(null);
      deps.onFeedback?.(null);
      close(segment);
      segment = { chunks: [], voicedChunks: 0 };
      await chain;
      return summary;
    },
  };
}
