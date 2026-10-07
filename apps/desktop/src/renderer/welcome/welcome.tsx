// Premier lancement (§4.9), en trois étapes : autorisations, modèle de dictée, essai du raccourci.
// Rouvert à chaque lancement tant que « Terminer » n'a pas été atteint ou qu'une autorisation manque.

import { useEffect, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Settings, SettingsState } from '../../ipc.ts';
import * as I from '../icons.tsx';
import { permissionRows } from '../permissions.tsx';
import { T } from '../texts.ts';

const api = window.pastille;
const W = T.welcome;

function App() {
  const [s, setS] = useState<SettingsState | null>(null);
  const [step, setStep] = useState(() => Number(location.hash.slice(1)) || 1); // #2, #3 : photos de l'autotest
  const [download, setDownload] = useState<number | null>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    void api.getSettings().then(setS);
    const off = api.onSettingsChanged(setS);
    const offProgress = api.onDownloadProgress(setDownload);
    const onFocus = () => void api.getSettings().then(setS); // retour des Réglages du système
    window.addEventListener('focus', onFocus);
    return () => {
      off();
      offProgress();
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  // Étape 3 : un appui sur le raccourci termine l'assistant (la capture, elle, a lieu).
  useEffect(() => api.onShortcutPressed(() => step === 3 && void finish()), [step]);

  // Étape 2 : le téléchargement démarre seul si le modèle manque.
  useEffect(() => {
    if (step === 2 && s && s.engine === 'local' && s.whisper.state === 'missing' && download === null && !error) void getModel();
  }, [step, s?.whisper.state]);

  if (!s) return null;

  const update = (patch: Partial<Settings>) => api.updateSettings(patch);

  async function getModel() {
    setError(undefined);
    setDownload(0);
    const r = await api.downloadModel();
    setDownload(null);
    if (!r.ok) setError(r.error);
  }


  async function finish() {
    await update({ firstRunDone: true });
    window.close();
  }

  const mac = s.platform === 'mac';
  const screenOk = !mac || s.permissions.screen === 'granted';
  const micOk = s.permissions.microphone === 'granted';
  const keyboard = s.commentMode === 'keyboard';

  const Granted = ({ label = W.permissions.granted }: { label?: string }) => (
    <span className="granted">
      <I.CheckCircle />
      {label}
    </span>
  );

  let body: ReactNode;
  let footer: ReactNode;

  if (step === 1) {
    body = (
      <>
        <Intro title={W.permissions.title} text={W.permissions.intro} />
        <div className="card">
          {permissionRows(s).map((r) => (
            <div className="row" key={r.kind}>
              <span className="icon-box">{r.icon}</span>
              <span className="what">
                <b>{r.title}</b>
                <span>{r.why}</span>
              </span>
              {r.ok ? (
                <Granted />
              ) : (
                <button type="button" className={`btn tall ${r.optional ? '' : 'primary'}`} onClick={() => void api.askPermission(r.kind)}>
                  {W.permissions.allow}
                </button>
              )}
            </div>
          ))}
        </div>
        {mac && (
          <p className="aside">
            <I.Info size={15} />
            <span>{W.permissions.relaunch}</span>
          </p>
        )}
        {s.license.state === 'trial' && (
          <p className="aside">
            <I.Info size={15} />
            <span>{W.trial(s.license.daysLeft)}</span>
          </p>
        )}
      </>
    );
    footer = (
      <>
        {!micOk && !keyboard && (
          <button type="button" className="link" onClick={() => void update({ commentMode: 'keyboard' })}>
            {W.permissions.keyboardOnly}
          </button>
        )}
        <span className="spacer" />
        <button type="button" className="btn primary tall" disabled={!screenOk || (!micOk && !keyboard)} onClick={() => setStep(2)}>
          {W.continue}
        </button>
      </>
    );
  } else if (step === 2) {
    // Fichier présent : Whisper se charge (quelques secondes), puis prêt ; ou en erreur, avec sa raison.
    const api_ = s.engine === 'api';
    const state = s.whisper.state;
    const ready = api_ || state === 'ready';
    const present = state !== 'missing';
    const failed = error ?? (s.whisper.state === 'error' ? s.whisper.detail : undefined);
    body = (
      <>
        <Intro title={ready || (present && !failed) ? W.model.titleReady : W.model.title} text={api_ ? W.model.apiChosen : W.model.intro} />
        {!api_ && (
          <div className="card pad">
            <div className="row" style={{ padding: 0 }}>
              <span className="icon-box">
                <I.Waveform size={20} />
              </span>
              <span className="what">
                <b>{W.model.name}</b>
                <span className={failed ? 'failed' : undefined}>{failed ?? W.model.detail}</span>
              </span>
              {failed ? (
                <button type="button" className="btn tall" onClick={() => void getModel()}>
                  {W.model.retry}
                </button>
              ) : ready ? (
                <Granted label={W.model.ready} />
              ) : present && download === null ? (
                <span className="loading">
                  <I.Spinner size={12} />
                  {T.settings.modelState.loading}
                </span>
              ) : null}
            </div>
            <div className="progress" role="progressbar" aria-label={W.model.name} aria-valuemin={0} aria-valuemax={100} aria-valuenow={present ? 100 : (download ?? 0)}>
              <i style={{ width: `${present ? 100 : (download ?? 0)}%` }} />
            </div>
            <div className="figures">
              <span>{present ? W.model.progress(100) : W.model.progress(download ?? 0)}</span>
              {!present && <span>{download ?? 0} %</span>}
            </div>
          </div>
        )}
        {!present && !api_ && (
          <p className="note">
            <I.Keyboard size={15} />
            <span>{W.model.note}</span>
          </p>
        )}
      </>
    );
    footer = (
      <>
        {!api_ && !ready && (
          <button
            type="button"
            className="link"
            onClick={() => void update({ engine: 'api' }).then(() => api.openSettings('transcription'))}
          >
            {W.model.useApi}
          </button>
        )}
        <span className="spacer" />
        <button type="button" className="btn tall" onClick={() => setStep(1)}>
          {W.back}
        </button>
        <button type="button" className="btn primary tall" onClick={() => setStep(3)}>
          {W.continue}
        </button>
      </>
    );
  } else {
    const keys = mac ? [...s.shortcutLabel] : s.shortcutLabel.split('+');
    body = (
      <>
        <Intro title={W.shortcut.title} text={W.shortcut.intro(keys.length)} />
        <div className="keys">
          {keys.map((k, i) => (
            <kbd key={i}>{k}</kbd>
          ))}
          <span className="waiting" role="status">
            <i className="blink" />
            {W.shortcut.waiting}
          </span>
        </div>
        <ol>
          {W.shortcut.steps.map(([title, text], i) => (
            <li key={title}>
              <span className="pin">{i + 1}</span>
              <b>{title}</b>
              <span>{text}</span>
            </li>
          ))}
        </ol>
        <p className="aside news">
          <I.Video size={15} />
          <span>
            <b>{W.shortcut.videoTitle}</b> {W.shortcut.video(s.videoShortcutLabel)}
          </span>
        </p>
        <label className="check">
          <input type="checkbox" checked={s.openAtLogin} onChange={(e) => void update({ openAtLogin: e.target.checked })} />
          {W.shortcut.openAtLogin}
        </label>
      </>
    );
    footer = (
      <>
        <button type="button" className="link" onClick={() => api.openSettings('general')}>
          {W.shortcut.other}
        </button>
        <span className="spacer" />
        <button type="button" className="btn tall" onClick={() => setStep(2)}>
          {W.back}
        </button>
        <button type="button" className="btn primary tall" onClick={() => void finish()}>
          {W.finish}
        </button>
      </>
    );
  }

  return (
    <div className={`wizard ${mac ? '' : 'win'}`}>
      <div className="drag" />
      <div className="body">
        <div className="progress-head">
          <I.Logo size={36} />
          <div className="bars" role="progressbar" aria-label={W.step(step)} aria-valuemin={1} aria-valuemax={3} aria-valuenow={step}>
            {[1, 2, 3].map((n) => (
              <span key={n} className={n <= step ? 'on' : ''} />
            ))}
          </div>
          <span className="label">{W.step(step)}</span>
        </div>
        {body}
      </div>
      <footer>{footer}</footer>
    </div>
  );
}

const Intro = (p: { title: string; text: string }) => (
  <div className="intro">
    <h1>{p.title}</h1>
    <p>{p.text}</p>
  </div>
);

createRoot(document.getElementById('root')!).render(<App />);
