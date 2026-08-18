/* wandori.us — Workspace Overlay Sync
 * Adaptador entre el overlay local y el contrato remoto por cuenta.
 * localStorage/overlayStore sigue siendo la fuente inmediata; la red solo
 * confirma o presenta conflictos. Nunca persiste ResolvedWorkspace ni ventanas.
 * [297A-13] Política aprobada: merge por campo + LWW en la colisión real del
 * mismo campo, con aviso no bloqueante (toast) cuando se descarta un cambio
 * local — sin modal de fricción. */

import { ApiError } from '../../../api/client';
import { WorkspaceService, type WorkspaceOverlayResponse } from '../../../services/workspace.service';
import { authStore, createStore } from '../../../store';
import { showToast } from '../../../components/ui/toast';
import { overlayStore } from './stores';
import { releaseStore } from './stores';
import { equalValue, mergeOverlayLww, rebaseOverlay } from './merge';
import type { WorkspaceOverlay } from './types';

export type OverlaySyncStatus = 'idle' | 'loading' | 'ready' | 'offline';

export interface OverlaySyncState {
  readonly userId: string | null;
  readonly revision: number | null;
  readonly remoteOverlay: WorkspaceOverlay | null;
  readonly status: OverlaySyncStatus;
}

export const overlaySyncStore = createStore<OverlaySyncState>({
  userId: null,
  revision: null,
  remoteOverlay: null,
  status: 'idle',
});

let activeUserId: string | null = null;
let remoteRevision: number | null = null;
let remoteOverlay: WorkspaceOverlay | null = null;
let localSnapshot: WorkspaceOverlay | null = null;
let syncGeneration = 0;
let updateQueue: Promise<void> = Promise.resolve();
let stopOverlaySubscription: (() => void) | null = null;
let stopAuthSubscription: (() => void) | null = null;
let sharedCleanup: (() => void) | null = null;

function isEmptyOverlay(overlay: WorkspaceOverlay): boolean {
  return Object.keys(overlay.addedItems).length === 0
    && Object.keys(overlay.fieldOverrides).length === 0
    && overlay.tombstones.length === 0;
}

function setState(status: OverlaySyncStatus): void {
  overlaySyncStore.set({
    userId: activeUserId,
    revision: remoteRevision,
    remoteOverlay,
    status,
  }, 'sync');
}

function responseOverlay(response: WorkspaceOverlayResponse): void {
  remoteRevision = response.revision;
  remoteOverlay = rebaseOverlay(releaseStore.get(), response.overlay);
}

/* [297A-13] Aplica el merge por campo + LWW: si hubo descartes, los notifica
 * de forma no bloqueante en lugar de abrir un modal de conflicto. */
function applyMergedOverlay(local: WorkspaceOverlay): void {
  if (!remoteOverlay || remoteRevision === null) return;
  const { merged, discarded } = mergeOverlayLww(local, remoteOverlay);
  overlayStore.set(merged, 'sync');
  localSnapshot = merged;
  if (discarded.length > 0) {
    showToast(`se descartó un cambio en ${discarded.join(', ')} por una actualización más reciente en tu cuenta`);
  }
  setState('ready');
}

function queueLocalUpdate(overlay: WorkspaceOverlay): void {
  /* Capturar siempre la última intención local; el merge LWW usa este snapshot. */
  localSnapshot = overlay;
  if (!activeUserId || remoteRevision === null) return;
  const generation = syncGeneration;
  const userId = activeUserId;
  updateQueue = updateQueue.then(async () => {
    if (generation !== syncGeneration || activeUserId !== userId || remoteRevision === null) return;
    const pending = localSnapshot ?? overlay;
    try {
      const updated = await WorkspaceService.saveOverlay({
        overlay: pending,
        expected_revision: remoteRevision,
      });
      if (generation !== syncGeneration || activeUserId !== userId) return;
      responseOverlay(updated);
      setState('ready');
    } catch (error) {
      if (generation !== syncGeneration || activeUserId !== userId) return;
      if (error instanceof ApiError && error.status === 409) {
        /* Colisión: releer el remoto y resolver por campo + LWW con aviso. */
        try {
          const latest = await WorkspaceService.getOverlay();
          if (generation !== syncGeneration || activeUserId !== userId) return;
          responseOverlay(latest);
          applyMergedOverlay(localSnapshot ?? overlay);
        } catch {
          remoteRevision = null;
          remoteOverlay = null;
          setState('offline');
        }
        return;
      }
      setState('offline');
    }
  });
}

/** Sincroniza el overlay después de confirmar una cuenta con /auth/me. */
export async function syncOverlayForUser(userId: string): Promise<void> {
  /* [018A-66] El admin organiza/publica el release global; no participa en
   * el overlay personal de una cuenta. Evitar esta ruta también impide que un
   * overlay local antiguo se compare contra el remoto y abra conflictos al
   * recargar la sesión administrativa. */
  if (authStore.get().capability === 'admin') {
    clearOverlaySync();
    return;
  }
  const generation = ++syncGeneration;
  activeUserId = userId;
  remoteRevision = null;
  remoteOverlay = null;
  localSnapshot = overlayStore.get();
  setState('loading');

  let remote: WorkspaceOverlayResponse;
  try {
    remote = await WorkspaceService.getOverlay();
  } catch {
    if (generation === syncGeneration && activeUserId === userId) setState('offline');
    return;
  }
  if (generation !== syncGeneration || activeUserId !== userId) return;

  responseOverlay(remote);
  const resolvedRemote = remoteOverlay ?? remote.overlay;
  const local = overlayStore.get();
  if (equalValue(local, resolvedRemote)) {
    setState('ready');
  } else if (isEmptyOverlay(local)) {
    overlayStore.set(resolvedRemote, 'sync');
    localSnapshot = resolvedRemote;
    setState('ready');
  } else {
    /* [297A-13] Mismatch inicial: merge por campo + LWW con aviso no
     * bloqueante en lugar del modal de conflicto. */
    applyMergedOverlay(local);
  }
}

/** Desactiva la cuenta sin borrar el overlay anónimo local. */
export function clearOverlaySync(): void {
  syncGeneration += 1;
  activeUserId = null;
  remoteRevision = null;
  remoteOverlay = null;
  localSnapshot = null;
  updateQueue = Promise.resolve();
  overlaySyncStore.set({
    userId: null,
    revision: null,
    remoteOverlay: null,
    status: 'idle',
  }, 'sync');
}

/** Instala listeners únicos y devuelve cleanup idempotente. */
export function initOverlaySync(): () => void {
  if (sharedCleanup) return sharedCleanup;

  stopOverlaySubscription = overlayStore.subscribe((overlay, source) => {
    if (source === 'user') queueLocalUpdate(overlay);
  });
  stopAuthSubscription = authStore.subscribe((state) => {
    if (!state.isAuthenticated || !state.userId) {
      clearOverlaySync();
      return;
    }
    if (state.capability === 'admin') {
      clearOverlaySync();
      return;
    }
    if (state.userId !== activeUserId) {
      void syncOverlayForUser(state.userId);
    }
  });

  let cleaned = false;
  const cleanup = (): void => {
    if (cleaned) return;
    cleaned = true;
    stopOverlaySubscription?.();
    stopOverlaySubscription = null;
    stopAuthSubscription?.();
    stopAuthSubscription = null;
    sharedCleanup = null;
    clearOverlaySync();
  };
  sharedCleanup = cleanup;
  return cleanup;
}
