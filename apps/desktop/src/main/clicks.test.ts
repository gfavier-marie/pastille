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

const mouse = (overrides: Record<string, unknown> = {}) => ({ type: 7, button: 1, clicks: 1, shiftKey: false, altKey: false, ...overrides });

beforeEach(() => {
  uIOhook.removeAllListeners();
  desktop.cursor = { x: -800, y: 400 };
});

describe('gestes globaux de la vidéo', () => {
  it('fige au bouton enfoncé et affiche le cadre pendant un événement natif de glissement (type 10)', async () => {
    const clicked = vi.fn(), gesture = vi.fn();
    const clicks = createClicks({ ignore: () => false, onClick: clicked, onGesture: gesture });
    await clicks.start();
    uIOhook.emit('mousedown', mouse());
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
    const clicks = createClicks({ ignore, onClick: clicked, onGesture: gesture });
    await clicks.start();
    uIOhook.emit('mousedown', mouse());
    ignore.mockReturnValue(false);
    uIOhook.emit('mousedown', mouse({ button: 2 }));
    uIOhook.emit('mousedown', mouse({ clicks: 2 }));
    desktop.cursor = { x: -800, y: 210 };
    uIOhook.emit('mousedown', mouse());
    uIOhook.emit('mouseup', mouse());
    expect(clicked).not.toHaveBeenCalled();
    expect(gesture).not.toHaveBeenCalled();
    clicks.stop();
  });
});
