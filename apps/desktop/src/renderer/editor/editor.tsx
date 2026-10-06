// Éditeur d'annotations (§4.3) : en haut la session et l'export, au centre la capture,
// à droite les points de la capture, en bas les vignettes de la session.

import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { allAnnotations, type Annotation, type Note, type Session } from '@pastille/shared';
import { imageUrl, type ExportFormat, type SettingsState } from '../../ipc.ts';
import * as I from '../icons.tsx';
import { T } from '../texts.ts';
import { createRecorder, type RecorderState } from './recorder.ts';
import { Stage } from './Stage.tsx';

const api = window.pastille;
const isMac = navigator.userAgent.includes('Mac');
const MOD = isMac ? '⌘' : 'Ctrl+';
const WAVE_BARS = 18;
const BUBBLE_WIDTH = 312;

/** Durée d'enregistrement « m:ss ». */
const clock = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;

/** Onde de la dictée : les derniers niveaux du micro, du plus ancien au plus récent. */
function Wave(props: { levels: number[]; small?: boolean }) {
  const max = props.small ? 18 : 22;
  const levels = [...Array(Math.max(0, WAVE_BARS - props.levels.length)).fill(0), ...props.levels.slice(-WAVE_BARS)];
  return (
    <div className={`wave ${props.small ? 'small' : ''}`} aria-hidden="true">
      {levels.map((l, i) => (
        <span key={i} style={{ height: 3 + Math.min(1, l * 14) * (max - 3) }} />
      ))}
    </div>
  );
}

