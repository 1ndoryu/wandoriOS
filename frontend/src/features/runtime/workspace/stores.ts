/* wandori.us — Workspace Stores
 * Stores reactivos del workspace separados para romper el ciclo de importación
 * entre workspace-store.ts y overlay-mutations.ts.
 * [Auditoría v2 — fix ciclo de imports] */

import { createStore, authStore } from '../../../store';
import { DEFAULT_RELEASE, ADMIN_NODES } from './default-release';
import { mergeWorkspace } from './merge';
import type { Capability } from '../capability';
import type {
  NodeId, WorkspaceNode, WorkspaceTree,
  WorkspaceOverlay,
  ResolvedWorkspace,
} from './types';

const OVERLAY_KEY = 'wandorius:workspace-overlay';
const OVERLAY_VERSION = 1;

/** Modo vista pública: cuando activo, el workspace muestra solo el release
 *  (lo que ven los visitantes), ignorando el overlay del admin. */
export const previewPublicStore = createStore<boolean>(false);

export const EMPTY_OVERLAY: WorkspaceOverlay = {
  version: OVERLAY_VERSION,
  addedItems: {},
  fieldOverrides: {},
  tombstones: [],
};

function loadOverlay(): WorkspaceOverlay {
  try {
    const raw = localStorage.getItem(OVERLAY_KEY);
    if (!raw) return EMPTY_OVERLAY;
    const parsed = JSON.parse(raw) as WorkspaceOverlay;
    if (parsed.version !== OVERLAY_VERSION) return EMPTY_OVERLAY;
    return parsed;
  } catch {
    return EMPTY_OVERLAY;
  }
}

function saveOverlay(overlay: WorkspaceOverlay): void {
  try {
    localStorage.setItem(OVERLAY_KEY, JSON.stringify(overlay));
  } catch {
    /* localStorage full or unavailable */
  }
}

/* === Stores === */

export const releaseStore = createStore<WorkspaceTree>(DEFAULT_RELEASE);
export const overlayStore = createStore<WorkspaceOverlay>(loadOverlay());
export const workspaceStore = createStore<ResolvedWorkspace>(
  mergeWorkspace(DEFAULT_RELEASE, loadOverlay(), 'public'),
);

overlayStore.subscribe((overlay) => {
  saveOverlay(overlay);
});

/* === Recompute con debounce via microtask ===
 * Evita triple recompute al iniciar (releaseStore + overlayStore + authStore). */

let recomputeScheduled = false;
function scheduleRecompute(): void {
  if (recomputeScheduled) return;
  recomputeScheduled = true;
  queueMicrotask(() => {
    recomputeScheduled = false;
    const release = releaseStore.get();
    const overlay = previewPublicStore.get() ? EMPTY_OVERLAY : overlayStore.get();
    const auth = authStore.get();
    const capability: Capability = auth.capability;

    /* [Auditoría v4 §5.4] Inyectar nodos admin dinámicamente */
    if (capability === 'admin') {
      const adminNodeMap: Record<NodeId, WorkspaceNode> = {};
      for (const [id, node] of Object.entries(ADMIN_NODES)) {
        adminNodeMap[id] = { ...node, requires: 'admin' as const };
      }
      const augmentedRelease: WorkspaceTree = {
        version: release.version,
        nodes: { ...release.nodes, ...adminNodeMap },
      };
      workspaceStore.set(mergeWorkspace(augmentedRelease, overlay, capability));
    } else {
      workspaceStore.set(mergeWorkspace(release, overlay, capability));
    }
  });
}

releaseStore.subscribe(() => scheduleRecompute());
overlayStore.subscribe(() => scheduleRecompute());
authStore.subscribe(() => scheduleRecompute());
previewPublicStore.subscribe(() => scheduleRecompute());
