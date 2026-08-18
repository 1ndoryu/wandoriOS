/* wandori.us — Profile Commands
 * [297A-29 F3] Comando 'profile:settings' admin-only que abre/cierra el
 * panel de configuración dentro de la ventana Perfil.
 * El CommandRegistry es singleton global; el panel vive en la instancia del
 * shell (desktop). desktop-shell registra el toggle con setProfileSettingsToggle
 * al montar y lo limpia al destruir. Fail-closed: sin handler => failure. */

import { Settings } from 'lucide';
import { CommandRegistry, adminOnly, type CommandResult } from '../command-registry';

let toggleHandler: (() => void) | null = null;

/** Registrar (o limpiar con null) el toggle del panel de la ventana Perfil. */
export function setProfileSettingsToggle(fn: (() => void) | null): void {
  toggleHandler = fn;
}

CommandRegistry.register(adminOnly({
  id: 'profile:settings',
  label: 'Configurar perfil',
  icon: Settings,
  order: 10,
  contexts: ['toolbar'],
  undoPolicy: 'none',
  analyticsEvent: 'profile.settings',
  execute: (): CommandResult => {
    if (!toggleHandler) return { status: 'failure', reason: 'ventana perfil no disponible' };
    toggleHandler();
    return { status: 'success' };
  },
}));
