// Appairage de la tablette (§5.1) : code QR (la clé ne passe jamais par le serveur),
// marche à suivre, tablette connectée et révocation.

import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { PairingState } from '../../ipc.ts';
import * as I from '../icons.tsx';
import { T } from '../texts.ts';

const api = window.pastille;
const P = T.pairing;

function App() {
  const [p, setP] = useState<PairingState | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    void api.getPairing().then((s) => {
      setP(s);
      setConnected(s.connected);
    });
    return api.onTabletStatus(setConnected);
  }, []);

  if (!p) return null;

  async function revoke() {
    await api.revokeTablet();
    setP(await api.getPairing()); // nouveau code
  }

  return (
    <div className="pairing">
      <div className="main">
        <div className="code">
          <div className="qr">
            <img src={p.qr} alt={P.qr} />
            <span className="logo">
              <I.Logo size={34} />
            </span>
          </div>
          <div className={`status ${connected ? 'ok' : ''}`} role="status">
            {connected ? <I.CheckCircle size={14} /> : <I.Spinner size={12} />}
            {connected ? P.connected : P.waiting}
          </div>
        </div>
        <div className="steps">
          <h1>{P.title}</h1>
          <ol>
            {P.steps.map((text, i) => (
              <li key={i}>
                <span className="step-num">{i + 1}</span>
                <span>{text}</span>
              </li>
            ))}
          </ol>
          <p className="note">
            <I.Lock size={15} />
            <span>{P.secure}</span>
          </p>
        </div>
      </div>

      {connected && (
        <section className="devices" aria-label={P.devices}>
          <h2>{P.devices}</h2>
          <div className="device">
            <I.Tablet size={18} />
            <span className="what">
              <b>{P.tablet}</b>
              <small>{P.revokeHint}</small>
            </span>
            <span className="online">
              <span className="dot" />
              {P.online}
            </span>
            <button type="button" className="btn danger" onClick={() => void revoke()}>
              {P.revoke}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
