/* wandori.us — Toolbar Commands
 * Comandos referenciados por app toolbars (Papelera, Finder, Projects).
 * [2026-08-18] Se retiraron game:character y game:settings (frente de juego archivado). */

import { adminOnly, CommandRegistry, type CommandResult } from '../command-registry';
import { Folder, Trash2, FolderCode } from 'lucide';

CommandRegistry.register({
  id: 'trash:restore-all',
  label: 'Restaurar todo',
  icon: Folder,
  order: 50,
  contexts: ['toolbar'],
  undoPolicy: 'none',
  analyticsEvent: 'trash.restore_all',
  isAvailable: () => ({ state: 'enabled' }),
  execute: async (): Promise<CommandResult> => {
    const { showConfirm } = await import('../../../components/ui/confirm');
    const ok = await showConfirm('¿Restaurar todos los elementos?');
    if (!ok) return { status: 'cancelled' };
    const { getTombstonedNodes, restoreNode } = await import('../workspace/workspace-store');
    for (const node of getTombstonedNodes()) restoreNode(node.id);
    return { status: 'success' };
  },
});

CommandRegistry.register({
  id: 'trash:empty',
  label: 'Vaciar papelera',
  icon: Trash2,
  order: 51,
  contexts: ['toolbar'],
  undoPolicy: 'none',
  analyticsEvent: 'trash.empty',
  isAvailable: () => ({ state: 'enabled' }),
  execute: async (): Promise<CommandResult> => {
    const { showConfirm } = await import('../../../components/ui/confirm');
    const ok = await showConfirm('¿Vaciar la papelera? Los elementos no se pueden recuperar.');
    if (!ok) return { status: 'cancelled' };
    const { resetOverlay } = await import('../workspace/workspace-store');
    resetOverlay();
    return { status: 'success' };
  },
});

/* [018A-90] finder:new-folder RETIRADO: era un duplicado de
 * workspace:create-folder, que ahora cubre toolbar + finder + icon + desktop.
 * El menú Archivo del Finder referencia workspace:create-folder. */

CommandRegistry.register(adminOnly({
  id: 'projects:new',
  label: 'Nuevo proyecto',
  icon: FolderCode,
  order: 53,
  /* [018A-90] Disponible desde el fondo del Finder; el menú sobre una carpeta
   * ('folder') queda reservado a acciones sobre la carpeta. */
  contexts: ['toolbar', 'finder'],
  undoPolicy: 'none',
  analyticsEvent: 'projects.new',
  /* [018A-26] La creación vive en el programa interno, no en la ruta legacy
   * /admin. adminOnly mantiene el comando fuera de toolbars públicas. */
  isAvailable: () => ({ state: 'enabled' }),
  execute: async (): Promise<CommandResult> => {
    const { openAppWindow } = await import('../route-app-adapter');
    await openAppWindow('project-editor');
    return { status: 'success' };
  },
}));
