import type { Geometry } from '@pastille/shared';

/** Un glissement de 4 DIP devient un cadre ; ⇧ une flèche, ⌥ / Alt un recadrage. */
export function videoGesture(
  start: { x: number; y: number; shift: boolean },
  end: { x: number; y: number; alt: boolean },
  display: { x: number; y: number; width: number; height: number },
): { geometry?: Geometry; crop: boolean } {
  const X = (x: number) => Math.max(0, Math.min(1, (x - display.x) / display.width));
  const Y = (y: number) => Math.max(0, Math.min(1, (y - display.y) / display.height));
  if (Math.abs(end.x - start.x) < 4 && Math.abs(end.y - start.y) < 4) return { crop: false };
  if (start.shift) return { geometry: { kind: 'arrow', x1: X(start.x), y1: Y(start.y), x2: X(end.x), y2: Y(end.y) }, crop: false };
  const x = Math.min(X(start.x), X(end.x)), y = Math.min(Y(start.y), Y(end.y));
  const w = Math.abs(X(end.x) - X(start.x)), h = Math.abs(Y(end.y) - Y(start.y));
  // Un glissement horizontal/vertical ne produit pas une image de largeur/hauteur nulle.
  if (!w || !h) return { crop: false };
  return { geometry: { kind: 'zone', x, y, w, h }, crop: end.alt };
}
