// PWA — POC synchro : se connecte au relais avec l'appairage du QR, répond aux
// pings du desktop et mesure l'aller-retour tablette → desktop → tablette.

import { connectLink, relaySocketUrl, type Message } from '@pastille/shared';

const statusEl = document.getElementById('status')!;
const measureBtn = document.getElementById('measure') as HTMLButtonElement;
const resultEl = document.getElementById('result')!;

// L'appairage arrive dans le fragment (#r=…&k=…), jamais envoyé au serveur, puis il est mémorisé.
const hash = new URLSearchParams(location.hash.slice(1));
if (hash.get('r') && hash.get('k')) {
  localStorage.setItem('pairing', JSON.stringify({ roomId: hash.get('r'), key: hash.get('k') }));
  history.replaceState(null, '', location.pathname);
}
const pairing = JSON.parse(localStorage.getItem('pairing') ?? 'null') as { roomId: string; key: string } | null;

const pending = new Map<number, (t: number) => void>();
let desktopSeen = false;

if (!pairing) {
  statusEl.textContent = 'Non appairée : scanne le QR code affiché par Pastille sur ton ordinateur.';
} else {
  const link = connectLink({
    url: relaySocketUrl(location.origin, pairing.roomId),
    key: pairing.key,
    role: 'tablet',
    onStatus(status) {
      statusEl.className = status;
      statusEl.textContent =
        status === 'open' ? (desktopSeen ? 'Connectée au desktop' : 'Relais joint, en attente du desktop…') : 'Connexion…';
      if (status !== 'open') measureBtn.disabled = true;
    },
    onMessage(msg: Message) {
      if (msg.type === 'hello' || msg.type === 'ping') {
        desktopSeen = true;
        statusEl.className = 'peer';
        statusEl.textContent = 'Connectée au desktop';
        measureBtn.disabled = false;
      }
      if (msg.type === 'ping') void link.send({ type: 'pong', id: msg.id, t: msg.t });
      if (msg.type === 'pong') pending.get(msg.id)?.(performance.now() - msg.t);
    },
  });

  measureBtn.onclick = async () => {
    measureBtn.disabled = true;
    const rtts: number[] = [];
    for (let id = 1; id <= 20; id++) {
      const rtt = await new Promise<number>((resolve) => {
        pending.set(id, resolve);
        void link.send({ type: 'ping', id, t: performance.now() });
        setTimeout(() => resolve(Infinity), 3000);
      });
      pending.delete(id);
      rtts.push(rtt);
    }
    rtts.sort((a, b) => a - b);
    const median = rtts[10]!;
    resultEl.textContent = `Aller-retour chiffré : médiane ${Math.round(median)} ms, max ${Math.round(rtts[19]!)} ms (cible < 300 ms) ${median < 300 ? '✓' : '✗'}`;
    measureBtn.disabled = false;
  };
}
