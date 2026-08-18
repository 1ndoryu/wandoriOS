/* wandori.us — Window Session Restore
 * Restauración de la sesión de presentación (ventanas desktop/tablet y stack
 * móvil) desde el estado persistido. Extraído de window-session.ts para
 * mantener los módulos bajo el límite de 300 líneas. [317A-5]
 *
 * La restauración es fail-closed por catálogo y capacidad: una app retirada
 * del AppRegistry se omite sin romper la sesión; una app que exige una
 * capacidad que la sesión actual ya no tiene (p. ej. admin tras logout) no
 * se reabre.
 */

import { openRestoredWindow, ensureNextZIndexAbove, windowStore } from './window-manager';
import { openMobileView } from '../mobile/mobile-stack';
import { AppRegistry } from './app-registry';
import { canOpenApp, findExistingWindow } from './app-instances';
import { authStore } from '../../store';
import { getPresentationMode } from '../../utils/viewport';
import { loadSession, type SavedWindow, type SavedMobileEntry } from './window-session';

/** Restaurar ventanas desktop/tablet con su geometría/estado/z-order/foco. */
export async function restoreDesktopWindows(saved: readonly SavedWindow[]): Promise<void> {
  const capability = authStore.get().capability;
  /* Orden ascendente de zIndex: el DOM y el apilado final coinciden con la sesión. */
  const ordered = [...saved].sort((a, b) => a.zIndex - b.zIndex);
  let maxZ = 0;

  for (const entry of ordered) {
    const app = AppRegistry.get(entry.appId);
    if (!app) continue; /* App retirada del catálogo → se omite, no rompe. */
    if (!canOpenApp(app, capability)) continue; /* Fail-closed: sesión expirada o sin capacidad. */

    /* [317A-5] No duplicar ventanas ya abiertas: en las transiciones de
     * presentación refreshRoute() abre primero la app de la URL y este
     * restore corre después; findExistingWindow evita la segunda instancia. */
    const existing = findExistingWindow(
      windowStore.get(),
      app,
      entry.params ? { ...entry.params } : undefined,
    );
    if (existing) continue;

    const controller = new AbortController();
    const view = await AppRegistry.instantiate(entry.appId, {
      signal: controller.signal,
      params: entry.params ? { ...entry.params } : undefined,
    });
    if (!view) {
      controller.abort();
      continue;
    }

    openRestoredWindow(app, view, controller, {
      bounds: entry.bounds,
      state: entry.state,
      zIndex: entry.zIndex,
      focused: entry.focused,
      params: entry.params ? { ...entry.params } : undefined,
      titleOverride: entry.title,
      preMaximizeBounds: entry.preMaximizeBounds,
    });
    maxZ = Math.max(maxZ, entry.zIndex);
  }

  if (maxZ > 0) ensureNextZIndexAbove(maxZ);
}

/** Restaurar el stack móvil en su orden original (top = foco). */
export async function restoreMobileStack(saved: readonly SavedMobileEntry[]): Promise<void> {
  const capability = authStore.get().capability;

  for (const entry of saved) {
    const app = AppRegistry.get(entry.appId);
    if (!app) continue;
    if (!canOpenApp(app, capability)) continue;

    const controller = new AbortController();
    const view = await AppRegistry.instantiate(entry.appId, {
      signal: controller.signal,
      params: entry.params ? { ...entry.params } : undefined,
    });
    if (!view) {
      controller.abort();
      continue;
    }

    await openMobileView(
      entry.appId,
      entry.title ?? app.title,
      view,
      entry.params ? { ...entry.params } : undefined,
      app.singleton,
      entry.layout ?? app.layout,
      controller,
    );
  }
}

/** Restaurar la sesión según la presentación activa. Idempotente ante ausencia. */
export async function restoreWindowSession(): Promise<void> {
  const session = loadSession();
  if (!session) return;
  if (getPresentationMode() === 'mobile') {
    await restoreMobileStack(session.mobile);
  } else {
    await restoreDesktopWindows(session.desktop);
  }
}
