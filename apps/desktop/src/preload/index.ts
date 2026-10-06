import { contextBridge, ipcRenderer } from 'electron';
import type { CaptureResult, OverlayPick, OverlayShow, PastilleApi } from '../ipc.ts';

const api: PastilleApi = {
  onCaptureResult(cb) {
    const listener = (_e: unknown, r: CaptureResult) => cb(r);
    ipcRenderer.on('capture:result', listener);
    return () => ipcRenderer.off('capture:result', listener);
  },
  startCapture: () => ipcRenderer.send('capture:start'),
  shortcutStatus: () => ipcRenderer.invoke('shortcut:status'),
  whisperStatus: () => ipcRenderer.invoke('whisper:status'),
  transcribe: (samples) => ipcRenderer.invoke('dictee:transcribe', samples),
  transcribeSample: () => ipcRenderer.invoke('dictee:sample'),

  onOverlayShow: (cb) => ipcRenderer.on('overlay:show', (_e, data: OverlayShow) => cb(data)),
  overlayReady: () => ipcRenderer.send('overlay:ready'),
  overlayPick: (pick: OverlayPick) => ipcRenderer.send('overlay:pick', pick),
};

contextBridge.exposeInMainWorld('pastille', api);
