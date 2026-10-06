// Moteur de transcription : Whisper local par défaut (whisper-server gardé en mémoire),
// API compatible OpenAI en secours si elle est choisie dans les réglages.

import type { WhisperStatus } from '../ipc.ts';
import type { createSettings } from './settings.ts';
import { findModel, findWhisperBin, startWhisperServer, transcribeWithApi, type WhisperServer } from './whisper.ts';

export function createTranscriber(opts: {
  binDirs: string[];
  modelDirs: string[];
  settings: ReturnType<typeof createSettings>;
}) {
  let server: WhisperServer | null = null;
  let status: WhisperStatus = { state: 'loading' };
  let ready: Promise<void> = Promise.resolve();

  async function load() {
    server?.stop();
    server = null;
    status = { state: 'loading' };
    const bin = findWhisperBin(opts.binDirs);
    const model = findModel(opts.modelDirs);
    if (!bin || !model) {
      status = { state: 'missing', detail: !model ? 'Modèle Whisper absent : télécharge-le dans les réglages.' : 'whisper-server introuvable.' };
      return;
    }
    const { language, glossary } = opts.settings.get();
    try {
      server = await startWhisperServer({ bin, model, language, prompt: glossary });
      status = { state: 'ready', loadMs: server.loadMs };
    } catch (err) {
      status = { state: 'error', detail: String(err) };
    }
  }

  return {
    /** (Re)démarre Whisper local, par exemple après un changement de langue ou de glossaire. */
    restart() {
      ready = load();
      return ready;
    },
    status: () => status,
    server: () => server,
    /** Dictée possible : moteur API configuré, ou Whisper local présent (même en cours de chargement). */
    available() {
      const s = opts.settings.get();
      if (s.engine === 'api') return !!opts.settings.apiKey();
      return status.state === 'loading' || status.state === 'ready';
    },
    async transcribe(wav: Uint8Array): Promise<string> {
      const s = opts.settings.get();
      if (s.engine === 'api') {
        return transcribeWithApi(wav, {
          url: s.apiUrl,
          key: opts.settings.apiKey(),
          model: s.apiModel,
          language: s.language,
          prompt: s.glossary,
        });
      }
      await ready;
      if (!server) throw new Error(`Transcription indisponible : ${JSON.stringify(status)}`);
      return (await server.transcribe(wav)).text;
    },
    stop: () => server?.stop(),
  };
}
