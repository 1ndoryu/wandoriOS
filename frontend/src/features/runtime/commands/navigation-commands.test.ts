/* Tests para navigation-commands.ts — Copiar URL canónica [297A-19]. */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRegistry } from '../app-registry';
import { CommandRegistry } from '../command-registry';
import { windowStore } from '../window-store';
import { clearQueue, getQueuedEvents } from '../../analytics/dispatcher';
import { createPathDeepLink } from '../deep-links';
import { copyText } from './navigation-commands';
import './navigation-commands';

const publicAppId = 'navigation-copy-url-public-test';
const localAppId = 'navigation-copy-url-local-test';

AppRegistry.register({
  id: publicAppId,
  title: 'Artículo público',
  icon: [],
  singleton: false,
  requires: 'public',
  deepLink: createPathDeepLink('/article/:slug', ['slug']),
  render: () => ({ element: document.createElement('div') }),
});

AppRegistry.register({
  id: localAppId,
  title: 'Carpeta local',
  icon: [],
  singleton: false,
  requires: 'public',
  render: () => ({ element: document.createElement('div') }),
});

const originalInnerWidth = window.innerWidth;
const originalClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
const originalExecCommandDescriptor = Object.getOwnPropertyDescriptor(document, 'execCommand');

function restoreGlobalProperty(
  target: object,
  property: string,
  descriptor: PropertyDescriptor | undefined,
): void {
  delete (target as Record<string, unknown>)[property];
  if (descriptor) Object.defineProperty(target, property, descriptor);
}

function setFocusedWindow(appId: string, params?: Readonly<Record<string, string>>): void {
  windowStore.set([{
    instanceId: 'copy-url-test-window',
    appId,
    title: 'Prueba',
    focused: true,
    state: 'open',
    bounds: { x: 0, y: 0, w: 640, h: 480 },
    zIndex: 1,
    content: document.createElement('div'),
    params,
  }]);
}

function setClipboard(value: { writeText: ReturnType<typeof vi.fn> } | undefined): void {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value,
  });
}

describe('navigation:copy-url', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
    window.history.replaceState({}, '', '/');
    windowStore.set([]);
    clearQueue();
    setClipboard(undefined);
  });

  afterEach(() => {
    windowStore.set([]);
    clearQueue();
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: originalInnerWidth,
    });
    restoreGlobalProperty(navigator, 'clipboard', originalClipboardDescriptor);
    restoreGlobalProperty(document, 'execCommand', originalExecCommandDescriptor);
    vi.restoreAllMocks();
  });

  it('construye una URL absoluta desde la ruta canónica', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    setFocusedWindow(publicAppId, { slug: 'julio-2026' });

    const result = await CommandRegistry.execute('navigation:copy-url');

    expect(result).toEqual({ status: 'success' });
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/article/julio-2026`);
    expect(getQueuedEvents().at(-1)).toMatchObject({
      eventName: 'share_url_copied',
      properties: {
        success: true,
        routeName: 'article',
        appId: publicAppId,
        presentationMode: 'desktop',
      },
    });
  });

  it('oculta el comando cuando la ventana no tiene deep link público', () => {
    setFocusedWindow(localAppId, { folderId: 'private-folder' });

    expect(CommandRegistry.isAvailable('navigation:copy-url', {})).toEqual({ state: 'hidden' });
  });

  it('usa execCommand como fallback cuando Clipboard API no está disponible', async () => {
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: execCommand,
    });
    setFocusedWindow(publicAppId, { slug: 'fallback' });

    const copied = await copyText('https://example.test/article/fallback');

    expect(copied).toBe(true);
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('emite fallo analítico si Clipboard API y fallback fallan', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('permission denied'));
    setClipboard({ writeText });
    const execCommand = vi.fn().mockReturnValue(false);
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: execCommand,
    });
    setFocusedWindow(publicAppId, { slug: 'blocked' });

    const result = await CommandRegistry.execute('navigation:copy-url');

    expect(result).toEqual({ status: 'failure', reason: 'clipboard unavailable' });
    expect(getQueuedEvents().at(-1)).toMatchObject({
      eventName: 'share_url_copied',
      properties: {
        success: false,
        routeName: 'article',
        appId: publicAppId,
        presentationMode: 'desktop',
      },
    });
  });
});
