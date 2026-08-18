/* wandori.us — Window Session Restore Tests
 * [317A-5] Restauración fail-closed por catálogo/capacidad, z-order y dispatch
 * por presentación. La captura/persistencia se prueba en window-session.test.ts. */

import { describe, it, expect, beforeEach } from 'vitest';
import { SESSION_STORAGE_KEY } from './window-session';
import {
  restoreDesktopWindows,
  restoreMobileStack,
  restoreWindowSession,
} from './window-session-restore';
import { windowStore } from './window-manager';
import { AppRegistry } from './app-registry';
import type { WindowEntry } from './window-store';
import {
  _resetWindowCountersForTest as resetWindowCounters,
  setWorkspaceBounds,
  generateNextZIndex,
} from './window-store';
import { mobileStackStore, _resetMobileStackForTest } from '../mobile/mobile-stack';
import { authStore } from '../../store';
import type { AppDefinition } from './app-registry';
import type { SavedWindow, SavedMobileEntry } from './window-session';

const publicApp: AppDefinition = {
  id: 'test-public',
  title: 'App Pública',
  icon: [],
  singleton: false,
  requires: 'public',
  render: () => ({ element: document.createElement('div'), destroy: () => {} }),
};

const adminApp: AppDefinition = {
  ...publicApp,
  id: 'test-admin',
  title: 'App Admin',
  requires: 'admin',
};

const singletonApp: AppDefinition = {
  ...publicApp,
  id: 'test-singleton',
  title: 'App Singleton',
  singleton: true,
};

const actionsApp: AppDefinition = {
  ...publicApp,
  id: 'test-actions',
  title: 'App con acciones',
  render: () => ({
    element: document.createElement('div'),
    actions: Object.assign(document.createElement('div'), {
      className: 'desktop-window__actions',
    }),
  }),
};

/* Registro único: el registry es singleton y no expone unregister. */
AppRegistry.register(publicApp);
AppRegistry.register(adminApp);
AppRegistry.register(singletonApp);
AppRegistry.register(actionsApp);

function makeWindow(overrides: Partial<WindowEntry> & { appId: string }): WindowEntry {
  const { appId, ...rest } = overrides;
  const app = AppRegistry.get(appId);
  return {
    instanceId: `win-${appId}`,
    appId,
    title: appId,
    state: 'open',
    bounds: { x: 40, y: 40, w: 640, h: 480 },
    zIndex: 10,
    focused: false,
    content: document.createElement('div'),
    controller: new AbortController(),
    app: app ?? publicApp,
    ...rest,
  };
}

function setViewportWidth(width: number): void {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
}

beforeEach(() => {
  resetWindowCounters();
  setWorkspaceBounds(1200, 800);
  _resetMobileStackForTest();
  windowStore.set([], 'init');
  authStore.set({ isAuthenticated: false, userId: null, capability: 'public' });
  localStorage.clear();
  setViewportWidth(1024); /* desktop */
});

