// Fenêtre de mesures du lot 0 : capture (raccourci, overlay, recadrage) et dictée.

import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { CaptureResult, TranscribeResult, WhisperStatus } from '../ipc.ts';

type Dictation = TranscribeResult & { source: 'micro' | 'échantillon'; micStartMs?: number; endToEndMs: number };

const ms = (n: number) => `${Math.round(n)} ms`;
const isMac = navigator.userAgent.includes('Mac');
const transcriptionTarget = isMac ? 2000 : 5000;

type RecorderState = { chunks: Float32Array[]; recording: boolean; onFirst?: () => void };

/** Micro → PCM 16 kHz mono. Le flux reste ouvert entre deux enregistrements. */
function useRecorder() {
  const ref = useRef<RecorderState | null>(null);

  async function start(): Promise<number> {
    const t0 = performance.now();
    if (!ref.current) {
      const ctx = new AudioContext({ sampleRate: 16000 });
      await ctx.audioWorklet.addModule(new URL('./pcm-worklet.js', document.baseURI).href);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const node = new AudioWorkletNode(ctx, 'pcm-capture');
      const state: RecorderState = { chunks: [], recording: false };
      node.port.onmessage = (e: MessageEvent<Float32Array>) => {
        if (!state.recording) return;
        state.chunks.push(e.data);
        state.onFirst?.();
        state.onFirst = undefined;
      };
      ctx.createMediaStreamSource(stream).connect(node);
      node.connect(ctx.destination); // le nœud ne produit que du silence
      ref.current = state;
    }
    const s = ref.current;
    s.chunks = [];
    s.recording = true;
    await new Promise<void>((resolve) => (s.onFirst = resolve));
    return performance.now() - t0;
  }

  function stop(): Float32Array {
    const s = ref.current!;
    s.recording = false;
    const out = new Float32Array(s.chunks.reduce((n, c) => n + c.length, 0));
    let offset = 0;
    for (const c of s.chunks) {
      out.set(c, offset);
      offset += c.length;
    }
    return out;
  }

  return { start, stop };
}

