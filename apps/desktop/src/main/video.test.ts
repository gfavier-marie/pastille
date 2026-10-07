import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { VIDEO_THUMB, type VideoFeedback, type VideoImage } from '../ipc.ts';
import { createSessionStore } from './session-store.ts';
import { createVideo, isVoiced, sameScreen, trimSilence, type VideoClick, type VideoTarget } from './video.ts';

const CHUNK = 1600; // 100 ms à 16 kHz
const voice = () => new Float32Array(CHUNK).fill(0.1);
const silence = () => new Float32Array(CHUNK);
const thumb = (gray: number) => new Uint8Array(VIDEO_THUMB.width * VIDEO_THUMB.height).fill(gray);

const display = { width: 1000, height: 800, scaleFactor: 2 };
const click = (x: number, y: number): VideoClick => ({ displayId: 1, display, x, y, at: Date.now() });
const window: VideoTarget = { rect: { x: 100, y: 100, width: 800, height: 600 }, app: 'Google Chrome', title: 'Commandes' };

async function setup(opts: { thumbs?: number[]; delays?: number[]; missing?: number[] } = {}) {
  const store = createSessionStore(await mkdtemp(join(tmpdir(), 'pastille-video-')));
  const submitted: { id: string; length: number }[] = [];
  const dropped: number[] = [];
  const feedback: VideoFeedback[] = [];
  let frames = 0;
  const video = createVideo({
    store,
    nextNumber: () => store.get()?.captures.reduce((n, c) => n + c.annotations.length, 1) ?? 1,
    onFeedback: (state) => feedback.push(state),
    submit: async (id, samples) => void submitted.push({ id, length: samples.length }),
    freeze: () => ++frames,
    crop: async (frameId, rect): Promise<VideoImage | null> => {
      await new Promise((r) => setTimeout(r, opts.delays?.[frameId - 1] ?? 0));
      if (!rect) {
        dropped.push(frameId);
        return null;
      }
      if (opts.missing?.includes(frameId)) return null;
      return { png: new Uint8Array([frameId]), width: 1600, height: 1200, thumb: thumb(opts.thumbs?.[frameId - 1] ?? 0), frozenAt: Date.now(), frameAgeMs: 0 };
    },
    target: async () => window,
  });
  const say = (n: number) => {
    for (let i = 0; i < n; i++) video.onAudio(voice());
  };
  const wait = (n: number) => {
    for (let i = 0; i < n; i++) video.onAudio(silence());
  };
  return { store, video, submitted, dropped, say, wait, feedback };
}

