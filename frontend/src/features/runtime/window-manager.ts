/* wandori.us — Window Manager
 * Funciones de mutación para ventanas del escritorio.
 * Los tipos, store y getters viven en window-store.ts.
 * [Auditoría v3 §2.2] Split para mantener bajo límite de 300 líneas. */

import type { MountedView } from '../../core/lifecycle';
import type { StoreSource } from '../../store';
import { stableParamsKey } from './deep-links';
import type { AppDefinition, AppToolbarGroup } from './app-registry';
import type { IconNode } from 'lucide';
import {
  windowStore, workspaceW, workspaceH,
  clampWindowBounds, generateWindowId, generateNextZIndex,
  type WindowEntry, type WindowBounds, type WindowState,
} from './window-store';

/* Re-export todo desde window-store para backward compatibility.
 * Los consumidores existentes importan de 'window-manager' y seguirán funcionando. */
export { windowStore, setWorkspaceBounds, clampWindowBounds, getWindows, getFocusedWindow, findOpenWindow, ensureNextZIndexAbove } from './window-store';
export type { WindowState, WindowBounds, WindowEntry, WindowIdentity, WindowGeometry, WindowContent } from './window-store';

/** Estado persistido de una ventana restaurada de sesión. [317A-5] */
export interface RestoredWindowState {
  readonly bounds: WindowBounds;
  readonly state: WindowState;
  readonly zIndex: number;
  readonly focused: boolean;
  readonly params?: Readonly<Record<string, string>>;
  readonly titleOverride?: string;
  readonly preMaximizeBounds?: WindowBounds;
}

/** Abrir una ventana restaurada de sesión con geometría/estado explícitos.
 * A diferencia de openWindow, no aplica defaults de apertura nueva: la sesión
 * define bounds, state, zIndex, focused y preMaximizeBounds exactos.
 * [317A-5] El content se re-instantía en restore; aquí solo se monta la entrada. */
export function openRestoredWindow(
  app: AppDefinition,
  view: MountedView,
  controller: AbortController,
  saved: RestoredWindowState,
): string {
  const instanceId = generateWindowId();
  const existing = windowStore.get();
  const bounds = clampWindowBounds(saved.bounds.x, saved.bounds.y, saved.bounds.w, saved.bounds.h);

  /* Solo la ventana enfocada de la sesión roba foco; las demás no. */
  const updated = saved.focused
    ? existing.map(w => ({ ...w, focused: false }))
    : existing;

  const entry: WindowEntry = {
    instanceId,
    appId: app.id,
    title: saved.titleOverride ?? app.title,
    state: saved.state,
    bounds,
    zIndex: saved.zIndex,
    focused: saved.focused,
    content: view.element,
    /* [018A-69] La restauración vuelve a instanciar la app; sus acciones
     * también deben viajar al WindowEntry para que el shell reconstruya la
     * franja inferior igual que en una apertura normal. No se persiste el DOM,
     * se deriva nuevamente desde MountedView. */
    actions: view.actions,
    controller,
    app,
    layout: app.layout,
    toolbar: app.toolbar,
    params: saved.params ? { ...saved.params } : undefined,
    _paramKey: saved.params ? stableParamsKey(saved.params) : undefined,
    onDestroy: view.destroy,
    preMaximizeBounds: saved.preMaximizeBounds,
  };

  windowStore.set([...updated, entry]);
  return instanceId;
}

/** Abrir una nueva ventana para una app. */
export function openWindow(
  app: AppDefinition,
  view: MountedView,
  controller: AbortController,
  initialBounds?: Partial<WindowBounds>,
  params?: Record<string, string>,
  titleOverride?: string,
): string {
  const instanceId = generateWindowId();
  const existing = windowStore.get();
  const defaults: WindowBounds = {
    x: 40 + (existing.length % 8) * 30,
    y: 40 + (existing.length % 8) * 30,
    w: 640,
    h: 480,
  };
  const raw: WindowBounds = { ...defaults, ...initialBounds };
  const bounds = clampWindowBounds(raw.x, raw.y, raw.w, raw.h);

  const updated = existing.map(w => ({ ...w, focused: false }));

  const entry: WindowEntry = {
    instanceId,
    appId: app.id,
    title: titleOverride ?? app.title,
    state: 'open',
    bounds,
    zIndex: generateNextZIndex(),
    focused: true,
    content: view.element,
    /* [018A-1] La app puede aportar su franja de acciones. */
    actions: view.actions,
    controller,
    app,
    layout: app.layout,
    toolbar: app.toolbar,
    params,
    _paramKey: params ? stableParamsKey(params) : undefined,
    onDestroy: view.destroy,
  };

  windowStore.set([...updated, entry]);
  return instanceId;
}

