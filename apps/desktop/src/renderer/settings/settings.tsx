// Réglages (§4.8) et premiers pas (§4.9) : autorisations, modèle Whisper, puis les préférences.

import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Settings, SettingsState } from '../../ipc.ts';

const api = window.pastille;
const LANGUAGES = { fr: 'Français', en: 'Anglais', es: 'Espagnol', de: 'Allemand', it: 'Italien', auto: 'Détection automatique' };

/** Touche pressée → accélérateur Electron (« CommandOrControl+Shift+2 »). */
function accelerator(e: React.KeyboardEvent): string | null {
  const key = e.code.startsWith('Key') ? e.code.slice(3) : e.code.startsWith('Digit') ? e.code.slice(5) : /^F\d+$/.test(e.code) ? e.code : null;
  if (!key) return null;
  const mods = [
    (e.metaKey && navigator.userAgent.includes('Mac')) || (e.ctrlKey && !navigator.userAgent.includes('Mac')) ? 'CommandOrControl' : null,
    e.ctrlKey && navigator.userAgent.includes('Mac') ? 'Control' : null,
    e.altKey ? 'Alt' : null,
    e.shiftKey ? 'Shift' : null,
  ].filter(Boolean);
  return mods.length ? [...mods, key].join('+') : null; // un raccourci global a toujours un modificateur
}

const Status = ({ ok, children }: { ok: boolean; children: React.ReactNode }) => (
  <span className={ok ? 'ok' : 'todo'}>{ok ? '✓' : '•'} {children}</span>
);

