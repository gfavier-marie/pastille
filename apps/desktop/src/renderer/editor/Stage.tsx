// Zone centrale : la capture et ses annotations, dessinées par la fonction de rendu partagée.
// Clic = nouveau point ; glisser = zone ; ⇧ + glisser = flèche ; clic sur une pastille = sélection + bulle ;
// glisser une pastille = déplacement.
// Molette = zoom, Espace maintenu + glisser = déplacement de la vue.

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { drawAnnotations, pinPosition, type Annotation, type Capture, type Ctx2D, type Geometry } from '@pastille/shared';

const PIN_RADIUS = 13;

const emptyAnnotation: Annotation = {
  id: '',
  number: 0,
  geometry: { kind: 'point', x: 0, y: 0 },
  text: '',
  input: 'typed',
  transcription: 'none',
  sketches: [],
  createdAt: '',
  updatedAt: '',
};
const DRAG_THRESHOLD = 3;

type ViewState = { scale: number; ox: number; oy: number };
type Gesture =
  | { kind: 'pan'; x: number; y: number; ox: number; oy: number }
  | { kind: 'drag'; id: string; x: number; y: number; geometry: Geometry; moved: boolean }
  | { kind: 'add'; x: number; y: number; shift: boolean };

function translate(g: Geometry, dx: number, dy: number): Geometry {
  if (g.kind === 'point') return { ...g, x: g.x + dx, y: g.y + dy };
  if (g.kind === 'zone') return { ...g, x: g.x + dx, y: g.y + dy };
  return { ...g, x1: g.x1 + dx, y1: g.y1 + dy, x2: g.x2 + dx, y2: g.y2 + dy };
}

