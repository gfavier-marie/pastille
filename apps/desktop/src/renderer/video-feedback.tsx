// Même pastille et même onde que dans l'éditeur, superposées à l'app qu'on commente.
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { drawAnnotations, type Annotation, type Ctx2D } from '@pastille/shared';
import type { VideoFeedback } from '../ipc.ts';
import { Wave, WAVE_BARS, clock } from './dictation-feedback.tsx';
import { T } from './texts.ts';
import * as I from './icons.tsx';

function App() {
  const [state, setState] = useState<VideoFeedback>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const levels = useRef<number[]>([]);
  const lastClick = useRef<VideoFeedback>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const geometry = state?.click?.geometry;
  async function act(action: Parameters<typeof window.pastille.videoAction>[0]) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try { await window.pastille.videoAction(action); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  }

  useEffect(() => window.pastille.onVideoFeedback((next) => {
    const previous = lastClick.current?.click;
    if (!next || previous?.at !== next.click?.at) { levels.current = []; setError(null); }
    levels.current = next ? [...levels.current, next.level].slice(-WAVE_BARS) : [];
    lastClick.current = next;
    setState(next);
    if (!next) window.pastille.videoFeedbackHover(false);
  }), []);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const draw = () => {
      const w = window.innerWidth, h = window.innerHeight;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      const ctx = canvas.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const c = state?.click;
      if (!c) return;
      // La pointe reste sur le pixel cliqué ; rayon identique au mode capture d'écran.
      const a: Annotation = {
        id: 'video-point', number: c.number, geometry: c.geometry ?? { kind: 'point', x: c.x / w, y: c.y / h },
        text: '', input: 'dictated', transcription: 'none', sketches: [], createdAt: '', updatedAt: '',
      };
      drawAnnotations(ctx as unknown as Ctx2D, [a], { x: 0, y: 0, width: w, height: h }, { radius: 13, selectedId: a.id });
    };
    draw();
    window.addEventListener('resize', draw);
    return () => window.removeEventListener('resize', draw);
  }, [state?.click?.x, state?.click?.y, state?.click?.number, geometry]);

  return <>
    <canvas ref={canvasRef} aria-hidden="true" />
    {state && <div className="feedback" onMouseEnter={() => window.pastille.videoFeedbackHover(true)} onMouseLeave={() => window.pastille.videoFeedbackHover(false)}>
      <div className="feedback-head">
        <span className="rec-dot" />
        <strong role="status">{state.inspiration ? T.videoFeedback.chooseInspiration : state.voiced ? T.editor.recording : T.videoFeedback.microphone}</strong>
        {!state.inspiration && <><Wave levels={levels.current} /><time>{clock(state.elapsedMs)}</time></>}
      </div>
      <div className="feedback-meta">
        <span>{state.inspiration?.number ? T.videoFeedback.point(state.inspiration.number) : state.click ? T.videoFeedback.point(state.click.number) : T.videoFeedback.general}</span>
        {!state.voiced && !state.kept && !state.inspiration && <span>· {state.click ? T.videoFeedback.speak : T.videoFeedback.ready}</span>}
      </div>
      {state.inspiration ? <>
        <div className="feedback-hint">{T.videoFeedback.inspirationHint(state.inspiration.shortcut)}</div>
        <div className="feedback-tools">
          <button type="button" className="primary" disabled={busy} onClick={() => void act('capture-inspiration')}><I.Capture size={13} />{T.videoFeedback.captureInspiration}</button>
          <button type="button" disabled={busy} onClick={() => void act('cancel-inspiration')}>{T.videoFeedback.resume}</button>
        </div>
      </> : <>
        <div className="feedback-tools">
          <button type="button" disabled={!state.click || busy} title={state.tablet ? T.videoFeedback.drawingReady : T.menu.pair} onClick={() => void act('draw')}><I.Tablet size={13} />{T.videoFeedback.drawing}</button>
          <button type="button" disabled={!state.click || busy} onClick={() => void act('inspiration')}><I.Picture size={13} />{T.editor.inspiration}</button>
        </div>
        <div className="feedback-hint">{T.videoFeedback.gestures}</div>
      </>}
      {(state.error || error) && <div className="feedback-error" role="alert">{state.error || error}</div>}
    </div>}
  </>;
}

createRoot(document.getElementById('root')!).render(<App />);
