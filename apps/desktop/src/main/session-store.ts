// Stockage local : un dossier par session (session.json + captures/…), écrit de façon
// atomique avec un anti-rebond de 300 ms. La session ouverte se rouvre au démarrage.

import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { newSession, renumber, type Capture, type Session } from '@pastille/shared';

const SAVE_DELAY_MS = 300;
const HISTORY_LIMIT = 200;
const COALESCE_MS = 1500;

export type UpdateOptions = {
  /** Modification de l'utilisateur, annulable avec ⌘Z. */
  undoable?: boolean;
  /** Deux modifications de même clé rapprochées (frappe dans un commentaire) ne font qu'une étape. */
  coalesceKey?: string;
  /** Résultat arrivé en différé (transcription) : appliqué aussi à l'historique pour ne pas être perdu par ⌘Z. */
  patchHistory?: boolean;
};

type State = { currentSessionId?: string; lastContext?: string };

export type SessionStore = ReturnType<typeof createSessionStore>;

export function createSessionStore(root: string, onChange: (s: Session | null) => void = () => {}) {
  const sessionsDir = join(root, 'sessions');
  const statePath = join(root, 'state.json');
  let session: Session | null = null;
  let state: State = {};
  let timer: ReturnType<typeof setTimeout> | null = null;
  let undoStack: Session[] = [];
  let redoStack: Session[] = [];
  let lastPush = { key: '', at: 0 };
  let saving = Promise.resolve();

  const dirOf = (id: string) => join(sessionsDir, id);

  async function writeAtomic(path: string, data: string) {
    await writeFile(path + '.tmp', data);
    await rename(path + '.tmp', path);
  }

  async function saveState() {
    await mkdir(root, { recursive: true });
    await writeAtomic(statePath, JSON.stringify(state, null, 2));
  }

  function scheduleSave() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void flush(), SAVE_DELAY_MS);
  }

  /** Écrit immédiatement les modifications en attente. */
  async function flush() {
    if (timer) clearTimeout(timer);
    timer = null;
    const s = session;
    if (!s) return saving;
    const json = JSON.stringify(s, null, 2);
    saving = saving.then(() => writeAtomic(join(dirOf(s.id), 'session.json'), json));
    return saving;
  }

  /** Rouvre la session en cours au démarrage (après un crash ou une fermeture). */
  async function restore(): Promise<Session | null> {
    if (existsSync(statePath)) state = JSON.parse(await readFile(statePath, 'utf8')) as State;
    const path = state.currentSessionId && join(dirOf(state.currentSessionId), 'session.json');
    session = path && existsSync(path) ? (JSON.parse(await readFile(path, 'utf8')) as Session) : null;
    onChange(session);
    return session;
  }

  /** La session ouverte, créée à la première capture si besoin. */
  async function ensure(): Promise<Session> {
    if (session) return session;
    const s = newSession(new Date(), state.lastContext);
    await mkdir(join(dirOf(s.id), 'captures'), { recursive: true });
    session = s;
    state.currentSessionId = s.id;
    await saveState();
    await flush();
    onChange(session);
    return s;
  }

  /** Toute modification passe par ici : numérotation, horodatage, sauvegarde, notification. */
  function update(mutate: (s: Session) => void, opts: UpdateOptions = {}) {
    if (!session) return;
    if (opts.undoable) {
      const now = Date.now();
      const coalesce = opts.coalesceKey && opts.coalesceKey === lastPush.key && now - lastPush.at < COALESCE_MS;
      if (!coalesce) undoStack = [...undoStack, structuredClone(session)].slice(-HISTORY_LIMIT);
      lastPush = { key: opts.coalesceKey ?? '', at: now };
      redoStack = [];
    }
    if (opts.patchHistory) for (const snapshot of [...undoStack, ...redoStack]) mutate(snapshot);
    mutate(session);
    commit();
  }

  function commit() {
    if (!session) return;
    renumber(session);
    session.updatedAt = new Date().toISOString();
    if (session.context !== state.lastContext) {
      state.lastContext = session.context;
      void saveState();
    }
    scheduleSave();
    onChange(session);
  }

  async function addCapture(
    png: Uint8Array,
    meta: Pick<Capture, 'width' | 'height' | 'scaleFactor' | 'source'>,
  ): Promise<Capture> {
    const s = await ensure();
    const capture: Capture = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      image: '',
      ...meta,
      annotations: [],
    };
    capture.image = `captures/${capture.id}.png`;
    await mkdir(join(dirOf(s.id), 'captures'), { recursive: true });
    await writeFile(join(dirOf(s.id), capture.image), png);
    // Une capture n'est pas annulable : elle est ajoutée aussi à l'historique.
    update((x) => x.captures.push(structuredClone(capture)), { patchHistory: true });
    return capture;
  }

  /** Annuler (⌘Z) / rétablir (⌘⇧Z) : la session revient à l'état précédent. */
  function undo() {
    const previous = undoStack.pop();
    if (!session || !previous) return;
    redoStack.push(session);
    session = previous;
    lastPush = { key: '', at: 0 };
    commit();
  }

  function redo() {
    const next = redoStack.pop();
    if (!session || !next) return;
    undoStack.push(session);
    session = next;
    commit();
  }

  /** « Nouvelle session » : la session actuelle est fermée, la suivante naîtra à la prochaine capture. */
  async function close() {
    await flush();
    undoStack = [];
    redoStack = [];
    session = null;
    state.currentSessionId = undefined;
    await saveState();
    onChange(null);
  }

  return {
    get: () => session,
    dir: (s: Session) => dirOf(s.id),
    sessionsDir,
    restore,
    ensure,
    update,
    undo,
    redo,
    addCapture,
    flush,
    close,
  };
}
