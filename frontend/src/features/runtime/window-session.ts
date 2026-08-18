/* wandori.us — Window Session Persistence
 * Persiste la sesión de presentación del OS (ventanas desktop/tablet y stack
 * móvil) en localStorage versionado. Al recargar, el escritorio se reconstruye
 * con la misma geometría, estado, z-order y foco. [317A-5]
 *
 * NO persiste contenido DOM, MountedView, clipboard, secretos ni estado de
 * formularios: las apps se re-instantían con AppRegistry.instantiate y la
 * restauración (en window-session-restore.ts) es fail-closed por catálogo y
 * capacidad.
 */

import { windowStore } from './window-manager';
import { mobileStackStore } from '../mobile/mobile-stack';
import { AppRegistry } from './app-registry';
import { getPresentationMode } from '../../utils/viewport';
import type { StoreSource } from '../../store';
import type { WindowBounds, WindowState } from './window-store';

/** Clave localStorage de la sesión de ventanas. [317A-5] */
export const SESSION_STORAGE_KEY = 'wandorius:window-session';
export const SESSION_VERSION = 1 as const;

/** Ventana desktop/tablet persistida (solo estado de presentación). */
export interface SavedWindow {
  readonly appId: string;
  readonly params?: Readonly<Record<string, string>>;
  /** Título si difiere del catálogo (p. ej. Finder con nombre de carpeta). */
  readonly title?: string;
  readonly bounds: WindowBounds;
  readonly state: WindowState;
  readonly zIndex: number;
  readonly focused: boolean;
  readonly preMaximizeBounds?: WindowBounds;
}

/** Entrada del stack móvil persistida. */
export interface SavedMobileEntry {
  readonly appId: string;
  readonly title?: string;
  readonly layout?: 'padded' | 'full-bleed';
  readonly params?: Readonly<Record<string, string>>;
}

/** Sesión completa versionada. */
export interface WindowSession {
  readonly version: typeof SESSION_VERSION;
  readonly desktop: readonly SavedWindow[];
  readonly mobile: readonly SavedMobileEntry[];
}

const DEBOUNCE_MS = 200;

/* === Load / Save con versionado y shape check === */

function isBounds(value: unknown): value is WindowBounds {
  if (!value || typeof value !== 'object') return false;
  const bounds = value as Record<string, unknown>;
  return [bounds.x, bounds.y, bounds.w, bounds.h].every(n => typeof n === 'number' && Number.isFinite(n));
}

function isWindowState(value: unknown): value is WindowState {
  return value === 'open' || value === 'minimized' || value === 'maximized';
}

function sanitizeWindow(value: unknown): SavedWindow | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.appId !== 'string' || !raw.appId) return null;
  if (!isBounds(raw.bounds) || !isWindowState(raw.state)) return null;
  if (typeof raw.zIndex !== 'number' || typeof raw.focused !== 'boolean') return null;
  const params = raw.params && typeof raw.params === 'object'
    ? raw.params as Readonly<Record<string, string>>
    : undefined;
  /* Normalizar solo el estado inconsistente real (foco + minimizado:
   * minimizeWindow siempre pone focused:false). 'maximized + focused' es un
   * estado normal del OS y debe conservarse. [317A-5] */
  const focused = raw.focused && raw.state !== 'minimized';
  return {
    appId: raw.appId,
    params,
    title: typeof raw.title === 'string' ? raw.title : undefined,
    bounds: raw.bounds,
    state: raw.state,
    zIndex: raw.zIndex,
    focused,
    preMaximizeBounds: isBounds(raw.preMaximizeBounds) ? raw.preMaximizeBounds : undefined,
  };
}

function sanitizeMobileEntry(value: unknown): SavedMobileEntry | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.appId !== 'string' || !raw.appId) return null;
  return {
    appId: raw.appId,
    title: typeof raw.title === 'string' ? raw.title : undefined,
    layout: raw.layout === 'padded' || raw.layout === 'full-bleed' ? raw.layout : undefined,
    params: raw.params && typeof raw.params === 'object'
      ? raw.params as Readonly<Record<string, string>>
      : undefined,
  };
}

