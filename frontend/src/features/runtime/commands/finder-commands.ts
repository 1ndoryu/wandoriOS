/* wandori.us — Finder Commands
 * [018A-88] Comandos de creación accesibles desde el menú contextual del
 * Finder (fondo de carpeta y sobre carpetas). Registran exclusivamente
 * acciones de creación; las acciones sobre recursos ya viven en
 * resource-commands (editar/publicar/propiedades) y el clipboard en
 * workspace-commands.
 *
 * Capacidades: crear contenido y subir media son acciones de admin
 * (adminOnly). Para usuarios public los comandos se ocultan solos vía
 * isAvailable del wrapper, sin if/else en la superficie. */

import { FileText, Store, Upload } from 'lucide';
import { CommandRegistry, adminOnly, type CommandResult } from '../command-registry';
import { showToast } from '../../../components/ui/toast';

/* === article:new — abrir el editor de artículos en modo creación === */

CommandRegistry.register(adminOnly({
  id: 'article:new',
  label: 'Nuevo artículo',
  icon: FileText,
  order: 54,
  /* [018A-90] La creación vive en el fondo del Finder ('finder'); el menú
   * sobre una carpeta ('folder') queda reservado a acciones sobre la carpeta. */
  contexts: ['finder'],
  undoPolicy: 'none',
  analyticsEvent: 'article.new',
  /* [018A-88] openAppWindow('article-editor') sin params abre el editor en
   * modo creación (el editor muestra "crear" cuando no hay articleId). */
  isAvailable: () => ({ state: 'enabled' }),
  execute: async (): Promise<CommandResult> => {
    const { openAppWindow } = await import('../route-app-adapter');
    await openAppWindow('article-editor');
    return { status: 'success' };
  },
}));

/* === product:new — abrir el editor de productos en modo creación === */

CommandRegistry.register(adminOnly({
  id: 'product:new',
  label: 'Nuevo producto',
  icon: Store,
  order: 56,
  /* [018A-90] La creación vive en el fondo del Finder ('finder'); el menú
   * sobre una carpeta ('folder') queda reservado a acciones sobre la carpeta. */
  contexts: ['finder'],
  undoPolicy: 'none',
  analyticsEvent: 'product.new',
  isAvailable: () => ({ state: 'enabled' }),
  execute: async (): Promise<CommandResult> => {
    const { openAppWindow } = await import('../route-app-adapter');
    await openAppWindow('product-editor');
    return { status: 'success' };
  },
}));

/* === media:upload — subir un archivo de media al workspace ===
 * [018A-88] pickAndUpload abre el file picker del SO; tras subir, el nodo
 * aterriza solo en su subcarpeta de Documentos vía media-gallery-sync
 * (comportamiento ya definido en 018A-87). El backend es la autoridad de
 * MIME/límites; MEDIA_ACCEPT es solo el filtro UX (fuente única con la
 * biblioteca de media). Fail-closed: cualquier error de subida devuelve
 * failure con toast visible. */

CommandRegistry.register(adminOnly({
  id: 'media:upload',
  label: 'Subir archivo',
  icon: Upload,
  order: 57,
  /* [018A-90] La creación vive en el fondo del Finder ('finder'); el menú
   * sobre una carpeta ('folder') queda reservado a acciones sobre la carpeta. */
  contexts: ['finder'],
  undoPolicy: 'none',
  analyticsEvent: 'media.upload',
  isAvailable: () => ({ state: 'enabled' }),
  execute: async (): Promise<CommandResult> => {
    const { pickAndUpload } = await import('../../../utils/upload');
    const { MEDIA_ACCEPT } = await import('../../desktop/apps/media-library/media-library-utils');
    try {
      const result = await pickAndUpload(MEDIA_ACCEPT);
      if (!result) return { status: 'cancelled' };
      showToast('archivo subido');
      return { status: 'success' };
    } catch (err) {
      showToast('error al subir el archivo');
      return { status: 'failure', reason: err instanceof Error ? err.message : 'upload falló' };
    }
  },
}));
