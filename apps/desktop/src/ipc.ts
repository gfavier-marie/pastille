// Contrat IPC entre le processus principal et les fenêtres (exposé par le preload).

export type OverlayShow = { jpeg: Uint8Array };

/** Coordonnées en pixels logiques (DIP), relatives à l'écran de l'overlay. */
export type OverlayPick =
  | { kind: 'click'; x: number; y: number }
  | { kind: 'zone'; x: number; y: number; w: number; h: number }
  | { kind: 'cancel' };

export type CaptureResult =
  | {
      ok: true;
      file: string;
      width: number; // pixels physiques
      height: number;
      scaleFactor: number;
      target: 'window' | 'screen' | 'zone';
      app?: string;
      title?: string;
      point?: { x: number; y: number }; // normalisé 0–1
      timings: {
        captureMs: number; // raccourci → écrans figés
        windowsMs: number; // raccourci → liste des fenêtres
        overlayMs: number; // raccourci → overlay affiché
        pickToSavedMs: number; // clic → PNG écrit
      };
    }
  | { ok: false; error: string };

export type WhisperStatus =
  | { state: 'missing'; detail: string }
  | { state: 'loading' }
  | { state: 'ready'; loadMs: number }
  | { state: 'error'; detail: string };

export type TranscribeResult = { text: string; whisperMs: number; audioMs: number };

export type PastilleApi = {
  // Fenêtre POC
  onCaptureResult(cb: (r: CaptureResult) => void): () => void;
  startCapture(): void;
  shortcutStatus(): Promise<{ accelerator: string; registered: boolean }>;
  whisperStatus(): Promise<WhisperStatus>;
  transcribe(samples: Float32Array): Promise<TranscribeResult>;
  transcribeSample(): Promise<TranscribeResult>;
  // Overlay
  onOverlayShow(cb: (data: OverlayShow) => void): void;
  overlayReady(): void;
  overlayPick(pick: OverlayPick): void;
};

declare global {
  interface Window {
    pastille: PastilleApi;
  }
}
