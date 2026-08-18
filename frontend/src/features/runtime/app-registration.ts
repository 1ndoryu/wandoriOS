/* wandori.us — App Registration
 * Registra todas las apps del OS en el AppRegistry.
 * Cada app define su id, título, icono, capacidades y render function.
 * Las apps solo devuelven contenido; el shell crea la ventana. */

import { FileUser, Folder, FileText, FolderCode, Trash2, UserRound, Store, ClipboardList, Download, Info } from 'lucide';
import { createEl } from '../../utils/dom';
import { AppRegistry } from './app-registry';
import { createPathDeepLink } from './deep-links';
import { updateWindowInstance, windowStore } from './window-manager';
import { createFinderPreview } from '../desktop/apps/finder/finder-preview';
import { createReaderPreview, type ReaderOptions } from '../desktop/apps/reader/reader-preview';
import { createTrashPreview } from '../desktop/apps/trash/trash-preview';
import { dispatchEvent } from '../analytics/dispatcher';
import type { MountedView, RenderContext } from '../../core/lifecycle';
import { SettingsService } from '../../services';
import { appendSanitizedHtml } from '../../utils/sanitize-html';
import { mountAccountView } from './account-view';
import { createDownloadsView, createOrdersView, createStoreView } from '../commerce/store-view';
import { createPropertiesPreview } from '../desktop/apps/properties/properties-preview';
import { initMediaGallerySync } from './workspace/media-gallery-sync';
import './app-registration-admin';

/* === Finder === */
AppRegistry.register({
  id: 'finder',
  /* [018A-87] La carpeta del workspace ahora es "Documentos", no "Galería". */
  title: 'Documentos',
  icon: Folder,
  iconType: 'folder',
  singleton: false,
  requires: 'public',
  routePatterns: ['/gallery'],
  deepLink: createPathDeepLink('/gallery'),
  layout: 'full-bleed',
  /* [018A-88] El menú Archivo expone la misma creación que el menú
   * contextual del Finder. Los comandos adminOnly se ocultan solos para
   * usuarios public (isAvailable), sin if/else aquí.
   * [018A-90] finder:new-folder se consolidó en workspace:create-folder. */
  toolbar: [
    { label: 'Archivo', items: ['workspace:create-folder', 'article:new', 'projects:new', 'product:new', 'media:upload'] },
  ],
  render: (ctx: RenderContext): MountedView => {
    dispatchEvent({ type: 'app_opened', appId: 'finder' });

    const folderId = ctx.params?.folderId ?? 'desktop';

    const content = createFinderPreview({
      folderId,
      onOpenApp: (appId: string, params?: Record<string, string>) => {
        void import('./route-app-adapter').then(m => m.openAppWindow(appId, params));
      },
      onNavigate: (folderId: string, label: string) => {
        /* [018A-77] La navegación interna del Finder debe propagarse al
         * windowStore (title + params/_paramKey), no solo al DOM. Sin esto la
         * taskbar queda desincronizada y reabrir la carpeta de origen no hace
         * nada: findExistingWindow matchea por _paramKey viejo y solo enfoca
         * una ventana que ya está mostrando otra carpeta. El shell deriva el
         * título de la barra desde el store en su update. */
        const win = windowStore.get().find(w => w.content === content);
        if (win) updateWindowInstance(win.instanceId, { title: label, params: { folderId } });
      },
    });

    return {
      element: content,
      destroy: () => { dispatchEvent({ type: 'app_closed', appId: 'finder' }); },
    };
  },
});

/* === Reader === */
AppRegistry.register({
  id: 'reader',
  title: 'Documento',
  icon: FileText,
  iconType: 'document',
  singleton: false,
  requires: 'public',
  routePatterns: ['/article/:slug'],
  deepLink: createPathDeepLink('/article/:slug', ['slug']),
  layout: 'full-bleed',
  render: (ctx: RenderContext): MountedView => {
    dispatchEvent({ type: 'app_opened', appId: 'reader' });

    /* `slug` es el único identificador público permitido por el deep link.
     * `resourceId` pertenece al workspace y no puede convertirse implícitamente
     * en slug: resolverlo requerirá un envelope público autorizado. */
    const opts: ReaderOptions = {
      slug: ctx.params?.slug,
      title: ctx.params?.title,
    };
    const content = createReaderPreview(opts);

    return {
      element: content,
      destroy: () => { dispatchEvent({ type: 'app_closed', appId: 'reader' }); },
    };
  },
});

/* === Cuenta === */
AppRegistry.register({
  id: 'account',
  title: 'Cuenta',
  icon: UserRound,
  iconType: 'application',
  singleton: true,
  requires: 'public',
  routePatterns: ['/login'],
  deepLink: createPathDeepLink('/login'),
  layout: 'padded',
  render: (ctx: RenderContext): MountedView => {
    dispatchEvent({ type: 'app_opened', appId: 'account' });
    const view = mountAccountView(ctx);
    return {
      element: view.element,
      destroy: () => {
        view.destroy?.();
        dispatchEvent({ type: 'app_closed', appId: 'account' });
      },
    };
  },
});