export function Stage(props: {
  capture: Capture;
  imageUrl: string;
  nextNumber: number; // numéro affiché pendant le tracé d'une zone ou d'une flèche
  selectedId: string | null;
  onSelect: (id: string | null, openBubble: boolean) => void;
  onAdd: (geometry: Geometry) => void;
  onMove: (id: string, geometry: Geometry) => void;
  bubble: (pin: { x: number; y: number }) => ReactNode; // bulle du point sélectionné, positionnée par la scène
}) {
  const { capture } = props;
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<ViewState>({ scale: 1, ox: 0, oy: 0 });
  const [preview, setPreview] = useState<{ id: string; geometry: Geometry } | null>(null);
  const [draft, setDraft] = useState<Geometry | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const space = useRef(false);

  // Chargement de l'image de la capture.
  useEffect(() => {
    const image = new Image();
    image.onload = () => setImg(image);
    image.src = props.imageUrl;
    return () => void (image.onload = null);
  }, [props.imageUrl]);

  // Taille de la zone d'affichage.
  useLayoutEffect(() => {
    const el = wrapRef.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Image ajustée à la fenêtre à chaque changement de capture.
  useEffect(() => {
    if (!size.w || !size.h) return;
    const scale = Math.min((size.w - 40) / capture.width, (size.h - 40) / capture.height);
    setView({ scale, ox: (size.w - capture.width * scale) / 2, oy: (size.h - capture.height * scale) / 2 });
  }, [capture.id, capture.width, capture.height, size.w > 0, size.h > 0]);

  const annotations: Annotation[] = capture.annotations.map((a) =>
    preview && a.id === preview.id ? { ...a, geometry: preview.geometry } : a,
  );
  const drawn: Annotation[] = draft
    ? [...annotations, { ...emptyAnnotation, id: 'draft', number: props.nextNumber, geometry: draft }]
    : annotations;
  const imageView = { x: view.ox, y: view.oy, width: capture.width * view.scale, height: capture.height * view.scale };

  // Dessin.
  useEffect(() => {
    const canvas = canvasRef.current!;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size.w * dpr);
    canvas.height = Math.round(size.h * dpr);
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);
    if (img) {
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, imageView.x, imageView.y, imageView.width, imageView.height);
    }
    drawAnnotations(ctx as unknown as Ctx2D, drawn, imageView, { radius: PIN_RADIUS, selectedId: props.selectedId ?? undefined });
  });

  // Zoom à la molette, centré sur le curseur (écouteur non passif pour bloquer le défilement).
  useEffect(() => {
    const el = canvasRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      setView((v) => {
        const scale = Math.min(8, Math.max(0.05, v.scale * Math.exp(-e.deltaY * 0.002)));
        const k = scale / v.scale;
        return { scale, ox: mx - (mx - v.ox) * k, oy: my - (my - v.oy) * k };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Espace maintenu = main pour déplacer la vue.
  useEffect(() => {
    const isTyping = (e: KeyboardEvent) => e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement;
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTyping(e)) {
        space.current = true;
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => e.code === 'Space' && (space.current = false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  function local(e: React.PointerEvent) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function hitTest(x: number, y: number): Annotation | undefined {
    return [...annotations].reverse().find((a) => {
      const [px, py] = pinPosition(a.geometry, imageView);
      return Math.hypot(px - x, py - y) <= PIN_RADIUS + 3;
    });
  }

  function onPointerDown(e: React.PointerEvent) {
    canvasRef.current!.setPointerCapture(e.pointerId);
    const p = local(e);
    if (space.current || e.button === 1) {
      gesture.current = { kind: 'pan', ...p, ox: view.ox, oy: view.oy };
      return;
    }
    if (e.button !== 0) return;
    const hit = hitTest(p.x, p.y);
    if (hit) gesture.current = { kind: 'drag', id: hit.id, ...p, geometry: hit.geometry, moved: false };
    else gesture.current = { kind: 'add', ...p, shift: e.shiftKey };
  }

  function onPointerMove(e: React.PointerEvent) {
    const g = gesture.current;
    if (!g) return;
    const p = local(e);
    if (g.kind === 'pan') setView((v) => ({ ...v, ox: g.ox + p.x - g.x, oy: g.oy + p.y - g.y }));
    if (g.kind === 'drag' && (g.moved || Math.hypot(p.x - g.x, p.y - g.y) > DRAG_THRESHOLD)) {
      g.moved = true;
      setPreview({ id: g.id, geometry: translate(g.geometry, (p.x - g.x) / imageView.width, (p.y - g.y) / imageView.height) });
    }
    if (g.kind === 'add' && (draft || Math.hypot(p.x - g.x, p.y - g.y) > DRAG_THRESHOLD)) setDraft(shape(g, p));
  }

  /** Zone (glisser) ou flèche (⇧ + glisser), en coordonnées normalisées bornées à l'image. */
  function shape(g: { x: number; y: number; shift: boolean }, p: { x: number; y: number }): Geometry {
    const nx = (x: number) => Math.min(1, Math.max(0, (x - imageView.x) / imageView.width));
    const ny = (y: number) => Math.min(1, Math.max(0, (y - imageView.y) / imageView.height));
    if (g.shift) return { kind: 'arrow', x1: nx(g.x), y1: ny(g.y), x2: nx(p.x), y2: ny(p.y) };
    const x = Math.min(nx(g.x), nx(p.x)), y = Math.min(ny(g.y), ny(p.y));
    return { kind: 'zone', x, y, w: Math.abs(nx(p.x) - nx(g.x)), h: Math.abs(ny(p.y) - ny(g.y)) };
  }

  function onPointerUp(e: React.PointerEvent) {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    const p = local(e);
    if (g.kind === 'drag') {
      if (g.moved && preview) props.onMove(g.id, preview.geometry);
      else props.onSelect(g.id, true);
      setPreview(null);
    }
    if (g.kind === 'add' && draft) {
      setDraft(null);
      props.onAdd(shape(g, p));
    } else if (g.kind === 'add') {
      const x = (p.x - imageView.x) / imageView.width;
      const y = (p.y - imageView.y) / imageView.height;
      const inside = x >= 0 && x <= 1 && y >= 0 && y <= 1;
      if (inside && Math.hypot(p.x - g.x, p.y - g.y) <= DRAG_THRESHOLD) props.onAdd({ kind: 'point', x, y });
      else if (!inside) props.onSelect(null, false);
    }
  }

  const selected = annotations.find((a) => a.id === props.selectedId);
  const pin = selected && pinPosition(selected.geometry, imageView);

  return (
    <div className="stage" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        style={{ width: size.w, height: size.h, cursor: space.current ? 'grab' : 'crosshair' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      />
      {pin && props.bubble({ x: pin[0], y: pin[1] })}
    </div>
  );
}
