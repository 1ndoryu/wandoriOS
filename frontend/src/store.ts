/* wandori.us — Store (State Management)
 * Patrón pub/sub simple. Sin dependencias.
 * Cada store es un objeto reactivo que notifica suscriptores al cambiar.
 * [297A-29 F1] Se retiró fontStore (fuentes/tamaños estáticos); solo queda
 * profileStore para la configuración de perfil y redes. */

import type { Capability } from './features/runtime/capability';

export type AuthCapability = Capability;

type Listener<T> = (value: T) => void;
type Unsubscribe = () => void;

/** Origen del cambio de estado. Permite distinguir causas en suscriptores. */
export type StoreSource = 'user' | 'api' | 'overlay' | 'init' | 'sync';

/** Listener que recibe el valor y el origen del cambio. */
export type TypedListener<T> = (value: T, source: StoreSource) => void;

export interface Store<T> {
  get(): T;
  set(value: T, source?: StoreSource): void;
  update(fn: (current: T) => T, source?: StoreSource): void;
  subscribe(listener: TypedListener<T>): Unsubscribe;
  /** Suscribirse ignorando el source (compatibilidad con listeners simples). */
  subscribeSimple(listener: Listener<T>): Unsubscribe;
}

/* Crear un store reactivo */
export function createStore<T>(initialValue: T): Store<T> {
  let value = initialValue;
  const listeners = new Set<TypedListener<T>>();
  const simpleListeners = new Set<Listener<T>>();

  return {
    get() { return value; },
    set(newValue: T, source: StoreSource = 'user') {
      value = newValue;
      for (const listener of listeners) listener(value, source);
      for (const listener of simpleListeners) listener(value);
    },
    update(fn: (current: T) => T, source: StoreSource = 'user') {
      value = fn(value);
      for (const listener of listeners) listener(value, source);
      for (const listener of simpleListeners) listener(value);
    },
    subscribe(listener: TypedListener<T>): Unsubscribe {
      listeners.add(listener);
      listener(value, 'init');
      return () => { listeners.delete(listener); };
    },
    subscribeSimple(listener: Listener<T>): Unsubscribe {
      simpleListeners.add(listener);
      listener(value);
      return () => { simpleListeners.delete(listener); };
    },
  };
}

/* === Stores globales de la aplicación === */

/* Estado de autenticación
 * [297A-8] Migrado de JWT localStorage a sesiones opacas en cookie HttpOnly.
 * [028A-7] Se añade userEmail (opcional) para derivar el nombre de usuario
 * visible en la barra/cuenta sin prefijos redundantes tipo "Cuenta ·". */
export interface AuthState {
  isAuthenticated: boolean;
  userId: string | null;
  /** Email del usuario autenticado; permite mostrar su nombre (parte antes de @). */
  userEmail?: string | null;
  /** Capacidad confirmada por el backend; nunca se infiere desde la cookie. */
  capability: AuthCapability;
}

export const authStore = createStore<AuthState>({
  isAuthenticated: false,
  userId: null,
  userEmail: null,
  capability: 'public',
});

/* [028A-7] Nombre visible de la sesión: parte local del email (antes de @).
 * Si no hay email (estado legacy o sesión parcial), fallback según capacidad. */
export function authAccountName(state: AuthState): string {
  if (state.userEmail) {
    const local = state.userEmail.split('@')[0].trim();
    if (local) return local;
  }
  return state.capability === 'admin' ? 'admin' : 'cuenta';
}

/* [297A-29 F1] Configuración de perfil y redes.
 * Las fuentes y tamaños son ahora estáticos (JetBrains Mono + tokens fijos
 * en variables.css). El único estado configurable que se conserva es el del
 * perfil: dimensiones de la foto, borde, y tamaño/separación de las redes. */
export interface ProfileConfig {
  profileWidth: number;
  profileHeight: number;
  profileBorder: boolean;
  redesSize: number;
  redesGap: number;
}

export const profileStore = createStore<ProfileConfig>({
  profileWidth: 120, profileHeight: 120, profileBorder: true,
  redesSize: 13, redesGap: 8,
});

/* Aplicar solo los tokens de perfil/redes al cambiar (los demás son estáticos) */
profileStore.subscribe((config) => {
  const root = document.documentElement;
  root.style.setProperty('--profile-width', `${config.profileWidth}px`);
  root.style.setProperty('--profile-height', `${config.profileHeight}px`);
  root.style.setProperty('--profile-border', config.profileBorder ? 'var(--borde)' : 'none');
  root.style.setProperty('--redes-size', `${config.redesSize}px`);
  root.style.setProperty('--redes-gap', `${config.redesGap}px`);
});

/* Imagen de perfil */
export const profileImage = createStore<string>('/uploads/profile.jpg');

/* Configuración del sitio */
export interface SiteConfig {
  showEntriesOnHome: boolean;
}

export const siteConfig = createStore<SiteConfig>({
  showEntriesOnHome: false,
});

/* Redes sociales configurables */
export interface SocialLink {
  nombre: string;
  url: string;
}

export const socialLinksStore = createStore<SocialLink[]>([
  { nombre: 'instagram', url: 'https://instagram.com/wandorius' },
  { nombre: 'facebook', url: 'https://facebook.com/wandorius' },
  { nombre: 'threads', url: 'https://threads.net/@wandorius' },
  { nombre: 'youtube', url: 'https://youtube.com/@wandorius' },
  { nombre: 'spotify', url: 'https://open.spotify.com/artist/wandorius' },
  { nombre: 'github', url: 'https://github.com/wandorius' },
]);

/* Layout de redes: inline o stacked */
export type RedesLayout = 'inline' | 'stacked';
export const redesLayoutStore = createStore<RedesLayout>('inline');

/* Control de visibilidad del profile header */
export const showProfile = createStore<boolean>(true);

/* Control de visibilidad del sidebar */
export const showSidebar = createStore<boolean>(
  localStorage.getItem('wandorius:sidebar') !== 'hidden',
);
showSidebar.subscribe((visible) => {
  localStorage.setItem('wandorius:sidebar', visible ? 'visible' : 'hidden');
});
