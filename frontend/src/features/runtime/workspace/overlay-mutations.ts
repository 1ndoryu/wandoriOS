/* wandori.us — Overlay Mutations
 * Funciones que mutan el overlay del workspace. */

import type { GridPosition, NodeId, WorkspaceNode, ResolvedNode, ResolvedWorkspace } from './types';

import { overlayStore, workspaceStore, releaseStore, EMPTY_OVERLAY } from './stores';
import { logger } from '../../../services/logger';

/* [038A-2] Nodos del sistema que nunca se pueden tumbar: misma lista canónica
 * que el guard del backend (`SYSTEM_NODE_IDS` en release_validation.rs) y que
 * la v3 publicada. `trash` (Papelera) es irremplazable: sin él el usuario no
 * puede restaurar contenido borrado. El resto son la navegación de gobierno
 * del escritorio. Los nodos de contenido (documentos, store, orders,
 * downloads, projects) y los prototipos de juego SÍ son eliminables. */
export const SYSTEM_NODE_IDS: readonly string[] = ['trash', 'admin', 'settings', 'profile', 'about'];

/** [038A-2] True si el id pertenece a un nodo de sistema protegido. */
export function isSystemNode(nodeId: string): boolean {
  return SYSTEM_NODE_IDS.includes(nodeId);
}

export function moveNodePosition(nodeId: NodeId, position: { col: number; row: number }): void {
  overlayStore.update((prev) => ({
    ...prev,
    fieldOverrides: {
      ...prev.fieldOverrides,
      [nodeId]: { ...prev.fieldOverrides[nodeId], position },
    },
  }));
}

/** [297A-20] Mueve varios nodos en un SOLO update del overlay.
 * Evita N re-renders al reencuadrar tras un resize del grid. */
export function moveNodesPosition(
  moves: ReadonlyArray<{ nodeId: NodeId; position: { col: number; row: number } }>,
): void {
  if (moves.length === 0) return;
  overlayStore.update((prev) => {
    const fieldOverrides = { ...prev.fieldOverrides };
    for (const move of moves) {
      fieldOverrides[move.nodeId] = { ...fieldOverrides[move.nodeId], position: move.position };
    }
    return { ...prev, fieldOverrides };
  });
}

export function moveMobileNodesPosition(
  moves: ReadonlyArray<{ nodeId: NodeId; mobilePosition: GridPosition }>,
): void {
  if (moves.length === 0) return;
  overlayStore.update((prev) => {
    const fieldOverrides = { ...prev.fieldOverrides };
    for (const move of moves) {
      fieldOverrides[move.nodeId] = {
        ...fieldOverrides[move.nodeId],
        mobilePosition: move.mobilePosition,
      };
    }
    return { ...prev, fieldOverrides };
  });
}

export function moveNodeToParent(nodeId: NodeId, parentId: NodeId | 'desktop' | null): void {
  overlayStore.update((prev) => ({
    ...prev,
    fieldOverrides: {
      ...prev.fieldOverrides,
      [nodeId]: { ...prev.fieldOverrides[nodeId], parentId },
    },
  }));
}

export function addOverlayNode(node: WorkspaceNode): void {
  overlayStore.update((prev) => ({
    ...prev,
    addedItems: { ...prev.addedItems, [node.id]: node },
  }));
}

/* [018A-90] Renombrar un nodo vía fieldOverrides.label (el overlay ya lo
 * soporta en types.ts, pero no había mutación ni comando que lo usara).
 * No escribe overrides redundantes: si el label no cambia, no toca el overlay. */
export function renameNode(nodeId: NodeId, label: string): void {
  const trimmed = label.trim();
  if (!trimmed) return;
  overlayStore.update((prev) => ({
    ...prev,
    fieldOverrides: {
      ...prev.fieldOverrides,
      [nodeId]: { ...prev.fieldOverrides[nodeId], label: trimmed },
    },
  }));
}

export function tombstoneNode(nodeId: NodeId): void {
  /* [038A-2] Los nodos de sistema son inmutables desde la UI: tumbar la
   * Papelera (o admin/settings/profile/about) dejaría el OS sin
   * recuperación aunque el release lo conserve. No-op silencioso con aviso. */
  if (isSystemNode(nodeId)) {
    logger.warn(`[038A-2] No se puede eliminar el nodo de sistema «${nodeId}»`);
    return;
  }
  overlayStore.update((prev) => ({
    ...prev,
    tombstones: [...prev.tombstones, nodeId],
    addedItems: (() => {
      const items = { ...prev.addedItems };
      if (items[nodeId]) delete items[nodeId];
      return items;
    })(),
    fieldOverrides: (() => {
      const overrides = { ...prev.fieldOverrides };
      delete overrides[nodeId];
      return overrides;
    })(),
  }));
}

/* [018A-90] Borrado seguro en cascada: tumba el nodo y TODO su subárbol.
 * A diferencia de tombstoneNode, conserva addedItems y fieldOverrides de los
 * descendientes: el merge los ignora mientras el id esté en tombstones (ver
 * la guarda en merge.ts [018A-90]) y restoreNode los recupera al quitar el
 * tombstone de la raíz. Sin esto, borrar una carpeta destruía los hijos
 * creados por el usuario de forma irreversible desde la UI. */
