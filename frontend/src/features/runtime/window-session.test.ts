/* wandori.us — Window Session Tests (captura, persistencia, handle)
 * [317A-5] La restauración se prueba en window-session-restore.test.ts. */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  loadSession,
  saveSession,
  captureDesktopSession,
  captureMobileSession,
  initWindowSessionPersistence,
  SESSION_STORAGE_KEY,
  type WindowSession,
} from './window-session';
import { windowStore } from './window-manager';
import { _resetWindowCountersForTest as resetWindowCounters, setWorkspaceBounds } from './window-store';
import { mobileStackStore, _resetMobileStackForTest, type MobileStackEntry } from '../mobile/mobile-stack';
import { AppRegistry } from './app-registry';
import { authStore } from '../../store';
import type { AppDefinition } from './app-registry';
import type { WindowEntry } from './window-store';

const publicApp: AppDefinition = {
  id: 'test-public',
  title: 'App Pública',
  icon: [],
  singleton: false,
  requires: 'public',
  render: () => ({ element: document.createElement('div'), destroy: vi.fn() }),
};

/* Registro único: el registry es singleton y no expone unregister. */
AppRegistry.register(publicApp);

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

function makeMobileEntry(overrides: Partial<MobileStackEntry> & { appId: string }): MobileStackEntry {
  const { appId, ...rest } = overrides;
  return {
    instanceId: `mobile-${appId}`,
    appId,
    title: 'App Pública',
    view: { element: document.createElement('div'), destroy: vi.fn() },
    controller: new AbortController(),
    ...rest,
  };
}

/** Cargar la sesión esperando que exista; elimina non-null assertions del test. */
function requireSession(): WindowSession {
  const session = loadSession();
  if (!session) throw new Error('se esperaba una sesión guardada');
  return session;
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

afterEach(() => {
  vi.useRealTimers();
});

describe('captureDesktopSession [317A-5]', () => {
  it('captura solo apps del catálogo y excluye ventanas shell', () => {
    windowStore.set([
      makeWindow({ appId: 'test-public', focused: true, zIndex: 11, state: 'maximized' }),
      /* Ventana shell: appId no registrado en AppRegistry → se filtra */
      makeWindow({ appId: 'shell-profile', title: 'Perfil' }),
    ]);

    const captured = captureDesktopSession();
    expect(captured).toHaveLength(1);
    expect(captured[0].appId).toBe('test-public');
  });

  it('preserva bounds, state, zIndex y focused', () => {
    windowStore.set([
      makeWindow({
        appId: 'test-public',
        bounds: { x: 120, y: 90, w: 500, h: 300 },
        state: 'minimized',
        zIndex: 21,
        focused: false,
      }),
    ]);

    const [saved] = captureDesktopSession();
    expect(saved.bounds).toEqual({ x: 120, y: 90, w: 500, h: 300 });
    expect(saved.state).toBe('minimized');
    expect(saved.zIndex).toBe(21);
    expect(saved.focused).toBe(false);
  });
});

describe('captureMobileSession [317A-5]', () => {
  it('captura el stack móvil con params y layout', () => {
    mobileStackStore.set([
      makeMobileEntry({ appId: 'test-public', params: { folderId: 'a' }, layout: 'full-bleed' }),
    ]);

    const captured = captureMobileSession();
    expect(captured).toHaveLength(1);
    expect(captured[0].appId).toBe('test-public');
    expect(captured[0].params?.folderId).toBe('a');
    expect(captured[0].layout).toBe('full-bleed');
  });
});

describe('saveSession / loadSession [317A-5]', () => {
  it('guarda y carga con versionado correcto', () => {
    windowStore.set([makeWindow({ appId: 'test-public', focused: true, zIndex: 15 })]);
    saveSession();

    const session = requireSession();
    expect(session.version).toBe(1);
    expect(session.desktop).toHaveLength(1);
    expect(session.desktop[0].appId).toBe('test-public');
  });

  it('devuelve null con JSON corrupto', () => {
    localStorage.setItem(SESSION_STORAGE_KEY, '{not-json');
    expect(loadSession()).toBeNull();
  });

  it('devuelve null con versión inválida', () => {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ version: 99, desktop: [], mobile: [] }));
    expect(loadSession()).toBeNull();
  });

  it('sanea entradas malformadas en lugar de romper la sesión', () => {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
      version: 1,
      desktop: [
        { appId: 42, bounds: {} },
        { appId: 'test-public', bounds: { x: 0, y: 0, w: 100, h: 100 }, state: 'open', zIndex: 1, focused: false },
      ],
      mobile: [],
    }));
    const session = requireSession();
    expect(session.desktop).toHaveLength(1);
    expect(session.desktop[0].appId).toBe('test-public');
  });

  it('conserva el foco de ventanas maximizadas (regresión [317A-5])', () => {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
      version: 1,
      desktop: [{ appId: 'test-public', bounds: { x: 0, y: 0, w: 400, h: 300 }, state: 'maximized', zIndex: 5, focused: true }],
      mobile: [],
    }));
    const session = requireSession();
    expect(session.desktop[0].state).toBe('maximized');
    expect(session.desktop[0].focused).toBe(true);
  });

  it('normaliza foco + minimizado (estado inconsistente)', () => {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
      version: 1,
      desktop: [{ appId: 'test-public', bounds: { x: 0, y: 0, w: 400, h: 300 }, state: 'minimized', zIndex: 6, focused: true }],
      mobile: [],
    }));
    const session = requireSession();
    expect(session.desktop[0].focused).toBe(false);
  });
});

