// Réglages (§4.8), en onglets : général (capture, commentaire, export, démarrage),
// transcription (moteur, modèle, glossaire), instructions du PDF, tablette.

import { useEffect, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Settings, SettingsState, SettingsTab } from '../../ipc.ts';
import * as I from '../icons.tsx';
import { T } from '../texts.ts';

const api = window.pastille;
const isMac = navigator.userAgent.includes('Mac');
const S = T.settings;

/** Touche pressée → accélérateur Electron (« CommandOrControl+Shift+2 »). */
function accelerator(e: React.KeyboardEvent): string | null {
  const key = e.code.startsWith('Key') ? e.code.slice(3) : e.code.startsWith('Digit') ? e.code.slice(5) : /^F\d+$/.test(e.code) ? e.code : null;
  if (!key) return null;
  const mods = [
    (e.metaKey && isMac) || (e.ctrlKey && !isMac) ? 'CommandOrControl' : null,
    e.ctrlKey && isMac ? 'Control' : null,
    e.altKey ? 'Alt' : null,
    e.shiftKey ? 'Shift' : null,
  ].filter(Boolean);
  return mods.length ? [...mods, key].join('+') : null; // un raccourci global a toujours un modificateur
}

const Switch = (p: { on: boolean; label: string; onChange: (on: boolean) => void; disabled?: boolean }) => (
  <button type="button" role="switch" className="switch" aria-checked={p.on} aria-label={p.label} disabled={p.disabled} onClick={() => p.onChange(!p.on)} />
);

const Section = (p: { title: string; children: ReactNode; hint?: ReactNode }) => (
  <section>
    <h2>{p.title}</h2>
    <div className="group">{p.children}</div>
    {p.hint}
  </section>
);

const TABS: { id: SettingsTab; icon: ReactNode }[] = [
  { id: 'general', icon: <I.Sliders size={20} /> },
  { id: 'transcription', icon: <I.Mic size={20} /> },
  { id: 'export', icon: <I.Doc size={20} /> },
  { id: 'devices', icon: <I.Tablet size={20} /> },
];

