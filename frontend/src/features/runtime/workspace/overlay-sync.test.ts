import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../api/client';
import { WorkspaceService } from '../../../services/workspace.service';
import { authStore } from '../../../store';
import {
  clearOverlaySync,
  initOverlaySync,
  overlaySyncStore,
  resolveOverlayConflict,
  syncOverlayForUser,
} from './overlay-sync';
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
  vi.restoreAllMocks();
  stop?.();
  stop = null;
  clearOverlaySync();
  overlayStore.set(EMPTY_OVERLAY, 'sync');
  authStore.set({ isAuthenticated: false, userId: null, capability: 'public' }, 'sync');
});

describe('workspace overlay sync', () => {
  it('no sincroniza ni abre conflictos de overlay para una sesión admin', async () => {
    const getOverlay = vi.spyOn(WorkspaceService, 'getOverlay');
    stop = initOverlaySync();

    authStore.set({ isAuthenticated: true, userId: 'admin-1', capability: 'admin' }, 'sync');
    await syncOverlayForUser('admin-1');

    expect(getOverlay).not.toHaveBeenCalled();
    expect(overlaySyncStore.get()).toEqual({
      userId: null,
      revision: null,
      remoteOverlay: null,
      status: 'idle',
    });
  });

  it('carga el overlay remoto cuando el local está vacío', async () => {
    vi.spyOn(WorkspaceService, 'getOverlay').mockResolvedValue({
      overlay: remoteOverlay,
      revision: 3,
      updated_at: '2026-07-31T00:00:00.000Z',
    });
    stop = initOverlaySync();

    await syncOverlayForUser('user-a');

    expect(overlayStore.get()).toEqual(remoteOverlay);
    expect(overlaySyncStore.get()).toMatchObject({
      userId: 'user-a',
      revision: 3,
      status: 'ready',
    });
  });

  it('no guarda de vuelta un cambio que llegó desde remoto', async () => {
    const save = vi.spyOn(WorkspaceService, 'saveOverlay');
    vi.spyOn(WorkspaceService, 'getOverlay').mockResolvedValue({
      overlay: EMPTY_OVERLAY,
      revision: 1,
      updated_at: '2026-07-31T00:00:00.000Z',
    });
    stop = initOverlaySync();

    await syncOverlayForUser('user-a');
    overlayStore.set(remoteOverlay, 'sync');
    await Promise.resolve();

    expect(save).not.toHaveBeenCalled();
  });

  it('presenta conflicto en una respuesta 409 sin sobrescribir el overlay local', async () => {
    vi.spyOn(WorkspaceService, 'getOverlay').mockResolvedValueOnce({
      overlay: EMPTY_OVERLAY,
      revision: 1,
      updated_at: '2026-07-31T00:00:00.000Z',
    }).mockResolvedValueOnce({
      overlay: remoteOverlay,
      revision: 2,
      updated_at: '2026-07-31T00:00:00.000Z',
    });
    vi.spyOn(WorkspaceService, 'saveOverlay').mockRejectedValue(
      new ApiError(409, { error: 'conflict' }, 'API Error: 409'),
    );
    stop = initOverlaySync();

    await syncOverlayForUser('user-a');
    const localOverlay: WorkspaceOverlay = {
      ...EMPTY_OVERLAY,
      fieldOverrides: { 'local-folder': { label: 'Local' } },
    };
    overlayStore.set(localOverlay, 'user');

    await vi.waitFor(() => expect(overlaySyncStore.get().status).toBe('conflict'));

    expect(overlayStore.get()).toEqual(localOverlay);
    expect(overlaySyncStore.get()).toMatchObject({ revision: 2, remoteOverlay, status: 'conflict' });
  });

  it('conservar lo de este dispositivo usa la última mutación hecha durante el conflicto', async () => {
    vi.spyOn(WorkspaceService, 'getOverlay').mockResolvedValueOnce({
      overlay: EMPTY_OVERLAY,
      revision: 1,
      updated_at: '2026-07-31T00:00:00.000Z',
    }).mockResolvedValueOnce({
      overlay: remoteOverlay,
      revision: 2,
      updated_at: '2026-07-31T00:00:00.000Z',
    });
    const save = vi.spyOn(WorkspaceService, 'saveOverlay')
      .mockRejectedValueOnce(new ApiError(409, { error: 'conflict' }, 'API Error: 409'))
      .mockResolvedValueOnce({
        overlay: { ...EMPTY_OVERLAY, fieldOverrides: { latest: { label: 'Última' } } },
        revision: 3,
        updated_at: '2026-07-31T00:00:00.000Z',
      });
    stop = initOverlaySync();

    await syncOverlayForUser('user-a');
    overlayStore.set({
      ...EMPTY_OVERLAY,
      fieldOverrides: { first: { label: 'Primera' } },
    }, 'user');
    await vi.waitFor(() => expect(overlaySyncStore.get().status).toBe('conflict'));

    const latestLocal: WorkspaceOverlay = {
      ...EMPTY_OVERLAY,
      fieldOverrides: { latest: { label: 'Última mutación local' } },
    };
    overlayStore.set(latestLocal, 'user');
    resolveOverlayConflict('local');

    await vi.waitFor(() => expect(overlaySyncStore.get().status).toBe('ready'));
    expect(save).toHaveBeenLastCalledWith({
      overlay: latestLocal,
      expected_revision: 2,
    });
  });

  it('permite elegir el overlay remoto explícitamente', async () => {
    vi.spyOn(WorkspaceService, 'getOverlay').mockResolvedValue({
      overlay: remoteOverlay,
      revision: 4,
      updated_at: '2026-07-31T00:00:00.000Z',
    });
    stop = initOverlaySync();
    const localOverlay: WorkspaceOverlay = {
      ...EMPTY_OVERLAY,
      fieldOverrides: { 'local-folder': { label: 'Local' } },
    };
    overlayStore.set(localOverlay, 'sync');

    await syncOverlayForUser('user-a');
    expect(overlaySyncStore.get().status).toBe('conflict');

    resolveOverlayConflict('remote');

    expect(overlayStore.get()).toEqual(remoteOverlay);
    expect(overlaySyncStore.get().status).toBe('ready');
  });

  /* [297A-27] Falso conflicto por orden de claves: el backend Rust serializa
   * con BTreeMap (claves alfabéticas) mientras el local usa orden de inserción.
   * Mismo contenido, distinto orden → NO debe entrar en conflicto. */
  it('no marca conflicto cuando el remoto tiene las mismas claves en distinto orden', async () => {
    const localOverlay: WorkspaceOverlay = {
      version: 1,
      addedItems: {
        'zeta-app': { id: 'zeta-app', parentId: 'desktop', type: 'app', label: 'Zeta' },
        'alpha-app': { id: 'alpha-app', parentId: 'desktop', type: 'app', label: 'Alpha' },
      },
      fieldOverrides: {
        'zeta-app': { position: { col: 1, row: 2 } },
        'alpha-app': { position: { col: 3, row: 4 } },
      },
      tombstones: [],
    };
    // Orden alfabético (BTreeMap): claves ordenadas, campos internos reordenados.
    const remoteReordered: WorkspaceOverlay = {
      version: 1,
      addedItems: {
        'alpha-app': { id: 'alpha-app', type: 'app', parentId: 'desktop', label: 'Alpha' },
        'zeta-app': { id: 'zeta-app', type: 'app', parentId: 'desktop', label: 'Zeta' },
      },
      fieldOverrides: {
        'alpha-app': { position: { row: 4, col: 3 } },
        'zeta-app': { position: { row: 2, col: 1 } },
      },
      tombstones: [],
    };
    vi.spyOn(WorkspaceService, 'getOverlay').mockResolvedValue({
      overlay: remoteReordered,
      revision: 5,
      updated_at: '2026-07-31T00:00:00.000Z',
    });
    overlayStore.set(localOverlay, 'sync');
    stop = initOverlaySync();

    await syncOverlayForUser('user-a');

    expect(overlaySyncStore.get().status).toBe('ready');
    expect(overlayStore.get()).toEqual(localOverlay);
  });

  it('sí marca conflicto cuando el contenido realmente difiere pese al orden de claves', async () => {
    const localOverlay: WorkspaceOverlay = {
      ...EMPTY_OVERLAY,
      fieldOverrides: {
        'local-folder': { label: 'Local' },
      },
    };
    vi.spyOn(WorkspaceService, 'getOverlay').mockResolvedValue({
      overlay: remoteOverlay,
      revision: 6,
      updated_at: '2026-07-31T00:00:00.000Z',
    });
    overlayStore.set(localOverlay, 'sync');
    stop = initOverlaySync();

    await syncOverlayForUser('user-a');

    expect(overlaySyncStore.get().status).toBe('conflict');
  });

  it('respeta el orden de tombstones (los arrays comparan en orden)', async () => {
    const localOverlay: WorkspaceOverlay = {
      ...EMPTY_OVERLAY,
      tombstones: ['a', 'b'],
    };
    const remoteDiffOrder: WorkspaceOverlay = {
      ...EMPTY_OVERLAY,
      tombstones: ['b', 'a'],
    };
    vi.spyOn(WorkspaceService, 'getOverlay').mockResolvedValue({
      overlay: remoteDiffOrder,
      revision: 7,
      updated_at: '2026-07-31T00:00:00.000Z',
    });
    overlayStore.set(localOverlay, 'sync');
    stop = initOverlaySync();

    await syncOverlayForUser('user-a');

    expect(overlaySyncStore.get().status).toBe('conflict');
  });
});
