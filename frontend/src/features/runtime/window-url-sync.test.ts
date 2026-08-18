import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppRegistry } from './app-registry';
import { createPathDeepLink } from './deep-links';
import { hasOpenRuntimeApp, initWindowUrlSync, resolveFocusedPath } from './window-url-sync';
import { windowStore } from './window-store';
import { mobileStackStore } from '../mobile/mobile-stack';
import { clearQueue, getQueuedEvents } from '../analytics/dispatcher';

const publicAppId = 'window-url-sync-public-test';
const localAppId = 'window-url-sync-local-test';

AppRegistry.register({
  id: publicAppId,
  title: 'Artículo',
  icon: [],
  singleton: false,
  requires: 'public',
  deepLink: createPathDeepLink('/article/:slug', ['slug']),
  render: () => ({ element: document.createElement('div') }),
});

AppRegistry.register({
  id: localAppId,
  title: 'Finder local',
  icon: [],
  singleton: false,
  requires: 'public',
  render: () => ({ element: document.createElement('div') }),
});

describe('hasOpenRuntimeApp', () => {
  it('considera solo la superficie desktop/tablet activa', () => {
    expect(hasOpenRuntimeApp(
      [
        { appId: publicAppId, focused: false },
        { appId: 'shell-profile', focused: true },
      ],
      [{ appId: publicAppId }],
      'desktop',
    )).toBe(true);
    expect(hasOpenRuntimeApp(
      [{ appId: 'shell-profile', focused: true }],
      [{ appId: publicAppId }],
      'desktop',
    )).toBe(false);
  });

  it('considera solo la pila móvil activa', () => {
    expect(hasOpenRuntimeApp(
      [{ appId: publicAppId, focused: true }],
      [{ appId: 'shell-profile' }],
      'mobile',
    )).toBe(false);
    expect(hasOpenRuntimeApp(
      [{ appId: publicAppId, focused: true }],
      [{ appId: publicAppId }],
      'mobile',
    )).toBe(true);
  });
});

describe('resolveFocusedPath', () => {
  it('representa la ventana desktop enfocada con su ruta pública', () => {
    expect(resolveFocusedPath(
      [
        { appId: 'other', focused: false },
        { appId: publicAppId, focused: true, params: { slug: 'julio' } },
      ],
      [],
      'desktop',
    )).toBe('/article/julio');
  });

  it('no serializa parámetros locales sin deepLink', () => {
    expect(resolveFocusedPath(
      [{ appId: localAppId, focused: true, params: { folderId: 'internal-folder' } }],
      [],
      'desktop',
    )).toBe('/');
  });

  it('usa la vista superior móvil y no la ventana desktop', () => {
    expect(resolveFocusedPath(
      [{ appId: publicAppId, focused: true, params: { slug: 'desktop' } }],
      [{ appId: publicAppId, params: { slug: 'mobile' } }],
      'mobile',
    )).toBe('/article/mobile');
  });

  it('vuelve a la raíz sin app activa', () => {
    expect(resolveFocusedPath([], [], 'tablet')).toBe('/');
  });
});

describe('window focus analytics', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
    windowStore.set([]);
    mobileStackStore.set([]);
    clearQueue();
  });

  afterEach(() => {
    windowStore.set([]);
    mobileStackStore.set([]);
    clearQueue();
  });

  it('emite un evento al cambiar el foco entre apps runtime', () => {
    const stop = initWindowUrlSync();
    windowStore.set([{
      instanceId: 'focus-one',
      appId: publicAppId,
      title: 'Artículo',
      focused: true,
      state: 'open',
      bounds: { x: 0, y: 0, w: 400, h: 300 },
      zIndex: 1,
      content: document.createElement('div'),
      params: { slug: 'uno' },
    }]);
    windowStore.set([{
      instanceId: 'focus-one',
      appId: publicAppId,
      title: 'Artículo',
      focused: false,
      state: 'open',
      bounds: { x: 0, y: 0, w: 400, h: 300 },
      zIndex: 1,
      content: document.createElement('div'),
      params: { slug: 'uno' },
    }, {
      instanceId: 'focus-two',
      appId: localAppId,
      title: 'Finder local',
      focused: true,
      state: 'open',
      bounds: { x: 10, y: 10, w: 400, h: 300 },
      zIndex: 2,
      content: document.createElement('div'),
    }]);

    expect(getQueuedEvents().at(-1)).toMatchObject({
      eventName: 'window_focus_changed',
      properties: { appId: localAppId, previousAppId: publicAppId },
    });
    stop.stop();
  });

  it('mide también la app superior de la pila móvil', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    const stop = initWindowUrlSync();
    mobileStackStore.set([{
      instanceId: 'mobile-focus-one',
      appId: publicAppId,
      title: 'Artículo',
      params: { slug: 'móvil' },
      view: { element: document.createElement('div') },
      controller: new AbortController(),
    }]);

    expect(getQueuedEvents().at(-1)).toMatchObject({
      eventName: 'window_focus_changed',
      properties: { appId: publicAppId },
      presentationMode: 'mobile',
    });
    stop.stop();
  });
});
