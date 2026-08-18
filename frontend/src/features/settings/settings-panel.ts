/* wandori.us — Settings Panel
 * [297A-29 F4/F5] La app Configuración es el panel de control del OS:
 * apariencia (fondo/fuente/escala), default del admin y ajustes de cuenta.
 * El nombre del módulo se conserva por compatibilidad con el registro; el
 * contenido real vive en control-panel. */

import { createControlPanel } from './control-panel';
import type { MountedView } from '../../core/lifecycle';

export function createSettingsPanel(): MountedView {
  return createControlPanel();
}
