/* wandori.us — Mobile App Stack
 * Pila de navegación móvil sobre las mismas MountedView del AppRegistry.
 * No contiene lógica de negocio ni componentes MobileFoo: solo instancia,
 * apila y destruye vistas compartidas. [297A-12 §2–4] */

import { createVacio } from '../../components/ui/empty-state';
import type { MountedView } from '../../core/lifecycle';
import { AppRegistry } from '../runtime/app-registry';
import { getCurrentPath, pushPath } from '../../router';
import { getCanonicalAppPath, stableParamsKey, type AppOpenHistory } from '../runtime/deep-links';
import { createStore, type Store, type StoreSource } from '../../store';

export interface MobileStackEntry {
  readonly instanceId: string;
  readonly appId: string;
  readonly title: string;
  readonly layout?: 'padded' | 'full-bleed';
  readonly params?: Readonly<Record<string, string>>;
  readonly view: MountedView;
  readonly controller: AbortController;
}

export const mobileStackStore: Store<readonly MobileStackEntry[]> = createStore([]);

let nextMobileInstanceId = 1;
let mobileGeneration = 0;
const pendingMobileOpens = new Map<string, Promise<void>>();

function makeInstanceId(appId: string): string {
  return `mobile-${appId}-${nextMobileInstanceId++}`;
}

function closeEntry(entry: MobileStackEntry): void {
  entry.controller.abort();
  entry.view.destroy?.();
}

function sameParams(
  left?: Readonly<Record<string, string>>,
  right?: Readonly<Record<string, string>>,
): boolean {
  const leftEntries = Object.entries(left ?? {});
  const rightEntries = Object.entries(right ?? {});
  if (leftEntries.length !== rightEntries.length) return false;
  return leftEntries.every(([key, value]) => right?.[key] === value);
}

function findExistingIndex(
  appId: string,
  params: Readonly<Record<string, string>> | undefined,
  singleton: boolean,
): number {
  return mobileStackStore.get().findIndex((entry) => (
    entry.appId === appId && (singleton || sameParams(entry.params, params))
  ));
}

function focusExisting(index: number): void {
  const current = mobileStackStore.get();
  current.slice(index + 1).forEach(closeEntry);
  mobileStackStore.set(current.slice(0, index + 1));
}

/** Abrir o enfocar una app en la pila móvil. */
export async function openMobileView(
  appId: string,
  title: string,
  view: MountedView,
  params?: Readonly<Record<string, string>>,
  singleton = false,
  layout?: 'padded' | 'full-bleed',
  controller: AbortController = new AbortController(),
): Promise<void> {
  const existingIndex = findExistingIndex(appId, params, singleton);

  /* Una app ya abierta se enfoca: se descartan únicamente las vistas superiores. */
  if (existingIndex >= 0) {
    controller.abort();
    view.destroy?.();
    focusExisting(existingIndex);
    return;
  }

  if (controller.signal.aborted) {
    view.destroy?.();
    return;
  }

  const current = mobileStackStore.get();
  mobileStackStore.set([
    ...current,
    {
      instanceId: makeInstanceId(appId),
      appId,
      title,
      layout,
      params,
      view,
      controller,
    },
  ]);
}

/** Clave estable para deduplicar taps/clicks concurrentes de la misma app. */
function mobileOpenKey(appId: string, params?: Readonly<Record<string, string>>): string {
  return `${appId}:${stableParamsKey(params)}`;
}

async function openMobileAppOnce(
  appId: string,
  params?: Readonly<Record<string, string>>,
  options: { history?: AppOpenHistory } = {},
): Promise<void> {
  const generation = mobileGeneration;
  const app = AppRegistry.get(appId);
  if (!app) return;

  const existingIndex = findExistingIndex(appId, params, app.singleton);
  if (existingIndex >= 0) {
    focusExisting(existingIndex);
    return;
  }

  const controller = new AbortController();
  const view = await AppRegistry.instantiate(appId, { signal: controller.signal, params });
  if (!view || controller.signal.aborted || generation !== mobileGeneration) {
    controller.abort();
    view?.destroy?.();
    return;
  }

  const canonicalPath = getCanonicalAppPath(app, params);
  const shouldPushHistory = options.history !== 'none'
    && canonicalPath !== null
    && canonicalPath !== getCurrentPath();
  /* Push antes de mobileStackStore.set para que el sincronizador no convierta
   * una apertura intencional en replaceState. */
  if (shouldPushHistory) pushPath(canonicalPath);
  await openMobileView(
    appId,
    app.title,
    view,
    params,
    app.singleton,
    app.layout,
    controller,
  );
}

/** Abrir una app registrada con el mismo MountedView que usa desktop. */
export function openMobileApp(
  appId: string,
  params?: Readonly<Record<string, string>>,
  options: { history?: AppOpenHistory } = {},
): Promise<void> {
  const key = mobileOpenKey(appId, params);
  const pending = pendingMobileOpens.get(key);
  if (pending) return pending;

  const operation = openMobileAppOnce(appId, params, options).finally(() => {
    if (pendingMobileOpens.get(key) === operation) pendingMobileOpens.delete(key);
  });
  pendingMobileOpens.set(key, operation);
  return operation;
}

/** Volver una pantalla. La vista retirada siempre recibe teardown. */
export function popMobileApp(options: { preserveHistoryUrl?: boolean } = {}): void {
  const current = mobileStackStore.get();
  const entry = current.at(-1);
  if (!entry) return;
  closeEntry(entry);
  /* Cuando el caller va a ejecutar history.back(), el URL todavía representa
   * la vista retirada. Evitamos que window-url-sync lo reemplace antes del
   * popstate; el adapter resolverá la entrada histórica anterior. */
  mobileStackStore.set(
    current.slice(0, -1),
    options.preserveHistoryUrl ? 'sync' : 'user',
  );
}

/** Volver al launcher y liberar toda la pila. */
export function clearMobileStack(source: StoreSource = 'user'): void {
  mobileGeneration += 1;
  pendingMobileOpens.clear();
  for (const entry of mobileStackStore.get()) closeEntry(entry);
  mobileStackStore.set([], source);
}

/** Obtener la vista superior, si existe. */
export function getTopMobileApp(): MobileStackEntry | undefined {
  return mobileStackStore.get().at(-1);
}

/** Fallback visual para una app que no puede montarse en el shell móvil. */
export function createMobileErrorView(title: string): MountedView {
  return {
    element: createVacio(`No se pudo abrir ${title}.`),
  };
}

/** Reset interno para pruebas aisladas. */
export function _resetMobileStackForTest(): void {
  clearMobileStack();
  nextMobileInstanceId = 1;
}
