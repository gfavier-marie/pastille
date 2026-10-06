// Toile de dessin : Pointer Events, lissage (perfect-freehand), pression du stylet,
// rejet de la paume (dès qu'un stylet est vu, le doigt ne dessine plus), tap à deux doigts = annuler.

import { getStroke } from 'perfect-freehand';

export type Background = 'blanc' | 'quadrillé' | 'recadrage';
type Stroke = { tool: 'pen' | 'eraser'; color: string; size: number; pressure: boolean; points: [number, number, number][] };

const TWO_FINGER_TAP_MS = 300;

export function createBoard(bgCanvas: HTMLCanvasElement, inkCanvas: HTMLCanvasElement, onChange: () => void) {
  const strokes: Stroke[] = [];
  let current: Stroke | null = null;
  let penSeen = false;
  let background: Background = 'blanc';
  let crop: HTMLImageElement | null = null;
  const tool = { tool: 'pen' as Stroke['tool'], color: '#1D1D1F', size: 4 };
  const touches = new Map<number, number>(); // pointerId → début
  let tapCandidate = false;

  const size = () => ({ w: inkCanvas.clientWidth, h: inkCanvas.clientHeight });

  function path(ctx: CanvasRenderingContext2D, s: Stroke, w: number, h: number, scale: number) {
    const outline = getStroke(
      s.points.map(([x, y, p]) => [x * w, y * h, p]),
      { size: s.size * scale * (s.tool === 'eraser' ? 4 : 1), thinning: s.pressure ? 0.6 : 0.3, smoothing: 0.5, streamline: 0.4, simulatePressure: !s.pressure },
    );
    if (!outline.length) return;
    ctx.beginPath();
    ctx.moveTo(outline[0]![0]!, outline[0]![1]!);
    for (const [x, y] of outline.slice(1)) ctx.lineTo(x!, y!);
    ctx.closePath();
    ctx.globalCompositeOperation = s.tool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.fillStyle = s.color;
    ctx.fill();
  }

  function drawInk(ctx: CanvasRenderingContext2D, w: number, h: number, scale = 1) {
    ctx.clearRect(0, 0, w, h);
    for (const s of current ? [...strokes, current] : strokes) path(ctx, s, w, h, scale);
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number, scale = 1) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    if (background === 'quadrillé') {
      ctx.strokeStyle = '#e4e4e7';
      ctx.lineWidth = scale;
      const step = 32 * scale;
      ctx.beginPath();
      for (let x = step; x < w; x += step) (ctx.moveTo(x, 0), ctx.lineTo(x, h));
      for (let y = step; y < h; y += step) (ctx.moveTo(0, y), ctx.lineTo(w, y));
      ctx.stroke();
    }
    if (background === 'recadrage' && crop) {
      const k = Math.min(w / crop.width, h / crop.height);
      ctx.drawImage(crop, (w - crop.width * k) / 2, (h - crop.height * k) / 2, crop.width * k, crop.height * k);
    }
  }

  function render() {
    const { w, h } = size();
    const dpr = window.devicePixelRatio || 1;
    for (const c of [bgCanvas, inkCanvas]) {
      if (c.width !== Math.round(w * dpr)) c.width = Math.round(w * dpr);
      if (c.height !== Math.round(h * dpr)) c.height = Math.round(h * dpr);
    }
    const bg = bgCanvas.getContext('2d')!;
    bg.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawBackground(bg, w, h);
    const ink = inkCanvas.getContext('2d')!;
    ink.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawInk(ink, w, h);
  }

  function point(e: PointerEvent): [number, number, number] {
    const r = inkCanvas.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, e.pressure || 0.5];
  }

  inkCanvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'pen') penSeen = true;
    if (e.pointerType === 'touch') {
      touches.set(e.pointerId, performance.now());
      if (touches.size === 2) {
        tapCandidate = true; // deux doigts : pas de dessin, peut-être « annuler »
        current = null;
        render();
      }
      if (penSeen || touches.size > 1) return; // rejet de la paume
    }
    inkCanvas.setPointerCapture(e.pointerId);
    current = { ...tool, pressure: e.pointerType === 'pen', points: [point(e)] };
  });

  inkCanvas.addEventListener('pointermove', (e) => {
    if (!current || (e.pointerType === 'touch' && (penSeen || touches.size > 1))) return;
    for (const ev of e.getCoalescedEvents?.() ?? [e]) current.points.push(point(ev));
    tapCandidate = false;
    render();
  });

  const end = (e: PointerEvent) => {
    if (e.pointerType === 'touch') {
      const started = touches.get(e.pointerId) ?? 0;
      touches.delete(e.pointerId);
      if (tapCandidate && touches.size === 0 && performance.now() - started < TWO_FINGER_TAP_MS) undo();
      if (touches.size === 0) tapCandidate = false;
    }
    if (!current) return;
    if (current.points.length > 0) strokes.push(current);
    current = null;
    render();
    onChange();
  };
  inkCanvas.addEventListener('pointerup', end);
  inkCanvas.addEventListener('pointercancel', end);
  new ResizeObserver(render).observe(inkCanvas);

  function undo() {
    strokes.pop();
    render();
    onChange();
  }

  return {
    setTool: (t: Stroke['tool']) => (tool.tool = t),
    setColor: (c: string) => ((tool.color = c), (tool.tool = 'pen')),
    setSize: (s: number) => (tool.size = s),
    undo,
    clear() {
      strokes.length = 0;
      render();
      onChange();
    },
    isEmpty: () => strokes.length === 0,
    setBackground(b: Background) {
      background = b;
      render();
    },
    /** Recadrage de la capture autour du point actif (JPEG base64), pour le fond « recadrage ». */
    setCrop(base64: string | undefined) {
      if (!base64) return void ((crop = null), render());
      const img = new Image();
      img.onload = () => ((crop = img), render());
      img.src = `data:image/jpeg;base64,${base64}`;
    },
    hasCrop: () => crop !== null,
    /** PNG (fond compris) et traits en JSON, sous la taille maximale d'un message. */
    async export(maxBytes: number): Promise<{ png: string; strokes: string }> {
      const { w, h } = size();
      for (const target of [1600, 1200, 900, 600]) {
        const scale = Math.min(2, target / w);
        const c = document.createElement('canvas');
        c.width = Math.round(w * scale);
        c.height = Math.round(h * scale);
        const ctx = c.getContext('2d')!;
        drawBackground(ctx, c.width, c.height, scale);
        const ink = document.createElement('canvas');
        ink.width = c.width;
        ink.height = c.height;
        drawInk(ink.getContext('2d')!, c.width, c.height, scale);
        ctx.drawImage(ink, 0, 0);
        const png = c.toDataURL('image/png').split(',')[1]!;
        if (png.length <= maxBytes || target === 600) {
          return { png, strokes: JSON.stringify({ width: w, height: h, background, strokes }) };
        }
      }
      throw new Error('inaccessible');
    },
  };
}