function App() {
  const [s, setS] = useState<SettingsState | null>(null);
  const [error, setError] = useState<string>();
  const [download, setDownload] = useState<number | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [listening, setListening] = useState(false);

  useEffect(() => {
    void api.getSettings().then(setS);
    const off = api.onSettingsChanged(setS);
    const offProgress = api.onDownloadProgress(setDownload);
    // Les autorisations se donnent dans les Réglages du système : on rafraîchit au retour.
    const onFocus = () => void api.getSettings().then(setS);
    window.addEventListener('focus', onFocus);
    return () => {
      off();
      offProgress();
      window.removeEventListener('focus', onFocus);
    };
  }, []);

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

  const screenOk = s.permissions.screen === 'granted';
  const micOk = s.permissions.microphone === 'granted';
  const ready = screenOk && micOk && s.modelPresent;

  return (
    <main>
      <h1>Réglages</h1>
      {error && <p className="error">{error}</p>}

      {(!s.firstRunDone || !ready) && (
        <section className="first">
          <h2>Premiers pas</h2>
          {s.platform === 'mac' && (
            <div className="row">
              <Status ok={screenOk}>Enregistrement de l'écran (pour les captures)</Status>
              {!screenOk && <button onClick={() => void api.askPermission('screen')}>Autoriser…</button>}
            </div>
          )}
          <div className="row">
            <Status ok={micOk}>Micro (pour la dictée)</Status>
            {!micOk && <button onClick={() => void api.askPermission('microphone')}>Autoriser…</button>}
          </div>
          <div className="row">
            <Status ok={s.modelPresent}>Modèle de transcription Whisper (547 Mo, une seule fois)</Status>
            {!s.modelPresent &&
              (download === null ? (
                <button onClick={() => void getModel()}>Télécharger</button>
              ) : (
                <progress max={100} value={download}>
                  {download} %
                </progress>
              ))}
          </div>
          {s.platform === 'mac' && !screenOk && (
            <p className="hint">Après avoir coché Pastille dans les Réglages du système, macOS demande de relancer l'app.</p>
          )}
          {!s.firstRunDone && (
            <button className="primary" onClick={() => void update({ firstRunDone: true })}>
              {ready ? "C'est prêt" : 'Continuer quand même'}
            </button>
          )}
        </section>
      )}

      <section>
        <h2>Capture</h2>
        <label>
          Raccourci global
          <input
            readOnly
            className="shortcut"
            value={listening ? 'Appuie sur la combinaison…' : s.shortcutLabel}
            onFocus={() => setListening(true)}
            onBlur={() => setListening(false)}
            onKeyDown={(e) => {
              e.preventDefault();
              const acc = accelerator(e);
              if (acc) {
                void update({ shortcut: acc });
                e.currentTarget.blur();
              }
            }}
          />
        </label>
        {!s.shortcutOk && <p className="error">Ce raccourci est indisponible : choisis-en un autre.</p>}
      </section>

      <section>
        <h2>Commentaire</h2>
        <label>
          Mode
          <select value={s.commentMode} onChange={(e) => void update({ commentMode: e.target.value as Settings['commentMode'] })}>
            <option value="auto">Dictée automatique : poser un point lance le micro</option>
            <option value="push">Appuyer pour parler : maintenir ⌥ (Alt)</option>
            <option value="keyboard">Clavier seul</option>
          </select>
        </label>
        <label>
          Arrêt après un silence de
          <select value={s.silenceMs} onChange={(e) => void update({ silenceMs: Number(e.target.value) })}>
            {[2000, 3000, 5000, 8000].map((ms) => (
              <option key={ms} value={ms}>
                {ms / 1000} s
              </option>
            ))}
            <option value={0}>jamais (désactivé)</option>
          </select>
        </label>
        <label>
          Langue de dictée
          <select value={s.language} onChange={(e) => void update({ language: e.target.value })}>
            {Object.entries(LANGUAGES).map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section>
        <h2>Transcription</h2>
        <label>
          Moteur
          <select value={s.engine} onChange={(e) => void update({ engine: e.target.value as Settings['engine'] })}>
            <option value="local">Whisper local (gratuit, hors ligne, rien ne quitte la machine)</option>
            <option value="api">API avec clé (secours : l'audio est envoyé au service)</option>
          </select>
        </label>
        <p className="hint">
          Whisper local : {s.whisper.state === 'ready' ? 'prêt' : s.whisper.state === 'loading' ? 'chargement…' : 'detail' in s.whisper ? s.whisper.detail : ''}
        </p>
        {s.engine === 'api' && (
          <>
            <label>
              Adresse de l'API (compatible OpenAI)
              <input defaultValue={s.apiUrl} onBlur={(e) => void update({ apiUrl: e.target.value.trim() })} />
            </label>
            <label>
              Modèle
              <input defaultValue={s.apiModel} onBlur={(e) => void update({ apiModel: e.target.value.trim() })} />
            </label>
            <label>
              Clé {s.hasApiKey && <em>(enregistrée)</em>}
              <span className="inline">
                <input type="password" value={apiKey} placeholder="sk-…" onChange={(e) => setApiKey(e.target.value)} />
                <button onClick={() => void api.setApiKey(apiKey).then(() => setApiKey(''))}>Enregistrer</button>
              </span>
            </label>
          </>
        )}
        <label>
          Glossaire (vocabulaire à bien reconnaître)
          <textarea rows={3} defaultValue={s.glossary} onBlur={(e) => void update({ glossary: e.target.value })} />
        </label>
      </section>

      <section>
        <h2>Export</h2>
        <label>
          Dossier d'export
          <span className="inline">
            <input readOnly value={s.exportDir} />
            <button onClick={() => void api.chooseExportDir().then((dir) => (dir ? update({ exportDir: dir }) : undefined))}>Choisir…</button>
          </span>
        </label>
        <label>
          Instructions à l'IA en tête du PDF et du Markdown ({'{N}'} = nombre de retours)
          <textarea rows={6} key={s.instructions} defaultValue={s.instructions} onBlur={(e) => void update({ instructions: e.target.value })} />
        </label>
      </section>

      <section>
        <h2>Tablette</h2>
        <div className="row">
          <Status ok={s.tabletPaired}>{s.tabletPaired ? 'Une tablette est appairée' : 'Aucune tablette appairée'}</Status>
          <span>
            <button onClick={() => api.pairTablet()}>{s.tabletPaired ? 'Afficher le QR' : 'Appairer…'}</button>
            {s.tabletPaired && <button onClick={() => void api.revokeTablet()}>Révoquer</button>}
          </span>
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
