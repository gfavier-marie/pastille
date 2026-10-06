// Session factice pour les tests : 5 captures d'interfaces dessinées, 20 points.

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { newSession, renumber, type Annotation, type Geometry, type Session } from '@pastille/shared';

const SCREENS = ['Tableau de bord', 'Connexion', 'Paramètres', 'Liste des commandes', 'Fiche produit'];

/** Écrit la session dans `sessionsDir/<id>/` (session.json compris) ; renvoie la session et son dossier. */
export async function createFakeSession(sessionsDir: string, pointsPerScreen = 4): Promise<{ session: Session; dir: string }> {
  const session = newSession(new Date(2026, 9, 6, 10, 30), 'Back-office React, page testée en local');
  const dir = join(sessionsDir, session.id);
  await mkdir(join(dir, 'captures'), { recursive: true });
  for (const [i, title] of SCREENS.entries()) {
    const width = 1600, height = 1000;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f5f6f8';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(0, 0, width, 80); // header
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 32px sans-serif';
    ctx.fillText(title, 40, 52);
    for (let b = 0; b < pointsPerScreen; b++) {
      ctx.fillStyle = '#3b82f6';
      ctx.fillRect(120 + b * 340, 300 + (b % 2) * 200, 220, 64); // boutons
      ctx.fillStyle = '#ffffff';
      ctx.font = '24px sans-serif';
      ctx.fillText(`Bouton ${b + 1}`, 160 + b * 340, 342 + (b % 2) * 200);
    }
    const id = `capture-${i + 1}`;
    const image = `captures/${id}.png`;
    await writeFile(join(dir, image), await canvas.encode('png'));
    const annotations: Annotation[] = Array.from({ length: pointsPerScreen }, (_, b) => {
      const cx = (230 + b * 340) / width, cy = (332 + (b % 2) * 200) / height;
      const geometry: Geometry =
        b === 1 ? { kind: 'zone', x: cx - 0.08, y: cy - 0.05, w: 0.16, h: 0.1 }
        : b === 2 ? { kind: 'arrow', x1: cx, y1: cy, x2: cx + 0.1, y2: cy + 0.15 }
        : { kind: 'point', x: cx, y: cy };
      return {
        id: `${id}-a${b + 1}`,
        number: 0,
        geometry,
        text: `${title} : le bouton ${b + 1} doit avoir un border-radius de ${4 * (b + 1)} px.`,
        input: 'typed',
        transcription: 'none',
        sketches: [],
        createdAt: session.createdAt,
        updatedAt: session.createdAt,
      };
    });
    session.captures.push({
      id,
      createdAt: session.createdAt,
      image,
      width,
      height,
      scaleFactor: 2,
      source: { app: 'Google Chrome', windowTitle: title },
      annotations,
    });
  }
  // Un croquis de tablette sur le point #1.
  await mkdir(join(dir, 'sketches'), { recursive: true });
  const sketch = createCanvas(800, 600);
  const sctx = sketch.getContext('2d');
  sctx.fillStyle = '#ffffff';
  sctx.fillRect(0, 0, 800, 600);
  sctx.strokeStyle = '#E5341F';
  sctx.lineWidth = 8;
  sctx.strokeRect(200, 200, 400, 160);
  await writeFile(join(dir, 'sketches/croquis-1.png'), await sketch.encode('png'));
  await writeFile(join(dir, 'sketches/croquis-1.json'), '{"strokes":[]}');
  session.captures[0]!.annotations[0]!.sketches.push({
    id: 'croquis-1',
    png: 'sketches/croquis-1.png',
    strokes: 'sketches/croquis-1.json',
    createdAt: session.createdAt,
  });
  renumber(session);
  await writeFile(join(dir, 'session.json'), JSON.stringify(session, null, 2));
  return { session, dir };
}
