// Éditeur d'annotations (§4.3) : en haut la session et l'export, au centre la capture,
// à droite les points de la capture, en bas les vignettes de la session.

import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { allAnnotations, type Annotation, type Note, type Session } from '@pastille/shared';
import { imageUrl, type ExportFormat, type SessionSummary, type SettingsState } from '../../ipc.ts';
import * as I from '../icons.tsx';
import { T } from '../texts.ts';
import { createRecorder, type RecorderState } from './recorder.ts';
import { Stage } from './Stage.tsx';
import { Wave, WAVE_BARS, clock } from '../dictation-feedback.tsx';

const api = window.pastille;
const isMac = navigator.userAgent.includes('Mac');
const MOD = isMac ? '⌘' : 'Ctrl+';
const BUBBLE_WIDTH = 312;

/** Numéro d'un point : goutte pour un point, rond pour une zone ou une flèche. */
const Badge = ({ a }: { a: Annotation }) => (
  <span className={`badge ${a.geometry.kind === 'point' ? 'point' : ''} ${a.number > 99 ? 'wide' : ''}`}>{a.number}</span>
);
const isTyping = (t: EventTarget | null) => t instanceof HTMLTextAreaElement || t instanceof HTMLInputElement;

/** Image collée ou déposée (PNG, JPEG, WebP…) convertie en PNG ; null si illisible. */
async function toPng(file: File): Promise<Uint8Array | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
    return new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
  } catch {
    return null;
  }
}

/** Texte modifiable : état local pendant la saisie, envoyé au processus principal à chaque frappe. */
function EditableText(props: {
  value: string;
  onChange: (text: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  className?: string;
}) {
  const [text, setText] = useState(props.value);
  const focused = useRef(false);
  const sent = useRef<string[]>([]); // frappes envoyées, qui reviennent du processus principal
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    // Pendant la saisie, seul un changement venu d'ailleurs (transcription, ⌘Z) remplace le texte.
    if (focused.current && sent.current.includes(props.value)) return;
    sent.current = [];
    setText(props.value);
  }, [props.value]);
  useEffect(() => {
    // Hauteur ajustée au contenu.
    const el = ref.current!;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);
  return (
    <textarea
      ref={ref}
      className={props.className}
      rows={1}
      value={text}
      placeholder={props.placeholder}
      autoFocus={props.autoFocus}
      onFocus={(e) => {
        focused.current = true;
        if (props.autoFocus) e.currentTarget.setSelectionRange(text.length, text.length);
      }}
      onBlur={() => (focused.current = false)}
      onChange={(e) => {
        setText(e.target.value);
        sent.current = [...sent.current, e.target.value].slice(-50);
        props.onChange(e.target.value);
      }}
      onKeyDown={props.onKeyDown}
    />
  );
}

