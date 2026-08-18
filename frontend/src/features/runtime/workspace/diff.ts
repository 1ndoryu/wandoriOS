/* wandori.us — Workspace Diff
 * Resumen puro de los cambios pendientes en el overlay del workspace.
 * [297A-11] Draft/release/preview — el overlay ES el draft.
 * No accede al DOM ni al store directamente; recibe el overlay como parámetro. */

import type { WorkspaceOverlay } from './types';

export interface DiffSummary {
  readonly added: number;
  readonly modified: number;
  readonly removed: number;
  readonly isEmpty: boolean;
  readonly text: string;
}

/** Generar resumen de cambios pendientes en el overlay. */
export function getDiffSummary(overlay: WorkspaceOverlay): DiffSummary {
  const added = Object.keys(overlay.addedItems).length;
  const modified = Object.keys(overlay.fieldOverrides).length;
  const removed = overlay.tombstones.length;
  const isEmpty = added === 0 && modified === 0 && removed === 0;

  if (isEmpty) {
    return { added: 0, modified: 0, removed: 0, isEmpty: true, text: 'Sin cambios pendientes.' };
  }

  const parts: string[] = [];
  if (added > 0) parts.push(`${added} nuevo${added > 1 ? 's' : ''}`);
  if (modified > 0) parts.push(`${modified} modificado${modified > 1 ? 's' : ''}`);
  if (removed > 0) parts.push(`${removed} eliminado${removed > 1 ? 's' : ''}`);

  return {
    added,
    modified,
    removed,
    isEmpty: false,
    text: `Cambios pendientes: ${parts.join(', ')}.`,
  };
}
