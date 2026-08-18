/* wandori.us — Workspace/App Contract
 * Regla estructural pura para evitar drift entre el layout publicado y el
 * AppRegistry. Solo valida referencias desde nodos workspace hacia apps;
 * una app registrada puede existir sin icono (Cuenta, menú o app interna).
 * [297A-23 Fase 4] */

import type { WorkspaceNode } from './types';

export interface WorkspaceAppRef {
  readonly nodeId: string;
  readonly appId?: string;
}

/** Obtener referencias de nodos type:'app', conservando apps sin refId. */
export function getWorkspaceAppRefs(
  nodeMaps: readonly Readonly<Record<string, WorkspaceNode>>[],
): readonly WorkspaceAppRef[] {
  const refs = new Map<string, WorkspaceAppRef>();
  for (const nodes of nodeMaps) {
    for (const node of Object.values(nodes)) {
      if (node.type !== 'app') continue;
      refs.set(node.id, { nodeId: node.id, appId: node.refId });
    }
  }
  return [...refs.values()].sort((left, right) => left.nodeId.localeCompare(right.nodeId));
}

/**
 * Devolver violaciones del contrato.
 * Los mensajes incluyen el nodo para que el fallo indique cómo corregirlo.
 */
export function findWorkspaceAppContractIssues(
  refs: readonly WorkspaceAppRef[],
  hasApp: (appId: string) => boolean,
): readonly string[] {
  return refs.flatMap((ref) => {
    if (!ref.appId) return [`${ref.nodeId}:missing-refId`];
    if (!hasApp(ref.appId)) return [`${ref.nodeId}:unregistered-app:${ref.appId}`];
    return [];
  });
}
