// Fenêtre cachée du mode vidéo : filme chaque écran pour en garder la dernière image (celle d'avant
// un clic : la capture classique arriverait trop tard, après l'effet du clic), et envoie le micro
// au processus principal par blocs de 100 ms. Toute la logique reste dans le processus principal.

import { VIDEO_THUMB, type VideoSource } from '../ipc.ts';

// Chromium lit les images d'un flux sans les afficher ; l'API n'est pas encore dans lib.dom.
declare class MediaStreamTrackProcessor<T> {
  constructor(init: { track: MediaStreamTrack });
  readonly readable: ReadableStream<T>;
}

const api = window.pastille;
const FRAME_RATE = 10; // images par seconde : assez pour l'état d'avant un clic, peu coûteux

type Screen = { latest: VideoFrame | null; at: number };
type Frozen = { bitmap: ImageBitmap; frozenAt: number; frameAgeMs: number } | null;
const screens = new Map<number, Screen>();
const frozen = new Map<number, Promise<Frozen>>();

/** Un flux par écran, à sa taille physique ; seule la dernière image est gardée. */
async function film(source: VideoSource) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: source.sourceId,
        maxWidth: source.width,
        maxHeight: source.height,
        maxFrameRate: FRAME_RATE,
      },
    },
  } as unknown as MediaStreamConstraints);
  const screen: Screen = { latest: null, at: 0 };
  screens.set(source.displayId, screen);
  const reader = new MediaStreamTrackProcessor<VideoFrame>({ track: stream.getVideoTracks()[0]! }).readable.getReader();
  void (async () => {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      screen.latest?.close();
      screen.latest = value;
      screen.at = performance.now();
    }
  })();
}

/** Micro → PCM 16 kHz mono, comme la dictée de l'éditeur (même AudioWorklet). */
async function listen() {
  const audio = new AudioContext({ sampleRate: 16000 });
  await audio.audioWorklet.addModule(new URL('./pcm-worklet.js', document.baseURI).href);
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  const node = new AudioWorkletNode(audio, 'pcm-capture');
  node.port.onmessage = (e: MessageEvent<Float32Array>) => api.videoAudio(e.data);
  audio.createMediaStreamSource(stream).connect(node);
  node.connect(audio.destination); // le nœud ne produit que du silence
}

api.onVideoStart(async (sources) => {
  try {
    await Promise.all([...sources.map(film), listen()]);
    api.videoStarted();
  } catch (err) {
    api.videoStarted(String(err));
  }
});

// Au clic : la dernière image de l'écran est copiée tout de suite, avant que l'app cliquée ne réagisse.
api.onVideoFreeze(({ frameId, displayId }) => {
  const screen = screens.get(displayId);
  const frame = screen?.latest?.clone();
  const frozenAt = Date.now();
  const frameAgeMs = screen ? performance.now() - screen.at : 0;
  frozen.set(
    frameId,
    frame
      ? createImageBitmap(frame).then(
          (bitmap) => ({ bitmap, frozenAt, frameAgeMs }),
          () => null,
        ).finally(() => frame.close())
      : Promise.resolve(null),
  );
});

/** Image figée recadrée (PNG) et sa vignette en niveaux de gris ; sans rectangle, elle est jetée. */
api.onVideoCrop(async ({ frameId, rect }) => {
  const f = await frozen.get(frameId);
  frozen.delete(frameId);
  if (!f || !rect) {
    f?.bitmap.close();
    return api.videoCropped(frameId, null);
  }
  const { bitmap } = f;
  const sx = Math.round(rect.x * bitmap.width);
  const sy = Math.round(rect.y * bitmap.height);
  const width = Math.max(1, Math.min(Math.round(rect.width * bitmap.width), bitmap.width - sx));
  const height = Math.max(1, Math.min(Math.round(rect.height * bitmap.height), bitmap.height - sy));
  const canvas = new OffscreenCanvas(width, height);
  canvas.getContext('2d')!.drawImage(bitmap, sx, sy, width, height, 0, 0, width, height);
  bitmap.close();
  const png = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());

  const small = new OffscreenCanvas(VIDEO_THUMB.width, VIDEO_THUMB.height);
  const ctx = small.getContext('2d')!;
  ctx.drawImage(canvas, 0, 0, VIDEO_THUMB.width, VIDEO_THUMB.height);
  const rgba = ctx.getImageData(0, 0, VIDEO_THUMB.width, VIDEO_THUMB.height).data;
  const thumb = new Uint8Array(VIDEO_THUMB.width * VIDEO_THUMB.height);
  for (let i = 0; i < thumb.length; i++) thumb[i] = Math.round(0.3 * rgba[4 * i]! + 0.59 * rgba[4 * i + 1]! + 0.11 * rgba[4 * i + 2]!);

  api.videoCropped(frameId, { png, width, height, thumb, frozenAt: f.frozenAt, frameAgeMs: f.frameAgeMs });
});
