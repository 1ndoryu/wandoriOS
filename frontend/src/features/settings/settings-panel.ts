/* wandori.us — Settings Panel
 * [018A-44] La configuración de fuentes/tamaños fue retirada; el nombre del
 * módulo refleja ahora que la app conserva un panel de perfil delegable.
 * La app Configuración sigue registrada y puede evolucionar sin reintroducir
 * un boundary específico de tipografía. */

import { createProfileSettingsPanel } from './profile-settings';

export function createSettingsPanel(): HTMLElement {
  return createProfileSettingsPanel();
}
