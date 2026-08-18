import { describe, expect, it } from 'vitest';
import { createPathDeepLink } from './deep-links';
import { canOpenApp, findExistingWindow, validateRouteAccess } from './app-instances';
import type { AppDefinition } from './app-registry';
import type { WindowEntry } from './window-store';

const localApp: AppDefinition = {
  id: 'local-test',
  title: 'Local',
  icon: [],
  singleton: false,
  requires: 'public',
  render: () => ({ element: document.createElement('div') }),
};

const routedApp: AppDefinition = {
  id: 'routed-test',
  title: 'Routed',
  icon: [],
  singleton: false,
  requires: 'authenticated',
  deepLink: createPathDeepLink('/routed/:slug', ['slug']),
  render: () => ({ element: document.createElement('div') }),
};

const singletonApp: AppDefinition = {
  ...localApp,
  id: 'singleton-test',
  singleton: true,
};

function windowEntry(appId: string, paramKey?: string): WindowEntry {
  return {
    instanceId: `${appId}-window`,
    appId,
    title: appId,
    state: 'open',
    bounds: { x: 0, y: 0, w: 100, h: 100 },
    zIndex: 1,
    focused: false,
    content: document.createElement('div'),
    controller: new AbortController(),
    app: localApp,
    _paramKey: paramKey,
  };
}

describe('app instance policies', () => {
  it('valida params y capacidad antes de montar', () => {
    expect(validateRouteAccess(routedApp, { slug: 'julio' }, 'authenticated')).toEqual({
      allowed: true,
      params: { slug: 'julio' },
    });
    expect(validateRouteAccess(routedApp, { slug: 'julio' }, 'public').allowed).toBe(false);
    expect(validateRouteAccess(routedApp, { slug: '../privado' }, 'admin').allowed).toBe(false);
  });

  it('falla cerrado ante una capacidad desconocida', () => {
    expect(validateRouteAccess(routedApp, { slug: 'julio' }, 'super-admin').allowed).toBe(false);
  });

  it('valida aperturas internas sin interpretar sus params como URL pública', () => {
    expect(canOpenApp(localApp, 'public')).toBe(true);
    expect(canOpenApp(routedApp, 'public')).toBe(false);
    expect(canOpenApp(routedApp, 'authenticated')).toBe(true);
  });

  it('deduplica singleton por appId', () => {
    const existing = windowEntry(singletonApp.id);
    expect(findExistingWindow([existing], singletonApp)).toBe(existing);
  });

  it('deduplica apps parametrizadas con clave estable', () => {
    const existing = windowEntry(localApp.id, JSON.stringify([['folderId', 'julio'], ['view', 'grid']]));
    expect(findExistingWindow([existing], localApp, { view: 'grid', folderId: 'julio' })).toBe(existing);
    expect(findExistingWindow([existing], localApp, { folderId: 'agosto', view: 'grid' })).toBeUndefined();
  });

  it('no deduplica una app no singleton sin params', () => {
    const existing = windowEntry(localApp.id);
    expect(findExistingWindow([existing], localApp)).toBeUndefined();
  });
});
