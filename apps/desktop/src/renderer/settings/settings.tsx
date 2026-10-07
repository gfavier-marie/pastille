// Réglages (§4.8), en onglets : général (capture, commentaire, export, démarrage),
// transcription (moteur, modèle, glossaire), contexte du projet et instructions du PDF, tablette.

import { useEffect, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { LANG_NAMES, LANGS } from '@pastille/shared';
import type { Settings, SettingsState, SettingsTab } from '../../ipc.ts';
import * as I from '../icons.tsx';
import { T } from '../texts.ts';

const api = window.pastille;
const isMac = navigator.userAgent.includes('Mac');
const S = T.settings;

/** Touche pressée → accélérateur Electron (« CommandOrControl+Alt+P »). Electron vise la position
 *  physique de la touche sur Mac (e.code), mais la lettre du clavier sous Windows (code virtuel) :
 *  en AZERTY, la touche A doit donner « A », pas « Q ». */
function accelerator(e: React.KeyboardEvent): string | null {
  const vk = e.keyCode;
  const key = !isMac
    ? (vk >= 65 && vk <= 90) || (vk >= 48 && vk <= 57) ? String.fromCharCode(vk) : vk >= 112 && vk <= 123 ? `F${vk - 111}` : null
    : e.code.startsWith('Key') ? e.code.slice(3) : e.code.startsWith('Digit') ? e.code.slice(5) : /^F\d+$/.test(e.code) ? e.code : null;
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
  { id: 'claude', icon: <I.Terminal size={20} /> },
  { id: 'license', icon: <I.Lock size={20} /> },
];

function App() {
  const [s, setS] = useState<SettingsState | null>(null);
  const [tab, setTab] = useState<SettingsTab>('general');
  const [error, setError] = useState<string>();
  const [download, setDownload] = useState<number | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [listening, setListening] = useState(false);
  const [copied, setCopied] = useState(false);
  const [licenseKey, setLicenseKey] = useState('');
  const [activating, setActivating] = useState(false);
  const [licenseResult, setLicenseResult] = useState<{ ok: boolean; text: string }>();

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

  async function activate() {
    setActivating(true);
    const r = await api.activateLicense(licenseKey);
    setActivating(false);
    setLicenseResult(r.ok ? { ok: true, text: S.activated } : { ok: false, text: r.error });
    if (r.ok) setLicenseKey('');
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
            onClick={() => {
              setError(undefined);
              setListening(true);
            }}
            onBlur={() => setListening(false)}
            onKeyDown={(e) => {
              if (!listening) return;
              e.preventDefault();
              if (e.key === 'Escape') return setListening(false);
              if (['Control', 'Shift', 'Alt', 'AltGraph', 'Meta'].includes(e.key)) return; // la combinaison n'est pas finie
              const acc = accelerator(e);
              if (!acc) return setError(S.shortcutUnsupported); // sinon rien ne se passe, sans explication
              void update({ shortcut: acc });
              setListening(false);
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
          <label className="label" htmlFor="ui-language">
            {S.uiLanguage}
          </label>
          {/* Changer de langue recharge les fenêtres ouvertes, celle-ci comprise. */}
          <select id="ui-language" value={s.uiLanguage} onChange={(e) => void update({ uiLanguage: e.target.value as Settings['uiLanguage'] })}>
            <option value="auto">{S.uiLanguageAuto}</option>
            {LANGS.map((l) => (
              <option key={l} value={l} lang={l}>
                {LANG_NAMES[l]}
              </option>
            ))}
          </select>
        </div>
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
    <>
      <Section title={S.context}>
        <div className="row stack">
          <label className="hint" htmlFor="context" style={{ margin: 0 }}>
            {S.contextHint}
          </label>
          <textarea
            id="context"
            rows={2}
            key={s.context}
            defaultValue={s.context}
            placeholder={S.contextPlaceholder}
            onBlur={(e) => void update({ context: e.target.value.trim() })}
          />
        </div>
      </Section>
      <Section title={S.instructions}>
        <div className="row stack">
          <label className="hint" htmlFor="instructions" style={{ margin: 0 }}>
            {S.instructionsHint}
          </label>
          <textarea id="instructions" rows={14} key={s.instructions} defaultValue={s.instructions} onBlur={(e) => void update({ instructions: e.target.value })} />
        </div>
      </Section>
    </>
  );

  // Claude Code : la commande à copier, et la dernière connexion du serveur MCP.
  const command = `claude mcp add --transport http --scope user vibescreener ${s.mcp.url}`;
  const claude = (
    <Section title={S.claudeCode} hint={s.mcp.url ? <p className="hint">{S.claudeCodeHint}</p> : <p className="error">{s.mcp.error ?? S.claudeCodeOff}</p>}>
      <div className="row">
        <span className="device-icon">
          <I.Terminal size={20} />
        </span>
        <span className="label">
          {S.claudeCode}
          <small className="state">
            <span className={`dot ${s.mcpSeenAt ? '' : 'off'}`} />
            {s.mcpSeenAt ? S.claudeCodeSeen(s.mcpSeenAt) : S.claudeCodeNever}
          </small>
        </span>
      </div>
      {s.mcp.url && (
        <div className="row stack">
          <label className="hint" htmlFor="mcp" style={{ margin: 0 }}>
            {S.claudeCodeCommand}
          </label>
          <span className="field">
            <input id="mcp" readOnly value={command} onFocus={(e) => e.currentTarget.select()} />
            <button
              type="button"
              className="btn"
              onClick={() => {
                api.copyText(command);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? S.copied : S.copy}
            </button>
          </span>
        </div>
      )}
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

  // Licence : essai ou clé, achat sur le site, activation d'une clé reçue par e-mail.
  const L = s.license;
  const hasKey = L.state === 'licensed' || L.state === 'unverified';
  const license = (
    <>
      <Section title={S.license} hint={<p className="hint">{S.licenseHint}</p>}>
        <div className="row">
          <span className="device-icon">{L.state === 'trial' || L.state === 'licensed' ? <I.Lock size={20} /> : <I.Warning size={18} />}</span>
          <span className="label">
            <span>
              {S.licenseStates[L.state](L.daysLeft)}
              {L.key && <span className="key"> · {L.key}</span>}
            </span>
            <small>{S.licenseDetails[L.state]}</small>
          </span>
          {hasKey ? (
            <button type="button" className="btn" onClick={() => api.openLicensePage('portal')}>
              {S.portal}
            </button>
          ) : (
            <button type="button" className="btn primary" onClick={() => api.openLicensePage('buy')}>
              {S.buy}
            </button>
          )}
        </div>
        {!hasKey && (
          <div className="row stack">
            <label htmlFor="license-key">
              {S.licenseKey} <small className="hint">{S.licenseKeyHint}</small>
            </label>
            <span className="field">
              <input
                id="license-key"
                value={licenseKey}
                spellCheck={false}
                autoComplete="off"
                onChange={(e) => setLicenseKey(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && licenseKey.trim() && !activating && void activate()}
              />
              <button type="button" className="btn" disabled={!licenseKey.trim() || activating} onClick={() => void activate()}>
                {activating ? S.activating : S.activate}
              </button>
            </span>
          </div>
        )}
      </Section>
      {licenseResult && <p className={licenseResult.ok ? 'hint ok' : 'error'}>{licenseResult.text}</p>}
    </>
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
        {{ general, transcription, export: exportPdf, devices, claude, license }[tab]}
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