/** Actualizar la identidad de una ventana tras su creación.
 * Recalcula _paramKey cuando cambian los params para que la deduplicación
 * de findExistingWindow siga siendo correcta tras navegación interna.
 * [018A-77] El Finder navega dentro de la misma ventana; sin esta operación
 * el store queda desincronizado: la taskbar conserva el título viejo y
 * reabrir la carpeta de origen no produce efecto (match por _paramKey viejo). */
export function updateWindowInstance(
  instanceId: string,
  patch: { title?: string; params?: Record<string, string> },
): void {
  const windows = windowStore.get();
  const updated = windows.map((w) => {
    if (w.instanceId !== instanceId) return w;
    const params = patch.params !== undefined ? { ...patch.params } : w.params;
    return {
      ...w,
      title: patch.title ?? w.title,
      params,
      _paramKey: params ? stableParamsKey(params) : undefined,
    };
  });
  windowStore.set(updated);
}

/** Cerrar una ventana (destruye contenido y aborta signal). */
export function closeWindow(instanceId: string, source: StoreSource = 'user'): void {
  const windows = windowStore.get();
  const target = windows.find(w => w.instanceId === instanceId);
  if (!target) return;

  target.onDestroy?.();
  target.controller?.abort();

  const remaining = windows.filter(w => w.instanceId !== instanceId);

  if (target.focused && remaining.length > 0) {
    const topWindow = remaining.reduce((a, b) => (a.zIndex > b.zIndex ? a : b));
    topWindow.focused = true;
  }

  windowStore.set(remaining, source);
}

/** Registrar una shell window (perfil, etc.) directamente en windowStore. */
export function registerShellWindow(options: {
  instanceId: string;
  title: string;
  icon: IconNode;
  content: HTMLElement;
  initialBounds?: Partial<WindowBounds>;
  focused?: boolean;
  cssClass?: string;
  layout?: 'padded' | 'full-bleed';
  toolbar?: AppToolbarGroup[];
}): string {
  const existing = windowStore.get();
  if (existing.find(w => w.instanceId === options.instanceId)) return options.instanceId;

  const defaults: WindowBounds = { x: 40, y: 40, w: 470, h: 360 };
  const raw: WindowBounds = { ...defaults, ...options.initialBounds };
  const bounds = clampWindowBounds(raw.x, raw.y, raw.w, raw.h);

  const updated = options.focused !== false
    ? existing.map(w => ({ ...w, focused: false }))
    : existing;

  const entry: WindowEntry = {
    instanceId: options.instanceId,
    appId: options.instanceId,
    title: options.title,
    state: 'open',
    bounds,
    zIndex: generateNextZIndex(),
    focused: options.focused !== false,
    content: options.content,
    icon: options.icon,
    cssClass: options.cssClass,
    layout: options.layout,
    toolbar: options.toolbar,
  };

  windowStore.set([...updated, entry]);
  return options.instanceId;
}

/** Enfocar una ventana (traer al frente). */
export function focusWindow(instanceId: string): void {
  const windows = windowStore.get();
  const updated = windows.map(w => {
    if (w.instanceId === instanceId) {
      return { ...w, focused: true, zIndex: generateNextZIndex() };
    }
    return { ...w, focused: false };
  });
  windowStore.set(updated);
}

/** Minimizar una ventana. */
export function minimizeWindow(instanceId: string): void {
  const windows = windowStore.get();
  const target = windows.find(w => w.instanceId === instanceId);
  if (!target || target.state === 'minimized') return;

  const updated = windows.map(w => {
    if (w.instanceId === instanceId) {
      return { ...w, state: 'minimized' as const, focused: false };
    }
    return w;
  });

  const visible = updated.filter(w => w.state === 'open');
  if (visible.length > 0) {
    const top = visible.reduce((a, b) => (a.zIndex > b.zIndex ? a : b));
    top.focused = true;
  }

  windowStore.set(updated);
}

