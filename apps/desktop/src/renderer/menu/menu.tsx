// Menu de l'icône (§4.7), en popover sous l'icône : la session en cours, puis les entrées
// communes avec le menu ≡ de l'éditeur (items.tsx). Chaque action ferme le menu.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { MenuAction, MenuState } from '../../ipc.ts';
import * as I from '../icons.tsx';
import { T } from '../texts.ts';
import { MenuItems } from './items.tsx';

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

      <MenuItems s={s} act={act} />
    </section>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
