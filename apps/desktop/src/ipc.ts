// Contrat IPC entre le processus principal et les fenêtres (exposé par le preload).

import type { Geometry, Session } from '@pastille/shared';
import type { LicenseView } from './main/license.ts';
import type { Settings, SettingsView } from './main/settings.ts';

export type { LicenseView, Settings };

/** Écran figé, et de quoi annoncer la capture : session, numéro d'écran, numéro du prochain point. */
export type OverlayShow = {
  jpeg: Uint8Array;
  session: string;
  screen: number;
  nextNumber: number;
  cursor?: { x: number; y: number }; // position du curseur sur cet écran, au moment du raccourci
  inspiration?: number; // capture d'une inspiration pour ce point : rien n'est posé
};

/** Fenêtre visable sur l'écran de l'overlay (DIP), de l'avant vers l'arrière. */
export type OverlayWindow = { x: number; y: number; width: number; height: number; app?: string; title?: string };

/** Coordonnées en pixels logiques (DIP), relatives à l'écran de l'overlay. */
export type OverlayPick =
  | { kind: 'click'; x: number; y: number; shift?: boolean }
  | { kind: 'zone'; x: number; y: number; w: number; h: number; crop?: boolean } // ⌥ : recadrer ; sinon zone montrée sur la fenêtre
  | { kind: 'cancel' };

/** Mode vidéo : un écran filmé par la fenêtre cachée (source de desktopCapturer), taille en pixels physiques. */
export type VideoSource = { displayId: number; sourceId: string; width: number; height: number };

/** Retour à l'écran pendant la vidéo : point provisoire et état réel du micro. */
export type VideoFeedback = {
  click?: { displayId: number; x: number; y: number; number: number; at: number; geometry?: Geometry };
  elapsedMs: number;
  level: number;
  voiced: boolean;
  kept?: boolean;
  paused?: boolean;
  inspiration?: { shortcut: string; number?: number };
  stopShortcut?: string; // raccourci qui arrête l'enregistrement, affiché sur « Arrêter »
  tablet?: boolean;
  armed?: boolean; // ⌘ / Ctrl tenu : le prochain clic pose un point
  error?: string;
} | null;

/** Image figée au clic, recadrée sur la cible : rectangle en 0–1 de l'écran ; null la jette. */
export type VideoCrop = { frameId: number; rect: { x: number; y: number; width: number; height: number } | null };

/** Image recadrée, sa vignette en niveaux de gris (pour reconnaître un écran inchangé) et ses mesures. */
export type VideoImage = {
  png: Uint8Array;
  width: number; // pixels physiques
  height: number;
  thumb: Uint8Array; // VIDEO_THUMB.width × VIDEO_THUMB.height octets
  frozenAt: number; // Date.now() quand l'image a été figée
  frameAgeMs: number; // âge de l'image à ce moment
};

export const VIDEO_THUMB = { width: 64, height: 36 };

/** Niveau RMS du micro au-dessus duquel quelqu'un parle (dictée de l'éditeur et mode vidéo). */
export const VOICE_RMS = 0.015;

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
  videoShortcutLabel: string; // raccourci fixe du mode vidéo, affiché
  shortcutOk: boolean;
  permissions: { screen: string; microphone: string; accessibility: string }; // granted, denied, not-determined…
  whisper: WhisperStatus;
  tabletPaired: boolean;
  tabletConnected: boolean;
  mcp: { url?: string; error?: string }; // serveur MCP pour Claude Code
  license: LicenseView;
};

/** Fenêtre d'appairage : le code QR (image) et l'état de la tablette. */
export type PairingState = { qr: string; connected: boolean };

export type SettingsTab = 'general' | 'permissions' | 'transcription' | 'export' | 'devices' | 'claude' | 'license';
export type ExportResult = { ok: true; path: string } | { ok: false; error: string };

/** Une session enregistrée, telle que listée (menu de l'icône, liste de toutes les sessions). */
export type SessionSummary = { id: string; name: string; points: number; screens: number; updatedAt: string };

/** Ce qu'affichent le menu de l'icône et la barre flottante. */
export type MenuState = {
  platform: 'mac' | 'win' | 'other';
  session: { name: string; points: number; screens: number; createdAt: string } | null;
  tablet: boolean; // tablette connectée
  pending: number; // transcriptions en cours
  errors: number; // transcriptions en erreur
  shortcut: string; // raccourci de capture, affiché (« ⌃⌥⌘P »)
  video: { shortcut: string; since?: number }; // mode vidéo : raccourci affiché, début de l'enregistrement en cours (Date.now())
  recents: SessionSummary[];
  update?: string; // version plus récente publiée
  updateProgress?: number; // téléchargement de la mise à jour en cours (%)
  license: LicenseView;
};

