import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../api/client';
import { WorkspaceService } from '../../../services/workspace.service';
import { authStore } from '../../../store';
import {
  clearOverlaySync,
  initOverlaySync,
  overlaySyncStore,
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

  it('resuelve un 409 con merge por campo: combina local y remoto sin perder nada', async () => {
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

    /* El merge (item remoto + override local) solo se aplica tras el 409. */
    await vi.waitFor(() => expect(overlayStore.get().addedItems['remote-folder']).toBeDefined());

    const merged = overlayStore.get();
    expect(merged.fieldOverrides['local-folder']).toEqual({ label: 'Local' });
    expect(overlaySyncStore.get()).toMatchObject({ revision: 2, status: 'ready' });
  });

  it('aplica LWW en la colisión real del mismo id (remoto gana) y queda ready', async () => {
    const remoteCollision: WorkspaceOverlay = {
      ...EMPTY_OVERLAY,
      addedItems: {
        'shared-folder': { id: 'shared-folder', parentId: 'desktop', type: 'folder', label: 'Remoto', requires: 'public' },
      },
    };
    vi.spyOn(WorkspaceService, 'getOverlay').mockResolvedValue({
      overlay: remoteCollision,
      revision: 4,
      updated_at: '2026-07-31T00:00:00.000Z',
    });
    stop = initOverlaySync();
    const localOverlay: WorkspaceOverlay = {
      ...EMPTY_OVERLAY,
      addedItems: {
        'shared-folder': { id: 'shared-folder', parentId: 'desktop', type: 'folder', label: 'Local', requires: 'public' },
      },
    };
    overlayStore.set(localOverlay, 'sync');

    await syncOverlayForUser('user-a');

    expect(overlaySyncStore.get().status).toBe('ready');
    /* Mismo id tocado por ambos lados: gana el remoto (LWW). */
    expect(overlayStore.get().addedItems['shared-folder'].label).toBe('Remoto');
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

  it('combina campos distintos por campo (sin colisión) y queda ready', async () => {
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

    /* Ids distintos: no hay colisión real → ambos se conservan. */
    expect(overlaySyncStore.get().status).toBe('ready');
    const merged = overlayStore.get();
    expect(merged.fieldOverrides['local-folder']).toEqual({ label: 'Local' });
    expect(merged.addedItems['remote-folder']).toBeDefined();
  });

  it('une tombstones de ambos lados sin orden ni duplicados', async () => {
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

    expect(overlaySyncStore.get().status).toBe('ready');
    expect(overlayStore.get().tombstones).toEqual(['a', 'b']);
  });
});
