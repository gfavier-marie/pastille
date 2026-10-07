// Entrées du menu de l'icône (§4.7), partagées par le popover et le menu ≡ de l'éditeur :
// capture, vidéo, export, sessions récentes, licence, mise à jour, appairage, réglages, quitter.

import type { MenuAction, MenuState } from '../../ipc.ts';
import * as I from '../icons.tsx';
import { T } from '../texts.ts';

/** Dans l'éditeur, « Ouvrir l'éditeur » n'a pas de sens : l'entrée est masquée. */
export function MenuItems({ s, act, inEditor = false }: { s: MenuState; act: (a: MenuAction) => void; inEditor?: boolean }) {
  const mac = s.platform === 'mac';
  const { session } = s;

  return (
    <>
      <div className="capture">
        <button type="button" onClick={() => act({ type: 'capture' })}>
          <I.Capture />
          <span style={{ flex: 1, textAlign: 'left' }}>{T.menu.capture}</span>
          <kbd>{s.shortcut}</kbd>
        </button>
      </div>
      <button type="button" className="item" onClick={() => act({ type: 'video' })}>
        <I.Video />
        <span>{s.video.since ? T.menu.stopVideo : T.menu.video}</span>
        <kbd>{s.video.shortcut}</kbd>
      </button>

      {!inEditor && (
        <button type="button" className="item" onClick={() => act({ type: 'editor' })}>
          <I.Window />
          <span>{T.menu.editor}</span>
        </button>
      )}
      <button type="button" className="item" disabled={!session} onClick={() => act({ type: 'export' })}>
        <I.Export />
        <span>{T.menu.exportPdf}</span>
        {mac && <kbd>⌘E</kbd>}
      </button>
      <button type="button" className="item" onClick={() => act({ type: 'new-session' })}>
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
    </>
  );
}
