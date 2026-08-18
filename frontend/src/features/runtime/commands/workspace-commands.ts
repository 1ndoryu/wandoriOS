/* wandori.us — Workspace Commands
 * Comandos de workspace: trash, restore, reset, publish, clipboard, create-folder.
 * [018A-90] Los comandos de gestión de nodos (abrir/renombrar/eliminar) viven
 * en workspace-node-commands.ts para mantener este archivo bajo el límite de
 * líneas; este módulo conserva el helper resolveWorkspaceNodeId compartido. */

import { Folder } from 'lucide';
import { CommandRegistry, type CommandContext, type CommandResult } from '../command-registry';
import {
  restoreNode,
  resetOverlay,
  overlayStore,
  workspaceStore,
  publishWorkspace,
  rollbackWorkspace,
  previewPublicStore,
  setClipboard,
  getClipboard,
  pasteFromClipboard,
  createFolder,
} from '../workspace/workspace-store';
import { getDiffSummary } from '../workspace/diff';
import { showConfirm } from '../../../components/ui/confirm';
import { showPrompt } from '../../../components/ui/prompt';
import { showToast } from '../../../components/ui/toast';
import { getSelectedIds } from '../selection-store';

/* [018A-90] Exportado para que workspace-node-commands.ts lo reutilice. */
export function resolveWorkspaceNodeId(targetId: string): string | undefined {
  const ws = workspaceStore.get();
  const node = Object.values(ws.nodes).find(
    (n) => n.id === targetId || n.refId === targetId,
  );
  return node?.id;
}

/* === Trash / Restore / Reset === */

CommandRegistry.register({
  id: 'workspace:restore',
  label: 'Restaurar',
  order: 31,
  contexts: ['trash'],
  undoPolicy: 'none',
  analyticsEvent: 'workspace.restore',
  isAvailable: (ctx) => {
    const nodeId = ctx.targets?.[0]?.id;
    if (!nodeId) return { state: 'hidden', reason: 'no target' };
    return { state: 'enabled' };
  },
  execute: (ctx?: CommandContext): CommandResult => {
    const nodeId = ctx?.targets?.[0]?.id;
    if (!nodeId) return { status: 'failure', reason: 'no target' };
    restoreNode(nodeId);
    return { status: 'success' };
  },
});

CommandRegistry.register({
  id: 'workspace:reset',
  label: 'Restablecer escritorio',
  order: 32,
  contexts: ['desktop'],
  undoPolicy: 'none',
  analyticsEvent: 'workspace.reset',
  isAvailable: () => ({ state: 'enabled' }),
  execute: (): CommandResult => {
    resetOverlay();
    return { status: 'success' };
  },
});

CommandRegistry.register({
  id: 'workspace:publish',
  label: 'Publicar escritorio',
  order: 33,
  contexts: ['desktop'],
  requires: 'admin',
  undoPolicy: 'none',
  analyticsEvent: 'workspace.published',
  isAvailable: (ctx) => {
    if (ctx.capability !== 'admin') return { state: 'hidden' };
    return { state: 'enabled' };
  },
  execute: async (): Promise<CommandResult> => {
    const overlay = overlayStore.get();
    const diff = getDiffSummary(overlay);

    if (diff.isEmpty) {
      showToast('Sin cambios pendientes para publicar');
      return { status: 'success' };
    }

    const confirmed = await showConfirm(`¿Publicar escritorio? ${diff.text}`);
    if (!confirmed) return { status: 'cancelled' };

    const result = await publishWorkspace();
    if (result) {
      showToast(`Escritorio publicado (v${result.version})`);
      return { status: 'success' };
    }
    return { status: 'failure', reason: 'Error al publicar' };
  },
});

CommandRegistry.register({
  id: 'workspace:rollback',
  label: 'Restaurar versión anterior',
  order: 34,
  contexts: ['desktop'],
  requires: 'admin',
  undoPolicy: 'none',
  analyticsEvent: 'workspace.rollback',
  isAvailable: (ctx) => {
    if (ctx.capability !== 'admin') return { state: 'hidden' };
    return { state: 'enabled' };
  },
  execute: async (): Promise<CommandResult> => {
    /* [018A-90] showPrompt en vez de window.prompt: el navegador integrado no
     * soporta prompt() y el diálogo propio mantiene la estética B&W del OS. */
    const versionStr = await showPrompt('Número de versión a restaurar:');
    if (versionStr === null) return { status: 'cancelled' };
    const version = Number(versionStr);
    if (isNaN(version) || version < 1) return { status: 'failure', reason: 'version inválida' };

    const confirmed = await showConfirm(`¿Restaurar escritorio a versión ${version}?`);
    if (!confirmed) return { status: 'cancelled' };

    const ok = await rollbackWorkspace(version);
    return ok ? { status: 'success' } : { status: 'failure', reason: 'rollback falló' };
  },
});

/* === Clipboard === */

