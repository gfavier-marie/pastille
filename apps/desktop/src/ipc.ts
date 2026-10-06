// Contrat IPC entre le processus principal et les fenêtres (exposé par le preload).

import type { Geometry, Session } from '@pastille/shared';
import type { Settings, SettingsView } from './main/settings.ts';

export type { Settings };

/** Écran figé, et de quoi annoncer la capture : session, numéro d'écran, numéro du prochain point. */
export type OverlayShow = {
  jpeg: Uint8Array;
  session: string;
  screen: number;
  nextNumber: number;
  cursor?: { x: number; y: number }; // position du curseur sur cet écran, au moment du raccourci
};

/** Fenêtre visable sur l'écran de l'overlay (DIP), de l'avant vers l'arrière. */
export type OverlayWindow = { x: number; y: number; width: number; height: number; app?: string; title?: string };

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
  tabletConnected: boolean;
  mcp: { url?: string; error?: string }; // serveur MCP pour Claude Code
};

/** Fenêtre d'appairage : le code QR (image) et l'état de la tablette. */
export type PairingState = { qr: string; connected: boolean };

export type SettingsTab = 'general' | 'transcription' | 'export' | 'devices';
export type ExportResult = { ok: true; path: string } | { ok: false; error: string };

/** Ce qu'affichent le menu de l'icône et la barre flottante. */
export type MenuState = {
  platform: 'mac' | 'win' | 'other';
  session: { name: string; points: number; screens: number; createdAt: string } | null;
  tablet: boolean; // tablette connectée
  pending: number; // transcriptions en cours
  errors: number; // transcriptions en erreur
  shortcut: string; // raccourci de capture, affiché (« ⇧⌘2 »)
  recents: { id: string; name: string; points: number; screens: number; updatedAt: string }[];
  update?: string; // version plus récente publiée sur GitHub
};

export type MenuAction =
  | { type: 'capture' | 'editor' | 'export' | 'new-session' | 'pair' | 'settings' | 'quit' | 'close' | 'hide-bar' | 'reveal' | 'update' }
  | { type: 'open-recent' | 'export-recent'; id: string };

/** Message de la barre flottante après un export. */
export type ExportNotice = { format: ExportFormat; file: string; copied: boolean };

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
  addNote(): Promise<string>;
  updateNote(id: string, text: string): void;
  deleteNote(id: string): void;
  exportSession(format: ExportFormat): Promise<ExportResult>;
  undo(): void;
  redo(): void;
  dictationAvailable(): Promise<boolean>;
  submitDictation(annotationId: string, samples: Float32Array): void; // point ou remarque générale
  retryDictation(annotationId: string): void;
  setRecording(recording: boolean): void;
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
  getPairing(): Promise<PairingState>;
  onSettingsChanged(cb: (s: SettingsState) => void): () => void;
  onSettingsTab(cb: (tab: SettingsTab) => void): () => void;
  openSettings(tab?: SettingsTab): void;
  onShortcutPressed(cb: () => void): () => void; // assistant de premier lancement
  // Menu de l'icône et barre flottante
  getMenuState(): Promise<MenuState>;
  onMenuState(cb: (s: MenuState) => void): () => void;
  menuAction(action: MenuAction): void;
  menuResize(height: number): void;
  barHover(inside: boolean): void;
  onExportNotice(cb: (n: ExportNotice) => void): () => void;
  // Fenêtre POC
  onCaptureResult(cb: (r: CaptureResult) => void): () => void;
  startCapture(): void;
  shortcutStatus(): Promise<{ accelerator: string; registered: boolean }>;
  whisperStatus(): Promise<WhisperStatus>;
  transcribe(samples: Float32Array): Promise<TranscribeResult>;
  transcribeSample(): Promise<TranscribeResult>;
  // Overlay
  onOverlayShow(cb: (data: OverlayShow) => void): void;
  onOverlayWindows(cb: (windows: OverlayWindow[]) => void): void;
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
