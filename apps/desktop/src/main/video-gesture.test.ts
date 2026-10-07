import { describe, expect, it } from 'vitest';
import { videoGesture } from './video-gesture.ts';

const display = { x: -1000, y: 200, width: 1000, height: 800 };
const start = { x: -800, y: 400, shift: false };

describe('cadres vidéo', () => {
  it('utilise les coordonnées de l’écran du clic, même à gauche et au-dessous du principal', () => {
    expect(videoGesture(start, { x: -400, y: 700, alt: false }, display)).toEqual({ geometry: { kind: 'zone', x: 0.2, y: 0.25, w: expect.closeTo(0.4), h: 0.375 }, crop: false });
  });
  it('un glissement inversé et Alt donnent le même cadre recadré', () => {
    expect(videoGesture({ x: -400, y: 700, shift: false }, { ...start, alt: true }, display)).toEqual({ geometry: { kind: 'zone', x: 0.2, y: 0.25, w: expect.closeTo(0.4), h: 0.375 }, crop: true });
  });
  it('borne un glissement qui sort de l’écran initial', () => {
    expect(videoGesture(start, { x: 500, y: 1500, alt: false }, display)).toEqual({ geometry: { kind: 'zone', x: 0.2, y: 0.25, w: 0.8, h: 0.75 }, crop: false });
  });
  it('une petite dérive du curseur et un cadre sans hauteur restent des clics', () => {
    expect(videoGesture(start, { x: -798, y: 403, alt: true }, display)).toEqual({ crop: false });
    expect(videoGesture(start, { x: -500, y: 400, alt: true }, display)).toEqual({ crop: false });
  });
  it('⇧ + glisser produit une flèche, sans recadrage', () => {
    expect(videoGesture({ ...start, shift: true }, { x: -400, y: 700, alt: true }, display)).toEqual({ geometry: { kind: 'arrow', x1: 0.2, y1: 0.25, x2: 0.6, y2: 0.625 }, crop: false });
  });
});
