// Éditeur d'annotations (§4.3) : en haut la session et l'export, au centre la capture,
// à droite les points de la capture, en bas les vignettes de la session.

import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { allAnnotations, type Annotation, type Session } from '@pastille/shared';
import { imageUrl, type ExportFormat } from '../../ipc.ts';
import { createRecorder, type RecorderState } from './recorder.ts';
import { Stage } from './Stage.tsx';

const api = window.pastille;
const isMac = navigator.userAgent.includes('Mac');
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
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!focused.current) setText(props.value);
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
  const [tablet, setTablet] = useState(false);
  const [zoomed, setZoomed] = useState<string | null>(null); // croquis agrandi
  // Whisper présent (ou en cours de chargement) : sinon, saisie au clavier seulement.
  const [canDictate] = useState(() => api.dictationAvailable());
  const [recorder] = useState(() =>
    createRecorder({ silenceMs: 3000, maxMs: 60_000, onState: setRec, onFinish: (id, samples) => api.submitDictation(id, samples) }),
  );

  /** Dictée automatique : poser un point lance l'enregistrement (§4.4). */
  function startDictation(annotationId: string) {
    void canDictate
      .then((ok) => (ok ? recorder.start(annotationId) : undefined))
      .catch((err) => setToast({ text: `Micro indisponible : ${err}`, error: true }));
  }

  useEffect(() => {
    void api.getSession().then(setSession);
    const offSession = api.onSession(setSession);
    const offFocus = api.onFocus((f) => {
      setCaptureId(f.captureId);
      setSelectedId(f.annotationId ?? null);
      setBubbleOpen(!!f.openBubble);
      if (f.annotationId && f.openBubble) startDictation(f.annotationId);
    });
    void api.tabletStatus().then(setTablet);
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
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  // La tablette dessine toujours pour le point sélectionné (§2).
  useEffect(() => api.setSelection(selectedId), [selectedId]);

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

  async function runExport(format: ExportFormat) {
    setExportMenu(false);
    setToast({ text: format === 'pdf' ? 'Export du PDF…' : 'Export Markdown…' });
    const r = await api.exportSession(format);
    setToast(r.ok ? { text: `Exporté : ${r.path}` } : { text: r.error, error: true });
    setTimeout(() => setToast(null), 5000);
  }

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
      <div className="empty">
        <p>Aucune capture pour l'instant.</p>
        <p>
          Sur l'écran à relire, appuie sur <kbd>{isMac ? '⌘⇧2' : 'Ctrl+Shift+2'}</kbd> puis clique sur l'élément à
          corriger.
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

  const status = (a: Annotation) =>
    rec?.annotationId === a.id ? (
      <span className="rec">
        ● {Math.floor(rec.elapsedMs / 1000)} s<i style={{ width: `${Math.min(100, rec.level * 600)}%` }} />
      </span>
    ) : a.transcription === 'pending' ? (
      <span className="pending">transcription…</span>
    ) : a.transcription === 'error' ? (
      <span className="error">
        transcription en erreur{' '}
        <button onClick={() => api.retryDictation(a.id)}>Réessayer</button>
      </span>
    ) : null;

  const sketches = (a: Annotation) =>
    a.sketches.length > 0 && (
      <div className="sketches">
        {a.sketches.map((k) => (
          <span key={k.id} className="sketch">
            <img src={imageUrl(session, k.png)} alt="Croquis" onClick={() => setZoomed(imageUrl(session, k.png))} />
            <button title="Supprimer le croquis" onClick={() => api.deleteSketch(a.id, k.id)}>
              ×
            </button>
          </span>
        ))}
      </div>
    );

  return (
    <div className="editor">
      <header>
        {renaming ? (
          <input
            className="name"
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
          <h1 title="Cliquer pour renommer" onClick={() => setRenaming(true)}>
            {session.name}
          </h1>
        )}
        <input
          className="context"
          placeholder="Contexte : projet, stack, page testée"
          defaultValue={session.context ?? ''}
          key={session.id}
          onChange={(e) => api.updateSession({ context: e.target.value })}
        />
        <span className={`tablet ${tablet ? 'on' : ''}`} title={tablet ? 'Tablette connectée' : 'Tablette non connectée'}>
          ● Tablette
        </span>
        <span className="count">
          {ordered.length} point{ordered.length > 1 ? 's' : ''}
        </span>
        <div className="export">
          <button className="primary" onClick={() => setExportMenu((v) => !v)}>
            Exporter ▾
          </button>
          {exportMenu && (
            <div className="menu">
              <button onClick={() => void runExport('pdf')}>PDF pour l'IA ({isMac ? '⌘E' : 'Ctrl+E'})</button>
              <button onClick={() => void runExport('markdown')}>Dossier Markdown + images</button>
            </div>
          )}
        </div>
      </header>

      <main>
        <Stage
          capture={capture}
          imageUrl={imageUrl(session, capture.image)}
          selectedId={selectedId}
          nextNumber={captures.slice(0, captures.indexOf(capture) + 1).reduce((n, c) => n + c.annotations.length, 0) + 1}
          onSelect={(id, open) => {
            recorder.stop(true);
            setSelectedId(id);
            setBubbleOpen(open);
          }}
          onAdd={async (geometry) => {
            const id = await api.addAnnotation(capture.id, geometry);
            setSelectedId(id);
            setBubbleOpen(true);
            startDictation(id);
          }}
          onMove={(id, geometry) => api.updateAnnotation(id, { geometry })}
          bubble={(pin) =>
            bubbleOpen && selected ? (
              <div className="bubble" style={{ left: pin.x + 20, top: pin.y - 18 }} key={selected.id}>
                <span className="num">#{selected.number}</span>
                <div className="body">
                  <EditableText
                    value={selected.text}
                    autoFocus
                    placeholder={rec?.annotationId === selected.id ? 'Parle… ou tape pour écrire' : 'Ton commentaire… (Entrée pour valider)'}
                    onChange={(text) => api.updateAnnotation(selected.id, { text })}
                    onKeyDown={bubbleKeys}
                  />
                  {status(selected)}
                  {sketches(selected)}
                </div>
              </div>
            ) : null
          }
        />

        <aside>
          <h2>Points de cette capture</h2>
          {capture.annotations.length === 0 && <p className="muted">Clique sur la capture pour poser un point.</p>}
          {capture.annotations.map((a) => (
            <div
              key={a.id}
              className={`item ${a.id === selectedId ? 'selected' : ''}`}
              onMouseDown={() => {
                if (a.id !== selectedId) recorder.stop(true);
                setSelectedId(a.id);
                setBubbleOpen(false);
              }}
            >
              <span className="num">#{a.number}</span>
              <div className="body">
                <EditableText
                  value={a.text}
                  placeholder="(sans commentaire)"
                  onChange={(text) => api.updateAnnotation(a.id, { text })}
                />
                {status(a)}
                {sketches(a)}
              </div>
              <button className="delete" title="Supprimer le point" onClick={() => api.deleteAnnotation(a.id)}>
                ×
              </button>
            </div>
          ))}
        </aside>
      </main>

      <footer>
        {captures.map((c, i) => (
          <button
            key={c.id}
            className={`thumb ${c.id === capture.id ? 'selected' : ''}`}
            title={[`Écran ${i + 1}`, c.source?.app, c.source?.windowTitle].filter(Boolean).join(' — ')}
            onClick={() => {
              setCaptureId(c.id);
              setSelectedId(null);
              setBubbleOpen(false);
            }}
          >
            <img src={imageUrl(session, c.image)} alt="" />
            <span>{c.annotations.length}</span>
          </button>
        ))}
      </footer>

      {toast && <div className={`toast ${toast.error ? 'error' : ''}`}>{toast.text}</div>}
      {zoomed && (
        <div className="zoomed" onClick={() => setZoomed(null)}>
          <img src={zoomed} alt="Croquis agrandi" />
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