/** Restaurar una ventana minimizada. */
export function restoreWindow(instanceId: string): void {
  const windows = windowStore.get();
  const updated = windows.map(w => {
    if (w.instanceId === instanceId) {
      return { ...w, state: 'open' as const, focused: true, zIndex: generateNextZIndex() };
    }
    return { ...w, focused: false };
  });
  windowStore.set(updated);
}

/** Maximizar/restaurar una ventana (toggle). */
export function toggleMaximizeWindow(instanceId: string): void {
  const windows = windowStore.get();
  const target = windows.find(w => w.instanceId === instanceId);
  if (!target) return;

  if (target.state === 'maximized') {
    const restored = target.preMaximizeBounds ?? { x: 40, y: 40, w: 640, h: 480 };
    const updated = windows.map(w => {
      if (w.instanceId === instanceId) {
        return { ...w, state: 'open' as const, bounds: clampWindowBounds(restored.x, restored.y, restored.w, restored.h), preMaximizeBounds: undefined };
      }
      return w;
    });
    windowStore.set(updated);
  } else {
    const updated = windows.map(w => {
      if (w.instanceId === instanceId) {
        return { ...w, state: 'maximized' as const, bounds: { x: 0, y: 0, w: workspaceW, h: workspaceH }, preMaximizeBounds: { ...w.bounds } };
      }
      return w;
    });
    windowStore.set(updated);
  }
}

/** Reencuadrar todas las ventanas tras un cambio de superficie.
 * [018A-61] Una sola mutación batch evita recalcular/persistir cada ventana
 * por separado; las maximizadas ocupan el workspace nuevo y las demás usan
 * el mismo clamp que drag/resize. `sync` evita que un ResizeObserver altere
 * el historial de rutas.
 */
export function reframeAllWindows(source: StoreSource = 'sync'): number {
  const windows = windowStore.get();
  let changed = 0;
  const updated = windows.map((window) => {
    const bounds = window.state === 'maximized'
      ? { x: 0, y: 0, w: workspaceW, h: workspaceH }
      : clampWindowBounds(window.bounds.x, window.bounds.y, window.bounds.w, window.bounds.h);
    const preMaximizeBounds = window.preMaximizeBounds
      ? clampWindowBounds(
        window.preMaximizeBounds.x,
        window.preMaximizeBounds.y,
        window.preMaximizeBounds.w,
        window.preMaximizeBounds.h,
      )
      : undefined;
    const sameBounds = Object.entries(bounds).every(([key, value]) =>
      window.bounds[key as keyof WindowBounds] === value,
    );
    const samePreMaximize =
      (window.preMaximizeBounds === undefined && preMaximizeBounds === undefined)
      || Object.entries(preMaximizeBounds ?? {}).every(([key, value]) =>
        window.preMaximizeBounds?.[key as keyof WindowBounds] === value,
      );
    if (sameBounds && samePreMaximize) return window;
    changed += 1;
    return { ...window, bounds, preMaximizeBounds };
  });

  if (changed > 0) windowStore.set(updated, source);
  return changed;
}

/** Actualizar bounds de una ventana (drag/resize/keyboard). */
export function updateWindowBounds(instanceId: string, bounds: Partial<WindowBounds>): void {
  const windows = windowStore.get();
  const updated = windows.map(w => {
    if (w.instanceId === instanceId) {
      const merged = { ...w.bounds, ...bounds };
      const clamped = clampWindowBounds(merged.x, merged.y, merged.w, merged.h);
      return { ...w, bounds: clamped };
    }
    return w;
  });
  windowStore.set(updated);
}

/** Cerrar todas las ventanas (para cleanup y transición de presentación). */
export function closeAllWindows(): void {
  const windows = windowStore.get();
  for (const w of windows) {
    w.onDestroy?.();
    w.controller?.abort();
  }
  windowStore.set([]);
}
