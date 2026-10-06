// Transcription locale : whisper-server (whisper.cpp) tourne en processus enfant
// et garde le modèle en mémoire. Aucun import d'Electron ici, pour que le script
// de mesure puisse l'utiliser avec Node seul.

import { spawn, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { availableParallelism } from 'node:os';
import { join } from 'node:path';

export const MODEL_FILE = 'ggml-large-v3-turbo-q5_0.bin';

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

export type WhisperServer = {
  url: string;
  loadMs: number;
  transcribe(wav: Uint8Array): Promise<{ text: string; ms: number }>;
  stop(): void;
};

/** Cherche whisper-server : variable d'env, dossier vendor/ du dépôt, puis PATH. */
export function findWhisperBin(repoRoot: string): string | undefined {
  const exe = process.platform === 'win32' ? 'whisper-server.exe' : 'whisper-server';
  const candidates = [process.env.PASTILLE_WHISPER_BIN, join(repoRoot, 'vendor', 'whisper', exe)];
  for (const c of candidates) if (c && existsSync(c)) return c;
  try {
    const cmd = process.platform === 'win32' ? 'where' : 'which';
    return execFileSync(cmd, [exe], { encoding: 'utf8' }).split(/\r?\n/)[0]?.trim() || undefined;
  } catch {
    return undefined;
  }
}

export function findModel(repoRoot: string): string | undefined {
  const candidates = [process.env.PASTILLE_WHISPER_MODEL, join(repoRoot, 'models', MODEL_FILE)];
  return candidates.find((c): c is string => !!c && existsSync(c));
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
      const form = new FormData();
      form.append('file', new Blob([wav.slice()], { type: 'audio/wav' }), 'audio.wav');
      form.append('response_format', 'json');
      form.append('temperature', '0.0');
      form.append('audio_ctx', String(audioContextFor(((wav.byteLength - 44) / 32000) * 1000)));
      const t = performance.now();
      const res = await fetch(url + '/inference', { method: 'POST', body: form });
      if (!res.ok) throw new Error(`whisper-server : HTTP ${res.status} ${await res.text()}`);
      const body = (await res.json()) as { text?: string; error?: string };
      if (body.error) throw new Error(`whisper-server : ${body.error}`);
      return { text: (body.text ?? '').trim(), ms: performance.now() - t };
    },
    stop() {
      child.kill();
    },
  };
}
