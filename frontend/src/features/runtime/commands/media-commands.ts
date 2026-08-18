/* wandori.us — Comandos de la Biblioteca de media
 * [018A-71] Comandos 'media:*' para el filtro de tipo y la vista
 * biblioteca/papelera. Viven en el app toolbar REAL de la ventana (grupo
 * "Ver" declarado en app-registration-admin), no en el body.
 *
 * Patrón profile:settings: el CommandRegistry es singleton global y el
 * estado vive en la vista montada; media-library registra el puente con
 * setMediaViewHandler al montar y lo limpia (null) al destruir. Fail-closed:
 * sin puente => failure.
 *
 * isActive alimenta el checkmark del item activo (patrón de menú de OS):
 * createAppToolbar muestra Check cuando isActive es true. */

import { FolderOpen, Image as ImageIcon, LayoutList, Music, Trash2, Video } from 'lucide';
import type { IconNode } from 'lucide';
import { CommandRegistry, type CommandResult } from '../command-registry';

export type MediaFilter = 'all' | 'image' | 'audio' | 'video';

export interface MediaViewState {
  readonly filter: MediaFilter;
  readonly trashView: boolean;
}

/** Puente que la vista montada expone a los comandos (fail-closed). */
export interface MediaViewBridge {
  readonly state: () => MediaViewState;
  readonly setFilter: (filter: MediaFilter) => void;
  readonly setTrashView: (trashView: boolean) => void;
}

let bridge: MediaViewBridge | null = null;

/** Registrar (o limpiar con null) el puente de la vista de media. */
export function setMediaViewHandler(fn: MediaViewBridge | null): void {
  bridge = fn;
}

function registerFilterCommand(
  id: string,
  label: string,
  icon: IconNode,
  order: number,
  filter: MediaFilter,
): void {
  CommandRegistry.register({
    id,
    label,
    icon,
    order,
    contexts: ['toolbar'],
    undoPolicy: 'none',
    analyticsEvent: 'media.filter',
    isActive: (): boolean => bridge?.state().filter === filter,
    execute: (): CommandResult => {
      if (!bridge) return { status: 'failure', reason: 'biblioteca de media no disponible' };
      bridge.setFilter(filter);
      return { status: 'success' };
    },
  });
}

registerFilterCommand('media:filter-all', 'todos', LayoutList, 10, 'all');
registerFilterCommand('media:filter-image', 'imágenes', ImageIcon, 11, 'image');
registerFilterCommand('media:filter-audio', 'audio', Music, 12, 'audio');
registerFilterCommand('media:filter-video', 'video', Video, 13, 'video');

function registerViewCommand(
  id: string,
  label: string,
  icon: IconNode,
  order: number,
  trashView: boolean,
): void {
  CommandRegistry.register({
    id,
    label,
    icon,
    order,
    contexts: ['toolbar'],
    undoPolicy: 'none',
    analyticsEvent: 'media.view',
    isActive: (): boolean => bridge?.state().trashView === trashView,
    execute: (): CommandResult => {
      if (!bridge) return { status: 'failure', reason: 'biblioteca de media no disponible' };
      bridge.setTrashView(trashView);
      return { status: 'success' };
    },
  });
}

registerViewCommand('media:view-library', 'biblioteca', FolderOpen, 20, false);
registerViewCommand('media:view-trash', 'papelera', Trash2, 21, true);
