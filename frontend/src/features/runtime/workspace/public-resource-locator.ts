/* wandori.us — Public Resource Locator
 * Traduce un locator público del workspace a una apertura de app allowlisted.
 * `refId` queda fuera del contrato: es interno y nunca se convierte en URL.
 */

import { AppRegistry } from '../app-registry';
import { hasCapability } from '../capability';
import { parseAppParams } from '../deep-links';
import type { ResolvedNode } from './types';

export interface PublicResourceTarget {
  readonly appId: string;
  readonly params: Record<string, string>;
}

/**
 * Resolver un locator público solo si apunta a una app pública registrada y
 * sus parámetros pasan el deep-link allowlist de esa app.
 */
export function resolvePublicResourceTarget(
  node: Pick<ResolvedNode, 'type' | 'requires' | 'publicLocator'>,
): PublicResourceTarget | null {
  const locator = node.publicLocator;
  if (!locator || !['resource', 'shortcut'].includes(node.type)) return null;
  if (node.requires && node.requires !== 'public') return null;

  const app = AppRegistry.get(locator.appId);
  if (!app || !hasCapability('public', app.requires) || !app.deepLink) return null;

  const params = parseAppParams(app, locator.params);
  if (!params) return null;

  return { appId: app.id, params };
}

export interface ShellOpenOptions {
  /** El Finder tiene visor local de imágenes (preview pública); el escritorio
   * y el launcher móvil no, así que sin locator la imagen no se abre. */
  readonly allowImagePreview?: boolean;
}

/* [058A-3] Filtro de visibilidad del shell: un nodo solo aparece si su doble
 * clic / toque puede hacer algo útil (navegar, abrir app, visor o URL pública).
 * Sin esto, recursos con locator roto (slug nulo) o borrados se listaban en el
 * Finder y solo producían el aviso "sin referencia pública disponible". */
export function canOpenNodeFromShell(
  node: Pick<ResolvedNode, 'type' | 'requires' | 'publicLocator' | 'refId' | 'resourceKind'>,
  options: ShellOpenOptions = {},
): boolean {
  if (node.type === 'folder') return true;
  if (node.type === 'app') return Boolean(node.refId);
  if (node.type === 'resource') {
    if (options.allowImagePreview && node.resourceKind === 'image' && node.refId) return true;
    if (node.resourceKind) return resolvePublicResourceTarget(node) !== null;
    return false;
  }
  if (node.type === 'shortcut') return resolvePublicResourceTarget(node) !== null;
  return false;
}
