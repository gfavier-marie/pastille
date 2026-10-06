// Génère les icônes de la barre de menus / zone de notification et celles de la PWA
// (à relancer si le dessin change : node apps/desktop/scripts/make-icons.ts).

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createCanvas, Path2D, type SKRSContext2D } from '@napi-rs/canvas';

const out = join(import.meta.dirname, '..', 'resources');
const pwa = join(import.meta.dirname, '..', '..', 'pwa', 'public');
const ACCENT = '#D63A0C';

// Dessins en unités de 16 × 16 (barre de menus) : la pastille en goutte, pointe en bas à gauche.
const PIN_OUTLINE = new Path2D('M8 1.75a6.25 6.25 0 1 1 0 12.5H1.75V8A6.25 6.25 0 0 1 8 1.75z');
const PIN_FILLED = new Path2D('M8 1a7 7 0 1 1 0 14H1V8a7 7 0 0 1 7-7z');
const SPINNER = new Path2D('M6 1.25A4.75 4.75 0 1 1 1.25 6'); // en unités de 12
const WARNING = new Path2D('M7 1.8 12.6 11.6H1.4zM7 5.6v2.6M7 10h0'); // en unités de 14

type Draw = (ctx: SKRSContext2D) => void;

async function png(width: number, height: number, scale: number, draw: Draw, file: string) {
  const c = createCanvas(width * scale, height * scale);
  const ctx = c.getContext('2d');
  ctx.scale(scale, scale);
  draw(ctx);
  await writeFile(file, await c.encode('png'));
}

/** Icône de barre de menus en 1x et 2x (macOS choisit selon l'écran). */
async function tray(name: string, width: number, draw: Draw) {
  await png(width, 16, 1, draw, join(out, `${name}.png`));
  await png(width, 16, 2, draw, join(out, `${name}@2x.png`));
}

const outline = (color: string): Draw => (ctx) => {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.stroke(PIN_OUTLINE);
  ctx.beginPath();
  ctx.arc(8, 8, 2.25, 0, Math.PI * 2);
  ctx.fill();
};

/** Pastille pleine, centre évidé : seul état en couleur (dictée en cours). */
const filled = (color: string): Draw => (ctx) => {
  ctx.fillStyle = color;
  ctx.fill(PIN_FILLED);
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.arc(8, 8, 2.4, 0, Math.PI * 2);
  ctx.fill();
};

/** Pastille suivie d'un signe (transcriptions en cours, erreur), dessiné à droite. */
const withMark = (mark: Path2D, unit: number, size: number): Draw => (ctx) => {
  outline('#000000')(ctx);
  ctx.save();
  ctx.translate(18, (16 - size) / 2);
  ctx.scale(size / unit, size / unit);
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke(mark);
  ctx.restore();
};

// macOS : images « template » (noir + transparence, inversées par le système), sauf la dictée.
await tray('trayTemplate', 16, outline('#000000'));
await tray('trayPendingTemplate', 30, withMark(SPINNER, 12, 11));
await tray('trayErrorTemplate', 32, withMark(WARNING, 14, 13));
await tray('trayRecording', 16, filled(ACCENT));
// Windows : une icône carrée en couleur, l'état passe par l'infobulle.
await png(16, 16, 2, filled(ACCENT), join(out, 'tray.png'));

// PWA (écran d'accueil) : la pastille du logo sur fond blanc.
const logo: Draw = (ctx) => {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 28, 28);
  ctx.translate(4, 4);
  ctx.scale(20 / 28, 20 / 28);
  ctx.fillStyle = ACCENT;
  ctx.fill(new Path2D('M14 2a12 12 0 1 1 0 24H2V14A12 12 0 0 1 14 2z'));
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(14, 14, 4.2, 0, Math.PI * 2);
  ctx.fill();
};
await png(28, 28, 192 / 28, logo, join(pwa, 'icon-192.png'));
await png(28, 28, 512 / 28, logo, join(pwa, 'icon-512.png'));
await png(28, 28, 180 / 28, logo, join(pwa, 'apple-touch-icon.png'));
