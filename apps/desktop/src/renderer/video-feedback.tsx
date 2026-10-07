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
  const written = useRef(false); // le commentaire écrit n'est envoyé qu'une fois (Entrée, Échap ou clic ailleurs)
  useEffect(() => { if (state?.writing) written.current = false; }, [state?.writing]);
  function finishWriting(text: string | null) {
    if (written.current) return;
    written.current = true;
    void window.pastille.videoText(text);
  }
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

  const v = T.videoFeedback;
  const c = state?.click;
  return <>
    <canvas ref={canvasRef} aria-hidden="true" />
    {state && <div className={`feedback${state.armed ? ' armed' : ''}`} onMouseEnter={() => window.pastille.videoFeedbackHover(true)} onMouseLeave={() => window.pastille.videoFeedbackHover(false)}>
      <div className="feedback-head">
        <span className="rec-dot" />
        <strong>{state.inspiration ? v.chooseInspiration : c ? v.point(c.number) : v.general}</strong>
        {!state.inspiration && <><Wave levels={levels.current} /><time>{clock(state.elapsedMs)}</time></>}
        <button type="button" className="stop" onClick={() => void window.pastille.videoAction('stop')}>
          <I.Stop size={13} />{v.stop}{state.stopShortcut && <kbd>{state.stopShortcut}</kbd>}
        </button>
      </div>
      {state.inspiration ? <>
        <div className="feedback-hint">{state.inspiration.number ? `${v.point(state.inspiration.number)} · ` : ''}{v.inspirationHint(state.inspiration.shortcut)}</div>
        <div className="feedback-tools">
          <button type="button" className="primary" disabled={busy} onClick={() => void act('capture-inspiration')}><I.Capture size={13} />{v.captureInspiration}</button>
          <button type="button" disabled={busy} onClick={() => void act('cancel-inspiration')}>{v.resume}</button>
        </div>
      </> : state.writing ? <>
        <textarea className="feedback-text" autoFocus rows={2} placeholder={v.writePlaceholder}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); finishWriting(e.currentTarget.value); }
            else if (e.key === 'Escape') finishWriting(null);
          }}
          onBlur={(e) => finishWriting(e.currentTarget.value)} />
        <div className="feedback-hint">{v.writeHint}</div>
      </> : <>
        <div className="feedback-meta" role="status">{state.voiced ? T.editor.recording : c ? (state.kept ? '' : v.speak) : v.microphone}</div>
        <div className="feedback-tools">
          <button type="button" disabled={busy} onClick={() => void act('write')}><I.Keyboard size={13} />{v.write}</button>
          {c && <>
            <button type="button" disabled={busy} title={state.tablet ? v.drawingReady : T.menu.pair} onClick={() => void act('draw')}><I.Tablet size={13} />{v.drawing}</button>
            <button type="button" disabled={busy} onClick={() => void act('inspiration')}><I.Picture size={13} />{T.editor.inspiration}</button>
          </>}
        </div>
        <div className="feedback-keys">
          <span><kbd className="point-key">{v.key}</kbd> + <kbd>{v.click}</kbd> → {v.placePoint}</span>
          <span className="sep">·</span>
          <span><kbd>{v.click}</kbd> → {v.navigate}</span>
        </div>
        <div className="feedback-hint">{v.gestures}</div>
      </>}
      {(state.error || error) && <div className="feedback-error" role="alert">{state.error || error}</div>}
    </div>}
  </>;
}

createRoot(document.getElementById('root')!).render(<App />);
