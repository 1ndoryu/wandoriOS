/* wandori.us — Compatibilidad del release local
 * El backend sigue siendo la fuente de verdad del workspace publicado. Durante
 * el prototipo, Vite puede apuntar a un release persistido antes de registrar
 * la app del Bosque; este fallback solo aporta esa entrada visual en DEV.
 * En producción no se reintroduce ninguna app que el administrador haya
 * excluido del release. [018A-92] */

import { DEFAULT_RELEASE } from './default-release';
import type { WorkspaceTree } from './types';

const LOCAL_PROTOTYPE_NODE_IDS = ['gamePlayable'] as const;

/**
 * Añade únicamente el nodo del juego que todavía no conoce el release local.
 * No sobrescribe posiciones, etiquetas ni nodos publicados; los tombstones
 * del overlay siguen prevaleciendo en mergeWorkspace. El fixture jugable se
 * incluye solo como compatibilidad local mientras el release publicado no lo
 * conozca. [GAME-01-F3]
 */
export function withLocalPrototypeNodes(tree: WorkspaceTree): WorkspaceTree {
  if (!import.meta.env.DEV) return tree;

  const missingNodes = LOCAL_PROTOTYPE_NODE_IDS.filter((id) => !tree.nodes[id]);
  if (missingNodes.length === 0) return tree;

  const nodes = { ...tree.nodes };
  for (const id of missingNodes) {
    const node = DEFAULT_RELEASE.nodes[id];
    if (node) nodes[id] = node;
  }

  return { ...tree, nodes };
}
