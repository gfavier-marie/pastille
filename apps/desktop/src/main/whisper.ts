// Transcription locale : whisper-server (whisper.cpp) tourne en processus enfant
// et garde le modèle en mémoire. Aucun import d'Electron ici, pour que le script
// de mesure puisse l'utiliser avec Node seul.

import { spawn, execFileSync } from 'node:child_process';
import { createWriteStream, existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { availableParallelism } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { renameRetry } from './rename.ts';

export const MODEL_FILE = 'ggml-large-v3-turbo-q5_0.bin';
export const MODEL_URL = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${MODEL_FILE}`;

// Le prompt initial oriente Whisper vers le jargon d'interface.
export const UI_PROMPT =
  "Retour d'interface : bouton, border-radius de 8 px, padding, margin, header, footer, " +
  'sidebar, navbar, modale, dropdown, hover, focus, flexbox, grid, z-index, opacité.';

/**
 * Contexte audio réduit pour les dictées courtes : l'encodeur traite sinon toujours 30 s,
 * même pour 5 s de parole (≈ 2 à 3 fois plus rapide). Mesuré sur M1 Pro : seuls les
 * multiples de 256 donnent un texte stable ; on garde une marge de 50 % et au moins 768.
 */
export function audioContextFor(durationMs: number): number {
  const frames = (durationMs / 1000) * 50 * 1.5; // 50 trames par seconde
  return Math.min(1500, Math.max(768, Math.ceil(frames / 256) * 256));
}

/** Avec un contexte réduit, Whisper répète parfois la fin en boucle (vu sur 5,8 s de dictée : 800
 *  caractères au lieu de 86). Un texte bien plus long que ce qu'on dit en ce temps-là est refait
 *  avec le contexte complet. On parle environ 15 caractères par seconde. */
export const looksRepeated = (text: string, durationMs: number) => text.length > 30 * (durationMs / 1000) + 30;

export type WhisperServer = {
  url: string;
  loadMs: number;
  transcribe(wav: Uint8Array): Promise<{ text: string; ms: number }>;
  stop(): void;
};

/** Cherche whisper-server : variable d'env, dossiers donnés (vendor/, ressources de l'app), puis PATH. */
export function findWhisperBin(dirs: string[]): string | undefined {
  const exe = process.platform === 'win32' ? 'whisper-server.exe' : 'whisper-server';
  const candidates = [process.env.PASTILLE_WHISPER_BIN, ...dirs.map((d) => join(d, exe))];
  for (const c of candidates) if (c && existsSync(c)) return c;
  try {
    const cmd = process.platform === 'win32' ? 'where' : 'which';
    return execFileSync(cmd, [exe], { encoding: 'utf8' }).split(/\r?\n/)[0]?.trim() || undefined;
  } catch {
    return undefined;
  }
}

export function findModel(dirs: string[]): string | undefined {
  const candidates = [process.env.PASTILLE_WHISPER_MODEL, ...dirs.map((d) => join(d, MODEL_FILE))];
  return candidates.find((c): c is string => !!c && existsSync(c));
}

/** Téléchargement avec progression ; le fichier n'apparaît qu'une fois complet. */
export async function downloadFile(url: string, dest: string, onProgress?: (done: number, total: number) => void) {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Téléchargement impossible (${res.status}) : ${url}`);
  const total = Number(res.headers.get('content-length') ?? 0);
  let done = 0;
  const body = Readable.fromWeb(res.body as never);
  body.on('data', (chunk: Buffer) => onProgress?.((done += chunk.length), total));
  await pipeline(body, createWriteStream(dest + '.part'));
  await renameRetry(dest + '.part', dest);
}

/** Moteur de secours : API compatible OpenAI (/audio/transcriptions), avec clé. L'audio quitte la machine. */
export async function transcribeWithApi(
  wav: Uint8Array,
  opts: { url: string; key: string; model: string; language: string; prompt: string },
): Promise<string> {
  const form = new FormData();
  form.append('file', new Blob([wav.slice()], { type: 'audio/wav' }), 'audio.wav');
  form.append('model', opts.model);
  form.append('language', opts.language);
  form.append('prompt', opts.prompt);
  const res = await fetch(`${opts.url.replace(/\/$/, '')}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${opts.key}` },
    body: form,
  });
  if (!res.ok) throw new Error(`API de transcription : HTTP ${res.status} ${await res.text()}`);
  return ((await res.json()) as { text?: string }).text ?? '';
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const address = srv.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

export async function startWhisperServer(opts: {
  bin: string;
  model: string;
  language?: string;
  prompt?: string;
}): Promise<WhisperServer> {
  const port = await freePort();
  const threads = Math.min(8, availableParallelism());
  const args = ['-m', opts.model, '-l', opts.language ?? 'fr', '-t', String(threads)];
  args.push('--host', '127.0.0.1', '--port', String(port));
  if (opts.prompt) args.push('--prompt', opts.prompt);

  const t0 = performance.now();
  const child = spawn(opts.bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (d: Buffer) => {
    stderr = (stderr + d.toString()).slice(-4000);
  });
  let exited = false;
  child.once('exit', () => (exited = true));

  const url = `http://127.0.0.1:${port}`;
  // Le serveur répond une fois le modèle chargé.
  for (;;) {
    if (exited) throw new Error(`whisper-server s'est arrêté au démarrage :\n${stderr}`);
    if (performance.now() - t0 > 120_000) {
      child.kill();
      throw new Error('whisper-server ne répond pas après 120 s');
    }
    try {
      const res = await fetch(url + '/');
      if (res.ok) break;
    } catch {
      // pas encore prêt
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  const loadMs = performance.now() - t0;

  return {
    url,
    loadMs,
    async transcribe(wav) {
      const durationMs = ((wav.byteLength - 44) / 32000) * 1000;
      const infer = async (audioCtx: number) => {
        const form = new FormData();
        form.append('file', new Blob([wav.slice()], { type: 'audio/wav' }), 'audio.wav');
        form.append('response_format', 'json');
        form.append('temperature', '0.0');
        form.append('audio_ctx', String(audioCtx));
        const res = await fetch(url + '/inference', { method: 'POST', body: form });
        if (!res.ok) throw new Error(`whisper-server : HTTP ${res.status} ${await res.text()}`);
        const body = (await res.json()) as { text?: string; error?: string };
        if (body.error) throw new Error(`whisper-server : ${body.error}`);
        return (body.text ?? '').trim();
      };
      const t = performance.now();
      const audioCtx = audioContextFor(durationMs);
      let text = await infer(audioCtx);
      if (audioCtx < 1500 && looksRepeated(text, durationMs)) text = await infer(1500);
      return { text, ms: performance.now() - t };
    },
    stop() {
      child.kill();
    },
  };
}
