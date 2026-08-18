import { afterEach, describe, expect, it } from 'vitest';
import {
  clearRuntimePresentation,
  isMobilePresentationReady,
  openInMobileIfActive,
  setMobileOpenHandler,
} from './runtime-presentation';
import { closeAllWindows, openWindow, registerShellWindow, windowStore } from './window-manager';
import { clearMobileStack, mobileStackStore, openMobileView } from '../mobile/mobile-stack';
import type { AppDefinition } from './app-registry';

const app: AppDefinition = {
  id: 'presentation-test-app',
  title: 'Presentation test',
  icon: [],
  singleton: false,
  requires: 'public',
  render: () => ({ element: document.createElement('div') }),
};

const originalWidth = window.innerWidth;

function setWidth(width: number): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
}

afterEach(() => {
  setWidth(originalWidth);
  setMobileOpenHandler(null);
  closeAllWindows();
  clearMobileStack();
});

describe('runtime presentation boundary', () => {
  it('solo considera lista la presentación móvil cuando existe handler', () => {
    setWidth(390);
    expect(isMobilePresentationReady()).toBe(false);

    const stop = setMobileOpenHandler(async () => undefined);
    expect(isMobilePresentationReady()).toBe(true);

    stop();
    expect(isMobilePresentationReady()).toBe(false);
  });

  it('delega apertura móvil con params y política de historial', async () => {
    setWidth(390);
    const calls: Array<{ appId: string; params?: Record<string, string>; history?: string }> = [];
    setMobileOpenHandler(async (appId, params, options) => {
      calls.push({ appId, params, history: options?.history });
    });

    await expect(openInMobileIfActive('finder', { folderId: 'folder-1' }, { history: 'none' }))
      .resolves.toBe(true);

    expect(calls).toEqual([{
      appId: 'finder',
      params: { folderId: 'folder-1' },
      history: 'none',
    }]);
    expect(mobileStackStore.get()).toHaveLength(0);
  });

  it('en móvil limpia la pila activa con source sync', async () => {
    setWidth(390);
    await openMobileView('mobile-runtime-test', 'Móvil', { element: document.createElement('div') });
    let receivedSource: string | undefined;
    const stop = mobileStackStore.subscribe((_value, source) => {
      receivedSource = source;
    });

    clearRuntimePresentation();

    expect(mobileStackStore.get()).toHaveLength(0);
    expect(receivedSource).toBe('sync');
    stop();
  });

  it('en desktop limpia apps runtime y conserva Perfil shell', () => {
    setWidth(1024);
    registerShellWindow({
      instanceId: 'shell-profile',
      title: 'Perfil',
      icon: [],
      content: document.createElement('div'),
      focused: true,
    });
    openWindow(app, { element: document.createElement('div') }, new AbortController());

    clearRuntimePresentation();

    expect(windowStore.get().map((entry) => entry.instanceId)).toEqual(['shell-profile']);
  });
});
