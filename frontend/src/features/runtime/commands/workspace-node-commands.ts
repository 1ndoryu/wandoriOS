/* wandori.us — Workspace Node Commands
 * [018A-90] Comandos de gestión de nodos del workspace (abrir, renombrar,
 * eliminar) visibles en el menú contextual de carpetas ('folder') e iconos
 * ('icon'). Se separaron de workspace-commands.ts al superar el límite de
 * líneas del archivo: la gestión sobre una carpeta es un dominio propio. */

import { CommandRegistry, type CommandContext, type CommandResult } from '../command-registry';
import {
  tombstoneNode,
  tombstoneSubtree,
  renameNode,
  workspaceStore,
  isSystemNode,
} from '../workspace/workspace-store';
import { showConfirm } from '../../../components/ui/confirm';
import { showPrompt } from '../../../components/ui/prompt';
import { resolveWorkspaceNodeId } from './workspace-commands';

/* === workspace:open — Abrir carpeta en el Finder ===
 * [018A-90] Si hay una ventana del Finder enfocada, la navega (evento
 * finder:navigate sobre su content, que el preview traduce a navigateTo y
 * sincroniza title/params vía onNavigate); si no, abre una ventana nueva
 * con la carpeta. */

CommandRegistry.register({
  id: 'workspace:open',
  label: 'Abrir',
  order: 20,
  contexts: ['folder'],
  undoPolicy: 'none',
  analyticsEvent: 'workspace.open_folder',
  isAvailable: (ctx) => {
    /* [058A-4] Abrir solo tiene sentido con un target: con multi-selección el
     * comando queda oculto (abrir varias carpetas a la vez no es un gesto
     * del OS). */
    if ((ctx.targets?.length ?? 0) > 1) return { state: 'hidden', reason: 'multi-select' };
    const targetId = ctx.targets?.[0]?.id;
    if (!targetId) return { state: 'hidden', reason: 'no target' };
    const nodeId = resolveWorkspaceNodeId(targetId);
    if (!nodeId) return { state: 'hidden', reason: 'node not found' };
    const ws = workspaceStore.get();
    if (ws.nodes[nodeId]?.type !== 'folder') return { state: 'hidden', reason: 'not a folder' };
    return { state: 'enabled' };
  },
  execute: async (ctx?: CommandContext): Promise<CommandResult> => {
    const targetId = ctx?.targets?.[0]?.id;
    if (!targetId) return { status: 'failure', reason: 'no target' };
    const nodeId = resolveWorkspaceNodeId(targetId);
    if (!nodeId) return { status: 'failure', reason: 'node not found' };
    const ws = workspaceStore.get();
    const node = ws.nodes[nodeId];
    if (!node || node.type !== 'folder') return { status: 'failure', reason: 'not a folder' };

    const { windowStore } = await import('../window-manager');
    const focused = windowStore.get().find((w) => w.focused && w.appId === 'finder');
    if (focused?.content) {
      focused.content.dispatchEvent(new CustomEvent('finder:navigate', { detail: { folderId: nodeId } }));
      return { status: 'success' };
    }
    const { openAppWindow } = await import('../route-app-adapter');
    await openAppWindow('finder', { folderId: nodeId });
    return { status: 'success' };
  },
});

/* === workspace:rename — Renombrar nodo ===
 * [018A-90] Muta fieldOverrides.label vía renameNode. Usa window.prompt
 * (mismo mecanismo que workspace:rollback) por no existir aún un diálogo
 * de entrada con nombre en el sistema de UI. */

