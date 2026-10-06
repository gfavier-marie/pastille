// Connexion au relais, côté desktop (Node) comme côté tablette (navigateur) :
// chiffrement des messages et reconnexion automatique avec attente progressive.

import { importKey } from './crypto.ts';
import { decodeMessage, encodeMessage, type Message } from './protocol.ts';

export type LinkStatus = 'connecting' | 'open' | 'closed';

export type Link = { send(msg: Message): Promise<void>; close(): void };

export function relaySocketUrl(relayBase: string, roomId: string): string {
  return `${relayBase.replace(/^http/, 'ws').replace(/\/$/, '')}/ws/${roomId}`;
}

export function connectLink(opts: {
  url: string; // wss://…/ws/<roomId>
  key: string;
  role: 'desktop' | 'tablet';
  onMessage: (msg: Message) => void;
  onStatus?: (status: LinkStatus) => void;
}): Link {
  const keyPromise = importKey(opts.key);
  let ws: WebSocket | null = null;
  let closed = false;
  let delay = 500;

  async function send(msg: Message) {
    if (ws?.readyState !== WebSocket.OPEN) return;
    ws.send(await encodeMessage(await keyPromise, msg));
  }

  function open() {
    opts.onStatus?.('connecting');
    const socket = new WebSocket(opts.url);
    socket.binaryType = 'arraybuffer';
    ws = socket;
    socket.onopen = () => {
      delay = 500;
      opts.onStatus?.('open');
      void send({ type: 'hello', role: opts.role });
    };
    socket.onmessage = async (e) => {
      if (!(e.data instanceof ArrayBuffer)) return;
      let msg: Message;
      try {
        msg = await decodeMessage(await keyPromise, new Uint8Array(e.data));
      } catch {
        return; // message illisible (autre clé) : ignoré
      }
      // Chaque côté répond une fois au hello de l'autre : la présence est connue quel que soit l'ordre d'arrivée.
      if (msg.type === 'hello' && !msg.ack) void send({ type: 'hello', role: opts.role, ack: true });
      opts.onMessage(msg);
    };
    socket.onclose = () => {
      if (ws !== socket) return;
      opts.onStatus?.('closed');
      if (closed) return;
      setTimeout(open, delay);
      delay = Math.min(delay * 2, 10_000);
    };
  }

  open();
  return {
    send,
    close() {
      closed = true;
      ws?.close();
    },
  };
}
