// Stockage local : un dossier par session (session.json + captures/…), écrit de façon
// atomique avec un anti-rebond de 300 ms. La session ouverte se rouvre au démarrage.

import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { findAnnotation, newSession, renumber, upgradeSession, type Capture, type Inspiration, type Session } from '@pastille/shared';
import { renameRetry } from './rename.ts';

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

type State = { currentSessionId?: string };

export type SessionStore = ReturnType<typeof createSessionStore>;

/** `context` : contexte du projet (réglage), repris par chaque nouvelle session. */
export function createSessionStore(root: string, onChange: (s: Session | null) => void = () => {}, context: () => string = () => '') {
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
    await renameRetry(path + '.tmp', path);
  }

  /** Écritures de state.json l'une après l'autre : deux renommages du même .tmp en parallèle échouent. */
  let savingState = Promise.resolve();
  function saveState() {
    savingState = savingState
      .catch(() => {})
      .then(async () => {
        await mkdir(root, { recursive: true });
        await writeAtomic(statePath, JSON.stringify(state, null, 2));
      });
    return savingState;
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
    // Un échec est signalé à l'appelant sans bloquer les sauvegardes suivantes.
    saving = saving.catch(() => {}).then(() => writeAtomic(join(dirOf(s.id), 'session.json'), json));
    return saving;
  }

  /** Rouvre la session en cours au démarrage (après un crash ou une fermeture). */
  async function restore(): Promise<Session | null> {
    if (existsSync(statePath)) state = JSON.parse(await readFile(statePath, 'utf8')) as State;
    const path = state.currentSessionId && join(dirOf(state.currentSessionId), 'session.json');
    session = path && existsSync(path) ? upgradeSession(JSON.parse(await readFile(path, 'utf8')) as Session) : null;
    onChange(session);
    return session;
  }

  /** La session ouverte, créée à la première capture si besoin. */
  async function ensure(): Promise<Session> {
    if (session) return session;
    const s = newSession(new Date(), context() || undefined);
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

  /** Inspiration jointe à un point (annulable) ; l'image reste sur le disque pour que ⌘Z puisse la rétablir. */
  async function addInspiration(annotationId: string, png: Uint8Array, source?: Inspiration['source']) {
    const s = session;
    if (!s || !findAnnotation(s, annotationId)) return;
    const id = crypto.randomUUID();
    const inspiration: Inspiration = { id, image: `inspirations/${id}.png`, createdAt: new Date().toISOString(), source };
    await mkdir(join(dirOf(s.id), 'inspirations'), { recursive: true });
    await writeFile(join(dirOf(s.id), inspiration.image), png);
    update(
      (x) => {
        const a = findAnnotation(x, annotationId)?.annotation;
        if (a) a.inspirations = [...(a.inspirations ?? []), { ...inspiration }];
      },
      { undoable: true },
    );
  }

  /** Point resté vide (Échap) : retiré partout, historique compris, pour que ⌘Z ne le fasse pas revenir. */
  function discard(annotationId: string) {
    if (!session || !findAnnotation(session, annotationId)) return;
    update(
      (s) => {
        for (const c of s.captures) c.annotations = c.annotations.filter((a) => a.id !== annotationId);
        renumber(s);
      },
      { patchHistory: true },
    );
    // Les étapes devenues sans effet (création du point, frappe effacée) disparaissent : ⌘Z revient avant le point.
    const same = (a: Session, b: Session) => JSON.stringify({ ...a, updatedAt: '' }) === JSON.stringify({ ...b, updatedAt: '' });
    let next = session;
    for (let i = undoStack.length - 1; i >= 0; i--) {
      if (same(undoStack[i]!, next)) undoStack.splice(i, 1);
      else next = undoStack[i]!;
    }
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

  /** Sessions récentes, la plus récente d'abord (menu de l'icône). */
  async function recent(limit = 5) {
    const ids = existsSync(sessionsDir) ? await readdir(sessionsDir) : [];
    const list = [];
    for (const id of ids) {
      try {
        const s = JSON.parse(await readFile(join(dirOf(id), 'session.json'), 'utf8')) as Session;
        list.push({
          id: s.id,
          name: s.name,
          updatedAt: s.updatedAt,
          points: s.captures.reduce((n, c) => n + c.annotations.length, 0),
          screens: s.captures.length,
        });
      } catch {
        // dossier incomplet : ignoré
      }
    }
    return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, limit);
  }

  /** Rouvre une session (pour la compléter ou la réexporter). */
  async function open(id: string) {
    await flush();
    session = upgradeSession(JSON.parse(await readFile(join(dirOf(id), 'session.json'), 'utf8')) as Session);
    undoStack = [];
    redoStack = [];
    state.currentSessionId = id;
    await saveState();
    onChange(session);
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
    discard,
    undo,
    redo,
    recent,
    open,
    addCapture,
    addInspiration,
    flush,
    close,
  };
}
