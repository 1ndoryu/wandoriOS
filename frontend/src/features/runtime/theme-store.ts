/* [297A-18] Tema claro/oscuro del OS.
 * Store global del modo de tema (system | claro | oscuro) con resolución a un
 * tema concreto, persistencia local y aplicación al atributo raíz del shell.
 * La sincronización remota llega con 297A-13 (overlay remoto); aquí el ámbito
 * del evento de analytics es siempre 'local'. Un modo inválido o la falta de
 * almacenamiento caen a 'system' (feature flag + fallback claro). */

import { createStore } from '../../store';
import { dispatchEvent } from '../analytics/dispatcher';

export type ThemeMode = 'system' | 'claro' | 'oscuro';
export type ResolvedTheme = 'claro' | 'oscuro';

const STORAGE_KEY = 'wandorius:tema';
const VALID_MODES: readonly ThemeMode[] = ['system', 'claro', 'oscuro'];
const DARK_QUERY = '(prefers-color-scheme: dark)';

/** Leer el modo persistido con fallback a 'system'. */
function readStoredMode(): ThemeMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && (VALID_MODES as readonly string[]).includes(raw)) return raw as ThemeMode;
  } catch {
    /* Almacenamiento no disponible: modo por defecto. */
  }
  return 'system';
}

export const themeStore = createStore<ThemeMode>(readStoredMode());

/** Resolver un modo al tema concreto según la preferencia del sistema. */
export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode !== 'system') return mode;
  return window.matchMedia(DARK_QUERY).matches ? 'oscuro' : 'claro';
}

/** Aplicar el tema resuelto al atributo raíz del shell (anti-flash). */
export function applyTheme(theme: ResolvedTheme): void {
  const root = document.documentElement;
  if (theme === 'oscuro') root.setAttribute('data-tema', 'oscuro');
  else root.removeAttribute('data-tema');
}

let systemMedia: MediaQueryList | null = null;
let stopSystemListener: (() => void) | null = null;

/** Sincronizar el listener del SO solo cuando el modo es 'system'. */
function syncSystemListener(mode: ThemeMode): void {
  if (mode === 'system') {
    if (systemMedia) return;
    systemMedia = window.matchMedia(DARK_QUERY);
    const onChange = (e: MediaQueryListEvent): void => {
      setResolvedTheme(e.matches ? 'oscuro' : 'claro', 'system');
    };
    systemMedia.addEventListener('change', onChange);
    stopSystemListener = () => systemMedia?.removeEventListener('change', onChange);
    return;
  }
  stopSystemListener?.();
  stopSystemListener = null;
  systemMedia = null;
}

/** Aplicar tema y emitir analytics solo cuando el tema resuelto cambia. */
function setResolvedTheme(next: ResolvedTheme, mode: ThemeMode): void {
  const root = document.documentElement;
  const current = root.getAttribute('data-tema') === 'oscuro' ? 'oscuro' : 'claro';
  if (next === current) return;
  applyTheme(next);
  dispatchEvent({
    type: 'theme_changed',
    mode,
    resolved: next,
    scope: 'local',
  });
}

/** Inicializar el store: aplicar tema inicial, persistir y escuchar al SO. */
export function initThemeStore(): void {
  const mode = themeStore.get();
  setResolvedTheme(resolveTheme(mode), mode);

  themeStore.subscribe((nextMode, source) => {
    if (source !== 'init') {
      try {
        localStorage.setItem(STORAGE_KEY, nextMode);
      } catch {
        /* Sin almacenamiento: el tema vive solo en memoria. */
      }
    }
    syncSystemListener(nextMode);
    setResolvedTheme(resolveTheme(nextMode), nextMode);
  });

  syncSystemListener(mode);
}
