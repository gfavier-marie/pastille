import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDock } from './dock.ts';

describe('icône du Dock', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup() {
    const st = { open: false, busy: false, visible: true, shows: 0, hides: 0 };
    const dock = createDock({
      open: () => st.open,
      busy: () => st.busy,
      isVisible: () => st.visible,
      show: async () => {
        st.visible = true;
        st.shows++;
      },
      hide: () => {
        st.visible = false;
        st.hides++;
      },
      delayMs: 1500,
    });
    return { st, dock };
  }

  it('apparaît tout de suite quand une fenêtre s’ouvre', async () => {
    const { st, dock } = setup();
    st.visible = false;
    st.open = true;
    expect(await dock.sync()).toBe(true);
    expect(st.visible).toBe(true);
    expect(await dock.sync()).toBe(false); // déjà visible : rien à refocaliser
  });

  it('disparaît seulement après le délai, sans fenêtre ouverte', async () => {
    const { st, dock } = setup();
    await dock.sync();
    vi.advanceTimersByTime(1400);
    expect(st.visible).toBe(true);
    vi.advanceTimersByTime(200);
    expect(st.visible).toBe(false);
  });

  it('reste si une fenêtre se rouvre pendant le délai', async () => {
    const { st, dock } = setup();
    await dock.sync();
    vi.advanceTimersByTime(1000);
    st.open = true;
    await dock.sync();
    vi.advanceTimersByTime(5000);
    expect(st.hides).toBe(0);
  });

  it('attend la fin d’une capture avant de disparaître', async () => {
    const { st, dock } = setup();
    st.busy = true;
    await dock.sync();
    vi.advanceTimersByTime(4000);
    expect(st.visible).toBe(true);
    st.busy = false;
    vi.advanceTimersByTime(1600);
    expect(st.visible).toBe(false);
  });
});
