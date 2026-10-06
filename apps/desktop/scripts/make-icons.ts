// Génère les icônes de la barre de menus / zone de notification (à relancer si le dessin change).

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createCanvas } from '@napi-rs/canvas';

const out = join(import.meta.dirname, '..', 'resources');
const pwa = join(import.meta.dirname, '..', '..', 'pwa', 'public');

async function icon(size: number, color: string, file: string, background?: string) {
  const c = createCanvas(size, size);
  const ctx = c.getContext('2d');
  const r = size * (background ? 0.3 : 0.42);
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, size, size);
  }
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, r, 0, Math.PI * 2);
  ctx.fill();
  // Petit point évidé au centre : une pastille posée sur un élément.
  ctx.globalCompositeOperation = background ? 'source-over' : 'destination-out';
  if (background) ctx.fillStyle = background;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, r * 0.38, 0, Math.PI * 2);
  ctx.fill();
  await writeFile(file, await c.encode('png'));
}

await icon(16, '#000000', join(out, 'trayTemplate.png')); // macOS : image « template », noire + transparence
await icon(32, '#000000', join(out, 'trayTemplate@2x.png'));
await icon(32, '#e5484d', join(out, 'tray.png')); // Windows
await icon(192, '#e5484d', join(pwa, 'icon-192.png'), '#ffffff'); // PWA (écran d'accueil)
await icon(512, '#e5484d', join(pwa, 'icon-512.png'), '#ffffff');
await icon(180, '#e5484d', join(pwa, 'apple-touch-icon.png'), '#ffffff');
await icon(1024, '#e5484d', join(import.meta.dirname, '..', 'build', 'icon.png'), '#ffffff'); // icône de l'app (installeurs)