CommandRegistry.register({
  id: 'workspace:rename',
  label: 'Renombrar',
  order: 25,
  contexts: ['icon', 'folder'],
  undoPolicy: 'local',
  analyticsEvent: 'workspace.rename',
  isAvailable: (ctx) => {
    /* [058A-4] Renombrar solo tiene sentido con un target (un solo diálogo);
     * con multi-selección queda oculto. */
    if ((ctx.targets?.length ?? 0) > 1) return { state: 'hidden', reason: 'multi-select' };
    const targetId = ctx.targets?.[0]?.id;
    if (!targetId) return { state: 'hidden', reason: 'no target' };
    const nodeId = resolveWorkspaceNodeId(targetId);
    if (!nodeId) return { state: 'hidden', reason: 'node not found in workspace' };
    return { state: 'enabled' };
  },
  execute: async (ctx?: CommandContext): Promise<CommandResult> => {
    const targetId = ctx?.targets?.[0]?.id;
    if (!targetId) return { status: 'failure', reason: 'no target' };
    const nodeId = resolveWorkspaceNodeId(targetId);
    if (!nodeId) return { status: 'failure', reason: 'node not found' };
    const ws = workspaceStore.get();
    const current = ws.nodes[nodeId]?.label ?? '';
    /* [018A-90] showPrompt en vez de window.prompt: el navegador integrado no
     * soporta prompt() y el diálogo propio mantiene la estética B&W del OS. */
    const label = await showPrompt('Nuevo nombre:', current);
    if (label === null) return { status: 'cancelled' };
    const trimmed = label.trim();
    if (!trimmed) return { status: 'failure', reason: 'nombre vacío' };
    if (trimmed === current) return { status: 'success' };
    renameNode(nodeId, trimmed);
    return { status: 'success' };
  },
});

/* === workspace:trash — Eliminar nodo ===
 * [018A-90] El menú contextual del Finder mandaba carpetas al contexto
 * 'folder' (que antes solo exponía acciones de creación), así que eliminar
 * solo existía en 'icon'. Ahora trash/copy/cut cubren ambos contextos.
 * Borrar una carpeta tumba su subárbol completo (tombstoneSubtree) y pide
 * confirmación; el borrado es restaurable desde la papelera (restoreNode
 * en cascada). */

CommandRegistry.register({
  id: 'workspace:trash',
  label: 'Eliminar',
  order: 30,
  contexts: ['icon', 'folder'],
  undoPolicy: 'none',
  analyticsEvent: 'workspace.trash',
  isAvailable: (ctx) => {
    const targets = ctx?.targets ?? [];
    if (targets.length === 0) return { state: 'hidden', reason: 'no target' };
    /* [058A-4] Multi-selección: disponible si TODOS los targets son nodos
     * válidos y ninguno es de sistema. */
    const ws = workspaceStore.get();
    for (const t of targets) {
      const nodeId = resolveWorkspaceNodeId(t.id);
      if (!nodeId || !ws.nodes[nodeId]) return { state: 'hidden', reason: 'node not found in workspace' };
      /* [038A-2] Eliminar un nodo de sistema (Papelera, admin, settings,
       * profile, about) no está disponible: son parte fija del OS. */
      if (isSystemNode(nodeId)) return { state: 'hidden', reason: 'system node' };
    }
    return { state: 'enabled' };
  },
  execute: async (ctx?: CommandContext): Promise<CommandResult> => {
    const targets = ctx?.targets ?? [];
    if (targets.length === 0) return { status: 'failure', reason: 'no target' };
    const ws = workspaceStore.get();
    /* [058A-4] Resolver todos los targets y descartar ids sin nodo. La
     * confirmación es única (una vez para todo el lote); si hay carpetas se
     * tumba su subárbol (tombstoneSubtree), el resto con tombstoneNode. */
    const nodeIds = targets
      .map(t => resolveWorkspaceNodeId(t.id))
      .filter((id): id is string => Boolean(id))
      .filter(id => Boolean(ws.nodes[id]));
    if (nodeIds.length === 0) return { status: 'failure', reason: 'node not found' };
    /* [038A-2] Doble guardia por si algo invoca el comando sin pasar por
     * isAvailable (atajos, programas, integraciones). */
    for (const nodeId of nodeIds) {
      if (isSystemNode(nodeId)) {
        console.warn(`[038A-2] No se puede eliminar el nodo de sistema «${nodeId}»`);
        return { status: 'failure', reason: 'system node' };
      }
    }
    const hasFolder = nodeIds.some(id => ws.nodes[id]?.type === 'folder');
    if (hasFolder) {
      const detail = nodeIds.length > 1
        ? `${nodeIds.length} elementos`
        : `«${ws.nodes[nodeIds[0]]?.label ?? ''}»`;
      const confirmed = await showConfirm(`¿Eliminar ${detail}? Se podrá restaurar desde la papelera.`);
      if (!confirmed) return { status: 'cancelled' };
    }
    for (const nodeId of nodeIds) {
      const node = ws.nodes[nodeId];
      if (node?.type === 'folder') {
        tombstoneSubtree(nodeId);
      } else {
        tombstoneNode(nodeId);
      }
    }
    return { status: 'success' };
  },
});