/** Cargar la sesión; null ante ausencia, versión inválida o JSON corrupto. */
export function loadSession(): WindowSession | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WindowSession>;
    if (parsed.version !== SESSION_VERSION) return null;
    const desktop = Array.isArray(parsed.desktop)
      ? parsed.desktop.map(sanitizeWindow).filter((e): e is SavedWindow => e !== null)
      : [];
    const mobile = Array.isArray(parsed.mobile)
      ? parsed.mobile.map(sanitizeMobileEntry).filter((e): e is SavedMobileEntry => e !== null)
      : [];
    return { version: SESSION_VERSION, desktop, mobile };
  } catch {
    return null;
  }
}

/** Guardar la sesión; nunca lanza (localStorage lleno/no disponible). */
export function saveSession(): void {
  try {
    const previous = loadSession();
    const presentation = getPresentationMode();
    const session: WindowSession = {
      version: SESSION_VERSION,
      /* Solo la sección de la presentación activa se actualiza: el escritorio
       * en móvil está vacío (usa stack) y viceversa; así una sección no pisa
       * a la otra al alternar entre presentaciones. */
      desktop: presentation === 'mobile' ? (previous?.desktop ?? []) : captureDesktopSession(),
      mobile: presentation === 'mobile' ? captureMobileSession() : (previous?.mobile ?? []),
    };
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    /* localStorage full or unavailable */
  }
}

/* === Captura desde los stores === */

/** Capturar ventanas desktop/tablet: solo apps del catálogo (excluye shell). */
export function captureDesktopSession(): SavedWindow[] {
  return windowStore.get()
    .filter((window) => AppRegistry.get(window.appId) !== undefined)
    .map((window) => {
      const app = AppRegistry.get(window.appId);
      const saved: SavedWindow = {
        appId: window.appId,
        params: window.params ? { ...window.params } : undefined,
        title: app && window.title !== app.title ? window.title : undefined,
        bounds: { ...window.bounds },
        state: window.state,
        zIndex: window.zIndex,
        focused: window.focused,
        preMaximizeBounds: window.preMaximizeBounds ? { ...window.preMaximizeBounds } : undefined,
      };
      return saved;
    });
}

/** Capturar el stack móvil actual. */
export function captureMobileSession(): SavedMobileEntry[] {
  return mobileStackStore.get().map((entry) => ({
    appId: entry.appId,
    title: entry.title,
    layout: entry.layout,
    params: entry.params ? { ...entry.params } : undefined,
  }));
}

/* === Persistencia reactiva (debounce + flush + pause) === */

export interface WindowSessionHandle {
  readonly pause: () => void;
  readonly resume: () => void;
  readonly stop: () => void;
}

/** Suscribirse a los stores y persistir con debounce; flush en pagehide.
 * - Ignora la notificación inicial 'init' (no pisa la sesión guardada al arrancar).
 * - pause() suspende guardados durante transiciones de presentación.
 * - stop() libera suscripciones y el listener de pagehide (idempotente). */
export function initWindowSessionPersistence(): WindowSessionHandle {
  let paused = false;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const scheduleSave = (source: StoreSource): void => {
    if (source === 'init' || paused || stopped) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      saveSession();
    }, DEBOUNCE_MS);
  };

  const stopWindows = windowStore.subscribe((_windows, source) => scheduleSave(source));
  const stopMobile = mobileStackStore.subscribe((_entries, source) => scheduleSave(source));

  const flush = (): void => {
    if (paused || stopped) return;
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
    saveSession();
  };
  const onPageHide = (): void => flush();
  window.addEventListener('pagehide', onPageHide);

  return {
    pause: () => { paused = true; },
    resume: () => { paused = false; },
    stop: () => {
      if (stopped) return;
      stopped = true;
      stopWindows();
      stopMobile();
      window.removeEventListener('pagehide', onPageHide);
    },
  };
}