function App() {
  const [shortcut, setShortcut] = useState<{ accelerator: string; registered: boolean }>();
  const [whisper, setWhisper] = useState<WhisperStatus>({ state: 'loading' });
  const [captures, setCaptures] = useState<CaptureResult[]>([]);
  const [dictations, setDictations] = useState<Dictation[]>([]);
  const [recording, setRecording] = useState<{ micStartMs: number } | 'starting' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const recorder = useRecorder();

  useEffect(() => {
    void window.pastille.shortcutStatus().then(setShortcut);
    const off = window.pastille.onCaptureResult((r) => setCaptures((c) => [r, ...c]));
    const timer = setInterval(() => {
      void window.pastille.whisperStatus().then((s) => {
        setWhisper(s);
        if (s.state !== 'loading') clearInterval(timer);
      });
    }, 300);
    return () => {
      off();
      clearInterval(timer);
    };
  }, []);

  async function toggleRecording() {
    setError(undefined);
    if (!recording) {
      setRecording('starting');
      try {
        setRecording({ micStartMs: await recorder.start() });
      } catch (err) {
        setRecording(null);
        setError(String(err));
      }
      return;
    }
    if (recording === 'starting') return;
    const samples = recorder.stop();
    const { micStartMs } = recording;
    setRecording(null);
    setBusy(true);
    const t = performance.now();
    try {
      const r = await window.pastille.transcribe(samples);
      setDictations((d) => [{ ...r, source: 'micro', micStartMs, endToEndMs: performance.now() - t }, ...d]);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function testSample() {
    setError(undefined);
    setBusy(true);
    const t = performance.now();
    try {
      const r = await window.pastille.transcribeSample();
      setDictations((d) => [{ ...r, source: 'échantillon', endToEndMs: performance.now() - t }, ...d]);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  function copyMeasures() {
    const lines = [
      `Pastille — mesures POC (${navigator.platform})`,
      '',
      '| Capture | Taille | Écrans figés | Overlay affiché | Clic → image |',
      '| --- | --- | --- | --- | --- |',
      ...captures.map((c) =>
        c.ok
          ? `| ${c.target}${c.app ? ` (${c.app})` : ''} | ${c.width}×${c.height} @${c.scaleFactor}x | ${ms(c.timings.captureMs)} | ${ms(c.timings.overlayMs)} | ${ms(c.timings.pickToSavedMs)} |`
          : `| erreur : ${c.error} | | | | |`,
      ),
      '',
      '| Dictée | Audio | Transcription | Démarrage micro | Texte |',
      '| --- | --- | --- | --- | --- |',
      ...dictations.map(
        (d) =>
          `| ${d.source} | ${(d.audioMs / 1000).toFixed(1)} s | ${ms(d.whisperMs)} | ${d.micStartMs ? ms(d.micStartMs) : '—'} | ${d.text} |`,
      ),
    ];
    void navigator.clipboard.writeText(lines.join('\n'));
  }

  return (
    <>
      <h1>Pastille — POC du lot 0</h1>

      <h2>Capture</h2>
      <p>
        {shortcut?.registered ? (
          <>
            Appuie sur <b>{isMac ? '⌘⇧2' : 'Ctrl+Shift+2'}</b> depuis n'importe quelle app, puis clique sur une
            fenêtre (ou glisse pour une zone, Échap pour annuler).
          </>
        ) : (
          <span className="ko">Raccourci {shortcut?.accelerator} indisponible (déjà pris ?).</span>
        )}
      </p>
      <button onClick={() => window.pastille.startCapture()}>Capturer maintenant</button>
      <table>
        <thead>
          <tr>
            <th>Cible</th>
            <th>Taille</th>
            <th>Écrans figés</th>
            <th>Overlay (&lt; 200 ms)</th>
            <th>Clic → image</th>
          </tr>
        </thead>
        <tbody>
          {captures.map((c, i) =>
            c.ok ? (
              <tr key={i}>
                <td>
                  {c.target}
                  {c.app && <div className="muted">{c.app} — {c.title}</div>}
                </td>
                <td>
                  {c.width}×{c.height} @{c.scaleFactor}x
                </td>
                <td>{ms(c.timings.captureMs)}</td>
                <td className={c.timings.overlayMs < 200 ? 'ok' : 'ko'}>{ms(c.timings.overlayMs)}</td>
                <td>{ms(c.timings.pickToSavedMs)}</td>
              </tr>
            ) : (
              <tr key={i}>
                <td colSpan={5} className="ko">
                  {c.error}
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>

      <h2>Dictée</h2>
      <p>
        Whisper :{' '}
        {whisper.state === 'ready' ? (
          <span className="ok">prêt (modèle chargé en {ms(whisper.loadMs)})</span>
        ) : whisper.state === 'loading' ? (
          'chargement du modèle…'
        ) : (
          <span className="ko">{whisper.detail}</span>
        )}
      </p>
      <button onClick={toggleRecording} disabled={whisper.state !== 'ready' || busy}>
        {recording ? '■ Arrêter et transcrire' : '● Enregistrer'}
      </button>
      <button onClick={testSample} disabled={whisper.state !== 'ready' || busy || !!recording}>
        Tester l'échantillon
      </button>
      {busy && <span className="muted">transcription…</span>}
      {error && <p className="ko">{error}</p>}
      <p className="muted">
        À dire : « Sur ce bouton, mets un border-radius de 8 pixels, plus de padding, et un header plus haut. »
      </p>
      {dictations.map((d, i) => (
        <div key={i}>
          <div>
            {d.source}, {(d.audioMs / 1000).toFixed(1)} s d'audio — transcription{' '}
            <b className={d.whisperMs < transcriptionTarget ? 'ok' : 'ko'}>{ms(d.whisperMs)}</b>
            {d.micStartMs !== undefined && <> — micro actif en {ms(d.micStartMs)}</>}
          </div>
          <blockquote>{d.text || <span className="muted">(rien entendu)</span>}</blockquote>
        </div>
      ))}

      <h2>Résultats</h2>
      <button onClick={copyMeasures}>Copier les mesures</button>
      <span className="muted">à me coller dans la conversation</span>
    </>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