/* === Comercio === */
for (const commerceApp of [
  { id: 'store', title: 'Tienda', icon: Store, route: '/store', render: () => createStoreView() },
  { id: 'orders', title: 'Pedidos', icon: ClipboardList, route: '/orders', render: () => ({ element: createOrdersView(), destroy: () => {} }) },
  { id: 'downloads', title: 'Descargas', icon: Download, route: '/downloads', render: () => ({ element: createDownloadsView(), destroy: () => {} }) },
] as const) {
  AppRegistry.register({
    id: commerceApp.id,
    title: commerceApp.title,
    icon: commerceApp.icon,
    iconType: 'application',
    singleton: true,
    requires: 'public',
    routePatterns: [commerceApp.route],
    deepLink: createPathDeepLink(commerceApp.route),
    layout: 'padded',
    render: (): MountedView => {
      dispatchEvent({ type: 'app_opened', appId: commerceApp.id });
      const view = commerceApp.render();
      return { element: view.element, destroy: () => { view.destroy(); dispatchEvent({ type: 'app_closed', appId: commerceApp.id }); } };
    },
  });
}

/* === About === */
AppRegistry.register({
  id: 'about',
  title: 'About',
  icon: FileUser,
  iconType: 'document',
  singleton: true,
  requires: 'public',
  routePatterns: ['/about'],
  deepLink: createPathDeepLink('/about'),
  layout: 'full-bleed',
  render: (ctx: RenderContext): MountedView => {
    dispatchEvent({ type: 'app_opened', appId: 'about' });

    const container = createEl('article', { className: 'desktop-about' });

    void (async () => {
      try {
        if (ctx.signal.aborted) return;
        const settings = await SettingsService.getPublic();
        if (ctx.signal.aborted) return;
        const content = settings.about_content || '';
        if (content) {
          appendSanitizedHtml(container, content);
        } else {
          container.appendChild(createEl('p', { textContent: 'Contenido about no configurado.' }));
        }
      } catch {
        container.appendChild(createEl('p', { textContent: 'Error al cargar contenido about.' }));
      }
    })();

    return {
      element: container,
      destroy: () => { dispatchEvent({ type: 'app_closed', appId: 'about' }); },
    };
  },
});

/* === Trash === */
AppRegistry.register({
  id: 'trash',
  title: 'Papelera',
  icon: Trash2,
  iconType: 'application',
  singleton: true,
  requires: 'public',
  toolbar: [
    { label: 'Archivo', items: ['trash:restore-all', '---', 'trash:empty'] },
  ],
  render: (_ctx: RenderContext): MountedView => {
    dispatchEvent({ type: 'app_opened', appId: 'trash' });

    const content = createTrashPreview();

    return {
      element: content,
      destroy: () => { dispatchEvent({ type: 'app_closed', appId: 'trash' }); },
    };
  },
});

/* === Properties === */
AppRegistry.register({
  id: 'properties',
  title: 'Propiedades',
  icon: Info,
  iconType: 'document',
  singleton: false,
  requires: 'public',
  layout: 'padded',
  render: (ctx: RenderContext): MountedView => {
    dispatchEvent({ type: 'app_opened', appId: 'properties' });
    return {
      element: createPropertiesPreview(ctx.params?.nodeId),
      destroy: () => { dispatchEvent({ type: 'app_closed', appId: 'properties' }); },
    };
  },
});

/* === Projects === */
AppRegistry.registerLazy({
  id: 'projects',
  title: 'Proyectos',
  icon: FolderCode,
  iconType: 'folder',
  singleton: true,
  requires: 'public',
  routePatterns: ['/projects'],
  deepLink: createPathDeepLink('/projects'),
  toolbar: [
    { label: 'Archivo', items: ['projects:new'] },
  ],
  load: () => import('../../pages/projects').then(m => ({
    render: (ctx: RenderContext): MountedView => {
      dispatchEvent({ type: 'app_opened', appId: 'projects' });
      /* [317A-2] Contenedor con fill-height: los estados vacios centrados ocupan toda la ventana. */
      const container = createEl('div', { className: 'app-contenedor' });
      void m.renderProjects().then(el => {
        if (!ctx.signal.aborted) container.appendChild(el);
      });
      return {
        element: container,
        destroy: () => { dispatchEvent({ type: 'app_closed', appId: 'projects' }); },
      };
    },
  })),
});

/* [018A-87] Puente media → escritorio: al subir un archivo aterriza como nodo
 * en su subcarpeta de "Documentos" (Imágenes/Audio/Vídeo/Documentos) y el admin
 * lo propaga con "Publicar escritorio". Se inicializa aquí (no en main.ts,
 * que tiene cambios ajenos en curso) porque este módulo se carga siempre con
 * el shell y el registro es idempotente. */
initMediaGallerySync();
