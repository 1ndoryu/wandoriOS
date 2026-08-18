/* wandori.us — App Instance Policies
 * Políticas puras para validar una apertura y resolver deduplicación.
 * No conoce router, stores mutables, DOM ni presentación; el adapter conserva
 * la orquestación y los efectos secundarios. [297A-23 Fase 3]
 */

import { hasCapability } from './capability';
import type { AppDefinition } from './app-registry';
import { parseAppParams, stableParamsKey, type PublicRouteParams } from './deep-links';
import type { WindowEntry } from './window-store';

/** Resultado de validar los parámetros y la capacidad de una app. */
export interface AppAccessResult {
  readonly allowed: boolean;
  readonly params?: Record<string, string>;
}

/** Validar parámetros públicos de ruta y capacidad antes de hidratar una app. */
export function validateRouteAccess(
  app: AppDefinition,
  params: PublicRouteParams,
  capability: unknown,
): AppAccessResult {
  const safeParams = parseAppParams(app, params);
  if (safeParams === null || !hasCapability(capability, app.requires)) {
    return { allowed: false };
  }
  return { allowed: true, params: safeParams };
}

/** Validar solo la capacidad para aperturas internas del workspace.
 * Los params de estas aperturas (folderId/resourceId) son internos y no
 * representan parámetros públicos de URL. */
export function canOpenApp(app: AppDefinition, capability: unknown): boolean {
  return hasCapability(capability, app.requires);
}

/** Buscar una ventana existente según singleton o parámetros de instancia. */
export function findExistingWindow(
  windows: readonly WindowEntry[],
  app: AppDefinition,
  params?: PublicRouteParams,
): WindowEntry | undefined {
  if (app.singleton) {
    return windows.find((window) => window.appId === app.id);
  }
  if (!params) return undefined;

  const paramKey = stableParamsKey(params);
  return windows.find((window) => (
    window.appId === app.id && window._paramKey === paramKey
  ));
}
