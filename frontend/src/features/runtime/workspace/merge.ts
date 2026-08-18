/* wandori.us — Workspace Merge
 * Algoritmo puro: merge release + overlay → resolved workspace. */

import { hasCapability, type Capability } from '../capability';
import { ADMIN_NODES } from './default-release';
import type {
  NodeId,
  WorkspaceNode,
  WorkspaceTree,
  WorkspaceOverlay,
  ResolvedNode,
  ResolvedWorkspace,
} from './types';

/**
 * Merge release + overlay → resolved workspace.
 * 1. Clone release nodes
 * 2. Remove tombstones (and orphan children)
 * 3. Apply field overrides (position, mobilePosition, label, parentId, mobileOrder)
 * 4. Add overlay items
 * 5. Filter by auth capability
 */
export function mergeWorkspace(
  release: WorkspaceTree,
  overlay: WorkspaceOverlay,
  capability: Capability,
): ResolvedWorkspace {
  const result: Record<NodeId, ResolvedNode> = {};

  for (const [id, node] of Object.entries(release.nodes)) {
    result[id] = { ...node, origin: 'release' };
  }

  /* Remove tombstones and all descendants (recursive orphan detection) */
  const tombstoneSet = new Set(overlay.tombstones);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of Object.values(result)) {
      if (tombstoneSet.has(node.id)) {
        delete result[node.id];
        changed = true;
      } else if (node.parentId !== 'desktop' && node.parentId !== null && tombstoneSet.has(node.parentId)) {
        tombstoneSet.add(node.id);
        delete result[node.id];
        changed = true;
      }
    }
  }

  const collidedOverlayIds = new Set<NodeId>();
  for (const [id, node] of Object.entries(overlay.addedItems)) {
    /* [018A-90] Un tombstone también elimina addedItems: antes el merge solo
     * tumbaba nodos del release y tombstoneNode borraba los addedItems a mano
     * (irrecuperables). Ahora tombstoneSubtree conserva los addedItems para
     * poder restaurarlos con la raíz, así que el tombstone debe prevalecer
     * también aquí. */
    if (tombstoneSet.has(id)) continue;
    /* IDs del release pertenecen al namespace publicado. Un overlay remoto
     * inválido no puede reemplazar silenciosamente una app/recurso publicado;
     * el item colisionado se ignora y el release conserva precedencia. */
    if (result[id]) {
      collidedOverlayIds.add(id);
      continue;
    }
    result[id] = { ...node, origin: 'overlay' };
  }

  /* Aplicar fieldOverrides DESPUÉS de añadir los items del overlay:
   * así las posiciones desktop/móvil y etiqueta de nodos creados por el usuario
   * también se resuelven en una sola pasada. */
  for (const [id, overrides] of Object.entries(overlay.fieldOverrides)) {
    const existing = result[id];
    if (existing && !collidedOverlayIds.has(id)) Object.assign(existing, overrides);
  }

  for (const [id, node] of Object.entries(result)) {
    if (!hasCapability(capability, node.requires)) delete result[id];
  }

  return { releaseVersion: release.version, nodes: result };
}

/** Rebase overlay ante un release nuevo. */
export function rebaseOverlay(
  newRelease: WorkspaceTree,
  currentOverlay: WorkspaceOverlay,
): WorkspaceOverlay {
  /* [297A-29] Los nodos admin dinámicos (ADMIN_NODES) también son ids válidos:
   * el merge los inyecta en el workspace resuelto, así que un override o
   * tombstone sobre ellos (p. ej. mediaLibrary) debe sobrevivir al rebase.
   * Sin esto, si el release publicado no incluye un nodo admin, el rebase lo
   * descartaba del overlay remoto y producía un falso conflicto ("workspace
   * actualizado") al comparar con el local, y fetchWorkspaceRelease perdía
   * el override local (movimiento del icono) de ese nodo. */
  const releaseIds = new Set([...Object.keys(newRelease.nodes), ...Object.keys(ADMIN_NODES)]);

  const validTombstones = currentOverlay.tombstones.filter((id) => releaseIds.has(id));

  const addedIds = new Set(Object.keys(currentOverlay.addedItems));
  const validOverrides: Record<NodeId, Partial<Pick<WorkspaceNode, 'position' | 'mobilePosition' | 'label' | 'parentId' | 'mobileOrder'>>> = {};
  for (const [id, overrides] of Object.entries(currentOverlay.fieldOverrides)) {
    /* Los nodos publicados se rebajan contra el release; los creados por el
     * usuario permanecen válidos aunque no formen parte del release. */
    if (releaseIds.has(id) || addedIds.has(id)) {
      validOverrides[id] = overrides;
    }
  }

  if (
    validTombstones.length === currentOverlay.tombstones.length
    && Object.keys(validOverrides).length === Object.keys(currentOverlay.fieldOverrides).length
  ) {
    return currentOverlay;
  }

  return {
    version: currentOverlay.version,
    addedItems: currentOverlay.addedItems,
    fieldOverrides: validOverrides,
    tombstones: validTombstones,
  };
}
