// File de transcription en arrière-plan (§4.4, §8.1) : chaque dictée est écrite en WAV
// dans le dossier de session, le point (ou la remarque générale) passe à « pending », puis
// le texte s'ajoute à la fin du commentaire quand Whisper a fini. La file survit à un redémarrage.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { allAnnotations, findComment, type Session } from '@pastille/shared';
import type { SessionStore } from './session-store.ts';

type Job = { sessionId: string; annotationId: string; audio: string }; // annotationId : point ou remarque

/** Tout ce qui se dicte : commentaires des points, puis remarques générales. */
const comments = (s: Session) => [...allAnnotations(s), ...(s.notes ?? [])];

export function createDictation(store: SessionStore, transcribe: (wav: Uint8Array) => Promise<string>) {
  const queue: Job[] = [];
  let running = false;

  function setState(annotationId: string, patch: Parameters<typeof Object.assign>[1]) {
    store.update(
      (s) => {
        const found = findComment(s, annotationId);
        if (found) Object.assign(found, patch);
      },
      { patchHistory: true },
    );
  }

  async function pump() {
    if (running) return;
    running = true;
    while (queue.length) {
      const job = queue.shift()!;
      const session = store.get();
      if (!session || session.id !== job.sessionId) continue; // session fermée entre-temps
      try {
        const raw = await transcribe(new Uint8Array(await readFile(join(store.dir(session), job.audio))));
        const text = raw.replace(/\s+/g, ' ').trim(); // Whisper sépare ses segments par des retours à la ligne
        store.update(
          (s) => {
            const a = findComment(s, job.annotationId);
            if (!a) return;
            if (text) {
              a.input = a.text.trim() ? (a.input === 'dictated' ? 'dictated' : 'mixed') : 'dictated';
              a.text = [a.text.trim(), text].filter(Boolean).join(' ');
            }
            a.transcription = 'done';
            a.updatedAt = new Date().toISOString();
          },
          { patchHistory: true },
        );
      } catch (err) {
        console.error('Transcription en erreur :', err);
        setState(job.annotationId, { transcription: 'error' }); // l'audio est conservé pour « Réessayer »
      }
    }
    running = false;
  }

  return {
    /** Nouvelle dictée pour un point : enregistrée, mise en file, sans jamais bloquer l'interface. */
    async submit(annotationId: string, wav: Uint8Array) {
      const session = store.get();
      if (!session || !findComment(session, annotationId)) return;
      await mkdir(join(store.dir(session), 'audio'), { recursive: true });
      const audio = `audio/${annotationId}-${Date.now()}.wav`;
      await writeFile(join(store.dir(session), audio), wav);
      setState(annotationId, { transcription: 'pending', audio });
      queue.push({ sessionId: session.id, annotationId, audio });
      void pump();
    },

    /** « Réessayer » après une erreur, avec l'audio conservé. */
    retry(annotationId: string) {
      const session = store.get();
      const a = session && findComment(session, annotationId);
      if (!session || !a?.audio) return;
      setState(annotationId, { transcription: 'pending' });
      queue.push({ sessionId: session.id, annotationId, audio: a.audio });
      void pump();
    },

    /** Au démarrage : les dictées restées en attente repartent. */
    resume() {
      const session = store.get();
      if (!session) return;
      for (const a of comments(session)) {
        if (a.transcription === 'pending' && a.audio) queue.push({ sessionId: session.id, annotationId: a.id, audio: a.audio });
        if (a.transcription === 'recording') setState(a.id, { transcription: 'none' });
      }
      void pump();
    },

    /** Transcriptions en cours ou en erreur, nommées « #3 » ou « remarque 2 » (avertissement avant export). */
    unfinished() {
      const session = store.get();
      const list = session
        ? [
            ...allAnnotations(session).map((a) => [a.transcription, `#${a.number}`]),
            ...(session.notes ?? []).map((n, i) => [n.transcription, `remarque ${i + 1}`]),
          ]
        : [];
      return {
        pending: list.filter(([t]) => t === 'pending').map(([, label]) => label!),
        error: list.filter(([t]) => t === 'error').map(([, label]) => label!),
      };
    },
  };
}
