import { contextBridge, ipcRenderer } from 'electron';
import type { PastilleApi } from '../ipc.ts';

/** Abonnement à un message du processus principal ; renvoie la fonction de désabonnement. */
function on<T>(channel: string, cb: (data: T) => void) {
  const listener = (_e: unknown, data: T) => cb(data);
  ipcRenderer.on(channel, listener);
  return () => void ipcRenderer.off(channel, listener);
}

const api: PastilleApi = {
  getSession: () => ipcRenderer.invoke('session:get'),
  onSession: (cb) => on('session:changed', cb),
  onFocus: (cb) => on('editor:focus', cb),
  addAnnotation: (captureId, geometry) => ipcRenderer.invoke('annotation:add', captureId, geometry),
  updateAnnotation: (id, patch) => ipcRenderer.send('annotation:update', id, patch),
  deleteAnnotation: (id) => ipcRenderer.send('annotation:delete', id),
  updateSession: (patch) => ipcRenderer.send('session:update', patch),
  exportSession: (format) => ipcRenderer.invoke('session:export', format),
  undo: () => ipcRenderer.send('session:undo'),
  redo: () => ipcRenderer.send('session:redo'),
  dictationAvailable: () => ipcRenderer.invoke('dictation:available'),
  submitDictation: (id, samples) => ipcRenderer.send('dictation:submit', id, samples),
  retryDictation: (id) => ipcRenderer.send('dictation:retry', id),
  onPrepareMic: (cb) => on('editor:prepare-mic', cb),
  setSelection: (id) => ipcRenderer.send('editor:selection', id),
  deleteSketch: (annotationId, sketchId) => ipcRenderer.send('sketch:delete', annotationId, sketchId),
  tabletStatus: () => ipcRenderer.invoke('tablet:status'),
  onTabletStatus: (cb) => on('tablet:status', cb),

  onCaptureResult: (cb) => on('capture:result', cb),
  startCapture: () => ipcRenderer.send('capture:start'),
  shortcutStatus: () => ipcRenderer.invoke('shortcut:status'),
  whisperStatus: () => ipcRenderer.invoke('whisper:status'),
  transcribe: (samples) => ipcRenderer.invoke('dictee:transcribe', samples),
  transcribeSample: () => ipcRenderer.invoke('dictee:sample'),

  onOverlayShow: (cb) => void on('overlay:show', cb),
  onOverlayWindows: (cb) => void on('overlay:windows', cb),
  overlayReady: () => ipcRenderer.send('overlay:ready'),
  overlayPick: (pick) => ipcRenderer.send('overlay:pick', pick),
};

contextBridge.exposeInMainWorld('pastille', api);
