/* wandori.us — Runtime Presentation Boundary
 * Dueño de la frontera desktop/mobile para el RouteAppAdapter.
 * No decide rutas ni permisos: solo delega la apertura al shell móvil y
 * libera la superficie activa cuando una navegación abandona el runtime.
 * [297A-23 Fase 3]
 */

import { clearMobileStack } from '../mobile/mobile-stack';
import { getPresentationMode } from '../../utils/viewport';
import { closeWindow, windowStore } from './window-manager';
import type { AppOpenHistory } from './deep-links';

export type MobileOpenHandler = (
  appId: string,
  params?: Record<string, string>,
  options?: { history?: AppOpenHistory },
) => Promise<void>;

let mobileOpenHandler: MobileOpenHandler | null = null;

/** Registrar el adaptador móvil y devolver teardown idempotente. */
export function setMobileOpenHandler(handler: MobileOpenHandler | null): () => void {
  mobileOpenHandler = handler;
  return () => {
    if (mobileOpenHandler === handler) mobileOpenHandler = null;
  };
}

/** La ruta puede ser interceptada en móvil solo cuando el shell está listo. */
export function isMobilePresentationReady(): boolean {
  return getPresentationMode() !== 'mobile' || mobileOpenHandler !== null;
}

/** Delegar apertura al shell móvil si la presentación activa es móvil. */
export async function openInMobileIfActive(
  appId: string,
  params: Record<string, string> | undefined,
  options: { history?: AppOpenHistory },
): Promise<boolean> {
  if (getPresentationMode() !== 'mobile') return false;
  if (mobileOpenHandler) await mobileOpenHandler(appId, params, options);
  return true;
}

/** Liberar la superficie activa cuando la URL deja una app válida.
 * Perfil es chrome del shell y se conserva explícitamente en desktop. */
export function clearRuntimePresentation(): void {
  if (getPresentationMode() === 'mobile') {
    clearMobileStack('sync');
    return;
  }

  for (const win of windowStore.get()) {
    if (win.instanceId !== 'shell-profile') closeWindow(win.instanceId, 'sync');
  }
}