/** Numéro d'un point : goutte pour un point, rond pour une zone ou une flèche. */
const Badge = ({ a }: { a: Annotation }) => (
  <span className={`badge ${a.geometry.kind === 'point' ? 'point' : ''} ${a.number > 99 ? 'wide' : ''}`}>{a.number}</span>
);
const isTyping = (t: EventTarget | null) => t instanceof HTMLTextAreaElement || t instanceof HTMLInputElement;

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

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [captureId, setCaptureId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [bubbleOpen, setBubbleOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [exportMenu, setExportMenu] = useState(false);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const [rec, setRec] = useState<RecorderState>(null);
  const levels = useRef<number[]>([]);
  const [editingContext, setEditingContext] = useState(false);
  const [shortcut, setShortcut] = useState(isMac ? '⇧⌘2' : 'Ctrl+Shift+2');
  const [tablet, setTablet] = useState(false);
  const [zoomed, setZoomed] = useState<string | null>(null); // croquis agrandi
  const [newNoteId, setNewNoteId] = useState<string | null>(null); // remarque juste ajoutée, à mettre au focus
  const activeNote = useRef<string | null>(null); // remarque en cours de saisie
  const [commentMode, setCommentMode] = useState<SettingsState['commentMode']>('auto');
  // Whisper présent (ou en cours de chargement) : sinon, saisie au clavier seulement.
  const [canDictate] = useState(() => api.dictationAvailable());
  // Mode de commentaire et délai de silence suivent les réglages.
  const prefs = useRef<Pick<SettingsState, 'commentMode' | 'silenceMs'>>({ commentMode: 'auto', silenceMs: 3000 });
  const [recorder] = useState(() =>
    createRecorder({
      silenceMs: () => prefs.current.silenceMs,
      maxMs: 60_000,
      onState: (state) => {
        levels.current = state ? [...levels.current, state.level].slice(-WAVE_BARS) : [];
        setRec(state);
      },
      onFinish: (id, samples) => api.submitDictation(id, samples),
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
      setCaptureId(f.captureId);
      setSelectedId(f.annotationId ?? null);
      setBubbleOpen(!!f.openBubble);
      if (f.annotationId && f.openBubble) autoDictation(f.annotationId);
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
    const offMic = api.onPrepareMic(() => void canDictate.then((ok) => (ok ? recorder.open() : undefined)).catch(() => {}));
    // Fenêtre cachée : la dictée en cours part en transcription et le micro est libéré.
    const onVisibility = () => document.hidden && recorder.close();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      offSession();
      offFocus();
      offMic();
      offTablet();
      offSettings();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

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

  // Mode « appuyer pour parler » : ⌥ (Alt) maintenu enregistre pour le point sélectionné.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const target = activeNote.current ?? selectedId;
      if (e.key !== 'Alt' || e.repeat || prefs.current.commentMode !== 'push' || !target) return;
      e.preventDefault();
      if (!activeNote.current) setBubbleOpen(true);
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

  if (!session || !capture) {
    return (
      <div className={`empty ${isMac ? 'mac' : ''}`}>
        <I.Logo size={40} />
        <h1>{T.editor.emptyTitle}</h1>
        <p>
          {T.editor.emptyBefore} <kbd>{shortcut}</kbd> {T.editor.emptyAfter}
        </p>
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

  const sketches = (a: Annotation) =>
    a.sketches.length > 0 && (
      <div className="sketches">
        {a.sketches.map((k) => (
          <span key={k.id} className="sketch">
            <button type="button" aria-label={T.editor.zoomSketch} onClick={() => setZoomed(imageUrl(session, k.png))}>
              <img src={imageUrl(session, k.png)} alt="" />
            </button>
            <button type="button" className="remove" aria-label={T.editor.deleteSketch} onClick={() => api.deleteSketch(a.id, k.id)}>
              <I.Close size={9} />
            </button>
          </span>
        ))}
        <span className="count">{T.editor.sketches(a.sketches.length)}</span>
      </div>
    );

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

  return (
    <div className={`editor ${isMac ? 'mac' : ''}`}>
      <header>
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
        {editingContext ? (
          <input
            className="context-input"
            aria-label={T.editor.context}
            placeholder={T.editor.contextEmpty}
            autoFocus
            defaultValue={session.context ?? ''}
            onChange={(e) => api.updateSession({ context: e.target.value })}
            onBlur={() => setEditingContext(false)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === 'Escape') && e.currentTarget.blur()}
          />
        ) : (
          <button type="button" className={`context ${session.context ? '' : 'empty'}`} onClick={() => setEditingContext(true)}>
            <span className="label">{T.editor.context}</span>
            <span className="value">{session.context || T.editor.contextEmpty}</span>
          </button>
        )}
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
          }}
          onAdd={async (geometry) => {
            const id = await api.addAnnotation(capture.id, geometry);
            setSelectedId(id);
            setBubbleOpen(true);
            autoDictation(id);
          }}
          onMove={(id, geometry) => api.updateAnnotation(id, { geometry })}
          bubble={(pin, stage) => {
            if (!bubbleOpen || !selected) return null;
            // À droite de la pastille, ou à gauche si la place manque ; toujours dans la scène.
            let left = pin.x + pin.r + 12;
            if (left + BUBBLE_WIDTH > stage.w - 12) left = Math.max(12, pin.x - pin.r - 12 - BUBBLE_WIDTH);
            const top = Math.max(12, Math.min(pin.y - pin.r + 4, stage.h - 240));
            const r = recording(selected);
            return (
              <section className="bubble" aria-label={T.editor.bubbleLabel(selected.number)} style={{ left, top }} key={selected.id}>
                <div className="bubble-head">
                  <span className="num">
                    {r && <span className="rec-dot blink" />}#{selected.number}
                  </span>
                  {r ? <Wave levels={levels.current} /> : <span className="spacer" />}
                  {r && <span className="time">{clock(r.elapsedMs)}</span>}
                </div>
                <EditableText
                  className="field"
                  value={selected.text}
                  autoFocus
                  placeholder={r ? T.editor.placeholderRecording : T.editor.placeholder}
                  onChange={(text) => api.updateAnnotation(selected.id, { text })}
                  onKeyDown={bubbleKeys}
                />
                {status(selected, kind(selected))}
                {sketches(selected)}
                {tablet && selected.sketches.length === 0 && (
                  <div className="meta">
                    <I.Tablet size={13} />
                    {T.editor.sketchHint}
                  </div>
                )}
                <div className="keys">
                  {[...T.editor.keys, ...(r ? [T.editor.keyToType] : [])].map(([key, text]) => (
                    <span key={key}>
                      <b>{key}</b> {text}
                    </span>
                  ))}
                </div>
              </section>
            );
          }}
        />

        <aside aria-label={T.editor.screenTitle(index + 1, capture.annotations.length)}>
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

          <div className="points">
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
                    {sketches(a)}
                  </div>
                  <button type="button" className="delete" aria-label={T.editor.deletePoint} onClick={() => api.deleteAnnotation(a.id)}>
                    <I.Close size={10} />
                  </button>
                </article>
              );
            })}
          </div>

          <section className="notes" aria-label={T.editor.notes}>
            <div className="title">{T.editor.notes}</div>
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

          <div className="aside-foot">
            <I.Undo size={13} />
            <span>{T.editor.undoAll(MOD)}</span>
          </div>
        </aside>
      </main>

      <nav aria-label={T.editor.captures}>
        {captures.map((c, i) => (
          <button
            type="button"
            key={c.id}
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
        ))}
        <button type="button" className="thumb new" onClick={() => api.startCapture()}>
          <span className="img">
            <I.Capture size={18} />
            <kbd>{shortcut}</kbd>
          </span>
          <span className="cap">{T.editor.newCapture}</span>
        </button>
      </nav>

      {exportMenu && <div style={{ position: 'fixed', inset: 0, zIndex: 9 }} onMouseDown={() => setExportMenu(false)} />}
      {toast && <div className={`toast ${toast.error ? 'error' : ''}`} role="status">{toast.text}</div>}
      {zoomed && (
        <div className="zoomed" onClick={() => setZoomed(null)}>
          <img src={zoomed} alt={T.editor.sketchZoomed} />
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
