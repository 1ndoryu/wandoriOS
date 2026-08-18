/* wandori.us — Compatibilidad del release local
 * El backend sigue siendo la fuente de verdad del workspace publicado. Durante
 * el prototipo, Vite puede apuntar a un release persistido antes de registrar
 * las apps del OS; este fallback solo aporta entradas visuales en DEV.
 * En producción no se reintroduce ninguna app que el administrador haya
 * excluido del release. [018A-92]
 * [2026-08-18] Se retiró el nodo del juego (frente archivado); la función
 * queda como passthrough por compatibilidad con workspace-store. */

import type { WorkspaceTree } from './types';

/**
 * Passthrough: ya no hay nodos de prototipo local pendientes de registrar.
 * Se conserva la firma para no tocar workspace-store. [018A-92]
 */
export function withLocalPrototypeNodes(tree: WorkspaceTree): WorkspaceTree {
  return tree;
}
