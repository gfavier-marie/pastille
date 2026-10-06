// Dictée côté éditeur (§4.4) : micro → PCM 16 kHz mono via l'AudioWorklet. Le flux est
// ouvert à l'avance (au raccourci de capture) pour que la voix démarre sans délai au clic,
// et ~200 ms d'audio avant le clic sont gardés. Un seul enregistrement à la fois.

export type RecorderState = { annotationId: string; elapsedMs: number; level: number } | null;

const VOICE_RMS = 0.015; // au-dessus : quelqu'un parle
const PRE_ROLL_CHUNKS = 2; // blocs de 100 ms gardés avant le clic

type Recording = { annotationId: string; chunks: Float32Array[]; startedAt: number; lastVoiceAt: number; heardVoice: boolean };

export function createRecorder(opts: {
  silenceMs: number; // 0 = pas d'arrêt sur silence
  maxMs: number;
  onState: (s: RecorderState) => void;
  onFinish: (annotationId: string, samples: Float32Array) => void;
}) {
  let ctx: AudioContext | null = null;
  let stream: MediaStream | null = null;
  let opening: Promise<void> | null = null;
  let recent: Float32Array[] = [];
  let rec: Recording | null = null;

  function onChunk(chunk: Float32Array) {
    let sum = 0;
    for (const v of chunk) sum += v * v;
    const level = Math.sqrt(sum / chunk.length);
    recent = [...recent, chunk].slice(-PRE_ROLL_CHUNKS);
    if (!rec) return;
    const now = performance.now();
    rec.chunks.push(chunk);
    if (level > VOICE_RMS) {
      rec.lastVoiceAt = now;
      rec.heardVoice = true;
    }
    const elapsed = now - rec.startedAt;
    if (elapsed >= opts.maxMs) stop(true);
    else if (opts.silenceMs && now - rec.lastVoiceAt >= opts.silenceMs) stop(true);
    else opts.onState({ annotationId: rec.annotationId, elapsedMs: elapsed, level });
  }

  /** Ouvre le micro (sans enregistrer). Appelé dès le raccourci de capture. */
  function open(): Promise<void> {
    if (ctx) return Promise.resolve();
    opening ??= (async () => {
      try {
        const audio = new AudioContext({ sampleRate: 16000 });
        await audio.audioWorklet.addModule(new URL('./pcm-worklet.js', document.baseURI).href);
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        const node = new AudioWorkletNode(audio, 'pcm-capture');
        node.port.onmessage = (e: MessageEvent<Float32Array>) => onChunk(e.data);
        audio.createMediaStreamSource(stream).connect(node);
        node.connect(audio.destination); // le nœud ne produit que du silence
        ctx = audio;
      } finally {
        opening = null;
      }
    })();
    return opening;
  }

  /** Démarre la dictée d'un point ; arrête et envoie celle en cours. */
  async function start(annotationId: string) {
    stop(true);
    await open();
    const now = performance.now();
    rec = { annotationId, chunks: [...recent], startedAt: now, lastVoiceAt: now, heardVoice: false };
    opts.onState({ annotationId, elapsedMs: 0, level: 0 });
  }

  /** Arrête la dictée : envoyée en transcription, ou jetée (Échap, frappe au clavier, rien entendu). */
  function stop(send: boolean) {
    const r = rec;
    if (!r) return;
    rec = null;
    opts.onState(null);
    if (!send || !r.heardVoice) return;
    const samples = new Float32Array(r.chunks.reduce((n, c) => n + c.length, 0));
    let offset = 0;
    for (const c of r.chunks) {
      samples.set(c, offset);
      offset += c.length;
    }
    opts.onFinish(r.annotationId, samples);
  }

  /** Libère le micro (fenêtre cachée) : l'indicateur système s'éteint. */
  function close() {
    stop(true);
    stream?.getTracks().forEach((t) => t.stop());
    void ctx?.close();
    stream = null;
    ctx = null;
    recent = [];
  }

  return { open, start, stop, close, current: () => rec?.annotationId ?? null };
}
