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
  deleteCapture: (id) => ipcRenderer.send('capture:delete', id),
  listSessions: () => ipcRenderer.invoke('sessions:list'),
  openSession: (id) => ipcRenderer.invoke('session:open', id),
  trashSession: (id) => ipcRenderer.invoke('session:trash', id),
  onShowSessions: (cb) => on('editor:sessions', cb),
  addNote: () => ipcRenderer.invoke('note:add'),
  updateNote: (id, text) => ipcRenderer.send('note:update', id, text),
  deleteNote: (id) => ipcRenderer.send('note:delete', id),
  exportSession: (format) => ipcRenderer.invoke('session:export', format),
  undo: () => ipcRenderer.send('session:undo'),
  redo: () => ipcRenderer.send('session:redo'),
  dictationAvailable: () => ipcRenderer.invoke('dictation:available'),
  submitDictation: (id, samples) => ipcRenderer.send('dictation:submit', id, samples),
  retryDictation: (id) => ipcRenderer.send('dictation:retry', id),
  setRecording: (recording) => ipcRenderer.send('dictation:recording', recording),
  onPrepareMic: (cb) => on('editor:prepare-mic', cb),
  setSelection: (id) => ipcRenderer.send('editor:selection', id),
  deleteSketch: (annotationId, sketchId) => ipcRenderer.send('sketch:delete', annotationId, sketchId),
  captureInspiration: (id) => ipcRenderer.send('inspiration:capture', id),
  importInspiration: (id, png) => ipcRenderer.send('inspiration:import', id, png),
  deleteInspiration: (annotationId, inspirationId) => ipcRenderer.send('inspiration:delete', annotationId, inspirationId),
  tabletStatus: () => ipcRenderer.invoke('tablet:status'),
  onTabletStatus: (cb) => on('tablet:status', cb),

  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),
  setApiKey: (key) => ipcRenderer.invoke('settings:api-key', key),
  chooseExportDir: () => ipcRenderer.invoke('settings:choose-export-dir'),
  downloadModel: () => ipcRenderer.invoke('settings:download-model'),
  onDownloadProgress: (cb) => on('settings:download-progress', cb),
  askPermission: (kind) => ipcRenderer.invoke('settings:permission', kind),
  revokeTablet: () => ipcRenderer.invoke('tablet:revoke'),
  pairTablet: () => ipcRenderer.send('tablet:pair'),
  getPairing: () => ipcRenderer.invoke('tablet:pairing'),
  onSettingsChanged: (cb) => on('settings:changed', cb),
  onSettingsTab: (cb) => on('settings:tab', cb),
  openSettings: (tab) => ipcRenderer.send('settings:open', tab),
  copyText: (text) => ipcRenderer.send('clipboard:write', text),
  onShortcutPressed: (cb) => on('welcome:shortcut', cb),

  getMenuState: () => ipcRenderer.invoke('menu:state'),
  onMenuState: (cb) => on('menu:state', cb),
  menuAction: (action) => ipcRenderer.send('menu:action', action),
  menuResize: (height) => ipcRenderer.send('menu:resize', height),
  barHover: (inside) => ipcRenderer.send('bar:hover', inside),
  onExportNotice: (cb) => on('bar:export', cb),

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
