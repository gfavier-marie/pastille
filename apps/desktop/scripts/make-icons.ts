// Génère les icônes de la barre de menus / zone de notification (à relancer si le dessin change).

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createCanvas } from '@napi-rs/canvas';

const out = join(import.meta.dirname, '..', 'resources');

async function icon(size: number, color: string, file: string) {
  const c = createCanvas(size, size);
  const ctx = c.getContext('2d');
  const r = size * 0.42;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, r, 0, Math.PI * 2);
  ctx.fill();
  // Petit point évidé au centre : une pastille posée sur un élément.
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, r * 0.38, 0, Math.PI * 2);
  ctx.fill();
  await writeFile(join(out, file), await c.encode('png'));
}

await icon(16, '#000000', 'trayTemplate.png'); // macOS : image « template », noire + transparence
await icon(32, '#000000', 'trayTemplate@2x.png');
await icon(32, '#e5484d', 'tray.png'); // Windows