describe('restoreDesktopWindows [317A-5]', () => {
  it('restaura geometría, estado, zIndex y foco', async () => {
    const saved: SavedWindow[] = [{
      appId: 'test-public',
      bounds: { x: 150, y: 100, w: 520, h: 310 },
      state: 'maximized',
      zIndex: 30,
      focused: true,
      preMaximizeBounds: { x: 150, y: 100, w: 520, h: 310 },
    }];

    await restoreDesktopWindows(saved);

    const windows = windowStore.get();
    expect(windows).toHaveLength(1);
    expect(windows[0].appId).toBe('test-public');
    expect(windows[0].state).toBe('maximized');
    expect(windows[0].zIndex).toBe(30);
    expect(windows[0].focused).toBe(true);
    expect(windows[0].bounds).toEqual({ x: 150, y: 100, w: 520, h: 310 });
  });

  it('fail-closed: app fuera del catálogo se omite sin romper', async () => {
    const saved: SavedWindow[] = [
      { appId: 'app-retirada', bounds: { x: 0, y: 0, w: 300, h: 200 }, state: 'open', zIndex: 1, focused: false },
      { appId: 'test-public', bounds: { x: 0, y: 0, w: 300, h: 200 }, state: 'open', zIndex: 2, focused: true },
    ];

    await restoreDesktopWindows(saved);

    const windows = windowStore.get();
    expect(windows).toHaveLength(1);
    expect(windows[0].appId).toBe('test-public');
  });

  it('fail-closed: app admin no se restaura para capacidad pública', async () => {
    const saved: SavedWindow[] = [
      { appId: 'test-admin', bounds: { x: 0, y: 0, w: 300, h: 200 }, state: 'open', zIndex: 3, focused: true },
      { appId: 'test-public', bounds: { x: 0, y: 0, w: 300, h: 200 }, state: 'open', zIndex: 4, focused: false },
    ];

    await restoreDesktopWindows(saved);

    const windows = windowStore.get();
    expect(windows).toHaveLength(1);
    expect(windows[0].appId).toBe('test-public');
  });

  it('no duplica una ventana ya abierta (transición: URL app abierta antes)', async () => {
    /* Simula el orden de transición: refreshRoute() ya abrió la app de la URL
     * y el restore corre después; findExistingWindow evita la segunda instancia.
     * Se usa una app singleton: findExistingWindow deduplica por appId. */
    windowStore.set([makeWindow({ appId: 'test-singleton', focused: true, zIndex: 10 })]);

    const saved: SavedWindow[] = [{
      appId: 'test-singleton',
      bounds: { x: 10, y: 10, w: 400, h: 300 },
      state: 'open',
      zIndex: 20,
      focused: false,
    }];

    await restoreDesktopWindows(saved);

    const windows = windowStore.get();
    expect(windows).toHaveLength(1); /* no duplicada */
    expect(windows[0].appId).toBe('test-singleton');
  });

  it('sube el piso de z-index por encima del máximo restaurado', async () => {
    const saved: SavedWindow[] = [{
      appId: 'test-public',
      bounds: { x: 0, y: 0, w: 300, h: 200 },
      state: 'open',
      zIndex: 40,
      focused: true,
    }];

    await restoreDesktopWindows(saved);
    expect(generateNextZIndex()).toBeGreaterThan(40);
  });

  it('conserva las acciones derivadas de MountedView al restaurar', async () => {
    const saved: SavedWindow[] = [{
      appId: 'test-actions',
      bounds: { x: 0, y: 0, w: 300, h: 200 },
      state: 'open',
      zIndex: 50,
      focused: true,
    }];

    await restoreDesktopWindows(saved);

    const restored = windowStore.get()[0];
    expect(restored.actions?.className).toBe('desktop-window__actions');
  });
});

describe('restoreMobileStack [317A-5]', () => {
  it('restaura el stack en orden (top = foco)', async () => {
    const saved: SavedMobileEntry[] = [
      { appId: 'test-public', params: { folderId: 'a' } },
      { appId: 'test-public', params: { folderId: 'b' } },
    ];

    await restoreMobileStack(saved);

    const stack = mobileStackStore.get();
    expect(stack).toHaveLength(2);
    expect(stack[0].params?.folderId).toBe('a');
    expect(stack[1].params?.folderId).toBe('b');
  });

  it('fail-closed: omite apps sin capacidad', async () => {
    const saved: SavedMobileEntry[] = [
      { appId: 'test-admin' },
      { appId: 'test-public' },
    ];

    await restoreMobileStack(saved);

    const stack = mobileStackStore.get();
    expect(stack).toHaveLength(1);
    expect(stack[0].appId).toBe('test-public');
  });
});

describe('restoreWindowSession [317A-5]', () => {
  it('restaura desktop en presentación desktop', async () => {
    setViewportWidth(1024);
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
      version: 1,
      desktop: [{ appId: 'test-public', bounds: { x: 10, y: 10, w: 400, h: 300 }, state: 'open', zIndex: 12, focused: true }],
      mobile: [],
    }));

    await restoreWindowSession();

    const windows = windowStore.get();
    expect(windows).toHaveLength(1);
    expect(windows[0].appId).toBe('test-public');
  });

  it('restaura stack móvil en presentación móvil', async () => {
    setViewportWidth(390);
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
      version: 1,
      desktop: [],
      mobile: [{ appId: 'test-public', params: { folderId: 'x' } }],
    }));

    await restoreWindowSession();

    expect(mobileStackStore.get()).toHaveLength(1);
    expect(windowStore.get()).toHaveLength(0);
  });

  it('no hace nada sin sesión guardada', async () => {
    await restoreWindowSession();
    expect(windowStore.get()).toHaveLength(0);
    expect(mobileStackStore.get()).toHaveLength(0);
  });
});
