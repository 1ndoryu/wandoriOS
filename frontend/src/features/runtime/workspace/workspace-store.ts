/* sentinel-disable-file mixed-barrel-logic
 * [por que] Este modulo ES la API publica del workspace: re-exporta stores,
 * mutaciones y clipboard (documentado: "para romper el ciclo de importacion")
 * y ademas expone logica de servicio; separar el barrel romperia la API.
 */
/* wandori.us — Workspace Store
 * API y re-exports del workspace. Los stores viven en stores.ts
 * para romper el ciclo de importación con overlay-mutations.
 * [Plan 297A-11 §9.1–9.4] [Auditoría v2] */

import { WorkspaceService } from '../../../services';
import { showToast } from '../../../components/ui/toast';
import { rebaseOverlay } from './merge';
import { withLocalPrototypeNodes } from './local-development-release';
import type {
  NodeId,
  WorkspaceNode,
  WorkspaceTree,
} from './types';

/* Re-export stores y constantes desde stores.ts */
export { releaseStore, overlayStore, workspaceStore, EMPTY_OVERLAY, previewPublicStore } from './stores';

/* Import local para funciones API */
import { releaseStore, overlayStore, workspaceStore, EMPTY_OVERLAY } from './stores';

/* === API === */

export async function fetchWorkspaceRelease(): Promise<void> {
  try {
    const data = await WorkspaceService.getActiveRelease();
    if (data?.tree?.nodes) {
      const release = withLocalPrototypeNodes(data.tree);
      const currentRelease = releaseStore.get();
      const releaseNodeIds = Object.keys(release.nodes);
      const currentNodeIds = Object.keys(currentRelease.nodes);
      const nodeSetChanged = releaseNodeIds.length !== currentNodeIds.length
        || releaseNodeIds.some((id) => !currentRelease.nodes[id]);
      /* Un release antiguo puede conservar la misma versión pero no conocer
       * los nodos del prototipo. En ese caso también hay que rebasar el
       * overlay para que sus posiciones/tombstones no se pierdan. */
      if (release.version !== currentRelease.version || nodeSetChanged) {
        const currentOverlay = overlayStore.get();
        const rebased = rebaseOverlay(release, currentOverlay);
        if (rebased !== currentOverlay) {
          overlayStore.set(rebased);
        }
      }
      releaseStore.set(release);
    }
  } catch {
    /* API no disponible — usar DEFAULT_RELEASE */
  }
}

export function isMaterializedContentNode(node: WorkspaceNode): boolean {
  /* [038A-2] Los nodos `nota-{id}` y `media-{id}` son la forma física del
   * contenido publicado y el servidor los materializa SIEMPRE en la release
   * efectiva (cualquier versión activa). No se hornean en el release al
   * publicar: hornearlos los cristalizaría en la foto del layout cuando su
   * fuente viva ya es la BD (articles/media publicados). Si se hornearan,
   * una release publicada antes de despublicar un artículo seguiría
   * mostrándolo, violando “solo desaparece al eliminarse de verdad”. */
  return (node.id.startsWith('nota-') || node.id.startsWith('media-'))
    && node.type === 'resource';
}

export async function publishWorkspace(): Promise<{ version: number } | null> {
  const resolved = workspaceStore.get();
  const nodes: Record<NodeId, WorkspaceNode> = {};
  for (const [id, node] of Object.entries(resolved.nodes)) {
    if (isMaterializedContentNode(node)) {
      continue;
    }
    nodes[id] = {
      id: node.id,
      parentId: node.parentId,
      type: node.type,
      label: node.label,
      refId: node.refId,
      resourceKind: node.resourceKind,
      publicLocator: node.publicLocator,
      position: node.position,
      mobilePosition: node.mobilePosition,
      mobileOrder: node.mobileOrder,
      requires: node.requires,
    };
  }
  const tree: WorkspaceTree = { version: resolved.releaseVersion + 1, nodes };
  const result = await WorkspaceService.publish(tree);
  if (result?.version) {
    releaseStore.set(result.tree);
    overlayStore.set(EMPTY_OVERLAY);
    return { version: result.version };
  }
  return null;
}

/** Rollback a una versión anterior del release (admin).
 *  Re-publica el árbol antiguo como nueva versión y limpia el overlay. */
export async function rollbackWorkspace(targetVersion: number): Promise<boolean> {
  try {
    const oldRelease = await WorkspaceService.getReleaseByVersion(targetVersion);
    if (!oldRelease?.tree) return false;
    const result = await WorkspaceService.publish(oldRelease.tree);
    if (result?.version) {
      releaseStore.set(result.tree);
      overlayStore.set(EMPTY_OVERLAY);
      showToast(`Rollback exitoso (v${result.version})`);
      return true;
    }
  } catch {
    showToast('Error al restaurar versión anterior');
  }
  return false;
}

/* Re-export submodules for backward compatibility */
export { moveNodePosition, moveNodesPosition, moveMobileNodesPosition, moveNodeToParent, addOverlayNode, tombstoneNode, tombstoneSubtree, renameNode, restoreNode, resetOverlay, reorderDesktopNodes, reorderWorkspaceNodes, createFolder, getTombstonedNodes, getChildren, isSystemNode, SYSTEM_NODE_IDS } from './overlay-mutations';
export { getClipboard, setClipboard, clearClipboard, pasteFromClipboard } from './clipboard';
export type { ClipboardMode, ClipboardEntry } from './clipboard';
