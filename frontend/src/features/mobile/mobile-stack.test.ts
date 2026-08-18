import { describe, expect, it, beforeEach } from 'vitest';
import { AppRegistry } from '../runtime/app-registry';
import { createPathDeepLink } from '../runtime/deep-links';
import { getCurrentPath, isInternalHistoryEntry, replacePath } from '../../router';
import type { StoreSource } from '../../store';
import {
  _resetMobileStackForTest,
  clearMobileStack,
  mobileStackStore,
  openMobileApp,
  popMobileApp,
} from './mobile-stack';

const testAppId = 'mobile-stack-test-app';
const routedAppId = 'mobile-stack-routed-app';
let destroyed = 0;

AppRegistry.register({
  id: testAppId,
  title: 'App de prueba móvil',
  icon: [],
  singleton: false,
  requires: 'public',
  render: () => ({
    element: document.createElement('div'),
    destroy: () => { destroyed += 1; },
  }),
});

AppRegistry.register({
  id: routedAppId,
  title: 'App con ruta',
  icon: [],
  singleton: false,
  requires: 'public',
  deepLink: createPathDeepLink('/mobile/:slug', ['slug']),
  render: () => ({ element: document.createElement('div') }),
});

beforeEach(() => {
  _resetMobileStackForTest();
  replacePath('/');
  destroyed = 0;
});

describe('MobileAppStack', () => {
  it('abre una vista y la desapila con teardown', async () => {
    await openMobileApp(testAppId, { resourceId: 'one' });

    expect(mobileStackStore.get()).toHaveLength(1);
    expect(mobileStackStore.get()[0]?.params?.resourceId).toBe('one');

    popMobileApp();

    expect(mobileStackStore.get()).toHaveLength(0);
    expect(destroyed).toBe(1);
  });

  it('conserva instancias con parámetros distintos', async () => {
    await openMobileApp(testAppId, { resourceId: 'one' });
    await openMobileApp(testAppId, { resourceId: 'two' });

    expect(mobileStackStore.get()).toHaveLength(2);
    clearMobileStack();
    expect(destroyed).toBe(2);
  });

  it('enfoca una instancia existente y libera solo las superiores', async () => {
    await openMobileApp(testAppId, { resourceId: 'one' });
    await openMobileApp(testAppId, { resourceId: 'two' });
    await openMobileApp(testAppId, { resourceId: 'one' });

    expect(mobileStackStore.get()).toHaveLength(1);
    expect(mobileStackStore.get()[0]?.params?.resourceId).toBe('one');
    expect(destroyed).toBe(1);
  });

  it('deduplica aperturas concurrentes del mismo recurso', async () => {
    await Promise.all([
      openMobileApp(testAppId, { resourceId: 'same' }),
      openMobileApp(testAppId, { resourceId: 'same' }),
    ]);

    expect(mobileStackStore.get()).toHaveLength(1);
    expect(destroyed).toBe(0);
  });

  it('coordina el desapilado con history.back sin cambiar la URL antes del popstate', async () => {
    await openMobileApp(routedAppId, { slug: 'uno' });
    await openMobileApp(routedAppId, { slug: 'dos' });

    const sources: StoreSource[] = [];
    const stop = mobileStackStore.subscribe((_stack, source) => { sources.push(source); });
    sources.length = 0;
    popMobileApp({ preserveHistoryUrl: true });

    expect(getCurrentPath()).toBe('/mobile/dos');
    expect(sources).toEqual(['sync']);
    stop();
  });

  it('marca y crea una entrada History solo para una apertura intencional con deep link', async () => {
    await openMobileApp(routedAppId, { slug: 'uno' });

    expect(getCurrentPath()).toBe('/mobile/uno');
    expect(isInternalHistoryEntry()).toBe(true);
    expect('historyPushed' in (mobileStackStore.get()[0] ?? {})).toBe(false);

    await openMobileApp(routedAppId, { slug: 'dos' }, { history: 'none' });

    expect(getCurrentPath()).toBe('/mobile/uno');
    expect(mobileStackStore.get()).toHaveLength(2);
    expect('historyPushed' in (mobileStackStore.get()[1] ?? {})).toBe(false);
  });

  it('no monta una apertura pendiente después de Home', async () => {
    const opening = openMobileApp(testAppId, { resourceId: 'pending' });
    clearMobileStack();
    await opening;

    expect(mobileStackStore.get()).toHaveLength(0);
    expect(destroyed).toBe(1);
  });
});
