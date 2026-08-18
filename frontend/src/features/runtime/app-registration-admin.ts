/* wandori.us — Registro de apps administrativas
 * [018A-41] Separado del catálogo público para que cada módulo de registro
 * tenga una responsabilidad acotada. Este archivo solo declara apps y delega
 * el contenido a sus vistas lazy; el shell sigue siendo el único chrome. */

import { BarChart3, FileText, FolderCode, Settings, ShieldUser, ShoppingBag, FolderOpen } from 'lucide';
import { createEl } from '../../utils/dom';
import { AppRegistry } from './app-registry';
import { createPathDeepLink } from './deep-links';
import { dispatchEvent } from '../analytics/dispatcher';
import type { MountedView, RenderContext } from '../../core/lifecycle';

/* === Settings === */
AppRegistry.registerLazy({
  id: 'settings',
  title: 'Configuración',
  icon: Settings,
  iconType: 'application',
  singleton: true,
  requires: 'admin',
  load: () => import('../settings/settings-panel').then(m => ({
    render: (_ctx: RenderContext): MountedView => {
      dispatchEvent({ type: 'app_opened', appId: 'settings' });
      return {
        element: m.createSettingsPanel(),
        destroy: () => { dispatchEvent({ type: 'app_closed', appId: 'settings' }); },
      };
    },
  })),
});

/* === Estadísticas === */
AppRegistry.registerLazy({
  id: 'analytics',
  title: 'Estadísticas',
  icon: BarChart3,
  iconType: 'application',
  singleton: true,
  requires: 'admin',
  routePatterns: ['/analytics'],
  deepLink: createPathDeepLink('/analytics'),
  layout: 'padded',
  load: () => import('../analytics/analytics-panel').then(m => ({
    render: (ctx: RenderContext): MountedView => {
      dispatchEvent({ type: 'app_opened', appId: 'analytics' });
      const view = m.createAnalyticsPanel(ctx.signal);
      return {
        element: view.element,
        destroy: () => { view.destroy(); dispatchEvent({ type: 'app_closed', appId: 'analytics' }); },
      };
    },
  })),
});

/* === Admin === */
AppRegistry.registerLazy({
  id: 'admin',
  title: 'Admin',
  icon: ShieldUser,
  iconType: 'application',
  singleton: true,
  requires: 'admin',
  /* [018A-26] Admin es una aplicación interna del OS: no conserva una ruta
   * pública paralela. El shell la abre por AppRegistry y aplica la capacidad
   * admin en la frontera de openAppWindow. */
  load: () => import('../../pages/admin').then(m => ({
    render: (ctx: RenderContext): MountedView => {
      dispatchEvent({ type: 'app_opened', appId: 'admin' });
      /* [317A-2] Contenedor con fill-height: los estados vacios centrados ocupan toda la ventana. */
      const container = createEl('div', { className: 'app-contenedor' });
      let adminPage: HTMLElement | null = null;
      let disposed = false;

      /* [018A-1] createAdminWindowView devuelve la página (async) y la
       * franja de acciones (síncrona) que el shell coloca debajo del body. */
      const { page, actions } = m.createAdminWindowView();
      void page
        .then(el => {
          if (disposed || ctx.signal.aborted) {
            m.disposeAdminPage(el);
            return;
          }
          adminPage = el;
          container.appendChild(el);
        })
        .catch(() => {
          if (!disposed && !ctx.signal.aborted) {
            container.textContent = 'Error al cargar Admin.';
          }
        });

      return {
        element: container,
        actions,
        destroy: () => {
          disposed = true;
          if (adminPage) m.disposeAdminPage(adminPage);
          dispatchEvent({ type: 'app_closed', appId: 'admin' });
        },
      };
    },
  })),
});

/* === Article Editor — programa editorial admin === */
AppRegistry.registerLazy({
  id: 'article-editor',
  title: 'Editor de artículos',
  icon: FileText,
  iconType: 'document',
  singleton: false,
  requires: 'admin',
  layout: 'padded',
  load: () => import('../desktop/apps/article-editor/article-editor').then(m => ({
    render: (ctx: RenderContext): MountedView => m.renderArticleEditor(ctx),
  })),
});

/* === Project Editor — programa editorial admin === */
AppRegistry.registerLazy({
  id: 'project-editor',
  title: 'Editor de proyectos',
  icon: FolderCode,
  iconType: 'folder',
  singleton: false,
  requires: 'admin',
  layout: 'padded',
  load: () => import('../desktop/apps/project-editor/project-editor').then(m => ({
    render: (ctx: RenderContext): MountedView => m.renderProjectEditor(ctx),
  })),
});

/* === Product Editor — programa editorial admin === */
AppRegistry.registerLazy({
  id: 'product-editor',
  title: 'Editor de productos',
  icon: ShoppingBag,
  iconType: 'application',
  singleton: false,
  requires: 'admin',
  layout: 'padded',
  load: () => import('../desktop/apps/product-editor/product-editor').then(m => ({
    render: (ctx: RenderContext): MountedView => m.renderProductEditor(ctx),
  })),
});

/* === Media Library — biblioteca de media admin === */
AppRegistry.registerLazy({
  id: 'media-library',
  title: 'Biblioteca de media',
  icon: FolderOpen,
  iconType: 'folder',
  singleton: true,
  requires: 'admin',
  layout: 'padded',
  /* [018A-71] Grupo "Ver" en el app toolbar REAL de la ventana: filtro de
   * tipo y vista biblioteca/papelera separados con un separador, checkmark
   * del activo vía isActive de los comandos media:*. */
  toolbar: [
    {
      label: 'Ver',
      items: [
        'media:filter-all',
        'media:filter-image',
        'media:filter-audio',
        'media:filter-video',
        '---',
        'media:view-library',
        'media:view-trash',
      ],
    },
  ],
  load: () => import('../desktop/apps/media-library/media-library').then(m => ({
    render: (ctx: RenderContext): MountedView => {
      dispatchEvent({ type: 'app_opened', appId: 'media-library' });
      const view = m.createMediaLibraryPreview({ signal: ctx.signal });
      /* [018A-1 F3] La franja de acciones (subir archivo) viaja en
       * MountedView.actions; el shell la coloca igual en desktop y móvil. */
      return {
        element: view.element,
        actions: view.actions,
        destroy: () => {
          view.destroy();
          dispatchEvent({ type: 'app_closed', appId: 'media-library' });
        },
      };
    },
  })),
});
