import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { workspaceH, workspaceW } from './window-store';
import { createPathDeepLink } from './deep-links';
import { AppRegistry, type AppDefinition } from './app-registry';
import {
  closeAllWindows,
  openWindow,
  registerShellWindow,
  focusWindow,
  closeWindow,
  toggleMaximizeWindow,
  windowStore,
} from './window-manager';
import { initRouteAppAdapter, openAppWindow } from './route-app-adapter';
import { initWindowUrlSync } from './window-url-sync';
import { addRoute, initRouter, navigate, replacePath, setOutlet } from '../../router';
import { authStore } from '../../store';
import { clearMobileStack, mobileStackStore, openMobileView } from '../mobile/mobile-stack';
import type { MountedView } from '../../core/lifecycle';
import { clearQueue, getQueuedEvents } from '../analytics/dispatcher';

const routedAppId = 'route-adapter-reconcile-test';
const invalidParamsAppId = 'route-adapter-invalid-params-test';
const protectedAppId = 'route-adapter-protected-test';
const localAppId = 'route-adapter-local-test';

const invalidParamsApp: AppDefinition = {
  id: invalidParamsAppId,
  title: 'Ruta insegura de prueba',
  icon: [],
  singleton: false,
  requires: 'public',
  deepLink: createPathDeepLink('/runtime-invalid/:slug', ['slug']),
  render: () => ({ element: document.createElement('div') }),
};

const protectedApp: AppDefinition = {
  id: protectedAppId,
  title: 'Ruta protegida de prueba',
  icon: [],
  singleton: false,
  requires: 'admin',
  deepLink: createPathDeepLink('/runtime-protected'),
  render: () => ({ element: document.createElement('div') }),
};

const localApp: AppDefinition = {
  id: localAppId,
  title: 'App local de prueba',
  icon: [],
  singleton: false,
  requires: 'public',
  render: () => ({ element: document.createElement('div') }),
};

/* [GAME-01-VIS] App que abre maximizada: la ventana nace con state
 * 'maximized' ocupando el workspace y guarda preMaximizeBounds para restaurar. */
const maximizedAppId = 'route-adapter-maximized-test';
const maximizedApp: AppDefinition = {
  id: maximizedAppId,
  title: 'Maximizada de prueba',
  icon: [],
  singleton: false,
  requires: 'public',
  openMaximized: true,
  render: () => ({ element: document.createElement('div') }),
};

const routedApp: AppDefinition = {
  id: routedAppId,
  title: 'Ruta de prueba',
  icon: [],
  singleton: false,
  requires: 'public',
  deepLink: createPathDeepLink('/runtime-test'),
  render: () => ({ element: document.createElement('div') }),
};

AppRegistry.register(routedApp);
AppRegistry.register(invalidParamsApp);
AppRegistry.register(protectedApp);
AppRegistry.register(localApp);
AppRegistry.register(maximizedApp);
addRoute({ path: '/runtime-test', render: () => document.createElement('div') });
addRoute({ path: '/runtime-invalid/:slug', render: () => document.createElement('div') });
addRoute({ path: '/runtime-protected', render: () => document.createElement('div') });

const createTestView = (): MountedView => ({ element: document.createElement('div') });
let stopAdapter: (() => void) | null = null;

beforeEach(() => {
  closeAllWindows();
  clearMobileStack();
  setOutlet(document.createElement('main'));
  authStore.set({ isAuthenticated: false, userId: null, capability: 'public' });
  clearQueue();
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
  replacePath('/');
});

afterEach(() => {
  stopAdapter?.();
  stopAdapter = null;
  closeAllWindows();
  clearMobileStack();
  authStore.set({ isAuthenticated: false, userId: null, capability: 'public' });
  clearQueue();
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
});

