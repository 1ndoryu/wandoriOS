/* wandori.us — Canonical Deep Links
 * Helpers puros para rutas públicas del OS.
 * No serializa IDs internos, geometría, overlays, tokens ni estado de sesión.
 */

import type { AppDefinition, AppDeepLink } from './app-registry';

/** Parámetros que pueden aparecer en una URL canónica pública. */
export type PublicRouteParams = Readonly<Record<string, string>>;

/** Política de historial para una apertura de app. */
export type AppOpenHistory = 'push' | 'none';

/** Clave estable para deduplicar instancias sin depender del orden de propiedades. */
export function stableParamsKey(params?: PublicRouteParams): string {
  return JSON.stringify(
    Object.entries(params ?? {}).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0),
  );
}

function isSafeSegment(value: string | null | undefined): boolean {
  /* [058A-2] Rechazar null/undefined sin reventar: los publicLocator del
   * workspace pueden llegar con params null en runtime (datos incompletos),
   * y antes esto crasheaba en value.length (TypeError) desde el Finder.
   * Un locator malformado debe fallar la validación (fail-closed), no lanzar. */
  if (value == null) return false;
  return value.length > 0
    && value !== '.'
    && value !== '..'
    && value.length <= 200
    && !value.includes('/')
    && !value.includes('\\')
    && !/[\u0000-\u001f\u007f]/.test(value);
}

/** Crear un deep link público a partir de un patrón allowlisted. */
export function createPathDeepLink(
  pattern: string,
  parameterNames: readonly string[] = [],
): AppDeepLink {
  const names = new Set(parameterNames);

  return {
    patterns: [pattern],
    parse: (params: PublicRouteParams): Record<string, string> | null => {
      const keys = Object.keys(params);
      if (keys.some((key) => !names.has(key))) return null;
      for (const name of names) {
        const value = params[name];
        if (value === undefined || !isSafeSegment(value)) return null;
      }
      return Object.fromEntries(parameterNames.map((name) => [name, params[name]]));
    },
    stringify: (params?: PublicRouteParams): string | null => {
      const values = params ?? {};
      if (Object.keys(values).some((key) => !names.has(key))) return null;
      for (const name of names) {
        const value = values[name];
        if (value === undefined || !isSafeSegment(value)) return null;
      }

      return parameterNames.reduce(
        (path, name) => path.replace(`:${name}`, encodeURIComponent(values[name])),
        pattern,
      );
    },
  };
}

/** Validar parámetros provenientes del router antes de hidratar una app. */
export function parseAppParams(
  app: AppDefinition,
  params: PublicRouteParams,
): Record<string, string> | null {
  if (app.deepLink) return app.deepLink.parse(params);
  /* Apps legacy solo pueden conservar rutas exactas sin parámetros.
   * Nunca se pasa input dinámico a una app sin allowlist explícita. */
  return Object.keys(params).length === 0 ? {} : null;
}

/** Obtener la URL canónica pública de una app, si su contrato la permite. */
export function getCanonicalAppPath(
  app: AppDefinition,
  params?: PublicRouteParams,
): string | null {
  return app.deepLink?.stringify(params) ?? null;
}