export function tombstoneSubtree(nodeId: NodeId): void {
  /* [038A-2] Misma protección que tombstoneNode: una carpeta de sistema (o
   * cualquiera cuyo subárbol la incluya) no se puede tumbar desde la UI. */
  if (isSystemNode(nodeId)) {
    logger.warn(`[038A-2] No se puede eliminar el nodo de sistema «${nodeId}»`);
    return;
  }
  overlayStore.update((prev) => {
    const ws = workspaceStore.get();
    const ids = collectSubtreeIds(ws, nodeId);
    /* [038A-2] Si el subárbol contiene un nodo de sistema (p. ej. intentar
     * borrar «desktop»), aborta: nunca se puede arrastrar un nodo protegido. */
    if (ids.some(isSystemNode)) {
      logger.warn(`[038A-2] El subárbol de «${nodeId}» contiene un nodo de sistema`);
      return prev;
    }
    const tombstones = Array.from(new Set([...prev.tombstones, ...ids]));
    return { ...prev, tombstones };
  });
}

/* [018A-90] BFS sobre el árbol resuelto: recoge el nodo y todos sus
 * descendientes (hijos, nietos...) ANTES de tumbar, para no perder ramas. */
function collectSubtreeIds(ws: ResolvedWorkspace, nodeId: NodeId): NodeId[] {
  const out: NodeId[] = [nodeId];
  let frontier: NodeId[] = [nodeId];
  while (frontier.length > 0) {
    const next: NodeId[] = [];
    for (const [id, node] of Object.entries(ws.nodes)) {
      if (node.parentId && frontier.includes(node.parentId) && !out.includes(id)) {
        out.push(id);
        next.push(id);
      }
    }
    frontier = next;
  }
  return out;
}

/* [018A-90] Restaurar un nodo también restaura su subárbol (hijos y
 * descendientes tumbados con él). Busca tanto en el release como en los
 * addedItems para que las carpetas creadas por el usuario se recuperen
 * con su contenido. Quitar tombstones de una rama es idempotente. */
export function restoreNode(nodeId: NodeId): void {
  overlayStore.update((prev) => {
    const release = releaseStore.get();
    const keep = new Set(collectRestoreSubtree(nodeId, release.nodes, prev.addedItems));
    return { ...prev, tombstones: prev.tombstones.filter((id) => !keep.has(id)) };
  });
}

function collectRestoreSubtree(
  nodeId: NodeId,
  releaseNodes: Record<NodeId, WorkspaceNode>,
  addedItems: Record<NodeId, WorkspaceNode>,
): NodeId[] {
  const all = { ...releaseNodes, ...addedItems };
  const out: NodeId[] = [nodeId];
  let frontier: NodeId[] = [nodeId];
  while (frontier.length > 0) {
    const next: NodeId[] = [];
    for (const [id, node] of Object.entries(all)) {
      if (node.parentId && frontier.includes(node.parentId) && !out.includes(id)) {
        out.push(id);
        next.push(id);
      }
    }
    frontier = next;
  }
  return out;
}

export function resetOverlay(): void {
  overlayStore.set(EMPTY_OVERLAY);
}

/** Compatibilidad para datos legacy. El launcher nuevo escribe mobilePosition;
 * esta función solo se conserva para importar overlays antiguos y no participa en
 * la política de orden de Finder ni en la geometría desktop. */
export function reorderWorkspaceNodes(orderedIds: readonly NodeId[]): void {
  overlayStore.update((prev) => {
    const overrides = { ...prev.fieldOverrides };
    for (let i = 0; i < orderedIds.length; i++) {
      overrides[orderedIds[i]] = { ...overrides[orderedIds[i]], mobileOrder: i };
    }
    return { ...prev, fieldOverrides: overrides };
  });
}

/** Compatibilidad con el drag desktop existente. */
export function reorderDesktopNodes(orderedIds: NodeId[]): void {
  reorderWorkspaceNodes(orderedIds);
}

export function createFolder(parentId: NodeId | 'desktop', label: string): NodeId {
  const ws = workspaceStore.get();
  const siblings = Object.values(ws.nodes).filter((n) => n.parentId === parentId);

  /* Evitar nombres duplicados en el mismo padre — añadir sufijo numérico */
  let uniqueLabel = label;
  const existingLabels = new Set(siblings.map(n => n.label));
  if (existingLabels.has(uniqueLabel)) {
    let counter = 2;
    while (existingLabels.has(`${label} (${counter})`)) counter++;
    uniqueLabel = `${label} (${counter})`;
  }

  const id = `folder-${Date.now()}`;
  addOverlayNode({
    id,
    parentId,
    type: 'folder',
    label: uniqueLabel,
    mobilePosition: {
      col: siblings.length % 3,
      row: Math.floor(siblings.length / 3),
    },
    mobileOrder: siblings.length,
    requires: 'public',
  });
  return id;
}

/* [018A-90] La papelera lista solo RAÍCES tumbadas: si el padre también está
 * tumbado, el nodo se restaura con la raíz y no se ofrece por separado.
 * Incluye addedItems tumbados (carpetas/atajos creados por el usuario), que
 * antes quedaban fuera de la papelera y eran irrecuperables desde la UI. */
export function getTombstonedNodes(): WorkspaceNode[] {
  const release = releaseStore.get();
  const overlay = overlayStore.get();
  const all = { ...release.nodes, ...overlay.addedItems };
  const tombstoneSet = new Set(overlay.tombstones);
  return overlay.tombstones
    .map((id) => all[id])
    .filter((n): n is WorkspaceNode => {
      if (!n) return false;
      return !(n.parentId !== 'desktop' && n.parentId !== null && tombstoneSet.has(n.parentId));
    });
}

/** Devuelve hijos sin imponer una política de presentación.
 * Finder y otras superficies de contenido no deben heredar el orden del launcher;
 * la superficie móvil usa `sortMobileNodes` explícitamente cuando lo necesita. */
export function getChildren(parentId: NodeId | 'desktop'): ResolvedNode[] {
  const ws = workspaceStore.get();
  return Object.values(ws.nodes).filter((n) => n.parentId === parentId);
}