describe('initWindowSessionPersistence [317A-5]', () => {
  it('persiste con debounce tras un cambio de ventanas', async () => {
    vi.useFakeTimers();
    const handle = initWindowSessionPersistence();

    windowStore.set([makeWindow({ appId: 'test-public', focused: true, zIndex: 16 })]);
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull(); /* debounce */

    await vi.advanceTimersByTimeAsync(250);
    const session = requireSession();
    expect(session.desktop).toHaveLength(1);
    handle.stop();
  });

  it('pause evita persistir un escritorio vacío (transición)', async () => {
    vi.useFakeTimers();
    const handle = initWindowSessionPersistence();
    /* Sesión previa guardada con una ventana */
    windowStore.set([makeWindow({ appId: 'test-public', focused: true, zIndex: 17 })]);
    await vi.advanceTimersByTimeAsync(250);
    expect(requireSession().desktop).toHaveLength(1);

    /* Transición: closeAllWindows con persistence pausada */
    handle.pause();
    windowStore.set([], 'user');
    await vi.advanceTimersByTimeAsync(250);
    expect(requireSession().desktop).toHaveLength(1); /* no sobrescribe con vacío */

    handle.resume();
    windowStore.set([makeWindow({ appId: 'test-public', focused: true, zIndex: 18 })]);
    await vi.advanceTimersByTimeAsync(250);
    expect(requireSession().desktop).toHaveLength(1);
    handle.stop();
  });

  it('flush en pagehide persiste el último estado síncronamente', async () => {
    vi.useFakeTimers();
    const handle = initWindowSessionPersistence();

    windowStore.set([makeWindow({ appId: 'test-public', focused: true, zIndex: 19 })]);
    window.dispatchEvent(new Event('pagehide'));
    expect(requireSession().desktop).toHaveLength(1); /* sin esperar debounce */

    handle.stop();
  });

  it('stop libera suscripciones y pagehide', async () => {
    vi.useFakeTimers();
    const handle = initWindowSessionPersistence();
    handle.stop();

    windowStore.set([makeWindow({ appId: 'test-public', focused: true, zIndex: 20 })]);
    window.dispatchEvent(new Event('pagehide'));
    await vi.advanceTimersByTimeAsync(250);
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });
});