export type MenuAction =
  | { type: 'capture' | 'video' | 'editor' | 'sessions' | 'export' | 'new-session' | 'pair' | 'claude-code' | 'settings' | 'quit' | 'close' | 'hide-bar' | 'reveal' | 'update' | 'license' }
  | { type: 'open-recent' | 'export-recent'; id: string };

/** Message de la barre flottante après un export. */
export type ExportNotice = { format: ExportFormat; file: string; copied: boolean };

/** Ce que l'éditeur doit montrer : une capture, et éventuellement un point avec sa bulle ouverte (dictée lancée ou non). */
export type EditorFocus = { captureId: string; annotationId?: string; openBubble?: boolean; dictate?: boolean };

export type PastilleApi = {
  // Éditeur
  getSession(): Promise<Session | null>;
  onSession(cb: (s: Session | null) => void): () => void;
  onFocus(cb: (f: EditorFocus) => void): () => void;
  addAnnotation(captureId: string, geometry: Geometry): Promise<string>;
  updateAnnotation(id: string, patch: { text?: string; geometry?: Geometry }): void;
  deleteAnnotation(id: string): void;
  discardAnnotation(id: string): void; // point resté vide (Échap) : retiré sans étape d'annulation
  updateSession(patch: { name?: string }): void;
  deleteCapture(id: string): void; // annulable par ⌘Z
  listSessions(): Promise<SessionSummary[]>;
  openSession(id: string): Promise<void>;
  trashSession(id: string): Promise<boolean>; // après confirmation ; faux si annulé
  onShowSessions(cb: () => void): () => void; // « Toutes les sessions… » du menu de l'icône
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
  captureInspiration(annotationId: string): void; // éditeur masqué, la prochaine capture devient l'inspiration du point
  importInspiration(annotationId: string, png: Uint8Array): void; // image collée ou déposée
  deleteInspiration(annotationId: string, inspirationId: string): void;
  tabletStatus(): Promise<boolean>;
  onTabletStatus(cb: (connected: boolean) => void): () => void;
  // Réglages
  getSettings(): Promise<SettingsState>;
  updateSettings(patch: Partial<Settings>): Promise<{ ok: boolean; error?: string }>;
  setApiKey(key: string): Promise<void>;
  chooseExportDir(): Promise<string | undefined>;
  downloadModel(): Promise<{ ok: boolean; error?: string }>;
  onDownloadProgress(cb: (percent: number) => void): () => void;
  askPermission(kind: 'screen' | 'microphone' | 'accessibility'): Promise<void>;
  revokeTablet(): Promise<void>;
  pairTablet(): void;
  getPairing(): Promise<PairingState>;
  onSettingsChanged(cb: (s: SettingsState) => void): () => void;
  onSettingsTab(cb: (tab: SettingsTab) => void): () => void;
  openSettings(tab?: SettingsTab): void;
  copyText(text: string): void;
  onShortcutPressed(cb: () => void): () => void; // assistant de premier lancement
  activateLicense(key: string): Promise<{ ok: true } | { ok: false; error: string }>;
  openLicensePage(page: 'buy' | 'portal'): void; // site (tarifs) ou portail client Polar, dans le navigateur
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
  toggleVideo(): void;
  shortcutStatus(): Promise<{ accelerator: string; registered: boolean }>;
  whisperStatus(): Promise<WhisperStatus>;
  transcribe(samples: Float32Array): Promise<TranscribeResult>;
  transcribeSample(): Promise<TranscribeResult>;
  // Fenêtre cachée du mode vidéo
  onVideoStart(cb: (sources: VideoSource[]) => void): () => void;
  videoStarted(error?: string): void; // flux et micro ouverts, ou l'erreur
  onVideoFreeze(cb: (f: { frameId: number; displayId: number }) => void): () => void;
  onVideoCrop(cb: (c: VideoCrop) => void): () => void;
  videoCropped(frameId: number, image: VideoImage | null): void;
  videoAudio(chunk: Float32Array): void; // micro, blocs de 100 ms à 16 kHz
  onVideoFeedback(cb: (state: VideoFeedback) => void): () => void;
  videoFeedbackHover(inside: boolean): void;
  videoAction(action: 'draw' | 'inspiration' | 'capture-inspiration' | 'cancel-inspiration' | 'stop'): Promise<void>;
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
