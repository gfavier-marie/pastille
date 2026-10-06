// Barre flottante (option des réglages) : réduite par défaut, dépliée au survol,
// et 4 s de confirmation après un export.

import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { ExportNotice, MenuAction, MenuState } from '../../ipc.ts';
import * as I from '../icons.tsx';
import { T } from '../texts.ts';

const api = window.pastille;
const act = (action: MenuAction) => api.menuAction(action);
const NOTICE_MS = 4000;

/** Pastille de la barre, version claire sur fond sombre. */
const Pin = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M8 1a7 7 0 1 1 0 14H1V8a7 7 0 0 1 7-7z" fill="#FF6A3D" />
    <circle cx="8" cy="8" r="2.4" fill="#1C1C1E" />
  </svg>
);

function App() {
  const [s, setS] = useState<MenuState | null>(null);
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<ExportNotice | null>(null);

  useEffect(() => {
    void api.getMenuState().then(setS);
    const offState = api.onMenuState(setS);
    let timer: ReturnType<typeof setTimeout>;
    const offNotice = api.onExportNotice((n) => {
      setNotice(n);
      clearTimeout(timer);
      timer = setTimeout(() => setNotice(null), NOTICE_MS);
    });
    // Barre masquée (pendant une capture) : elle revient réduite et laisse passer les clics.
    const onVisibility = () => {
      if (!document.hidden) return;
      api.barHover(false);
      setOpen(false);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      offState();
      offNotice();
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  if (!s?.session) return null;

  // Survol : la fenêtre reprend les clics tant que la souris est sur la pilule.
  const hover = {
    onMouseEnter: () => {
      api.barHover(true);
      setOpen(true);
    },
    onMouseLeave: () => {
      api.barHover(false);
      setOpen(false);
    },
  };

  if (notice) {
    return (
      <div className="pill open" role="status" {...hover}>
        <I.CheckCircle color="#30D158" mark="#0B2E16" />
        <span className="done">{notice.copied ? T.bar.copied : T.bar.exported[notice.format]}</span>
        <span className="file">{notice.file}</span>
        <button type="button" className="reveal" onClick={() => act({ type: 'reveal' })}>
          {T.reveal}
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <div className="pill" role="toolbar" aria-label={T.bar.label} {...hover}>
        <Pin />
        <span className="count">{s.session.points}</span>
        <span className="sep" />
        <button type="button" className="round" aria-label={T.bar.newCapture} onClick={() => act({ type: 'capture' })}>
          <I.Capture size={15} />
        </button>
      </div>
    );
  }

  return (
    <div className="pill open" role="toolbar" aria-label={T.bar.label} {...hover}>
      <Pin />
      <span className="count">{T.points(s.session.points)}</span>
      {(s.tablet || s.pending > 0) && <span className="sep" />}
      {s.tablet && (
        <span className="state">
          <span className="dot" />
          {T.bar.tablet}
        </span>
      )}
      {s.pending > 0 && (
        <span className="state" aria-label={T.transcriptions(s.pending)}>
          <I.Spinner size={11} />
          {s.pending}
        </span>
      )}
      <span className="sep" />
      <button type="button" className="capture" onClick={() => act({ type: 'capture' })}>
        <I.Capture size={14} />
        {T.bar.capture}
        <kbd>{s.shortcut}</kbd>
      </button>
      <button type="button" className="icon" aria-label={T.bar.editor} onClick={() => act({ type: 'editor' })}>
        <I.Window />
      </button>
      <button type="button" className="icon" aria-label={T.bar.exportPdf} onClick={() => act({ type: 'export' })}>
        <I.Export />
      </button>
      <button type="button" className="icon hide" aria-label={T.bar.hide} onClick={() => act({ type: 'hide-bar' })}>
        <I.Close size={13} />
      </button>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
