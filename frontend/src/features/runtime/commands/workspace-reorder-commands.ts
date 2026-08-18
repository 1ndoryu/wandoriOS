/* wandori.us — Workspace Mobile Grid Commands
 * Alternativa accesible al drag del launcher. Opera sobre celdas móviles,
 * no sobre un swap de mobileOrder ni sobre la posición desktop. */

import { ArrowDown, ArrowUp } from 'lucide';
import { CommandRegistry, type CommandContext, type CommandResult } from '../command-registry';
import { getChildren, moveMobileNodesPosition, workspaceStore } from '../workspace/workspace-store';
import { mobilePositionOf, planMobilePlacement, sortMobileNodes } from '../workspace/mobile-grid';

function resolveTargetNode(ctx?: CommandContext): ReturnType<typeof getChildren>[number] | undefined {
  const targetId = ctx?.targets?.[0]?.id;
  if (!targetId) return undefined;
  const ws = workspaceStore.get();
  return Object.values(ws.nodes).find((node) => node.id === targetId || node.refId === targetId);
}

function mobileColumns(): number {
  return window.innerWidth <= 480 ? 2 : 3;
}

function moveMobileTarget(ctx: CommandContext | undefined, direction: -1 | 1): CommandResult {
  const node = resolveTargetNode(ctx);
  if (!node) return { status: 'failure', reason: 'node not found' };
  const siblings = sortMobileNodes(getChildren('desktop'), mobileColumns());
  const currentIndex = siblings.findIndex((sibling) => sibling.id === node.id);
  const targetIndex = currentIndex + direction;
  if (currentIndex < 0 || targetIndex < 0 || targetIndex >= siblings.length) {
    return { status: 'failure', reason: 'already at boundary' };
  }
  const target = mobilePositionOf(siblings[targetIndex], mobileColumns());
  const plan = planMobilePlacement(siblings, node.id, target, mobileColumns());
  moveMobileNodesPosition(plan.moves);
  return { status: 'success' };
}

function mobileAvailability(ctx: CommandContext | undefined, direction: -1 | 1) {
  if (ctx?.presentationMode !== 'mobile') return { state: 'hidden' as const };
  const node = resolveTargetNode(ctx);
  if (!node) return { state: 'hidden' as const };
  const siblings = sortMobileNodes(getChildren('desktop'), mobileColumns());
  const index = siblings.findIndex((sibling) => sibling.id === node.id);
  const available = index >= 0 && index + direction >= 0 && index + direction < siblings.length;
  return available
    ? { state: 'enabled' as const }
    : { state: 'disabled' as const, reason: direction < 0 ? 'ya está arriba' : 'ya está abajo' };
}

CommandRegistry.register({
  id: 'workspace:move-up',
  label: 'Mover a celda anterior',
  icon: ArrowUp,
  order: 44,
  contexts: ['icon'],
  undoPolicy: 'local',
  analyticsEvent: 'workspace.move_up',
  isAvailable: (ctx) => mobileAvailability(ctx, -1),
  execute: (ctx) => moveMobileTarget(ctx, -1),
});

CommandRegistry.register({
  id: 'workspace:move-down',
  label: 'Mover a celda siguiente',
  icon: ArrowDown,
  order: 45,
  contexts: ['icon'],
  undoPolicy: 'local',
  analyticsEvent: 'workspace.move_down',
  isAvailable: (ctx) => mobileAvailability(ctx, 1),
  execute: (ctx) => moveMobileTarget(ctx, 1),
});
