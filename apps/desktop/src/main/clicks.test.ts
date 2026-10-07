import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const desktop = vi.hoisted(() => ({
  cursor: { x: -800, y: 400 },
  display: { id: 2, bounds: { x: -1000, y: 200, width: 1000, height: 800 }, workArea: { x: -1000, y: 220, width: 1000, height: 760 } },
}));
vi.mock('electron', () => ({
  screen: { getCursorScreenPoint: () => desktop.cursor, getDisplayNearestPoint: () => desktop.display },
  systemPreferences: { isTrustedAccessibilityClient: () => true },
}));
vi.mock('uiohook-napi', () => ({ uIOhook: Object.assign(new EventEmitter(), { start: vi.fn(), stop: vi.fn() }) }));

import { uIOhook } from 'uiohook-napi';
import { createClicks } from './clicks.ts';

const mouse = (overrides: Record<string, unknown> = {}) => ({ type: 7, button: 1, clicks: 1, shiftKey: false, altKey: false, metaKey: false, ctrlKey: false, ...overrides });
const held = { metaKey: true, ctrlKey: true }; // ⌘ sur Mac, Ctrl ailleurs
const key = (type: number, overrides: Record<string, unknown> = {}) => ({ type, keycode: 3675, shiftKey: false, altKey: false, metaKey: false, ctrlKey: false, ...overrides });

beforeEach(() => {
  uIOhook.removeAllListeners();
  desktop.cursor = { x: -800, y: 400 };
});

describe('gestes globaux de la vidéo', () => {
  it('fige au bouton enfoncé et affiche le cadre pendant un événement natif de glissement (type 10)', async () => {
    const clicked = vi.fn(), gesture = vi.fn();
    const clicks = createClicks({ ignore: () => false, onClick: clicked, onGesture: gesture });
    await clicks.start();
    uIOhook.emit('mousedown', mouse(held));
    expect(clicked).toHaveBeenCalledWith({ x: -800, y: 400 }, expect.any(Number));
    desktop.cursor = { x: -400, y: 700 };
    // uiohook-napi transmet « input » mais n'émet pas « mousemove » pour les glissements.
    uIOhook.emit('input', mouse({ type: 10 }));
    expect(gesture).toHaveBeenLastCalledWith(2, { kind: 'zone', x: 0.2, y: 0.25, w: expect.closeTo(0.4), h: 0.375 }, false, false);
    uIOhook.emit('mouseup', mouse({ type: 8, altKey: true }));
    expect(gesture).toHaveBeenLastCalledWith(2, expect.objectContaining({ kind: 'zone' }), true, true);
    clicks.stop();
    expect(uIOhook.listenerCount('input')).toBe(0);
    expect(uIOhook.listenerCount('mousemove')).toBe(0);
    expect(uIOhook.listenerCount('mouseup')).toBe(0);
  });

  it('ignore le bandeau, le bouton droit, les double-clics et les zones système', async () => {
    const clicked = vi.fn(), gesture = vi.fn();
    const ignore = vi.fn(() => true);
    const navigated = vi.fn();
    const clicks = createClicks({ ignore, onClick: clicked, onNavigate: navigated, onGesture: gesture });
    await clicks.start();
    uIOhook.emit('mousedown', mouse(held));
    uIOhook.emit('mousedown', mouse());
    ignore.mockReturnValue(false);
    uIOhook.emit('mousedown', mouse({ button: 2, ...held }));
    uIOhook.emit('mousedown', mouse({ clicks: 2, ...held }));
    desktop.cursor = { x: -800, y: 210 };
    uIOhook.emit('mousedown', mouse(held));
    uIOhook.emit('mouseup', mouse());
    expect(clicked).not.toHaveBeenCalled();
    expect(navigated).not.toHaveBeenCalled();
    expect(gesture).not.toHaveBeenCalled();
    clicks.stop();
  });

  it('un clic seul navigue : ni point ni geste', async () => {
    const clicked = vi.fn(), navigated = vi.fn(), gesture = vi.fn();
    const clicks = createClicks({ ignore: () => false, onClick: clicked, onNavigate: navigated, onGesture: gesture });
    await clicks.start();
    uIOhook.emit('mousedown', mouse());
    desktop.cursor = { x: -400, y: 700 };
    uIOhook.emit('input', mouse({ type: 10 }));
    uIOhook.emit('mouseup', mouse({ type: 8 }));
    expect(navigated).toHaveBeenCalledTimes(1);
    expect(clicked).not.toHaveBeenCalled();
    expect(gesture).not.toHaveBeenCalled();
    clicks.stop();
  });

  it('⌘ / Ctrl tenu arme nos fenêtres, jusqu’au relâchement du glissement, et se corrige au mouvement', async () => {
    const armed = vi.fn();
    const clicks = createClicks({ ignore: () => false, onClick: vi.fn(), onArmed: armed });
    await clicks.start();
    uIOhook.emit('input', key(4, held));
    expect(armed).toHaveBeenLastCalledWith(true);
    uIOhook.emit('input', mouse(held));
    uIOhook.emit('mousedown', mouse(held));
    uIOhook.emit('input', key(5)); // touche relâchée pendant le glissement
    expect(armed).toHaveBeenCalledTimes(1);
    const up = mouse({ type: 8 });
    uIOhook.emit('input', up);
    uIOhook.emit('mouseup', up);
    expect(armed).toHaveBeenLastCalledWith(false);
    uIOhook.emit('input', key(4, held));
    uIOhook.emit('input', mouse({ type: 9 })); // relâchement manqué : le mouvement suivant le rattrape
    expect(armed.mock.calls).toEqual([[true], [false], [true], [false]]);
    uIOhook.emit('input', key(4, held));
    clicks.stop();
    expect(armed).toHaveBeenLastCalledWith(false);
  });
});
