// PWA de croquis (§5) : une toile, un bouton « Envoyer », le croquis rejoint le point
// sélectionné sur le desktop. Pas de compte, pas de liste, pas de saisie de texte.

import { connectLink, MAX_MESSAGE_BYTES, relaySocketUrl, type Message } from '@pastille/shared';
import { createBoard, type Background } from './board.ts';
import { T } from './texts.ts';

const $ = <E extends HTMLElement>(sel: string) => document.querySelector(sel) as E;
const pinEl = $<HTMLSpanElement>('#pin');
const titleEl = $<HTMLDivElement>('#title');
const subEl = $<HTMLDivElement>('#sub');
const linkEl = $<HTMLSpanElement>('#link');
const offlineEl = $<HTMLDivElement>('#offline');
const sendBtn = $<HTMLButtonElement>('#send');
const bgBtn = $<HTMLButtonElement>('#background');
const toastEl = $<HTMLDivElement>('#toast');
const welcomeEl = $<HTMLDivElement>('#welcome');

if ('serviceWorker' in navigator) void navigator.serviceWorker.register('/sw.js');

// L'appairage arrive dans le fragment (#r=…&k=…), jamais envoyé au serveur, puis il est mémorisé.
const hash = new URLSearchParams(location.hash.slice(1));
const justPaired = !!(hash.get('r') && hash.get('k'));
if (justPaired) {
  localStorage.setItem('pairing', JSON.stringify({ roomId: hash.get('r'), key: hash.get('k') }));
  history.replaceState(null, '', location.pathname);
}
const pairing = JSON.parse(localStorage.getItem('pairing') ?? 'null') as { roomId: string; key: string } | null;

type Focus = { annotationId: string; number: number; text: string } | { annotationId: ''; lastNumber?: number } | null;
let focus: Focus = null;
let desktop = false; // desktop joignable
let pendingAck: { sketchId: string; timer: ReturnType<typeof setTimeout> } | null = null;

let toastTimer: ReturnType<typeof setTimeout>;
function toast(text: string, ok = true) {
  toastEl.querySelector('span')!.textContent = text;
  toastEl.className = `on ${ok ? '' : 'plain'}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastEl.className = ''), 2500);
}

// Première ouverture après le scan : comment installer la PWA.
welcomeEl.querySelector('h1')!.textContent = T.welcomeTitle;
welcomeEl.querySelector('p')!.textContent = T.welcomeText;
welcomeEl.querySelector('button')!.textContent = T.welcomeStart;
welcomeEl.querySelector('button')!.addEventListener('click', () => welcomeEl.classList.remove('on'));
if (justPaired && !matchMedia('(display-mode: standalone)').matches) welcomeEl.classList.add('on');

const board = createBoard($('#bg'), $('#ink'), () => updateUi());

function target(): number | undefined {
  if (!focus) return undefined;
  return 'number' in focus ? focus.number : focus.lastNumber;
}

function header(pin: number | undefined, title: string, sub: string) {
  pinEl.textContent = pin ? String(pin) : '';
  pinEl.className = pin ? (pin > 99 ? 'wide' : '') : 'empty';
  titleEl.textContent = title;
  subEl.textContent = sub;
}

function updateUi() {
  const online = navigator.onLine;
  const linked = desktop && online;
  linkEl.hidden = !pairing;
  linkEl.querySelector('.dot')!.className = `dot ${linked ? '' : 'off'}`;
  linkEl.querySelector('span:last-child')!.textContent = linked ? T.connected : T.offline;
  offlineEl.classList.toggle('on', !!pairing && !online);
  offlineEl.querySelector('span')!.textContent = T.offlineBanner;

  if (!pairing) header(undefined, T.notPaired, T.notPairedHint);
  else if (!desktop && online) header(undefined, T.waiting, T.waitingHint);
  else if (focus && 'number' in focus) header(focus.number, T.point(focus.number), focus.text || T.noComment);
  else if (target()) header(undefined, T.noSelection, T.noSelectionHint(target()!));
  else header(undefined, T.noPoint, T.noPointHint);

  sendBtn.disabled = !desktop || !online || !target() || board.isEmpty() || !!pendingAck;
  sendBtn.querySelector('span')!.textContent = online ? T.send(target()) : T.offline;
}

// Outils.
for (const b of document.querySelectorAll<HTMLButtonElement>('nav button')) {
  const key = b.dataset.tool ?? b.dataset.color ?? b.dataset.size ?? b.id;
  if (T.labels[key]) b.setAttribute('aria-label', T.labels[key]);
}
$('nav').setAttribute('aria-label', T.labels.toolbar!);
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
const bgLabel = () => (bgBtn.querySelector('span')!.textContent = T.backgrounds[backgrounds[bgIndex]!]);
bgLabel();
bgBtn.addEventListener('click', () => {
  do bgIndex = (bgIndex + 1) % backgrounds.length;
  while (backgrounds[bgIndex] === 'recadrage' && !board.hasCrop());
  board.setBackground(backgrounds[bgIndex]!);
  bgLabel();
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
        toast(T.sent(msg.number));
      }
      updateUi();
    },
  });

  sendBtn.addEventListener('click', async () => {
    if (!focus || sendBtn.disabled) return;
    const sketchId = crypto.randomUUID();
    const { png, strokes } = await board.export(MAX_MESSAGE_BYTES * 0.7); // marge pour le chiffrement et le JSON
    pendingAck = { sketchId, timer: setTimeout(() => ((pendingAck = null), toast(T.notConfirmed, false), updateUi()), 5000) };
    updateUi();
    await link.send({ type: 'sketch', annotationId: focus.annotationId, sketchId, png, strokes });
  });
}

updateUi();