/** Toutes les sessions, la plus récente d'abord : ouvrir, réexporter le PDF, mettre à la corbeille. */
function SessionsPanel(props: { currentId?: string; onOpen: (id: string) => void; onExport: (id: string) => void; onClose: () => void }) {
  const [list, setList] = useState<SessionSummary[] | null>(null);
  const load = () => void api.listSessions().then(setList);
  useEffect(load, []);
  return (
    <div className="sessions-backdrop" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <section className="sessions" role="dialog" aria-label={T.editor.allSessions}>
        <div className="sessions-head">
          <h2>{T.editor.allSessions}</h2>
          <button type="button" className="nav-btn" aria-label={T.editor.close} onClick={props.onClose}>
            <I.Close size={11} />
          </button>
        </div>
        {list?.length === 0 && <p className="none">{T.editor.noSessions}</p>}
        <ul>
          {list?.map((r) => (
            <li key={r.id} className={r.id === props.currentId ? 'current' : ''}>
              <button type="button" className="open" aria-label={T.editor.openSession(r.name)} onClick={() => props.onOpen(r.id)}>
                <span className="title">{r.name}</span>
                <span className="meta">
                  {T.points(r.points)} · {T.screens(r.screens)} · {T.day(r.updatedAt)}
                </span>
              </button>
              {r.id === props.currentId && <span className="tag">{T.editor.sessionOpen}</span>}
              <button
                type="button"
                className="tool"
                aria-label={T.editor.exportSession(r.name)}
                title={T.editor.exportSession(r.name)}
                disabled={r.screens === 0}
                onClick={() => props.onExport(r.id)}
              >
                <I.Export size={14} />
              </button>
              <button
                type="button"
                className="tool"
                aria-label={T.editor.trashSession(r.name)}
                title={T.editor.trashSession(r.name)}
                onClick={() => void api.trashSession(r.id).then((done) => done && load())}
              >
                <I.Trash size={14} />
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [captureId, setCaptureId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [bubbleOpen, setBubbleOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [exportMenu, setExportMenu] = useState(false);
  const [sessionsOpen, setSessionsOpen] = useState(false); // liste de toutes les sessions
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const [rec, setRec] = useState<RecorderState>(null);
  const levels = useRef<number[]>([]);
  const [tab, setTab] = useState<'points' | 'notes'>('points'); // onglet du panneau de droite
  const [shortcut, setShortcut] = useState(isMac ? '⌃⌥⌘P' : 'Ctrl+Alt+P');
  const [tablet, setTablet] = useState(false);
  const [zoomed, setZoomed] = useState<string | null>(null); // croquis ou inspiration agrandi
  const [newNoteId, setNewNoteId] = useState<string | null>(null); // remarque juste ajoutée, à mettre au focus
  const activeNote = useRef<string | null>(null); // remarque en cours de saisie
  const [commentMode, setCommentMode] = useState<SettingsState['commentMode']>('auto');
  // Whisper présent (ou en cours de chargement) : sinon, saisie au clavier seulement.
  const [canDictate] = useState(() => api.dictationAvailable());
  // Mode de commentaire et délai de silence suivent les réglages.
  const prefs = useRef<Pick<SettingsState, 'commentMode' | 'silenceMs'>>({ commentMode: 'auto', silenceMs: 3000 });
  // Dictées envoyées en transcription : « en attente » avant même que le processus principal le dise.
  const submitted = useRef(new Set<string>());
  const [recorder] = useState(() =>
    createRecorder({
      silenceMs: () => prefs.current.silenceMs,
      maxMs: 60_000,
      onState: (state) => {
        levels.current = state ? [...levels.current, state.level].slice(-WAVE_BARS) : [];
        setRec(state);
      },
      onFinish: (id, samples) => {
        submitted.current.add(id);
        api.submitDictation(id, samples);
      },
    }),
  );

  /** Dictée automatique : poser un point lance l'enregistrement (§4.4). */
  function autoDictation(annotationId: string) {
    if (prefs.current.commentMode === 'auto') startDictation(annotationId);
  }

  function startDictation(annotationId: string) {
    void canDictate
      .then((ok) => (ok ? recorder.start(annotationId) : undefined))
      .catch((err) => setToast({ text: T.editor.micError(err), error: true }));
  }

  useEffect(() => {
    void api.getSession().then(setSession);
    const offSession = api.onSession(setSession);
    const offFocus = api.onFocus((f) => {
      setTab('points');
      setCaptureId(f.captureId);
      setSelectedId(f.annotationId ?? null);
      setBubbleOpen(!!f.openBubble);
      if (f.annotationId && f.openBubble && f.dictate) autoDictation(f.annotationId);
    });
    void api.tabletStatus().then(setTablet);
    const applyPrefs = (s: SettingsState) => {
      prefs.current = { commentMode: s.commentMode, silenceMs: s.silenceMs };
      setCommentMode(s.commentMode);
      setShortcut(s.shortcutLabel);
    };
    void api.getSettings().then(applyPrefs);
    const offSettings = api.onSettingsChanged(applyPrefs);
    const offTablet = api.onTabletStatus(setTablet);
    const offSessions = api.onShowSessions(() => setSessionsOpen(true));
    // Micro préparé au raccourci : la capture masque l'éditeur, mais le micro reste ouvert pour la dictée qui suit.
    let preparing = false;
    const offMic = api.onPrepareMic(() => {
      preparing = true;
      void canDictate.then((ok) => (ok ? recorder.open() : undefined)).catch(() => {});
    });
    // Fenêtre cachée (hors capture) : la dictée en cours part en transcription et le micro est libéré.
    const onVisibility = () => {
      if (!document.hidden) preparing = false;
      else if (!preparing) recorder.close();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      offSession();
      offFocus();
      offMic();
      offTablet();
      offSettings();
      offSessions();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  // Onglet Points : plus de remarque en cours de saisie, ni à remettre au focus.
  useEffect(() => {
    if (tab !== 'points') return;
    activeNote.current = null;
    setNewNoteId(null);
  }, [tab]);

  // La tablette dessine toujours pour le point sélectionné (§2).
  useEffect(() => api.setSelection(selectedId), [selectedId]);
  // L'icône de la barre de menus passe en couleur pendant la dictée.
  useEffect(() => api.setRecording(rec !== null), [rec !== null]);

  const captures = session?.captures ?? [];
  const capture = captures.find((c) => c.id === captureId) ?? captures.at(-1);
  const ordered = session ? allAnnotations(session) : [];
  const selected = ordered.find((a) => a.id === selectedId);

  function select(a: Annotation | undefined, openBubble: boolean) {
    if (!a || !session) return;
    recorder.stop(true);
    const owner = session.captures.find((c) => c.annotations.some((x) => x.id === a.id));
    if (owner) setCaptureId(owner.id);
    setSelectedId(a.id);
    setBubbleOpen(openBubble);
    setTab('points');
  }

  /** Point sans rien : ni texte, ni dictée envoyée, en attente ou en erreur, ni croquis, ni inspiration. */
  const isEmpty = (a: Annotation, text = a.text) =>
    !text.trim() &&
    a.transcription !== 'pending' &&
    a.transcription !== 'error' &&
    !submitted.current.has(a.id) &&
    !a.sketches.length &&
    !a.inspirations?.length;

  /** Échap sur un point vide (posé par erreur) : il est retiré, sans étape d'annulation. */
  function discard(id: string) {
    api.discardAnnotation(id);
    setSelectedId(null);
    setBubbleOpen(false);
  }

  /** Nouvelle remarque générale : comme un point posé, le micro s'ouvre en dictée automatique. */
  async function addNote() {
    recorder.stop(true);
    setBubbleOpen(false);
    const id = await api.addNote();
    setNewNoteId(id);
    autoDictation(id);
  }

  async function runExport(format: ExportFormat) {
    setExportMenu(false);
    setToast({ text: T.editor.exporting[format] });
    const r = await api.exportSession(format);
    setToast(r.ok ? { text: T.editor.exported(r.path) } : { text: r.error, error: true });
    setTimeout(() => setToast(null), 5000);
  }

  /** Une session de la liste s'ouvre dans l'éditeur ; « Exporter » l'ouvre puis exporte son PDF. */
  async function openSession(id: string, exportPdf = false) {
    recorder.stop(true);
    setSessionsOpen(false);
    if (id !== session?.id) {
      await api.openSession(id);
      setCaptureId(null);
      setSelectedId(null);
      setBubbleOpen(false);
    }
    if (exportPdf) void runExport('pdf');
  }

  const sessionsPanel = sessionsOpen && (
    <SessionsPanel
      currentId={session?.id}
      onOpen={(id) => void openSession(id)}
      onExport={(id) => void openSession(id, true)}
      onClose={() => setSessionsOpen(false)}
    />
  );

  // Mode « appuyer pour parler » : ⌥ (Alt) maintenu enregistre pour le point sélectionné.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const target = activeNote.current ?? selectedId;
      if (e.key !== 'Alt' || e.repeat || prefs.current.commentMode !== 'push' || !target) return;
      e.preventDefault();
      if (!activeNote.current) {
        setBubbleOpen(true);
        setTab('points');
      }
      startDictation(target);
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === 'Alt' && prefs.current.commentMode === 'push') recorder.stop(true);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  });

  // Raccourcis (§4.6).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (sessionsOpen) {
        // Liste des sessions ouverte : seul Échap agit (la fermer).
        if (e.key === 'Escape') setSessionsOpen(false);
        return;
      }
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        void runExport('pdf');
        return;
      }
      if (mod && e.key.toLowerCase() === 'm' && selectedId) {
        // Re-dicter : le texte s'ajoutera à la fin du commentaire.
        e.preventDefault();
        setBubbleOpen(true);
        setTab('points');
        startDictation(selectedId);
        return;
      }
      if (e.key === 'Tab' && ordered.length) {
        e.preventDefault();
        const i = ordered.findIndex((a) => a.id === selectedId);
        const next = e.shiftKey ? (i <= 0 ? ordered.length - 1 : i - 1) : (i + 1) % ordered.length;
        select(ordered[next], true);
        return;
      }
      if (isTyping(e.target)) return;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) api.redo();
        else api.undo();
      } else if (!isMac && e.ctrlKey && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        api.redo();
      } else if ((e.key === 'Backspace' || e.key === 'Delete') && selectedId) {
        if (recorder.current() === selectedId) recorder.stop(false);
        api.deleteAnnotation(selectedId);
        setSelectedId(null);
        setBubbleOpen(false);
      } else if (e.key === 'Enter' && selectedId) {
        e.preventDefault();
        setBubbleOpen(true);
      } else if (e.key === 'Escape') {
        recorder.stop(false);
        if (selected && isEmpty(selected)) discard(selected.id);
        setSelectedId(null);
        setBubbleOpen(false);
      } else if ((e.key === 'PageDown' || e.key === 'PageUp') && capture) {
        const i = captures.findIndex((c) => c.id === capture.id);
        const next = captures[e.key === 'PageDown' ? i + 1 : i - 1];
        if (next) {
          setCaptureId(next.id);
          setSelectedId(null);
          setBubbleOpen(false);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Image collée (⌘V) ou déposée : elle devient une inspiration du point sélectionné.
  useEffect(() => {
    const flash = (text: string) => {
      setToast({ text, error: true });
      setTimeout(() => setToast(null), 4000);
    };
    const attach = (files: FileList | undefined) => {
      const file = [...(files ?? [])].find((f) => f.type.startsWith('image/'));
      if (!file) return false;
      if (!selectedId) flash(T.editor.imageNeedsPoint);
      else {
        const id = selectedId;
        void toPng(file).then((png) => (png ? api.importInspiration(id, png) : flash(T.editor.unreadableImage)));
      }
      return true;
    };
    const onPaste = (e: ClipboardEvent) => {
      // Du texte collé dans un commentaire reste du texte.
      if (isTyping(e.target) && e.clipboardData?.types.includes('text/plain')) return;
      if (attach(e.clipboardData?.files)) e.preventDefault();
    };
    // Sans ceci, un fichier déposé remplace l'éditeur dans la fenêtre.
    const onDragOver = (e: DragEvent) => e.preventDefault();
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      attach(e.dataTransfer?.files);
    };
    window.addEventListener('paste', onPaste);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('paste', onPaste);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
  });

  // « Nouvelle capture » : au bout des vignettes, et dans l'éditeur vide.
  const newCapture = (
    <button type="button" className="btn primary new-capture" onClick={() => api.startCapture()}>
      <I.Plus size={14} />
      {T.editor.newCapture}
      <kbd>{shortcut}</kbd>
    </button>
  );

  if (!session || !capture) {
    return (
      <div className={`empty ${isMac ? 'mac' : ''}`}>
        <I.Logo size={40} />
        <h1>{T.editor.emptyTitle}</h1>
        <p>
          {T.editor.emptyBefore} <kbd>{shortcut}</kbd> {T.editor.emptyAfter}
        </p>
        <div className="actions">
          {newCapture}
          <button type="button" className="btn" onClick={() => setSessionsOpen(true)}>
            <I.Folder size={14} />
            {T.editor.allSessions}
          </button>
        </div>
        {sessionsPanel}
      </div>
    );
  }

  const bubbleKeys = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Escape') {
      // Entrée : la dictée part en transcription ; Échap : elle est jetée.
      e.preventDefault();
      recorder.stop(e.key === 'Enter');
      setBubbleOpen(false);
      e.currentTarget.blur();
    } else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
      recorder.stop(false); // taper au clavier annule la dictée et passe en saisie
    }
  };

  /** Clavier de la bulle : Échap retire aussi un point resté vide, comme une remarque vide. */
  const pointKeys = (a: Annotation) => (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape' && isEmpty(a, e.currentTarget.value)) {
      e.preventDefault();
      recorder.stop(false);
      discard(a.id);
    } else bubbleKeys(e);
  };

  /** Clavier d'une remarque : comme la bulle, plus Échap qui retire une remarque vide et ⌘Z qui revient en arrière. */
  const noteKeys = (n: Note) => (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const mod = isMac ? e.metaKey : e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z') {
      // Annulation de la session (ajout, dictée, suppression compris), pas seulement de la frappe.
      e.preventDefault();
      e.currentTarget.blur();
      if (e.shiftKey) api.redo();
      else api.undo();
    } else if (e.key === 'Escape' && !e.currentTarget.value.trim() && n.transcription !== 'pending') {
      e.preventDefault();
      recorder.stop(false);
      api.deleteNote(n.id);
    } else bubbleKeys(e);
  };

  const recording = (a: Note) => (rec?.annotationId === a.id ? rec : null);

  /** Micro d'un point (bulle et liste) : relance la dictée, le texte s'ajoute à la fin ; pendant la dictée, l'arrête. */
  const micButton = (id: string, on: boolean) =>
    commentMode !== 'keyboard' && (
      <button
        type="button"
        className={`mic ${on ? 'on' : ''}`}
        aria-label={on ? T.editor.stopDictation : T.editor.dictateMore(MOD)}
        title={on ? T.editor.stopDictation : T.editor.dictateMore(MOD)}
        onMouseDown={(e) => e.preventDefault()} // la saisie en cours garde le focus
        onClick={() => {
          if (on) return recorder.stop(true);
          setBubbleOpen(true);
          startDictation(id);
        }}
      >
        <I.Mic size={12} />
      </button>
    );
  const kind = (a: Annotation) => T.editor.kinds[a.geometry.kind];

  /** Ligne d'état d'un point ou d'une remarque : transcription en cours ou en erreur. */
  const status = (a: Note, what: string) =>
    a.transcription === 'pending' ? (
      <div className="status">
        <I.Spinner size={11} />
        {what} · {T.editor.transcribing}
      </div>
    ) : a.transcription === 'error' ? (
      <div className="status error">
        <I.Warning size={12} />
        {T.editor.transcriptionError}
        <button type="button" className="retry" onClick={() => api.retryDictation(a.id)}>
          {T.editor.retry}
        </button>
      </div>
    ) : null;

  /** Vignettes d'un point, croquis ou inspirations : clic = agrandir, croix = supprimer. */
  const gallery = (a: Annotation, kind: 'sketch' | 'inspiration') => {
    const sketch = kind === 'sketch';
    const items = sketch
      ? a.sketches.map((k) => ({ id: k.id, image: k.png, source: '' }))
      : (a.inspirations ?? []).map((k) => ({ id: k.id, image: k.image, source: [k.source?.app, k.source?.windowTitle].filter(Boolean).join(' — ') }));
    return (
      items.length > 0 && (
        <div className="sketches">
          {items.map((k) => (
            <span key={k.id} className="sketch" title={k.source || undefined}>
              <button type="button" aria-label={sketch ? T.editor.zoomSketch : T.editor.zoomInspiration} onClick={() => setZoomed(imageUrl(session, k.image))}>
                <img src={imageUrl(session, k.image)} alt="" />
              </button>
              <button
                type="button"
                className="remove"
                aria-label={sketch ? T.editor.deleteSketch : T.editor.deleteInspiration}
                onClick={() => (sketch ? api.deleteSketch(a.id, k.id) : api.deleteInspiration(a.id, k.id))}
              >
                <I.Close size={9} />
              </button>
            </span>
          ))}
          <span className="count">{sketch ? T.editor.sketches(items.length) : T.editor.inspirations(items.length)}</span>
        </div>
      )
    );
  };

  const notes = session.notes ?? [];
  const index = captures.indexOf(capture);
  const pending = ordered.filter((a) => a.transcription === 'pending').length;
  const goTo = (i: number) => {
    const next = captures[i];
    if (!next) return;
    setCaptureId(next.id);
    setSelectedId(null);
    setBubbleOpen(false);
  };

  /** Supprime un écran et ses points (⌘Z le fait revenir) ; l'écran voisin prend sa place. */
  function deleteCapture(i: number) {
    const c = captures[i]!;
    if (c.annotations.some((a) => a.id === recorder.current())) recorder.stop(false);
    if (c.id === capture!.id) {
      setCaptureId((captures[i + 1] ?? captures[i - 1])?.id ?? null);
      setSelectedId(null);
      setBubbleOpen(false);
    }
    api.deleteCapture(c.id);
    setToast({ text: T.editor.screenDeleted(i + 1, MOD) });
    setTimeout(() => setToast(null), 4000);
  }

  return (
    <div className={`editor ${isMac ? 'mac' : ''}`}>
      <header>
        <button type="button" className="crumb" onClick={() => setSessionsOpen(true)}>
          {T.editor.sessions}
        </button>
        <span className="crumb-sep" aria-hidden="true">
          /
        </span>
        {renaming ? (
          <input
            className="name-input"
            aria-label={T.editor.rename}
            autoFocus
            defaultValue={session.name}
            onBlur={(e) => {
              api.updateSession({ name: e.target.value.trim() || session.name });
              setRenaming(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') setRenaming(false);
            }}
          />
        ) : (
          <button type="button" className="name" aria-label={T.editor.rename} onClick={() => setRenaming(true)}>
            <span>{session.name}</span>
            <I.Pencil size={13} />
          </button>
        )}
        <span className="count">
          {T.points(ordered.length)} · {T.screens(captures.length)}
        </span>
        <span className="spacer" />
        {tablet && (
          <span className="chip">
            <I.Tablet size={13} />
            {T.editor.tablet}
            <span className="dot" />
          </span>
        )}
        {pending > 0 && (
          <span className="chip">
            <I.Spinner size={11} />
            {T.transcriptions(pending)}
          </span>
        )}
        <div className="export">
          <button type="button" className="btn primary" aria-haspopup="menu" aria-expanded={exportMenu} onClick={() => setExportMenu((v) => !v)}>
            <I.Export size={15} />
            {T.editor.export}
            <kbd>{MOD}E</kbd>
          </button>
          {exportMenu && (
            <div className="menu" role="menu">
              {(['pdf', 'markdown', 'pptx'] as const).map((f) => (
                <button type="button" role="menuitem" key={f} onClick={() => void runExport(f)}>
                  {T.editor.formats[f]}
                  {f === 'pdf' && <kbd>{MOD}E</kbd>}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      <main>
        <Stage
          capture={capture}
          imageUrl={imageUrl(session, capture.image)}
          selectedId={selectedId}
          nextNumber={captures.slice(0, index + 1).reduce((n, c) => n + c.annotations.length, 0) + 1}
          onSelect={(id, open) => {
            recorder.stop(true);
            setSelectedId(id);
            setBubbleOpen(open);
            if (id) setTab('points');
          }}
          onAdd={async (geometry) => {
            const id = await api.addAnnotation(capture.id, geometry);
            setSelectedId(id);
            setBubbleOpen(true);
            setTab('points');
            autoDictation(id);
          }}
          onMove={(id, geometry) => api.updateAnnotation(id, { geometry })}
          bubble={(pin, stage) => {
            if (!bubbleOpen || !selected) return null;
            // À droite de la pastille, ou à gauche si la place manque ; toujours dans la scène.
            let left = pin.x + pin.r + 12;
            if (left + BUBBLE_WIDTH > stage.w - 12) left = Math.max(12, pin.x - pin.r - 12 - BUBBLE_WIDTH);
            const top = Math.max(12, Math.min(pin.y - pin.r + 4, stage.h - 300)); // place pour une bulle avec croquis et inspiration
            const r = recording(selected);
            return (
              <section className="bubble" aria-label={T.editor.bubbleLabel(selected.number)} style={{ left, top }} key={selected.id}>
                <div className="bubble-head">
                  <span className="num">
                    {r && <span className="rec-dot blink" />}#{selected.number}
                  </span>
                  {r ? <Wave levels={levels.current} /> : <span className="spacer" />}
                  {r && <span className="time">{clock(r.elapsedMs)}</span>}
                  {micButton(selected.id, r !== null)}
                </div>
                <EditableText
                  className="field"
                  value={selected.text}
                  autoFocus
                  placeholder={r ? T.editor.placeholderRecording : T.editor.placeholder}
                  onChange={(text) => api.updateAnnotation(selected.id, { text })}
                  onKeyDown={pointKeys(selected)}
                />
                {status(selected, kind(selected))}
                {gallery(selected, 'sketch')}
                {tablet && selected.sketches.length === 0 && (
                  <div className="meta">
                    <I.Tablet size={13} />
                    {T.editor.sketchHint}
                  </div>
                )}
                <div className="meta">
                  <button
                    type="button"
                    className="inspire"
                    title={T.editor.inspirationTitle(shortcut, MOD)}
                    onMouseDown={(e) => e.preventDefault()} // la saisie en cours garde le focus
                    onClick={() => {
                      recorder.stop(true); // la dictée en cours part en transcription
                      api.captureInspiration(selected.id);
                    }}
                  >
                    <I.Picture size={13} />
                    {T.editor.inspiration}
                  </button>
                  {T.editor.inspirationHint(shortcut, MOD)}
                </div>
                {gallery(selected, 'inspiration')}
                <div className="keys">
                  {[...T.editor.keys, ...(r ? [T.editor.keyToType] : commentMode !== 'keyboard' ? [T.editor.keyDictate(MOD)] : [])].map(([key, text]) => (
                    <span key={key}>
                      <b>{key}</b> {text}
                    </span>
                  ))}
                </div>
              </section>
            );
          }}
        />

        <aside aria-label={T.editor.panel}>
          <div className="segmented" role="tablist" aria-label={T.editor.panel}>
            <button type="button" role="tab" aria-selected={tab === 'points'} onClick={() => setTab('points')}>
              {T.editor.pointsTab}
            </button>
            <button type="button" role="tab" aria-selected={tab === 'notes'} onClick={() => setTab('notes')}>
              {T.editor.notes}
              {notes.length > 0 && <span className="tab-count">{notes.length}</span>}
            </button>
          </div>

          {tab === 'points' ? (
            <>
              <div className="aside-head">
                <div className="titles">
                  <div className="title">{T.editor.screenTitle(index + 1, capture.annotations.length)}</div>
                  {capture.source?.app && (
                    <div className="sub">{[capture.source.app, capture.source.windowTitle].filter(Boolean).join(' — ')}</div>
                  )}
                </div>
                <button type="button" className="nav-btn" aria-label={T.editor.previous} disabled={index === 0} onClick={() => goTo(index - 1)}>
                  <I.ChevronLeft size={13} />
                </button>
                <button
                  type="button"
                  className="nav-btn"
                  aria-label={T.editor.next}
                  disabled={index === captures.length - 1}
                  onClick={() => goTo(index + 1)}
                >
                  <I.ChevronRight size={13} />
                </button>
              </div>

              <div className="points" role="tabpanel" aria-label={T.editor.screenTitle(index + 1, capture.annotations.length)}>
                {capture.annotations.length === 0 && <p className="none">{T.editor.noPoints}</p>}
                {capture.annotations.map((a) => {
                  const r = recording(a);
                  const meta = [a.geometry.kind !== 'point' && kind(a), a.text && (a.input === 'typed' ? T.editor.typed : T.editor.dictated)].filter(Boolean);
                  return (
                    <article
                      key={a.id}
                      className={`item ${a.id === selectedId ? 'selected' : ''}`}
                      aria-current={a.id === selectedId || undefined}
                      onMouseDown={() => {
                        if (a.id !== selectedId) recorder.stop(true);
                        setSelectedId(a.id);
                        setBubbleOpen(false);
                      }}
                    >
                      <Badge a={a} />
                      <div className="body">
                        {r ? (
                          <>
                            <div className="status">
                              <Wave levels={levels.current} small />
                              <span className="time">{clock(r.elapsedMs)}</span>
                            </div>
                            <div className="status">
                              {T.editor.recording}
                              {tablet && ` · ${T.editor.tabletDraws}`}
                            </div>
                          </>
                        ) : a.transcription === 'pending' && !a.text ? (
                          <div className="skeleton" aria-hidden="true">
                            <i style={{ width: '92%' }} />
                            <i style={{ width: '60%' }} />
                          </div>
                        ) : (
                          <EditableText value={a.text} placeholder={T.editor.noComment} onChange={(text) => api.updateAnnotation(a.id, { text })} />
                        )}
                        {status(a, kind(a))}
                        {!r && a.transcription !== 'pending' && a.transcription !== 'error' && meta.length > 0 && (
                          <div className="meta">
                            {a.input === 'typed' ? <I.Keyboard size={12} /> : <I.Mic size={12} />}
                            {meta.join(' · ')}
                          </div>
                        )}
                        {gallery(a, 'sketch')}
                        {gallery(a, 'inspiration')}
                      </div>
                      {micButton(a.id, r !== null)}
                      <button type="button" className="delete" aria-label={T.editor.deletePoint} onClick={() => api.deleteAnnotation(a.id)}>
                        <I.Close size={10} />
                      </button>
                    </article>
                  );
                })}
              </div>
            </>
          ) : (
            <section className="notes" role="tabpanel" aria-label={T.editor.notes}>
              {notes.length > 0 && (
                <ol>
                  {notes.map((n, i) => {
                    const r = recording(n);
                    return (
                      <li
                        key={n.id}
                        className={`remark ${r ? 'recording' : ''}`}
                        onFocus={() => (activeNote.current = n.id)}
                        onBlur={() => (activeNote.current = null)}
                      >
                        <span className="num">{i + 1}.</span>
                        <div className="body">
                          {r && (
                            <div className="status">
                              <span className="rec-dot blink" />
                              <Wave levels={levels.current} small />
                              <span className="time">{clock(r.elapsedMs)}</span>
                            </div>
                          )}
                          {n.transcription === 'pending' && !n.text ? (
                            <div className="skeleton" aria-hidden="true">
                              <i style={{ width: '80%' }} />
                            </div>
                          ) : (
                            <EditableText
                              value={n.text}
                              autoFocus={n.id === newNoteId}
                              placeholder={r ? T.editor.placeholderRecording : T.editor.notePlaceholder}
                              onChange={(text) => api.updateNote(n.id, text)}
                              onKeyDown={noteKeys(n)}
                            />
                          )}
                          {status(n, T.editor.note)}
                        </div>
                        <div className="tools">
                          {commentMode !== 'keyboard' && (
                            <button
                              type="button"
                              className={r ? 'on' : ''}
                              aria-label={r ? T.editor.stopDictation : T.editor.dictateNote}
                              title={r ? T.editor.stopDictation : T.editor.dictateNote}
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => (r ? recorder.stop(true) : startDictation(n.id))}
                            >
                              <I.Mic size={12} />
                            </button>
                          )}
                          <button
                            type="button"
                            aria-label={T.editor.deleteNote}
                            title={T.editor.deleteNote}
                            onClick={() => {
                              if (r) recorder.stop(false);
                              api.deleteNote(n.id);
                            }}
                          >
                            <I.Close size={10} />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
              <button type="button" className="add-note" onClick={() => void addNote()}>
                <I.Plus size={13} />
                {T.editor.addNote}
                <span className="hint">{notes.length ? '' : T.editor.notesHint}</span>
              </button>
            </section>
          )}

          <div className="aside-foot">
            <I.Undo size={13} />
            <span>{T.editor.undoAll(MOD)}</span>
          </div>
        </aside>
      </main>

      <nav aria-label={T.editor.captures}>
        {captures.map((c, i) => (
          <div className="shot" key={c.id}>
            <button
              type="button"
              className="thumb"
              aria-label={T.editor.thumbLabel(i + 1, c.annotations.length, c.id === capture.id)}
              aria-current={c.id === capture.id || undefined}
              onClick={() => goTo(i)}
            >
              <span className="img">
                <img src={imageUrl(session, c.image)} alt="" />
              </span>
              <span className="cap">{T.editor.thumb(i + 1, c.annotations[0]?.number, c.annotations.at(-1)?.number)}</span>
            </button>
            <button type="button" className="remove" aria-label={T.editor.deleteScreen(i + 1)} title={T.editor.deleteScreen(i + 1)} onClick={() => deleteCapture(i)}>
              <I.Close size={9} />
            </button>
          </div>
        ))}
        {newCapture}
      </nav>

      {exportMenu && <div style={{ position: 'fixed', inset: 0, zIndex: 9 }} onMouseDown={() => setExportMenu(false)} />}
      {toast && <div className={`toast ${toast.error ? 'error' : ''}`} role="status">{toast.text}</div>}
      {zoomed && (
        <div className="zoomed" onClick={() => setZoomed(null)}>
          <img src={zoomed} alt={T.editor.zoomedImage} />
        </div>
      )}
      {sessionsPanel}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