describe('mode vidéo', () => {
  it('annonce le micro, le clic immédiatement, puis la parole ; masque le retour dès l’arrêt', async () => {
    const { video, feedback, say, wait } = await setup();
    video.start();
    expect(feedback.at(-1)).toMatchObject({ level: 0, voiced: false });
    expect(feedback.at(-1)?.click).toBeUndefined();
    video.onClick(click(500, 400));
    expect(feedback.at(-1)).toMatchObject({ click: { displayId: 1, x: 500, y: 400, number: 1 }, level: 0, voiced: false });
    say(2);
    expect(feedback.at(-1)).toMatchObject({ level: expect.closeTo(0.1), voiced: false });
    say(1);
    expect(feedback.at(-1)?.voiced).toBe(true);
    wait(1);
    expect(feedback.at(-1)).toMatchObject({ level: 0, voiced: true });
    const stopped = video.stop();
    expect(feedback.at(-1)).toBeNull();
    const count = feedback.length;
    video.onAudio(voice());
    video.onClick(click(300, 200));
    await stopped;
    expect(feedback).toHaveLength(count);
  });

  it('ne numérote pas les clics sans parole et garde le numéro pendant les sauvegardes lentes', async () => {
    const { video, feedback, store, say } = await setup({ delays: [0, 40] });
    video.start();
    video.onClick(click(200, 200)); // navigation
    video.onClick(click(300, 200));
    expect(feedback.at(-1)?.click?.number).toBe(1);
    say(4);
    video.onClick(click(400, 200));
    expect(feedback.at(-1)?.click?.number).toBe(2);
    await new Promise((r) => setTimeout(r, 80));
    expect(feedback.at(-1)?.click?.number).toBe(2);
    say(4);
    await video.stop();
    video.start(); // reprise dans la même session
    video.onClick(click(500, 200));
    expect(feedback.at(-1)?.click?.number).toBe(3);
    expect(store.get()!.captures[0]!.annotations.map((a) => a.number)).toEqual([1, 2]);
    await video.stop();
  });

  it('corrige le numéro provisoire si l’image précédente est indisponible', async () => {
    const { video, feedback, say } = await setup({ missing: [1] });
    video.start();
    video.onClick(click(200, 200));
    say(4);
    video.onClick(click(300, 200));
    expect(feedback.at(-1)?.click?.number).toBe(2);
    await new Promise((r) => setTimeout(r, 20));
    expect(feedback.at(-1)?.click?.number).toBe(1);
    await video.stop();
  });

  it('clic suivi de paroles : un point à l’endroit cliqué, sur la fenêtre visée, mis en transcription', async () => {
    const { store, video, submitted, say } = await setup();
    video.start();
    video.onClick(click(500, 400));
    say(10);
    const summary = await video.stop();
    const capture = store.get()!.captures[0]!;
    expect(capture).toMatchObject({ width: 1600, height: 1200, scaleFactor: 2, source: { app: 'Google Chrome', windowTitle: 'Commandes', displayId: '1' } });
    expect(capture.annotations).toHaveLength(1);
    expect(capture.annotations[0]!.geometry).toEqual({ kind: 'point', x: 0.5, y: 0.5 });
    expect(submitted).toEqual([{ id: capture.annotations[0]!.id, length: 10 * CHUNK }]);
    expect(summary).toEqual({ firstCaptureId: capture.id, points: 1, notes: 0 });
  });

  it('clic sans parole (navigation) ou simple bruit : rien n’est gardé', async () => {
    const { store, video, submitted, dropped, say, wait } = await setup();
    video.start();
    video.onClick(click(500, 400));
    wait(20);
    video.onClick(click(300, 300));
    say(2); // un clic de souris s'entend, mais moins de 300 ms
    wait(5);
    const summary = await video.stop();
    expect(store.get()).toBeNull();
    expect(submitted).toEqual([]);
    expect(dropped).toEqual([1, 2]);
    expect(summary).toEqual({ points: 0, notes: 0 });
  });

  it('paroles avant le premier clic : une remarque générale', async () => {
    const { store, video, submitted, say } = await setup();
    video.start();
    say(5);
    video.onClick(click(500, 400));
    await video.stop();
    const notes = store.get()!.notes!;
    expect(notes).toHaveLength(1);
    expect(submitted).toEqual([{ id: notes[0]!.id, length: 5 * CHUNK }]);
  });

  it('écran presque inchangé : le point rejoint la même capture ; écran changé : nouvelle capture', async () => {
    const { store, video, say } = await setup({ thumbs: [0, 10, 200] });
    video.start();
    video.onClick(click(200, 200));
    say(5);
    video.onClick(click(600, 500)); // vignette à peine différente (survol, case cochée)
    say(5);
    video.onClick(click(400, 400)); // autre page
    say(5);
    await video.stop();
    const captures = store.get()!.captures;
    expect(captures.map((c) => c.annotations.map((a) => a.number))).toEqual([[1, 2], [3]]);
  });

  it('garde l’ordre des clics même si une image met plus de temps à arriver', async () => {
    const { store, video, say } = await setup({ thumbs: [0, 100, 200], delays: [60, 0, 0] });
    video.start();
    for (const x of [200, 400, 600]) {
      video.onClick(click(x, 300));
      say(4);
    }
    await video.stop();
    const points = store.get()!.captures.map((c) => c.annotations[0]!.geometry);
    expect(points.map((g) => g.kind === 'point' && Math.round(g.x * 8))).toEqual([1, 3, 5]);
  });
});

describe('audio du mode vidéo', () => {
  it('reconnaît la parole à partir de 300 ms', () => {
    expect(isVoiced([voice(), voice(), silence()])).toBe(false);
    expect(isVoiced([voice(), silence(), voice(), voice()])).toBe(true);
  });

  it('raccourcit les silences de plus d’une seconde', () => {
    const chunks = [...[1, 2, 3].map(voice), ...Array.from({ length: 30 }, silence), ...[1, 2, 3].map(voice)];
    expect(trimSilence(chunks).length).toBe((3 + 5 + 5 + 3) * CHUNK);
    const short = [voice(), voice(), voice(), silence(), silence(), voice(), voice(), voice()];
    expect(trimSilence(short).length).toBe(short.length * CHUNK);
  });

  it('compare deux vignettes', () => {
    const a = thumb(100);
    const b = thumb(100);
    b.fill(255, 0, 40); // moins de 2 % changé
    expect(sameScreen(a, b)).toBe(true);
    b.fill(255, 0, 60);
    expect(sameScreen(a, b)).toBe(false);
  });
});