function App() {
  const [s, setS] = useState<SettingsState | null>(null);
  const [tab, setTab] = useState<SettingsTab>('general');
  const [error, setError] = useState<string>();
  const [download, setDownload] = useState<number | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [listening, setListening] = useState(false);

  useEffect(() => {
    void api.getSettings().then(setS);
    const off = api.onSettingsChanged(setS);
    const offTab = api.onSettingsTab(setTab);
    const offProgress = api.onDownloadProgress(setDownload);
    // Les autorisations se donnent dans les Réglages du système : on rafraîchit au retour.
    const onFocus = () => void api.getSettings().then(setS);
    window.addEventListener('focus', onFocus);
    return () => {
      off();
      offTab();
      offProgress();
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  useEffect(() => void (document.title = S.tabs[tab]), [tab]);

  if (!s) return null;

  async function update(patch: Partial<Settings>) {
    const r = await api.updateSettings(patch);
    setError(r.ok ? undefined : r.error);
  }

  async function getModel() {
    setDownload(0);
    const r = await api.downloadModel();
    setDownload(null);
    if (!r.ok) setError(r.error);
  }

  const silence = s.silenceMs / 1000;
  const lastSilence = silence || 3;

  const general = (
    <>
      <Section
        title={S.capture}
        hint={
          <>
            <p className="hint">{S.shortcutHint}</p>
            {(!s.shortcutOk || error) && <p className="error">{error ?? S.shortcutTaken}</p>}
          </>
        }
      >
        <div className="row">
          <span className="label">{S.shortcut}</span>
          <button
            type="button"
            className="btn shortcut"
            aria-pressed={listening}
            aria-label={S.shortcutAria(s.shortcutLabel)}
            onClick={() => setListening(true)}
            onBlur={() => setListening(false)}
            onKeyDown={(e) => {
              if (!listening) return;
              e.preventDefault();
              if (e.key === 'Escape') return setListening(false);
              const acc = accelerator(e);
              if (acc) {
                void update({ shortcut: acc });
                setListening(false);
              }
            }}
          >
            {listening ? S.shortcutListening : s.shortcutLabel}
          </button>
        </div>
      </Section>

      <Section title={S.comment} hint={<p className="hint">{S.modeHints[s.commentMode]}</p>}>
        <div className="row">
          <span className="label">{S.mode}</span>
          <div className="segmented" role="group" aria-label={S.mode}>
            {(['auto', 'push', 'keyboard'] as const).map((m) => (
              <button type="button" key={m} aria-pressed={s.commentMode === m} onClick={() => void update({ commentMode: m })}>
                {S.modes[m]}
              </button>
            ))}
          </div>
        </div>
        <div className="row">
          <span className="label">{S.silence}</span>
          <div className={`stepper ${silence ? '' : 'off'}`}>
            <button type="button" aria-label={S.less} disabled={!silence || silence <= 1} onClick={() => void update({ silenceMs: (silence - 1) * 1000 })}>
              −
            </button>
            <span>{S.seconds(lastSilence)}</span>
            <button type="button" aria-label={S.more} disabled={!silence || silence >= 15} onClick={() => void update({ silenceMs: (silence + 1) * 1000 })}>
              +
            </button>
          </div>
          <Switch on={silence > 0} label={S.silenceSwitch} onChange={(on) => void update({ silenceMs: on ? 3000 : 0 })} />
        </div>
        <div className="row">
          <label className="label" htmlFor="language">
            {S.language}
          </label>
          <select id="language" value={s.language} onChange={(e) => void update({ language: e.target.value })}>
            {Object.entries(S.languages).map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </div>
      </Section>

      <Section title={S.export}>
        <div className="row">
          <span className="label">{S.exportDir}</span>
          <span className="path" title={s.exportDir}>
            <I.Folder size={14} />
            <span>{s.exportDir.replace(/^(\/Users\/[^/]+|[A-Z]:\\Users\\[^\\]+)/, '~')}</span>
          </span>
          <button type="button" className="btn" onClick={() => void api.chooseExportDir().then((dir) => (dir ? update({ exportDir: dir }) : undefined))}>
            {S.choose}
          </button>
        </div>
        <div className="row">
          <span className="label">{S.copyPdf}</span>
          <Switch on={s.copyPdf} label={S.copyPdf} onChange={(on) => void update({ copyPdf: on })} />
        </div>
      </Section>

      <Section title={S.app}>
        <div className="row">
          <span className="label">{S.openAtLogin}</span>
          <Switch on={s.openAtLogin} label={S.openAtLogin} onChange={(on) => void update({ openAtLogin: on })} />
        </div>
        <div className="row">
          <span className="label">
            {S.floatingBar}
            <small>{S.floatingBarHint}</small>
          </span>
          <Switch on={s.floatingBar} label={S.floatingBar} onChange={(on) => void update({ floatingBar: on })} />
        </div>
      </Section>
    </>
  );

  const whisper = s.whisper.state;
  const transcription = (
    <>
      <Section title={S.engine} hint={<p className="hint">{S.engineHints[s.engine]}</p>}>
        <div className="row">
          <span className="label">{S.engine}</span>
          <div className="segmented" role="group" aria-label={S.engine}>
            {(['local', 'api'] as const).map((e) => (
              <button type="button" key={e} aria-pressed={s.engine === e} onClick={() => void update({ engine: e })}>
                {S.engines[e]}
              </button>
            ))}
          </div>
        </div>
        {s.engine === 'local' && (
          <div className="row">
            <span className="label">
              {S.model}
              <small>{'detail' in s.whisper && whisper === 'error' ? s.whisper.detail : S.modelDetail}</small>
            </span>
            {download !== null ? (
              <progress max={100} value={download} />
            ) : whisper === 'missing' ? (
              <button type="button" className="btn" onClick={() => void getModel()}>
                {S.download}
              </button>
            ) : (
              <span className={`state ${whisper === 'ready' ? 'ok' : ''}`}>
                {whisper === 'ready' ? <I.CheckCircle size={14} /> : whisper === 'loading' ? <I.Spinner size={12} /> : <I.Warning size={13} />}
                {S.modelState[whisper]}
              </span>
            )}
          </div>
        )}
        {s.engine === 'api' && (
          <>
            <div className="row stack">
              <label htmlFor="api-url">{S.apiUrl}</label>
              <input id="api-url" defaultValue={s.apiUrl} onBlur={(e) => void update({ apiUrl: e.target.value.trim() })} />
            </div>
            <div className="row stack">
              <label htmlFor="api-model">{S.apiModel}</label>
              <input id="api-model" defaultValue={s.apiModel} onBlur={(e) => void update({ apiModel: e.target.value.trim() })} />
            </div>
            <div className="row stack">
              <label htmlFor="api-key">
                {S.apiKey} {s.hasApiKey && <em>({S.apiKeySaved})</em>}
              </label>
              <span className="field">
                <input id="api-key" type="password" value={apiKey} placeholder="sk-…" onChange={(e) => setApiKey(e.target.value)} />
                <button type="button" className="btn" onClick={() => void api.setApiKey(apiKey).then(() => setApiKey(''))}>
                  {S.save}
                </button>
              </span>
            </div>
          </>
        )}
      </Section>
      {error && <p className="error">{error}</p>}
      <Section title={S.glossary}>
        <div className="row stack">
          <label className="hint" htmlFor="glossary" style={{ margin: 0 }}>
            {S.glossaryHint}
          </label>
          <textarea id="glossary" rows={4} defaultValue={s.glossary} onBlur={(e) => void update({ glossary: e.target.value })} />
        </div>
      </Section>
    </>
  );

  const exportPdf = (
    <Section title={S.instructions}>
      <div className="row stack">
        <label className="hint" htmlFor="instructions" style={{ margin: 0 }}>
          {S.instructionsHint}
        </label>
        <textarea id="instructions" rows={14} key={s.instructions} defaultValue={s.instructions} onBlur={(e) => void update({ instructions: e.target.value })} />
      </div>
    </Section>
  );

  const devices = (
    <Section title={S.tablet} hint={<p className="hint">{S.tabletHint}</p>}>
      <div className="row">
        <span className="device-icon">
          <I.Tablet size={20} />
        </span>
        <span className="label">
          {s.tabletPaired ? S.tabletPaired : S.tabletNone}
          {s.tabletPaired && (
            <small className="state">
              <span className={`dot ${s.tabletConnected ? '' : 'off'}`} />
              {s.tabletConnected ? S.tabletConnected : S.tabletOffline}
            </small>
          )}
        </span>
        <button type="button" className="btn" onClick={() => api.pairTablet()}>
          {s.tabletPaired ? S.showQr : S.pair}
        </button>
        {s.tabletPaired && (
          <button type="button" className="btn danger" onClick={() => void api.revokeTablet()}>
            {S.revoke}
          </button>
        )}
      </div>
    </Section>
  );

  return (
    <div className={`settings ${isMac ? '' : 'win'}`}>
      <div className="toolbar">
        <div className="title">{S.tabs[tab]}</div>
        <div role="tablist" aria-label={document.title}>
          {TABS.map((t) => (
            <button type="button" role="tab" key={t.id} aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
              {t.icon}
              {S.tabs[t.id]}
            </button>
          ))}
        </div>
      </div>
      <div className="content" role="tabpanel">
        {tab === 'general' ? general : tab === 'transcription' ? transcription : tab === 'export' ? exportPdf : devices}
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
