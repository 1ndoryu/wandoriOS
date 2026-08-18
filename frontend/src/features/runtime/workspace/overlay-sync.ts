/* wandori.us — Workspace Overlay Sync
 * Adaptador entre el overlay local y el contrato remoto por cuenta.
 * localStorage/overlayStore sigue siendo la fuente inmediata; la red solo
 * confirma o presenta conflictos. Nunca persiste ResolvedWorkspace ni ventanas.
 * [297A-13] */

import { ApiError } from '../../../api/client';
import { WorkspaceService, type WorkspaceOverlayResponse } from '../../../services/workspace.service';
import { authStore, createStore } from '../../../store';
import { overlayStore } from './stores';
import { releaseStore } from './stores';
import { rebaseOverlay } from './merge';
import type { WorkspaceOverlay } from './types';

export type OverlaySyncStatus = 'idle' | 'loading' | 'ready' | 'offline' | 'conflict';

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
let conflictPending = false;

/* [297A-27] Comparación estructural insensible al orden de claves de objetos.
 * El backend Rust serializa con BTreeMap (claves alfabéticas) mientras el
 * frontend construye el overlay en orden de inserción JS; JSON.stringify
 * estricto producía falsos conflictos con contenido idéntico. Los arrays
 * (tombstones) sí comparan en orden porque el orden es significativo. */
function equalValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (typeof left !== typeof right) return false;
  if (left === null || right === null) return left === right;
  if (typeof left !== 'object') return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((value, index) => equalValue(value, right[index]));
  }
  const leftKeys = Object.keys(left as Record<string, unknown>);
  const rightKeys = Object.keys(right as Record<string, unknown>);
  if (leftKeys.length !== rightKeys.length) return false;
  for (const key of leftKeys) {
    if (!Object.prototype.hasOwnProperty.call(right, key)) return false;
    if (!equalValue((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key])) return false;
  }
  return true;
}

function equalOverlay(left: WorkspaceOverlay, right: WorkspaceOverlay): boolean {
  return equalValue(left, right);
}

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

function queueLocalUpdate(overlay: WorkspaceOverlay): void {
  /* Capturar siempre la última intención local, incluso durante conflicto;
   * la decisión explícita "conservar dispositivo" debe enviar este snapshot
   * y nunca una mutación anterior. */
  localSnapshot = overlay;
  if (!activeUserId || remoteRevision === null || conflictPending) return;
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
        try {
          const latest = await WorkspaceService.getOverlay();
          if (generation !== syncGeneration || activeUserId !== userId) return;
          responseOverlay(latest);
          conflictPending = true;
          setState('conflict');
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
  conflictPending = false;
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
  if (equalOverlay(local, resolvedRemote)) {
    setState('ready');
  } else if (isEmptyOverlay(local)) {
    overlayStore.set(resolvedRemote, 'sync');
    localSnapshot = resolvedRemote;
    setState('ready');
  } else {
    localSnapshot = local;
    conflictPending = true;
    setState('conflict');
  }
}

/** Resolver un conflicto sin sobrescritura silenciosa. */
export function resolveOverlayConflict(choice: 'remote' | 'local'): void {
  if (!activeUserId || remoteRevision === null || remoteOverlay === null) return;
  if (choice === 'remote') {
    conflictPending = false;
    overlayStore.set(remoteOverlay, 'sync');
    localSnapshot = remoteOverlay;
    setState('ready');
    return;
  }
  conflictPending = false;
  queueLocalUpdate(localSnapshot ?? overlayStore.get());
}

/** Desactiva la cuenta sin borrar el overlay anónimo local. */
export function clearOverlaySync(): void {
  syncGeneration += 1;
  activeUserId = null;
  remoteRevision = null;
  remoteOverlay = null;
  localSnapshot = null;
  conflictPending = false;
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
