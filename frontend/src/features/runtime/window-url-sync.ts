/* wandori.us — Focused Window URL Sync
 * Proyecta el foco actual del OS sobre la URL canónica.
 * El router sigue siendo la única fuente de navegación; este módulo solo
 * reemplaza la URL cuando cambia la presentación enfocada.
 */

import { getCurrentPath, replacePath } from '../../router';
import { getPresentationMode } from '../../utils/viewport';
import { mobileStackStore, type MobileStackEntry } from '../mobile/mobile-stack';
import { AppRegistry } from './app-registry';
import { getCanonicalAppPath } from './deep-links';
import { windowStore, type WindowEntry } from './window-store';
import type { StoreSource } from '../../store';
import { dispatchEvent } from '../analytics/dispatcher';

export interface FocusedEntrySnapshot {
  readonly appId: string;
  readonly focused?: boolean;
  readonly params?: Readonly<Record<string, string>>;
}

/**
 * Indica si la presentación tiene alguna app runtime abierta aunque el foco
 * esté en chrome del shell, como Perfil, y aunque no exista URL pública.
 * Solo una app registrada cuenta; entradas como `shell-profile` no cuentan.
 * [297A-24] Evita cerrar ventanas como efecto secundario de una proyección.
 */
export function hasOpenRuntimeApp(
  windows: readonly FocusedEntrySnapshot[],
  mobileStack: readonly FocusedEntrySnapshot[],
  presentation: 'desktop' | 'tablet' | 'mobile',
): boolean {
  const activeSurface = presentation === 'mobile' ? mobileStack : windows;
  return activeSurface.some((entry) => AppRegistry.get(entry.appId) !== undefined);
}

/** Resolver puro del path que representa la app actualmente enfocada. */
export function resolveFocusedPath(
  windows: readonly FocusedEntrySnapshot[],
  mobileStack: readonly FocusedEntrySnapshot[],
  presentation: 'desktop' | 'tablet' | 'mobile',
): string {
  const active = presentation === 'mobile'
    ? mobileStack.at(-1)
    : windows.find((entry) => entry.focused);
  if (!active) return '/';

  const app = AppRegistry.get(active.appId);
  return app ? getCanonicalAppPath(app, active.params) ?? '/' : '/';
}

/** Contexto público de la instancia enfocada, sin estado privado. */
export interface FocusedCanonicalTarget {
  readonly url: string;
  readonly path: string;
  readonly routeName: string;
  readonly appId: string;
  readonly presentationMode: 'desktop' | 'tablet' | 'mobile';
}

/**
 * Obtener el contexto canónico de la instancia enfocada si su app declara una
 * ruta pública. No incluye geometría, overlays ni estado de sesión.
 */
export function resolveFocusedCanonicalTarget(): FocusedCanonicalTarget | null {
  const presentationMode = getPresentationMode();
  const windows = windowStore.get();
  const mobileStack = mobileStackStore.get();
  const active = presentationMode === 'mobile'
    ? mobileStack.at(-1)
    : windows.find((entry) => entry.focused);
  if (!active) return null;

  const app = AppRegistry.get(active.appId);
  const path = app ? getCanonicalAppPath(app, active.params) : null;
  if (!path || path === '/') return null;
  return {
    url: new URL(path, window.location.origin).toString(),
    path,
    routeName: path.split('/').filter(Boolean)[0] ?? 'root',
    appId: active.appId,
    presentationMode,
  };
}

/** Obtener solo la URL absoluta del destino enfocado. */
export function resolveFocusedCanonicalUrl(): string | null {
  return resolveFocusedCanonicalTarget()?.url ?? null;
}

/** Registrar el sincronizador de foco; devuelve teardown idempotente. */
export interface WindowUrlSyncHandle {
  readonly pause: () => void;
  readonly resume: () => void;
  readonly stop: () => void;
}

function resolveFocusedRuntimeAppId(
  windows: readonly FocusedEntrySnapshot[],
  mobileStack: readonly FocusedEntrySnapshot[],
  presentation: 'desktop' | 'tablet' | 'mobile',
): string | null {
  const active = presentation === 'mobile'
    ? mobileStack.at(-1)
    : windows.find((entry) => entry.focused);
  return active && AppRegistry.get(active.appId) ? active.appId : null;
}

export function initWindowUrlSync(): WindowUrlSyncHandle {
  let windowsInitialized = false;
  let mobileInitialized = false;
  let lastFocusedAppId: string | null | undefined;
  let paused = false;
  let stopped = false;

  const sync = (): void => {
    if (paused || stopped) return;
    const windows = windowStore.get();
    const mobileStack = mobileStackStore.get();
    const presentation = getPresentationMode();
    const focusedAppId = resolveFocusedRuntimeAppId(windows, mobileStack, presentation);
    if (lastFocusedAppId !== undefined && focusedAppId && focusedAppId !== lastFocusedAppId) {
      dispatchEvent({
        type: 'window_focus_changed',
        appId: focusedAppId,
        ...(lastFocusedAppId ? { previousAppId: lastFocusedAppId } : {}),
      });
    }
    lastFocusedAppId = focusedAppId;
    const targetPath = resolveFocusedPath(windows, mobileStack, presentation);

    /* [297A-24 / S1] Una app runtime sin deep link no debe navegar a `/`.
     * Hacerlo activaría la reconciliación de rutas y cerraría todas las demás
     * ventanas aunque el usuario solo haya abierto/enfocado otra app. `/` se
     * proyecta únicamente cuando no existe ninguna app runtime enfocada. */
    if (targetPath === '/' && hasOpenRuntimeApp(windows, mobileStack, presentation)) return;
    if (targetPath !== getCurrentPath()) replacePath(targetPath);
  };

  const stopWindows = windowStore.subscribe((_: readonly WindowEntry[], source: StoreSource) => {
    /* Una mutación coordinada con history.back() conserva la URL hasta que
     * popstate resuelva la entrada anterior. */
    if (source === 'sync') return;
    /* No sobrescribir una deep link antes de que el router monte su app inicial. */
    if (!windowsInitialized) {
      windowsInitialized = true;
      lastFocusedAppId = resolveFocusedRuntimeAppId(windowStore.get(), mobileStackStore.get(), getPresentationMode());
      return;
    }
    sync();
  });
  const stopMobile = mobileStackStore.subscribe((_: readonly MobileStackEntry[], source: StoreSource) => {
    if (source === 'sync') return;
    if (!mobileInitialized) {
      mobileInitialized = true;
      lastFocusedAppId = resolveFocusedRuntimeAppId(windowStore.get(), mobileStackStore.get(), getPresentationMode());
      return;
    }
    sync();
  });

  return {
    pause: () => { paused = true; },
    resume: () => {
      if (stopped) return;
      paused = false;
      sync();
    },
    stop: () => {
      if (stopped) return;
      stopped = true;
      stopWindows();
      stopMobile();
    },
  };
}