CommandRegistry.register({
  id: 'workspace:copy',
  label: 'Copiar',
  shortcut: 'ctrl+c',
  order: 40,
  /* [018A-90] Copiar/cortar disponibles también para carpetas dentro del Finder. */
  contexts: ['icon', 'folder'],
  undoPolicy: 'none',
  analyticsEvent: 'workspace.copy',
  isAvailable: (ctx) => {
    if (ctx.targets?.length) return { state: 'enabled' };
    if (getSelectedIds().length > 0) return { state: 'enabled' };
    return { state: 'hidden', reason: 'no target' };
  },
  execute: (ctx?: CommandContext): CommandResult => {
    /* Usar targets del contexto o selección actual del escritorio */
    const targetIds = ctx?.targets?.length
      ? ctx.targets.map(t => resolveWorkspaceNodeId(t.id)).filter(Boolean) as string[]
      : getSelectedIds().filter(id => resolveWorkspaceNodeId(id));
    if (targetIds.length === 0) return { status: 'failure', reason: 'no target' };
    setClipboard(targetIds, 'copy');
    return { status: 'success' };
  },
});

CommandRegistry.register({
  id: 'workspace:cut',
  label: 'Cortar',
  shortcut: 'ctrl+x',
  order: 41,
  /* [018A-90] Copiar/cortar disponibles también para carpetas dentro del Finder. */
  contexts: ['icon', 'folder'],
  undoPolicy: 'none',
  analyticsEvent: 'workspace.cut',
  isAvailable: (ctx) => {
    if (ctx.targets?.length) return { state: 'enabled' };
    if (getSelectedIds().length > 0) return { state: 'enabled' };
    return { state: 'hidden', reason: 'no target' };
  },
  execute: (ctx?: CommandContext): CommandResult => {
    /* Usar targets del contexto o selección actual del escritorio */
    const targetIds = ctx?.targets?.length
      ? ctx.targets.map(t => resolveWorkspaceNodeId(t.id)).filter(Boolean) as string[]
      : getSelectedIds().filter(id => resolveWorkspaceNodeId(id));
    if (targetIds.length === 0) return { status: 'failure', reason: 'no target' };
    setClipboard(targetIds, 'cut');
    return { status: 'success' };
  },
});

CommandRegistry.register({
  id: 'workspace:paste',
  label: 'Pegar',
  shortcut: 'ctrl+v',
  order: 42,
  /* [018A-88] El fondo de carpeta del Finder (contexto 'finder') también
   * permite pegar desde el portapapeles del workspace. */
  contexts: ['desktop', 'folder', 'icon', 'finder'],
  undoPolicy: 'none',
  analyticsEvent: 'workspace.paste',
  isAvailable: () => {
    const clip = getClipboard();
    if (!clip || clip.nodeIds.length === 0) return { state: 'disabled', reason: 'clipboard vacío' };
    return { state: 'enabled' };
  },
  execute: (ctx?: CommandContext): CommandResult => {
    const targetId = ctx?.targets?.[0]?.id;
    let parentId: string = 'desktop';
    if (targetId) {
      const ws = workspaceStore.get();
      const nodeId = resolveWorkspaceNodeId(targetId);
      if (nodeId && ws.nodes[nodeId]?.type === 'folder') {
        parentId = nodeId;
      }
    }
    const pasted = pasteFromClipboard(parentId);
    if (pasted.length === 0) return { status: 'failure', reason: 'no se pudo pegar (ciclo o destino inválido)' };
    return { status: 'success' };
  },
});

CommandRegistry.register({
  id: 'workspace:preview-public',
  label: 'Vista pública',
  order: 35,
  contexts: ['desktop'],
  requires: 'admin',
  undoPolicy: 'none',
  analyticsEvent: 'workspace.preview_public',
  isAvailable: (ctx) => {
    if (ctx.capability !== 'admin') return { state: 'hidden' };
    return { state: 'enabled' };
  },
  execute: (): CommandResult => {
    const current = previewPublicStore.get();
    previewPublicStore.set(!current);
    showToast(current ? 'Vista personal restaurada' : 'Viendo como visitante');
    return { status: 'success' };
  },
});

CommandRegistry.register({
  id: 'workspace:create-folder',
  label: 'Nueva carpeta',
  icon: Folder,
  order: 43,
  /* [018A-90] Único comando de creación de carpetas: consolida el duplicado
   * finder:new-folder (retirado). Cubre escritorio, iconos, fondo de carpeta
   * del Finder y el toolbar del Finder. El menú sobre una carpeta ('folder')
   * ya NO ofrece creación: solo acciones sobre la carpeta. */
  contexts: ['desktop', 'icon', 'finder', 'toolbar'],
  undoPolicy: 'none',
  analyticsEvent: 'workspace.create_folder',
  isAvailable: () => ({ state: 'enabled' }),
  execute: (ctx?: CommandContext): CommandResult => {
    const targetId = ctx?.targets?.[0]?.id;
    let parentId: string = 'desktop';
    if (targetId) {
      const ws = workspaceStore.get();
      const nodeId = resolveWorkspaceNodeId(targetId);
      if (nodeId && ws.nodes[nodeId]?.type === 'folder') {
        parentId = nodeId;
      }
    }
    createFolder(parentId, 'Nueva carpeta');
    return { status: 'success' };
  },
});
