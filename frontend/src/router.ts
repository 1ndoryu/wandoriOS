/* wandori.us — SPA Router
 * Routing por History API. Sin recarga de página.
 * Soporta parámetros dinámicos (:slug), guards de autenticación
 * y AbortSignal para lifecycle de vistas. */

import { createVacio } from './components/ui/empty-state';
import type { RenderContext } from './core/lifecycle';
export type { RenderContext };

export type RouteParams = Record<string, string>;

export interface Route {
  path: string;
  render: (params: RouteParams, ctx: RenderContext) => HTMLElement | Promise<HTMLElement>;
  guard?: () => boolean | Promise<boolean>;
}

type NavigationListener = (path: string) => void;
type RouteInterceptor = (pathname: string, params: RouteParams) => boolean | Promise<boolean>;

const routes: Route[] = [];
const listeners: Set<NavigationListener> = new Set();
let currentPath = '';
let outlet: HTMLElement | null = null;
let currentController: AbortController | null = null;
let routeInterceptor: RouteInterceptor | null = null;

/* Marca privada para distinguir entradas creadas por el OS de un deep link
 * externo. No contiene rutas, IDs ni estado de sesión; solo el origen. */
const INTERNAL_HISTORY_KEY = '__wandorius';
const INTERNAL_HISTORY_KIND = 'navigation';

type InternalHistoryMode = 'push' | 'replace';

function createInternalHistoryState(
  mode: InternalHistoryMode,
  createdByPush: boolean,
  baseState: unknown = history.state,
): Record<string, unknown> {
  const preservedState = baseState && typeof baseState === 'object' && !Array.isArray(baseState)
    ? baseState as Record<string, unknown>
    : {};
  return {
    ...preservedState,
    [INTERNAL_HISTORY_KEY]: {
      kind: INTERNAL_HISTORY_KIND,
      mode,
      createdByPush,
    },
  };
}

function getInternalHistoryMarker(state: unknown = history.state): Record<string, unknown> | null {
  if (!state || typeof state !== 'object') return null;
  const marker = (state as Record<string, unknown>)[INTERNAL_HISTORY_KEY];
  if (!marker || typeof marker !== 'object') return null;
  const record = marker as Record<string, unknown>;
  return record.kind === INTERNAL_HISTORY_KIND ? record : null;
}

/** Saber si la entrada actual pertenece a una navegación interna del OS. */
export function isInternalHistoryEntry(state: unknown = history.state): boolean {
  return getInternalHistoryMarker(state) !== null;
}

/** Solo una entrada creada con push puede consumirse con history.back(). */
export function isInternalPushHistoryEntry(state: unknown = history.state): boolean {
  return getInternalHistoryMarker(state)?.createdByPush === true;
}

export function addRoute(route: Route): void {
  routes.push(route);
}

export function setOutlet(el: HTMLElement): void {
  outlet = el;
}

export function navigate(path: string): void {
  if (path === currentPath) return;
  history.pushState(createInternalHistoryState('push', true), '', path);
  handleRoute();
}

/** Actualizar la URL sin volver a resolver la ruta ni crear una entrada. */
export function replacePath(path: string): void {
  if (path === currentPath) return;
  /* Reemplazar la URL conserva el origen de la entrada: un estado interno
   * pasa a mode=replace; un deep link externo conserva state=null. */
  const currentMarker = getInternalHistoryMarker();
  const nextState = currentMarker
    ? createInternalHistoryState('replace', currentMarker.createdByPush === true)
    : history.state;
  history.replaceState(nextState, '', path);
  currentPath = path;
  for (const listener of listeners) listener(currentPath);
}

/** Crear una entrada de historial sin renderizar: el caller ya montó la vista. */
export function pushPath(path: string): void {
  if (path === currentPath) return;
  history.pushState(createInternalHistoryState('push', true), '', path);
  currentPath = path;
  for (const listener of listeners) listener(currentPath);
}

/** Renderizar el fallback seguro de ruta sin ejecutar una app. */
export function showRouteNotFound(): void {
  if (!outlet) return;
  outlet.innerHTML = '';
  outlet.appendChild(createVacio('página no encontrada'));
}

export function getCurrentPath(): string {
  return currentPath;
}

/** Volver a resolver la URL actual después de cambiar el outlet/presentación. */
export function refreshRoute(): Promise<void> {
  return handleRoute();
}

export function setRouteInterceptor(interceptor: RouteInterceptor | null): () => void {
  routeInterceptor = interceptor;
  return () => {
    if (routeInterceptor === interceptor) routeInterceptor = null;
  };
}

export function onNavigate(listener: NavigationListener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function matchRoute(pathname: string): { route: Route; params: RouteParams } | null {
  for (const route of routes) {
    const params = matchPath(route.path, pathname);
    if (params !== null) {
      return { route, params };
    }
  }
  return null;
}

function matchPath(pattern: string, pathname: string): RouteParams | null {
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = pathname.split('/').filter(Boolean);

  if (patternParts.length !== pathParts.length) return null;

  const params: RouteParams = {};
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(':')) {
      try {
        params[patternParts[i].slice(1)] = decodeURIComponent(pathParts[i]);
      } catch {
        return null;
      }
    } else if (patternParts[i] !== pathParts[i]) {
      return null;
    }
  }
  return params;
}

async function handleRoute(): Promise<void> {
  const pathname = window.location.pathname;
  currentPath = pathname;

  if (currentController) {
    currentController.abort();
    currentController = null;
  }

  const matched = matchRoute(pathname);

  if (!matched) {
    /* También notificamos rutas desconocidas: los adaptadores deben poder
     * liberar estado de presentación antes de mostrar el fallback 404. */
    for (const listener of listeners) listener(currentPath);
    showRouteNotFound();
    return;
  }

  if (matched.route.guard) {
    const allowed = await matched.route.guard();
    if (!allowed) {
      navigate('/login');
      return;
    }
  }

  if (routeInterceptor) {
    const handled = await routeInterceptor(pathname, matched.params);
    if (handled) {
      for (const listener of listeners) {
        listener(currentPath);
      }
      return;
    }
  }

  currentController = new AbortController();
  const ctx: RenderContext = { signal: currentController.signal };

  if (outlet) {
    outlet.innerHTML = '';
    const element = await matched.route.render(matched.params, ctx);
    outlet.appendChild(element);
  }

  for (const listener of listeners) {
    listener(currentPath);
  }

  window.scrollTo(0, 0);
}

function handleClick(e: MouseEvent): void {
  const target = e.target as HTMLElement;
  const anchor = target.closest('a');

  if (!anchor) return;
  if (anchor.origin !== window.location.origin) return;
  if (anchor.hasAttribute('data-external')) return;
  if (anchor.target === '_blank') return;

  e.preventDefault();
  navigate(anchor.pathname + anchor.search);
}

export function initRouter(): () => void {
  window.addEventListener('popstate', handleRoute);
  document.addEventListener('click', handleClick);
  handleRoute();
  return () => {
    window.removeEventListener('popstate', handleRoute);
    document.removeEventListener('click', handleClick);
  };
}
