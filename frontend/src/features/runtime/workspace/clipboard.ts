/* wandori.us — Workspace Clipboard
 * Clipboard in-memory para copiar/pegar nodos del workspace. */

import type { NodeId, ResolvedNode } from './types';
import { workspaceStore } from './workspace-store';
import { moveNodeToParent, addOverlayNode } from './overlay-mutations';

export type ClipboardMode = 'copy' | 'cut';

export interface ClipboardEntry {
  nodeIds: NodeId[];
  mode: ClipboardMode;
}

let clipboard: ClipboardEntry | null = null;

export function getClipboard(): ClipboardEntry | null {
  return clipboard;
}

export function setClipboard(nodeIds: NodeId[], mode: ClipboardMode): void {
  clipboard = { nodeIds, mode };
}

export function clearClipboard(): void {
  clipboard = null;
}

export function wouldCreateCycle(
  nodes: Readonly<Record<NodeId, ResolvedNode>>,
  nodeId: NodeId,
  newParentId: NodeId | 'desktop' | null,
): boolean {
  if (newParentId === 'desktop' || newParentId === null) return false;
  if (newParentId === nodeId) return true;
  let current: NodeId | 'desktop' | null = newParentId;
  const visited = new Set<NodeId>();
  while (current && current !== 'desktop') {
    if (current === nodeId) return true;
    if (visited.has(current)) return true;
    visited.add(current);
    current = nodes[current]?.parentId ?? null;
  }
  return false;
}

let copyCounter = 0;

export function pasteFromClipboard(targetParentId: NodeId | 'desktop'): NodeId[] {
  if (!clipboard) return [];
  const ws = workspaceStore.get();
  const pastedIds: NodeId[] = [];

  if (clipboard.mode === 'cut') {
    const idsToMove = clipboard.nodeIds.filter((id) => ws.nodes[id]);
    for (const id of idsToMove) {
      if (wouldCreateCycle(ws.nodes, id, targetParentId)) return [];
    }
    for (const id of idsToMove) {
      moveNodeToParent(id, targetParentId);
    }
    pastedIds.push(...idsToMove);
    clipboard = null;
  } else {
    for (const id of clipboard.nodeIds) {
      const original = ws.nodes[id];
      if (!original) continue;
      const newId = `${id}-copy-${++copyCounter}`;
      addOverlayNode({
        id: newId,
        parentId: targetParentId,
        type: original.type,
        label: `${original.label} (copia)`,
        refId: original.refId,
        resourceKind: original.resourceKind,
        publicLocator: original.publicLocator,
        position: original.position,
        mobilePosition: original.mobilePosition,
        mobileOrder: original.mobileOrder,
        requires: original.requires,
      });
      pastedIds.push(newId);
    }
  }

  return pastedIds;
}
