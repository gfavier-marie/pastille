// Clics de souris dans tout le système, pour le mode vidéo : Electron n'écoute que le clavier
// (globalShortcut). uiohook-napi (libuiohook) reçoit les clics des autres apps ; sur macOS, il
// exige l'autorisation Accessibilité. On n'écoute que le bouton gauche, et seulement pendant l'enregistrement.
// Le module natif n'est chargé qu'au premier enregistrement : s'il échoue, seul le mode vidéo est touché.

import { screen, systemPreferences } from 'electron';
import type { UiohookMouseEvent } from 'uiohook-napi';

type Point = { x: number; y: number };

const LEFT_BUTTON = 1;
const inside = (p: Point, r: Electron.Rectangle) => p.x >= r.x && p.y >= r.y && p.x < r.x + r.width && p.y < r.y + r.height;

export function createClicks(opts: {
  ignore: (p: Point) => boolean; // clic sur une de nos fenêtres
  onClick: (p: Point, at: number) => void; // position globale en DIP, Date.now() du clic
}) {
  let hook: typeof import('uiohook-napi')['uIOhook'] | null = null;
  let running = false;

  function onMouseDown(e: UiohookMouseEvent) {
    // Bouton gauche ; le 2ᵉ clic d'un double-clic ne compte pas.
    if (e.button !== LEFT_BUTTON || e.clicks > 1) return;
    const at = Date.now();
    // Position en DIP sur les deux systèmes (libuiohook donne des pixels physiques sous Windows).
    const p = screen.getCursorScreenPoint();
    // Barre des menus, Dock, barre des tâches : rien à commenter.
    if (!inside(p, screen.getDisplayNearestPoint(p).workArea) || opts.ignore(p)) return;
    opts.onClick(p, at);
  }

  return {
    /** macOS : autorisation Accessibilité accordée. */
    allowed: () => process.platform !== 'darwin' || systemPreferences.isTrustedAccessibilityClient(false),
    /** macOS : inscrit l'app dans la liste Accessibilité (et la demande, la première fois). */
    ask: () => process.platform === 'darwin' && systemPreferences.isTrustedAccessibilityClient(true),
    /** Rejette si le module ne se charge pas ou si l'écoute ne démarre pas (Accessibilité refusée). */
    async start() {
      if (running) return;
      hook ??= (await import('uiohook-napi')).uIOhook;
      hook.on('mousedown', onMouseDown);
      try {
        hook.start();
      } catch (err) {
        hook.off('mousedown', onMouseDown);
        throw err;
      }
      running = true;
    },
    stop() {
      if (!running || !hook) return;
      hook.off('mousedown', onMouseDown);
      hook.stop();
      running = false;
    },
  };
}
