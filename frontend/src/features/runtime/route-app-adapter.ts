/* wandori.us — Route App Adapter
 * Conecta el router existente con el AppRegistry y WindowManager.
 * Registra un interceptor de rutas: cuando el router navega a una ruta
 * que una app maneja, el adapter abre una ventana y evita que el router
 * renderice en el outlet. Esto elimina el doble rendering. */

import { onNavigate, setRouteInterceptor, pushPath, showRouteNotFound, type RouteParams } from '../../router';
import { AppRegistry } from './app-registry';
import {
  openWindow,
  focusWindow,
  restoreWindow,
  toggleMaximizeWindow,
  windowStore,
} from './window-manager';
import { canOpenApp, findExistingWindow, validateRouteAccess } from './app-instances';
import {
  clearRuntimePresentation,
  isMobilePresentationReady,
  openInMobileIfActive,
} from './runtime-presentation';
import { dispatchEvent } from '../analytics/dispatcher';
import { authStore } from '../../store';
import { getCanonicalAppPath, type AppOpenHistory } from './deep-links';

/* Re-export legacy API; the implementation lives in the presentation boundary. */
export { setMobileOpenHandler } from './runtime-presentation';

function reconcileRuntimeForRoute(pathname: string): void {
  if (AppRegistry.findByRoute(pathname)) return;
  clearRuntimePresentation();
}

export interface RouteAppAdapterOptions {
  /**
   * El shell restaura ventanas antes de inicializar el router. La ruta raíz
   * representa el escritorio y no debe cerrar esas ventanas en ese primer
   * reconcile; las navegaciones posteriores conservan el comportamiento
   * normal de limpiar runtime al volver a una ruta documental. [317A-5]
   */
  readonly preserveRootOnInit?: boolean;
}

/** Registrar el interceptor de rutas en el router.
 * Llamar una vez desde main.ts. */
export function initRouteAppAdapter(options: RouteAppAdapterOptions = {}): () => void {
  let preserveRootOnInit = options.preserveRootOnInit === true;
  const stopRouteReconciliation = onNavigate((pathname) => {
    if (preserveRootOnInit && pathname === '/') {
      preserveRootOnInit = false;
      return;
    }
    reconcileRuntimeForRoute(pathname);
  });
  const stopInterceptor = setRouteInterceptor(async (pathname: string, params: RouteParams): Promise<boolean> => {
    const app = AppRegistry.findByRoute(pathname);
    if (!app) return false; /* No es ruta de app → router renderiza normalmente */

    /* Si el shell móvil todavía no está listo, dejar que el router renderice
     * la ruta normal; nunca interceptar y dejar un outlet vacío. */
    if (!isMobilePresentationReady()) return false;

    /* Validar parámetros y capacidad antes de hidratar la app. */
    const access = validateRouteAccess(app, params, authStore.get().capability);
    if (!access.allowed || !access.params) {
      clearRuntimePresentation();
      showRouteNotFound();
      return true;
    }

    /* [297A-19] Solo una ruta válida y autorizada llega a esta medición. El
     * nombre es el primer segmento público; no se envían parámetros, IDs
     * internos ni la URL completa. El foco se mide en window-url-sync, que
     * también cubre clicks, taskbar, teclado y móvil sin duplicar eventos. */
    dispatchEvent({
      type: 'deep_link_opened',
      routeName: pathname.split('/').filter(Boolean)[0] ?? 'root',
      appId: app.id,
    });

    /* Una instancia existente se enfoca; no se duplica. */
    const existing = findExistingWindow(windowStore.get(), app, access.params);
    if (existing) {
      if (existing.state === 'minimized') restoreWindow(existing.instanceId);
      focusWindow(existing.instanceId);
      return true; /* Interceptor manejó la ruta */
    }

    /* Abrir la app con los parámetros de la ruta; el adapter elige
     * ventana desktop o pila móvil según la presentación activa. */
    await openAppWindow(app.id, access.params, { history: 'none' });
    return true; /* Interceptor manejó la ruta */
  });

  return () => {
    stopInterceptor();
    stopRouteReconciliation();
  };
}

/** Abrir ventana para una app por ID, con parámetros opcionales de instancia. */
export async function openAppWindow(
  appId: string,
  params?: Record<string, string>,
  options: { history?: AppOpenHistory } = {},
): Promise<void> {
  const app = AppRegistry.get(appId);
  if (!app) return;

  /* La apertura programática también es una frontera de autorización:
   * no depende de que la llamada venga del router o de un comando visible. */
  const capability = authStore.get().capability;
  if (!canOpenApp(app, capability)) return;

  /* Resolver singleton o instancia parametrizada antes de montar contenido. */
  const existing = findExistingWindow(windowStore.get(), app, params);
  if (existing) {
    if (existing.state === 'minimized') restoreWindow(existing.instanceId);
    focusWindow(existing.instanceId);
    return;
  }

  /* La presentación decide el chrome; la app y sus parámetros siguen siendo los mismos. */
  if (await openInMobileIfActive(appId, params, options)) return;

  /* Crear AbortController y RenderContext */
  const controller = new AbortController();
  const ctx = { signal: controller.signal, params };

  /* Instanciar contenido de la app */
  const view = await AppRegistry.instantiate(appId, ctx);
  if (!view) return;

  /* Para Finder non-singleton, usar el nombre de la carpeta como título de ventana */
  let titleOverride: string | undefined;
  if (appId === 'finder' && params?.folderId) {
    const { workspaceStore } = await import('./workspace/workspace-store');
    const ws = workspaceStore.get();
    const folderNode = ws.nodes[params.folderId];
    /* [018A-87] Fallback genérico: ya no existe la carpeta "Galería". */
    titleOverride = folderNode?.label ?? (params.folderId === 'desktop' ? 'Escritorio' : params.folderId);
  }

  const canonicalPath = getCanonicalAppPath(app, params);
  /* Push antes de publicar el cambio en windowStore: el sincronizador verá
   * la URL ya actualizada y no podrá reemplazar la entrada intencional. */
  if (options.history !== 'none' && canonicalPath) pushPath(canonicalPath);
  /* [GAME-01-VIS] Apertura expandida: la app declara openMaximized y la
   * ventana nace maximizada (bounds = workspace + preMaximizeBounds para
   * poder restaurar). Solo aplica a la apertura, no al foco de una ya abierta. */
  const instanceId = openWindow(app, view, controller, undefined, params, titleOverride);
  if (app.openMaximized) toggleMaximizeWindow(instanceId);
  dispatchEvent({ type: 'app_opened', appId });
}
