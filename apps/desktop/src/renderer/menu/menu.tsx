// Menu de l'icône (§4.7), en popover sous l'icône : session en cours, capture, export,
// sessions récentes, appairage, réglages. Chaque action ferme le menu.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { MenuAction, MenuState } from '../../ipc.ts';
import * as I from '../icons.tsx';
import { T } from '../texts.ts';

const api = window.pastille;
const act = (action: MenuAction) => api.menuAction(action);

function App() {
  const [s, setS] = useState<MenuState | null>(null);
  const panel = useRef<HTMLElement>(null);

  useEffect(() => {
    void api.getMenuState().then(setS);
    const off = api.onMenuState(setS);
    // Les raccourcis affichés fonctionnent aussi menu ouvert.
    const keys: Record<string, MenuAction['type']> = { e: 'export', ',': 'settings', q: 'quit' };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') act({ type: 'close' });
      else if ((e.metaKey || e.ctrlKey) && keys[e.key.toLowerCase()]) act({ type: keys[e.key.toLowerCase()]! } as MenuAction);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      off();
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  // La fenêtre prend la hauteur du contenu.
  useLayoutEffect(() => {
    const el = panel.current;
    if (!el) return;
    const ro = new ResizeObserver(() => api.menuResize(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [s !== null]);

  if (!s) return null;
  const mac = s.platform === 'mac';
  const { session } = s;

  return (
    <section className="panel" aria-label={T.menu.label} ref={panel}>
      <div className="head">
        <I.Logo size={28} />
        <div className="titles">
          <div className="name">{session ? session.name : T.menu.noSession}</div>
          <div className="meta">
            {session ? `${T.points(session.points)} · ${T.screens(session.screens)} · ${T.since(session.createdAt)}` : T.menu.noSessionHint}
          </div>
        </div>
      </div>

      {(s.tablet || s.pending > 0 || s.errors > 0) && (
        <div className="chips">
          {s.tablet && (
            <span className="chip">
              <span className="dot" />
              {T.menu.tablet}
            </span>
          )}
          {s.pending > 0 && (
            <span className="chip">
              <I.Spinner size={12} />
              {T.menu.pending(s.pending)}
            </span>
          )}
          {s.errors > 0 && (
            <span className="chip">
              <I.Warning size={12} />
              {T.menu.errors(s.errors)}
            </span>
          )}
        </div>
      )}

      <div className="capture">
        <button type="button" onClick={() => act({ type: 'capture' })}>
          <I.Capture />
          <span style={{ flex: 1, textAlign: 'left' }}>{T.menu.capture}</span>
          <kbd>{s.shortcut}</kbd>
        </button>
      </div>

      <button type="button" className="item" onClick={() => act({ type: 'editor' })}>
        <I.Window />
        <span>{T.menu.editor}</span>
      </button>
      <button type="button" className="item" disabled={!session} onClick={() => act({ type: 'export' })}>
        <I.Export />
        <span>{T.menu.exportPdf}</span>
        {mac && <kbd>⌘E</kbd>}
      </button>
      <button type="button" className="item" disabled={!session} onClick={() => act({ type: 'new-session' })}>
        <I.Plus />
        <span>{T.menu.newSession}</span>
      </button>

      {s.recents.length > 0 && (
        <>
          <hr />
          <div className="section">{T.menu.recents}</div>
          {s.recents.map((r) => (
            <div className="recent" key={r.id}>
              <button type="button" className="open" onClick={() => act({ type: 'open-recent', id: r.id })}>
                <span className="title">{r.name}</span>
                <span className="meta">
                  {T.points(r.points)} · {T.screens(r.screens)} · {T.day(r.updatedAt)}
                </span>
              </button>
              <button type="button" className="again" aria-label={T.menu.reexport(r.name)} onClick={() => act({ type: 'export-recent', id: r.id })}>
                <I.Export size={15} />
              </button>
            </div>
          ))}
          <button type="button" className="item" onClick={() => act({ type: 'sessions' })}>
            <I.Folder />
            <span>{T.menu.allSessions}</span>
          </button>
        </>
      )}

      <hr />
      {s.license.state !== 'licensed' && (
        // Essai en cours, ou captures bloquées : ouvre l'onglet Licence des réglages.
        <button type="button" className={`item ${s.license.state === 'trial' ? '' : 'update'}`} onClick={() => act({ type: 'license' })}>
          {s.license.state === 'trial' ? <I.Info /> : <I.Warning />}
          <span>{s.license.state === 'trial' ? T.menu.trial(s.license.daysLeft) : T.menu.license[s.license.state]}</span>
          <kbd>{T.menu.buy}</kbd>
        </button>
      )}
      {s.update && (
        <button type="button" className="item update" onClick={() => act({ type: 'update' })}>
          <I.Download />
          <span>{T.menu.update(s.update)}</span>
        </button>
      )}
      <button type="button" className="item" onClick={() => act({ type: 'pair' })}>
        <I.Qr />
        <span>{T.menu.pair}</span>
      </button>
      <button type="button" className="item" onClick={() => act({ type: 'claude-code' })}>
        <I.Terminal />
        <span>{T.menu.claudeCode}</span>
      </button>
      <button type="button" className="item" onClick={() => act({ type: 'settings' })}>
        <I.Sliders />
        <span>{T.menu.settings}</span>
        {mac && <kbd>⌘,</kbd>}
      </button>
      <button type="button" className="item" onClick={() => act({ type: 'quit' })}>
        <I.Power />
        <span>{T.menu.quit}</span>
        {mac && <kbd>⌘Q</kbd>}
      </button>
    </section>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
