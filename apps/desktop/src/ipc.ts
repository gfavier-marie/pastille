// Contrat IPC entre le processus principal et les fenêtres (exposé par le preload).

import type { Geometry, Session } from '@pastille/shared';
import type { Settings, SettingsView } from './main/settings.ts';

export type { Settings };

export type OverlayShow = { jpeg: Uint8Array };

/** Coordonnées en pixels logiques (DIP), relatives à l'écran de l'overlay. */
export type OverlayPick =
  | { kind: 'click'; x: number; y: number; shift?: boolean }
  | { kind: 'zone'; x: number; y: number; w: number; h: number }
  | { kind: 'cancel' };

/** Mesures d'une capture, affichées par la fenêtre POC. */
export type CaptureResult =
  | {
      ok: true;
      width: number; // pixels physiques
      height: number;
      scaleFactor: number;
      target: 'window' | 'screen' | 'zone';
      app?: string;
      title?: string;
      timings: {
        captureMs: number; // raccourci → écrans figés
        windowsMs: number; // raccourci → liste des fenêtres
        overlayMs: number; // raccourci → overlay affiché
        pickToSavedMs: number; // clic → image prête
      };
    }
  | { ok: false; error: string };

export type WhisperStatus =
  | { state: 'missing'; detail: string }
  | { state: 'loading' }
  | { state: 'ready'; loadMs: number }
  | { state: 'error'; detail: string };

export type TranscribeResult = { text: string; whisperMs: number; audioMs: number };

export type ExportFormat = 'pdf' | 'markdown' | 'pptx';

/** État affiché par la fenêtre de réglages et l'assistant de premier lancement. */
export type SettingsState = SettingsView & {
  platform: 'mac' | 'win' | 'other';
  shortcutLabel: string;
  shortcutOk: boolean;
  permissions: { screen: string; microphone: string }; // granted, denied, not-determined…
  modelPresent: boolean;
  whisper: WhisperStatus;
  tabletPaired: boolean;
  mcp: { url?: string; error?: string }; // serveur MCP pour Claude Code
};
export type ExportResult = { ok: true; path: string } | { ok: false; error: string };

/** Ce que l'éditeur doit montrer : une capture, et éventuellement un point avec sa bulle ouverte. */
export type EditorFocus = { captureId: string; annotationId?: string; openBubble?: boolean };

export type PastilleApi = {
  // Éditeur
  getSession(): Promise<Session | null>;
  onSession(cb: (s: Session | null) => void): () => void;
  onFocus(cb: (f: EditorFocus) => void): () => void;
  addAnnotation(captureId: string, geometry: Geometry): Promise<string>;
  updateAnnotation(id: string, patch: { text?: string; geometry?: Geometry }): void;
  deleteAnnotation(id: string): void;
  updateSession(patch: { name?: string; context?: string }): void;
  exportSession(format: ExportFormat): Promise<ExportResult>;
  undo(): void;
  redo(): void;
  dictationAvailable(): Promise<boolean>;
  submitDictation(annotationId: string, samples: Float32Array): void;
  retryDictation(annotationId: string): void;
  onPrepareMic(cb: () => void): () => void;
  setSelection(annotationId: string | null): void;
  deleteSketch(annotationId: string, sketchId: string): void;
  tabletStatus(): Promise<boolean>;
  onTabletStatus(cb: (connected: boolean) => void): () => void;
  // Réglages
  getSettings(): Promise<SettingsState>;
  updateSettings(patch: Partial<Settings>): Promise<{ ok: boolean; error?: string }>;
  setApiKey(key: string): Promise<void>;
  chooseExportDir(): Promise<string | undefined>;
  downloadModel(): Promise<{ ok: boolean; error?: string }>;
  onDownloadProgress(cb: (percent: number) => void): () => void;
  askPermission(kind: 'screen' | 'microphone'): Promise<void>;
  revokeTablet(): Promise<void>;
  pairTablet(): void;
  onSettingsChanged(cb: (s: SettingsState) => void): () => void;
  // Fenêtre POC
  onCaptureResult(cb: (r: CaptureResult) => void): () => void;
  startCapture(): void;
  shortcutStatus(): Promise<{ accelerator: string; registered: boolean }>;
  whisperStatus(): Promise<WhisperStatus>;
  transcribe(samples: Float32Array): Promise<TranscribeResult>;
  transcribeSample(): Promise<TranscribeResult>;
  // Overlay
  onOverlayShow(cb: (data: OverlayShow) => void): void;
  onOverlayWindows(cb: (rects: { x: number; y: number; width: number; height: number }[]) => void): void;
  overlayReady(): void;
  overlayPick(pick: OverlayPick): void;
};

/** Les images de session sont servies par le protocole pastille:// (voir main/index.ts). */
export const imageUrl = (session: Session, relativePath: string) => `pastille://session/${session.id}/${relativePath}`;

declare global {
  interface Window {
    pastille: PastilleApi;
  }
}
