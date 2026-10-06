// PWA de croquis (§5) : une toile, un bouton « Envoyer », le croquis rejoint le point
// sélectionné sur le desktop. Pas de compte, pas de liste, pas de saisie de texte.

import { connectLink, MAX_MESSAGE_BYTES, relaySocketUrl, type Message } from '@pastille/shared';
import { createBoard, type Background } from './board.ts';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const focusEl = $<HTMLSpanElement>('#focus');
const dot = $<HTMLSpanElement>('#dot');
const sendBtn = $<HTMLButtonElement>('#send');
const bgBtn = $<HTMLButtonElement>('#background');
const toastEl = $<HTMLDivElement>('#toast');

if ('serviceWorker' in navigator) void navigator.serviceWorker.register('/sw.js');

// L'appairage arrive dans le fragment (#r=…&k=…), jamais envoyé au serveur, puis il est mémorisé.
const hash = new URLSearchParams(location.hash.slice(1));
if (hash.get('r') && hash.get('k')) {
  localStorage.setItem('pairing', JSON.stringify({ roomId: hash.get('r'), key: hash.get('k') }));
  history.replaceState(null, '', location.pathname);
}
const pairing = JSON.parse(localStorage.getItem('pairing') ?? 'null') as { roomId: string; key: string } | null;

type Focus = { annotationId: string; number: number; text: string } | { annotationId: ''; lastNumber?: number } | null;
let focus: Focus = null;
let desktop = false; // desktop joignable
let pendingAck: { sketchId: string; timer: ReturnType<typeof setTimeout> } | null = null;

function toast(text: string) {
  toastEl.textContent = text;
  toastEl.style.display = 'block';
  setTimeout(() => (toastEl.style.display = 'none'), 2500);
}

const board = createBoard($('#bg'), $('#ink'), () => updateUi());

function target(): number | undefined {
  if (!focus) return undefined;
  return 'number' in focus ? focus.number : focus.lastNumber;
}

function updateUi() {
  dot.className = desktop && navigator.onLine ? 'on' : '';
  if (!pairing) focusEl.textContent = 'Non appairée : scanne le QR code affiché par Pastille sur ton ordinateur.';
  else if (!navigator.onLine) focusEl.textContent = 'Hors connexion : impossible d’envoyer un croquis.';
  else if (!desktop) focusEl.textContent = 'En attente de Pastille sur l’ordinateur…';
  else if (focus && 'number' in focus) focusEl.innerHTML = `<b>Point #${focus.number}</b> — ${escapeHtml(focus.text) || '<i>sans commentaire</i>'}`;
  else focusEl.textContent = target() ? `Aucun point sélectionné (envoi vers le dernier, #${target()})` : 'Aucun point sélectionné';
  sendBtn.disabled = !desktop || !navigator.onLine || !target() || board.isEmpty() || !!pendingAck;
  sendBtn.textContent = target() ? `Envoyer vers #${target()}` : 'Envoyer';
}

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

// Outils.
const press = (group: string, btn: HTMLElement) => {
  document.querySelectorAll(group).forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
};
document.querySelectorAll<HTMLButtonElement>('[data-color]').forEach((b) =>
  b.addEventListener('click', () => {
    board.setColor(b.dataset.color!);
    press('[data-color]', b);
    press('[data-tool]', $('[data-tool="pen"]'));
  }),
);
document.querySelectorAll<HTMLButtonElement>('[data-size]').forEach((b) =>
  b.addEventListener('click', () => (board.setSize(Number(b.dataset.size)), press('[data-size]', b))),
);
document.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((b) =>
  b.addEventListener('click', () => (board.setTool(b.dataset.tool as 'pen' | 'eraser'), press('[data-tool]', b))),
);
$('#undo').addEventListener('click', () => board.undo());
$('#clear').addEventListener('click', () => board.clear());
const backgrounds: Background[] = ['blanc', 'quadrillé', 'recadrage'];
let bgIndex = 0;
bgBtn.addEventListener('click', () => {
  do bgIndex = (bgIndex + 1) % backgrounds.length;
  while (backgrounds[bgIndex] === 'recadrage' && !board.hasCrop());
  board.setBackground(backgrounds[bgIndex]!);
  bgBtn.textContent = `Fond : ${backgrounds[bgIndex]}`;
});
window.addEventListener('online', updateUi);
window.addEventListener('offline', updateUi);

if (pairing) {
  const link = connectLink({
    url: relaySocketUrl(location.origin, pairing.roomId),
    key: pairing.key,
    role: 'tablet',
    onStatus(status) {
      if (status !== 'open') desktop = false;
      updateUi();
    },
    onMessage(msg: Message) {
      if (msg.type === 'hello' || msg.type === 'ping' || msg.type === 'focus' || msg.type === 'focus_none') desktop = true;
      if (msg.type === 'ping') void link.send({ type: 'pong', id: msg.id, t: msg.t });
      if (msg.type === 'focus') {
        if (!focus || !('number' in focus) || focus.annotationId !== msg.annotationId || msg.background) {
          board.setCrop(msg.background);
        }
        focus = { annotationId: msg.annotationId, number: msg.number, text: msg.text };
      }
      if (msg.type === 'focus_none') {
        focus = { annotationId: '', lastNumber: msg.lastNumber };
        board.setCrop(undefined);
      }
      if (msg.type === 'sketch_ack' && pendingAck?.sketchId === msg.sketchId) {
        clearTimeout(pendingAck.timer);
        pendingAck = null;
        board.clear();
        toast(`Joint au point #${msg.number}`);
      }
      updateUi();
    },
  });

  sendBtn.addEventListener('click', async () => {
    if (!focus || sendBtn.disabled) return;
    const sketchId = crypto.randomUUID();
    const { png, strokes } = await board.export(MAX_MESSAGE_BYTES * 0.7); // marge pour le chiffrement et le JSON
    pendingAck = { sketchId, timer: setTimeout(() => ((pendingAck = null), toast('Envoi non confirmé, réessaie'), updateUi()), 5000) };
    updateUi();
    await link.send({ type: 'sketch', annotationId: focus.annotationId, sketchId, png, strokes });
  });
}

updateUi();
