/* [018A-61] Regresión de comandos de navegación y geometría del shell.
 * Estos tests comprueban que las superficies delegan en el Registry y que el
 * reencuadre se aplica en una sola mutación, sin depender del navegador. */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearQueue, getQueuedEvents } from '../../analytics/dispatcher';
import { showSidebar } from '../../../store';
import { CommandRegistry } from '../command-registry';
import { setWorkspaceBounds, windowStore } from '../window-store';
import type { WindowEntry } from '../window-store';
import './navigation-commands';
import './window-commands';

function makeWindow(overrides: Partial<WindowEntry> = {}): WindowEntry {
  return {
    instanceId: 'window-command-test',
    appId: 'reader',
    title: 'Reader',
    focused: true,
    state: 'open',
    bounds: { x: 40, y: 40, w: 400, h: 300 },
    zIndex: 10,
    content: document.createElement('div'),
    ...overrides,
  };
}

describe('shell commands [018A-61]', () => {
  let initialSidebar: boolean;

  beforeEach(() => {
    initialSidebar = showSidebar.get();
    windowStore.set([], 'init');
    setWorkspaceBounds(1200, 800);
    clearQueue();
  });

  afterEach(() => {
    windowStore.set([], 'init');
    showSidebar.set(initialSidebar, 'init');
    clearQueue();
  });

  it('togglea navegación desde un único comando y mide el resultado', async () => {
    showSidebar.set(false, 'init');

    const result = await CommandRegistry.execute('navigation:toggle-external-nav');

    expect(result).toEqual({ status: 'success' });
    expect(showSidebar.get()).toBe(true);
    expect(getQueuedEvents().at(-1)).toMatchObject({
      eventName: 'external_nav_toggled',
      properties: { expanded: true },
    });
  });

  it('maximiza y restaura una ventana objetivo sin callback paralelo', async () => {
    const window = makeWindow();
    windowStore.set([window], 'init');
    const target = { targets: [{ id: window.instanceId, kind: 'window' as const }] };

    expect(CommandRegistry.isAvailable('window:maximize', target)).toEqual({ state: 'enabled' });
    expect(await CommandRegistry.execute('window:maximize', target)).toEqual({ status: 'success' });
    expect(windowStore.get()[0].state).toBe('maximized');
    expect(getQueuedEvents().at(-1)).toMatchObject({
      eventName: 'window_maximized',
      properties: { appId: 'reader', maximized: true },
    });

    expect(await CommandRegistry.execute('window:maximize', target)).toEqual({ status: 'success' });
    expect(windowStore.get()[0].state).toBe('open');
  });

  it('no permite maximizar una ventana minimizada', async () => {
    const window = makeWindow({ state: 'minimized', focused: false });
    windowStore.set([window], 'init');

    expect(CommandRegistry.isAvailable('window:maximize', {
      targets: [{ id: window.instanceId, kind: 'window' }],
    })).toEqual({ state: 'disabled', reason: 'window minimized' });
  });

  it('reencuadra ventanas en batch y actualiza las maximizadas', async () => {
    setWorkspaceBounds(800, 500);
    windowStore.set([
      makeWindow({ bounds: { x: 900, y: 480, w: 400, h: 300 } }),
      makeWindow({
        instanceId: 'window-command-maximized',
        state: 'maximized',
        bounds: { x: 0, y: 0, w: 1200, h: 800 },
        preMaximizeBounds: { x: 900, y: 480, w: 400, h: 300 },
      }),
    ], 'init');

    expect(await CommandRegistry.execute('window:reframe-all')).toEqual({ status: 'success' });
    const [open, maximized] = windowStore.get();
    expect(open.bounds.x).toBeLessThanOrEqual(740);
    expect(open.bounds.y).toBeLessThanOrEqual(476);
    expect(maximized.bounds).toEqual({ x: 0, y: 0, w: 800, h: 500 });
    expect(maximized.preMaximizeBounds?.x).toBeLessThanOrEqual(740);
    expect(getQueuedEvents().at(-1)).toMatchObject({
      eventName: 'windows_reframed',
      properties: { count: 2 },
    });
  });
});
