// Zone centrale : la capture et ses annotations, dessinées par la fonction de rendu partagée.
// Clic = nouveau point ; glisser = zone ; ⇧ + glisser = flèche ; clic sur une pastille = sélection + bulle ;
// glisser une pastille = déplacement.
// Molette = zoom, Espace maintenu + glisser = déplacement de la vue. Document : toutes ses pages les unes
// sous les autres, ajustées à la largeur ; la molette fait défiler d'une page à l'autre comme dans un lecteur
// (⇧ + molette : de côté, pour une feuille Excel zoomée), ⌘ / Ctrl + molette (ou le pincement) zoome.
// La page au milieu de l'écran devient la page en cours.

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { drawAnnotations, pinPosition, type Annotation, type Capture, type Ctx2D, type Geometry } from '@pastille/shared';
import { T } from '../texts.ts';

const PIN_RADIUS = 13;
const CARD_RADIUS = 10;
// Marges autour de la capture ajustée : la barre d'aide occupe le bas.
const PAD = { side: 28, top: 28, bottom: 72 };
const GAP = 0.025; // espace entre deux pages, en fraction de la largeur de la plus large
const MOD = navigator.userAgent.includes('Mac') ? '⌘' : 'Ctrl';

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
type Rect = { x: number; y: number; width: number; height: number };
type Gesture =
  | { kind: 'pan'; x: number; y: number; ox: number; oy: number }
  | { kind: 'drag'; id: string; page: string; x: number; y: number; geometry: Geometry; moved: boolean }
  | { kind: 'add'; page: string | null; x: number; y: number; shift: boolean };

function translate(g: Geometry, dx: number, dy: number): Geometry {
  if (g.kind === 'point') return { ...g, x: g.x + dx, y: g.y + dy };
  if (g.kind === 'zone') return { ...g, x: g.x + dx, y: g.y + dy };
  return { ...g, x1: g.x1 + dx, y1: g.y1 + dy, x2: g.x2 + dx, y2: g.y2 + dy };
}

/** Pages les unes sous les autres, centrées : position de chacune en pixels d'image, et taille de la colonne. */
function layout(pages: Capture[]) {
  const width = Math.max(...pages.map((p) => p.width));
  const gap = pages.length > 1 ? width * GAP : 0;
  let y = 0;
  const places = pages.map((p) => {
    const place = { x: (width - p.width) / 2, y };
    y += p.height + gap;
    return place;
  });
  return { places, width, height: y - gap };
}

