// Mesure du POC synchro : aller-retour chiffré desktop → tablette → desktop.
// Usage : pnpm bench:synchro [url du relais]   (défaut : http://localhost:8787)

import QRCode from 'qrcode';
import { connectLink, newPairing, relaySocketUrl, type Message } from '@pastille/shared';

const relay = (process.argv[2] ?? process.env.PASTILLE_RELAY ?? 'http://localhost:8787').replace(/\/$/, '');
const PINGS = 20;
const { roomId, key } = newPairing();
const pairUrl = `${relay}/#r=${roomId}&k=${key}`;

console.log(await QRCode.toString(pairUrl, { type: 'terminal', small: true }));
console.log(`Ouvre ce lien sur la tablette (ou scanne le QR) :\n${pairUrl}\n`);

const pending = new Map<number, (rtt: number) => void>();
let tabletReady: () => void;
const tablet = new Promise<void>((r) => (tabletReady = r));

const link = connectLink({
  url: relaySocketUrl(relay, roomId),
  key,
  role: 'desktop',
  onStatus: (s) => console.log(`relais : ${s}`),
  onMessage(msg: Message) {
    if (msg.type === 'hello' && msg.role === 'tablet') tabletReady();
    if (msg.type === 'ping') void link.send({ type: 'pong', id: msg.id, t: msg.t });
    if (msg.type === 'pong') pending.get(msg.id)?.(performance.now() - msg.t);
  },
});

await tablet;
console.log('Tablette connectée, mesure…');
const rtts: number[] = [];
for (let id = 1; id <= PINGS; id++) {
  rtts.push(
    await new Promise<number>((resolve) => {
      pending.set(id, resolve);
      void link.send({ type: 'ping', id, t: performance.now() });
      setTimeout(() => resolve(Infinity), 3000);
    }),
  );
  await new Promise((r) => setTimeout(r, 100));
}
rtts.sort((a, b) => a - b);
const median = rtts[Math.floor(PINGS / 2)]!;
console.log(`
| Mesure | Valeur |
| --- | --- |
| Relais | ${relay} |
| Aller-retour chiffré (médiane) | ${Math.round(median)} ms — cible < 300 ms ${median < 300 ? 'OK' : 'KO'} |
| Aller-retour (max) | ${Math.round(rtts.at(-1)!)} ms |
`);
console.log('La tablette reste joignable : Ctrl+C pour quitter.');
