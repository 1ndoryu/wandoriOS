/* wandori.us — Viewport Abstraction
 * Centraliza window.innerWidth/Height/location para desacoplar el frontend
 * del navegador. Facilita testing (mock) y futuras adaptaciones (mobile, Electron).
 * [Auditoría v4 §4.2] 21 referencias a window.* — esta capa abstrae las más críticas.
 */

/** Dimensiones del viewport actual. */
export interface Viewport {
  readonly width: number;
  readonly height: number;
}

/** Obtener dimensiones del viewport. En el futuro puede adaptarse a mobile/Electron. */
export function getViewport(): Viewport {
  return { width: window.innerWidth, height: window.innerHeight };
}

/** Obtener el modo de presentación según el ancho del viewport.
 * [297A-12] El launcher móvil es solo pantallas ≤480px; tablet (481–1023)
 * conserva el escritorio con su layout responsive (desktop-responsive.css).
 * Usado por analytics dispatcher y por el OS para elegir layout. */
export function getPresentationMode(): 'desktop' | 'tablet' | 'mobile' {
  const w = window.innerWidth;
  if (w < 481) return 'mobile';
  if (w < 1024) return 'tablet';
  return 'desktop';
}

/** Obtener el pathname actual. Wrapper centralizado para window.location.pathname. */
export function getCurrentPathname(): string {
  return window.location.pathname;
}

/** Obtener el origin actual. */
export function getCurrentOrigin(): string {
  return window.location.origin;
}
