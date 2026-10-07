// Même pastille et même onde que dans l'éditeur, superposées à l'app qu'on commente.
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { drawAnnotations, type Annotation, type Ctx2D } from '@pastille/shared';
import type { VideoFeedback } from '../ipc.ts';
import { Wave, WAVE_BARS, clock } from './dictation-feedback.tsx';
import { T } from './texts.ts';

function App() {
  const [state, setState] = useState<VideoFeedback>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const levels = useRef<number[]>([]);
  const lastClick = useRef<VideoFeedback>(null);

  useEffect(() => window.pastille.onVideoFeedback((next) => {
    const previous = lastClick.current?.click;
    if (!next || previous?.at !== next.click?.at) levels.current = [];
    levels.current = next ? [...levels.current, next.level].slice(-WAVE_BARS) : [];
    lastClick.current = next;
    setState(next);
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
        id: 'video-point', number: c.number, geometry: { kind: 'point', x: c.x / w, y: c.y / h },
        text: '', input: 'dictated', transcription: 'none', sketches: [], createdAt: '', updatedAt: '',
      };
      drawAnnotations(ctx as unknown as Ctx2D, [a], { x: 0, y: 0, width: w, height: h }, { radius: 13, selectedId: a.id });
    };
    draw();
    window.addEventListener('resize', draw);
    return () => window.removeEventListener('resize', draw);
  }, [state?.click?.x, state?.click?.y, state?.click?.number]);

  return <>
    <canvas ref={canvasRef} aria-hidden="true" />
    {state && <div className="feedback" role="status">
      <div className="feedback-head">
        <span className="rec-dot" />
        <strong>{state.voiced ? T.editor.recording : T.videoFeedback.microphone}</strong>
        <Wave levels={levels.current} />
        <time>{clock(state.elapsedMs)}</time>
      </div>
      <div className="feedback-meta">
        <span>{state.click ? T.videoFeedback.point(state.click.number) : T.videoFeedback.general}</span>
        {!state.voiced && <span>· {state.click ? T.videoFeedback.speak : T.videoFeedback.ready}</span>}
      </div>
    </div>}
  </>;
}

createRoot(document.getElementById('root')!).render(<App />);