export function Stage(props: {
  capture: Capture; // page en cours (ou capture d'écran)
  pages?: Capture[]; // document : toutes ses pages, dans l'ordre (la page en cours comprise)
  imageUrl: (c: Capture) => string;
  nextNumber: (pageId: string) => number; // numéro affiché pendant le tracé d'une zone ou d'une flèche
  selectedId: string | null;
  onSelect: (id: string | null, openBubble: boolean) => void;
  onAdd: (geometry: Geometry, pageId: string) => void;
  onMove: (id: string, geometry: Geometry) => void;
  onPage?: (pageId: string) => void; // le défilement a amené une autre page au milieu de l'écran
  // Bulle du point sélectionné : centre de sa pastille et taille de la scène, pour la placer.
  bubble: (pin: { x: number; y: number; r: number }, stage: { w: number; h: number }) => ReactNode;
  tools?: ReactNode; // boutons ajoutés au bout de la barre d'aide
}) {
  const { capture } = props;
  const pages = props.pages?.length ? props.pages : [capture];
  const reading = !!props.pages?.length; // document : défilement continu
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const images = useRef(new Map<string, HTMLImageElement>());
  const [, setLoaded] = useState(0); // redessine à l'arrivée d'une image
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<ViewState>({ scale: 1, ox: 0, oy: 0 });
  const [preview, setPreview] = useState<{ id: string; geometry: Geometry } | null>(null);
  const [draft, setDraft] = useState<{ page: string; geometry: Geometry } | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const space = useRef(false);
  const reported = useRef<string | null>(null); // page en cours annoncée par le défilement (pas de saut vers elle)

  const column = layout(pages);
  const index = new Map(pages.map((p, i) => [p.id, i]));
  /** Rectangle d'une page à l'écran. */
  const rectOf = (i: number, v = view): Rect => ({
    x: v.ox + column.places[i]!.x * v.scale,
    y: v.oy + column.places[i]!.y * v.scale,
    width: pages[i]!.width * v.scale,
    height: pages[i]!.height * v.scale,
  });
  // Lus par l'écouteur de la molette, posé une seule fois.
  const reader = useRef({ on: false, width: 0, height: 0 });
  reader.current = { on: reading, width: column.width, height: column.height };

  // Taille de la zone d'affichage.
  useLayoutEffect(() => {
    const el = wrapRef.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Ajustement : la capture entière ; un document à la largeur de sa plus large page, sans agrandir une
  // petite page au-delà de son image, vu depuis le haut de la page en cours.
  const fitKey = reading ? pages[0]!.id : capture.id;
  const fit = (v?: ViewState): ViewState => {
    const w = size.w - 2 * PAD.side, h = size.h - PAD.top - PAD.bottom;
    const scale = v?.scale ?? (reading ? Math.min(1, w / column.width) : Math.min(w / capture.width, h / capture.height));
    const ox = PAD.side + (w - column.width * scale) / 2;
    if (reading) return { scale, ox, oy: PAD.top - column.places[index.get(capture.id) ?? 0]!.y * scale };
    const oy = capture.height * scale > h ? PAD.top : PAD.top + (h - capture.height * scale) / 2;
    return { scale, ox, oy };
  };
  useEffect(() => {
    if (!size.w || !size.h) return;
    reported.current = capture.id;
    setView(fit());
    // Document : le zoom choisi reste d'une page à l'autre (les pages n'ont pas toutes la même taille).
  }, [fitKey, reading ? 0 : capture.width, reading ? 0 : capture.height, size.w > 0, size.h > 0]);

  // Autre page choisie ailleurs (vignette, Page suiv., point de la liste) : la vue y saute, au même zoom.
  useEffect(() => {
    if (!reading || capture.id === reported.current || !size.w) return;
    reported.current = capture.id;
    setView((v) => ({ ...v, oy: fit(v).oy }));
  }, [capture.id]);

  // Défilement : la page au milieu de l'écran devient la page en cours.
  useEffect(() => {
    if (!reading || !size.h) return;
    const middle = size.h * 0.4;
    let current = 0;
    for (let i = 0; i < pages.length; i++) if (rectOf(i).y <= middle) current = i;
    const id = pages[current]!.id;
    if (id !== reported.current) {
      reported.current = id;
      props.onPage?.(id);
    }
  }, [view.oy, view.scale, size.h, reading]);

  // Pages proches de l'écran (une hauteur d'écran au-dessus et au-dessous) : seules leurs images sont chargées.
  const near = (i: number, margin = size.h) => {
    const r = rectOf(i);
    return r.y + r.height >= -margin && r.y <= size.h + margin;
  };
  const visible = pages.map((_, i) => i).filter((i) => near(i, 0));
  useEffect(() => {
    const wanted = new Set(pages.filter((_, i) => near(i)).map((p) => p.id));
    for (const id of images.current.keys()) if (!wanted.has(id)) images.current.delete(id);
    for (const p of pages) {
      if (!wanted.has(p.id) || images.current.has(p.id)) continue;
      const image = new Image();
      images.current.set(p.id, image);
      image.onload = () => setLoaded((n) => n + 1);
      image.src = props.imageUrl(p);
    }
  });

  const annotationsOf = (p: Capture): Annotation[] => {
    const list = p.annotations.map((a) => (preview && a.id === preview.id ? { ...a, geometry: preview.geometry } : a));
    return draft?.page === p.id ? [...list, { ...emptyAnnotation, id: 'draft', number: props.nextNumber(p.id), geometry: draft.geometry }] : list;
  };

  // Dessin : chaque page visible posée sur une carte (coins arrondis, ombre, liseré), puis ses annotations.
  useEffect(() => {
    const canvas = canvasRef.current!;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size.w * dpr);
    canvas.height = Math.round(size.h * dpr);
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);
    for (const i of visible) {
      const page = pages[i]!;
      const img = images.current.get(page.id);
      const { x, y, width, height } = rectOf(i);
      const ready = !!img?.complete && img.naturalWidth > 0;
      if (ready || reading) {
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = reading ? 24 : 50;
        ctx.shadowOffsetY = reading ? 8 : 20;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.roundRect(x, y, width, height, reading ? 4 : CARD_RADIUS);
        ctx.fill();
        ctx.restore();
      }
      if (ready) {
        ctx.save();
        ctx.clip();
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, x, y, width, height);
        ctx.restore();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(x - 0.5, y - 0.5, width + 1, height + 1, reading ? 4 : CARD_RADIUS);
        ctx.stroke();
      }
      drawAnnotations(ctx as unknown as Ctx2D, annotationsOf(page), { x, y, width, height }, { radius: PIN_RADIUS, selectedId: props.selectedId ?? undefined });
    }
  });

  /** Zoom centré sur un point de la scène, borné entre 5 % et 800 %. */
  function zoomAt(factor: number, mx: number, my: number) {
    setView((v) => {
      const scale = Math.min(8, Math.max(0.05, v.scale * factor));
      const k = scale / v.scale;
      return { scale, ox: mx - (mx - v.ox) * k, oy: my - (my - v.oy) * k };
    });
  }

  // Zoom à la molette, centré sur le curseur (écouteur non passif pour bloquer le défilement).
  // Document : la molette fait défiler toutes les pages, sans dépasser le début ni la fin ; ⌘ / Ctrl (et le pincement) zoome.
  useEffect(() => {
    const el = canvasRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      if (!reader.current.on || e.ctrlKey || e.metaKey) return zoomAt(Math.exp(-e.deltaY * 0.002), e.clientX - rect.left, e.clientY - rect.top);
      // Ne défile que ce qui dépasse, et jamais au-delà des bords. ⇧ + molette d'une souris (Windows) défile de côté.
      const scroll = (offset: number, delta: number, size: number, view: number, before: number, after: number) =>
        size <= view - before - after ? offset : Math.min(before, Math.max(view - after - size, offset - delta));
      const sideways = e.shiftKey && !e.deltaX;
      setView((v) => ({
        ...v,
        ox: scroll(v.ox, sideways ? e.deltaY : e.deltaX, reader.current.width * v.scale, rect.width, PAD.side, PAD.side),
        oy: scroll(v.oy, sideways ? 0 : e.deltaY, reader.current.height * v.scale, rect.height, PAD.top, PAD.bottom),
      }));
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

  /** Page sous un point de la scène. */
  function pageAt(x: number, y: number): Capture | undefined {
    const i = visible.find((n) => {
      const r = rectOf(n);
      return x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;
    });
    return i === undefined ? undefined : pages[i];
  }

  /** Pastille sous un point de la scène, sur les pages visibles (la dernière dessinée d'abord). */
  function hitTest(x: number, y: number): { annotation: Annotation; page: Capture } | undefined {
    for (const i of [...visible].reverse()) {
      const page = pages[i]!;
      const r = rectOf(i);
      const annotation = [...annotationsOf(page)].reverse().find((a) => {
        const [px, py] = pinPosition(a.geometry, r, PIN_RADIUS);
        return a.id !== 'draft' && Math.hypot(px - x, py - y) <= PIN_RADIUS + 3;
      });
      if (annotation) return { annotation, page };
    }
    return undefined;
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
    if (hit) gesture.current = { kind: 'drag', id: hit.annotation.id, page: hit.page.id, ...p, geometry: hit.annotation.geometry, moved: false };
    else gesture.current = { kind: 'add', page: pageAt(p.x, p.y)?.id ?? null, ...p, shift: e.shiftKey };
  }

  function onPointerMove(e: React.PointerEvent) {
    const g = gesture.current;
    if (!g) return;
    const p = local(e);
    if (g.kind === 'pan') setView((v) => ({ ...v, ox: g.ox + p.x - g.x, oy: g.oy + p.y - g.y }));
    if (g.kind === 'drag' && (g.moved || Math.hypot(p.x - g.x, p.y - g.y) > DRAG_THRESHOLD)) {
      g.moved = true;
      const r = rectOf(index.get(g.page) ?? 0);
      setPreview({ id: g.id, geometry: translate(g.geometry, (p.x - g.x) / r.width, (p.y - g.y) / r.height) });
    }
    if (g.kind === 'add' && g.page && (draft || Math.hypot(p.x - g.x, p.y - g.y) > DRAG_THRESHOLD)) setDraft({ page: g.page, geometry: shape(g, g.page, p) });
  }

  /** Zone (glisser) ou flèche (⇧ + glisser), en coordonnées normalisées bornées à la page de départ. */
  function shape(g: { x: number; y: number; shift: boolean }, pageId: string, p: { x: number; y: number }): Geometry {
    const r = rectOf(index.get(pageId) ?? 0);
    const nx = (x: number) => Math.min(1, Math.max(0, (x - r.x) / r.width));
    const ny = (y: number) => Math.min(1, Math.max(0, (y - r.y) / r.height));
    if (g.shift) return { kind: 'arrow', x1: nx(g.x), y1: ny(g.y), x2: nx(p.x), y2: ny(p.y) };
    const x = Math.min(nx(g.x), nx(p.x)), y = Math.min(ny(g.y), ny(p.y));
    return { kind: 'zone', x, y, w: Math.abs(nx(p.x) - nx(g.x)), h: Math.abs(ny(p.y) - ny(g.y)) };
  }

  /** Point ajouté sur une page : elle devient la page en cours, sans que la vue bouge. */
  function add(geometry: Geometry, pageId: string) {
    if (pageId !== capture.id) {
      reported.current = pageId;
      props.onPage?.(pageId);
    }
    props.onAdd(geometry, pageId);
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
    if (g.kind === 'add' && draft && g.page) {
      setDraft(null);
      add(shape(g, g.page, p), g.page);
    } else if (g.kind === 'add') {
      const page = g.page ? pages[index.get(g.page)!] : undefined;
      if (page && Math.hypot(p.x - g.x, p.y - g.y) <= DRAG_THRESHOLD) {
        const r = rectOf(index.get(page.id)!);
        add({ kind: 'point', x: (p.x - r.x) / r.width, y: (p.y - r.y) / r.height }, page.id);
      } else if (!page) props.onSelect(null, false);
    }
  }

  // Bulle : la pastille sélectionnée, sur la page où elle se trouve.
  const owner = pages.findIndex((pg) => pg.annotations.some((a) => a.id === props.selectedId));
  const selected = owner >= 0 ? annotationsOf(pages[owner]!).find((a) => a.id === props.selectedId) : undefined;
  const pinAt = selected && pinPosition(selected.geometry, rectOf(owner), PIN_RADIUS);
  const pin = pinAt && pinAt[1] > -PIN_RADIUS && pinAt[1] < size.h + PIN_RADIUS ? pinAt : undefined; // pastille hors de l'écran : pas de bulle

  return (
    <div className="stage" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        style={{ width: size.w, height: size.h, cursor: space.current ? 'grab' : 'crosshair' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      />
      {pin && props.bubble({ x: pin[0], y: pin[1], r: PIN_RADIUS }, size)}
      <div className="stage-bar">
        {[...T.editor.stageHints, ...(reading ? [T.editor.wheelZoom(MOD)] : [])].map(([key, text]) => (
          <span key={key}>
            <b>{key}</b> {text}
          </span>
        ))}
        <i />
        <button type="button" aria-label={T.editor.zoomOut} onClick={() => zoomAt(1 / 1.25, size.w / 2, size.h / 2)}>
          −
        </button>
        <span className="zoom">{Math.round(view.scale * 100)} %</span>
        <button type="button" aria-label={T.editor.zoomIn} onClick={() => zoomAt(1.25, size.w / 2, size.h / 2)}>
          +
        </button>
        {props.tools}
      </div>
    </div>
  );
}