describe('RouteAppAdapter runtime reconciliation', () => {
  it('conserva la ventana de una ruta de app', () => {
    stopAdapter = initRouteAppAdapter();
    openWindow(routedApp, createTestView(), new AbortController());

    replacePath('/runtime-test');

    expect(windowStore.get().some((window) => window.appId === routedAppId)).toBe(true);
  });

  it('mide la apertura de un deep link válido sin exponer parámetros', async () => {
    stopAdapter = initRouteAppAdapter();

    navigate('/runtime-test');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(getQueuedEvents()).toContainEqual(expect.objectContaining({
      eventName: 'deep_link_opened',
      properties: { routeName: 'runtime-test', appId: routedAppId },
    }));
  });

  it('abre maximizada una app que declara openMaximized', async () => {
    stopAdapter = initRouteAppAdapter();

    await openAppWindow(maximizedAppId);

    const window = windowStore.get().find((w) => w.appId === maximizedAppId);
    expect(window?.state).toBe('maximized');
    /* Ocupa el workspace completo (defaults del módulo en el test) y guarda
     * las dimensiones previas para poder restaurar. */
    expect(window?.bounds).toEqual({ x: 0, y: 0, w: workspaceW, h: workspaceH });
    expect(window?.preMaximizeBounds).toBeDefined();
    expect(window?.preMaximizeBounds?.w).toBeGreaterThan(0);

    /* El toggle de restauración vuelve a las dimensiones de apertura. */
    toggleMaximizeWindow(window!.instanceId);
    expect(windowStore.get().find((w) => w.appId === maximizedAppId)?.state).toBe('open');
  });

  it('conserva ventanas restauradas al reconciliar la raíz inicial', () => {
    stopAdapter = initRouteAppAdapter({ preserveRootOnInit: true });
    openWindow(routedApp, createTestView(), new AbortController());

    replacePath('/');

    expect(windowStore.get().some((window) => window.appId === routedAppId)).toBe(true);
  });

  it('vacía la pila móvil al volver a una ruta documental', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    stopAdapter = initRouteAppAdapter();
    await openMobileView('mobile-reconcile-test', 'Móvil', createTestView());

    replacePath('/runtime-test');
    replacePath('/');

    expect(mobileStackStore.get()).toHaveLength(0);
  });

  it('limpia el runtime ante un parámetro deep-link inseguro', async () => {
    stopAdapter = initRouteAppAdapter();
    openWindow(routedApp, createTestView(), new AbortController());

    navigate('/runtime-invalid/%2F');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(windowStore.get().some((window) => window.appId === routedAppId)).toBe(false);
  });

  it('limpia el runtime ante una ruta sin capacidad', async () => {
    stopAdapter = initRouteAppAdapter();
    openWindow(routedApp, createTestView(), new AbortController());

    navigate('/runtime-protected');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(windowStore.get().some((window) => window.appId === routedAppId)).toBe(false);
  });

  it('no cierra la app al enfocar Perfil, que es chrome del shell', () => {
    stopAdapter = initRouteAppAdapter();
    const stopUrlSync = initWindowUrlSync();
    openWindow(routedApp, createTestView(), new AbortController());
    replacePath('/runtime-test');
    registerShellWindow({
      instanceId: 'shell-profile',
      title: 'Perfil',
      icon: [],
      content: document.createElement('div'),
      focused: false,
    });

    focusWindow('shell-profile');

    expect(windowStore.get().map((window) => window.appId)).toEqual([
      routedAppId,
      'shell-profile',
    ]);
    expect(window.location.pathname).toBe('/runtime-test');
    stopUrlSync.stop();
  });

  it('no cierra una app canónica al abrir otra app runtime sin deep link', () => {
    stopAdapter = initRouteAppAdapter();
    const stopUrlSync = initWindowUrlSync();
    openWindow(routedApp, createTestView(), new AbortController());
    replacePath('/runtime-test');

    openWindow(localApp, createTestView(), new AbortController());

    expect(windowStore.get().map((window) => window.appId)).toEqual([routedAppId, localAppId]);
    expect(window.location.pathname).toBe('/runtime-test');
    stopUrlSync.stop();
  });

  /* [297A-24] La apertura programática (icono del escritorio, comandos) no
   * pasa por el router: abrir una segunda app nunca puede reconciliar ni
   * cerrar la primera. */
  it('abrir una segunda app por openAppWindow no cierra la primera', async () => {
    stopAdapter = initRouteAppAdapter();
    const stopUrlSync = initWindowUrlSync();
    openWindow(routedApp, createTestView(), new AbortController());
    replacePath('/runtime-test');

    await openAppWindow(localAppId);

    expect(windowStore.get().map((window) => window.appId)).toEqual([routedAppId, localAppId]);
    expect(window.location.pathname).toBe('/runtime-test');
    stopUrlSync.stop();
  });

  /* [297A-24] Back (popstate) desde una ruta de app a la raíz es una
   * navegación fuera del runtime: cierra el conjunto y conserva Perfil. */
  it('Back a la raíz cierra el conjunto y conserva Perfil', async () => {
    stopAdapter = initRouteAppAdapter();
    const stopRouter = initRouter();
    const stopUrlSync = initWindowUrlSync();
    registerShellWindow({
      instanceId: 'shell-profile',
      title: 'Perfil',
      icon: [],
      content: document.createElement('div'),
      focused: true,
    });
    openWindow(routedApp, createTestView(), new AbortController());
    replacePath('/runtime-test');
    expect(windowStore.get().filter((w) => w.appId === routedAppId)).toHaveLength(1);

    history.back();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(window.location.pathname).toBe('/');
    expect(windowStore.get().map((window) => window.instanceId)).toEqual(['shell-profile']);
    stopRouter();
    stopUrlSync.stop();
  });

  it('vuelve a `/` al cerrar la última app y conserva Perfil', () => {
    stopAdapter = initRouteAppAdapter();
    const stopUrlSync = initWindowUrlSync();
    registerShellWindow({
      instanceId: 'shell-profile',
      title: 'Perfil',
      icon: [],
      content: document.createElement('div'),
      focused: true,
    });
    openWindow(routedApp, createTestView(), new AbortController());
    replacePath('/runtime-test');
    const appWindow = windowStore.get().find((window) => window.appId === routedAppId);
    expect(appWindow).toBeDefined();
    closeWindow(appWindow!.instanceId);

    expect(windowStore.get().map((window) => window.instanceId)).toEqual(['shell-profile']);
    expect(window.location.pathname).toBe('/');
    stopUrlSync.stop();
  });

  it('cierra apps al volver a una ruta documental y conserva Perfil', () => {
    stopAdapter = initRouteAppAdapter();
    registerShellWindow({
      instanceId: 'shell-profile',
      title: 'Perfil',
      icon: [],
      content: document.createElement('div'),
      focused: true,
    });
    openWindow(routedApp, createTestView(), new AbortController());

    replacePath('/runtime-test');
    replacePath('/');

    expect(windowStore.get().map((window) => window.instanceId)).toEqual(['shell-profile']);
  });
});
