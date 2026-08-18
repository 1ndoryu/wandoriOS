/* [018A-66] La sesión admin publica el release global y nunca participa del
 * overlay personal: el modal de conflicto no debe abrirse con capacidad admin
 * y debe cerrarse si la sesión cambia a admin con el modal abierto. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { authStore } from '../../../store';
import { initOverlayConflictUI } from './overlay-conflict-ui';
import { clearOverlaySync, overlaySyncStore } from './overlay-sync';
import { EMPTY_OVERLAY, overlayStore } from './stores';
import type { WorkspaceOverlay } from './types';

const remoteOverlay: WorkspaceOverlay = {
  version: 1,
  addedItems: {
    'remote-folder': {
      id: 'remote-folder',
      parentId: 'desktop',
      type: 'folder',
      label: 'Remota',
      requires: 'public',
    },
  },
  fieldOverrides: {},
  tombstones: [],
};

let stop: (() => void) | null = null;

beforeEach(() => {
  stop?.();
  stop = null;
  document.body.innerHTML = '';
  overlayStore.set(EMPTY_OVERLAY, 'sync');
  overlaySyncStore.set({ userId: null, revision: null, remoteOverlay: null, status: 'idle' }, 'sync');
  authStore.set({ isAuthenticated: false, userId: null, capability: 'public' }, 'sync');
});

afterEach(() => {
  stop?.();
  stop = null;
  document.body.innerHTML = '';
});

describe('overlay conflict UI (018A-66)', () => {
  it('no abre el modal de conflicto para una sesión admin', () => {
    stop = initOverlayConflictUI();
    authStore.set({ isAuthenticated: true, userId: 'admin-1', capability: 'admin' }, 'sync');
    overlaySyncStore.set({
      userId: 'admin-1',
      revision: 3,
      remoteOverlay,
      status: 'conflict',
    }, 'sync');

    expect(document.body.textContent).not.toContain('workspace actualizado');
  });

  it('abre el modal para una cuenta normal y lo cierra si la sesión pasa a admin', () => {
    stop = initOverlayConflictUI();
    authStore.set({ isAuthenticated: true, userId: 'cuenta-1', capability: 'authenticated' }, 'sync');
    overlaySyncStore.set({
      userId: 'cuenta-1',
      revision: 3,
      remoteOverlay,
      status: 'conflict',
    }, 'sync');

    expect(document.body.textContent).toContain('workspace actualizado');

    /* La misma pestaña se convierte en sesión admin: la suscripción de auth de
     * overlay-sync hace clearOverlaySync() y el store de sync notifica idle;
     * la UI debe cerrar el modal (y la guardia admin de render lo asegura). */
    authStore.set({ isAuthenticated: true, userId: 'admin-1', capability: 'admin' }, 'sync');
    clearOverlaySync();
    expect(document.body.textContent).not.toContain('workspace actualizado');
  });

  it('no abre el modal sin conflicto declarado por el store de sync', () => {
    stop = initOverlayConflictUI();
    authStore.set({ isAuthenticated: true, userId: 'cuenta-1', capability: 'authenticated' }, 'sync');
    overlaySyncStore.set({
      userId: 'cuenta-1',
      revision: 3,
      remoteOverlay,
      status: 'ready',
    }, 'sync');

    expect(document.body.textContent).not.toContain('workspace actualizado');
  });
});
