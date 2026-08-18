/* wandori.us — Settings Service
 * Capa de servicio para configuración del sitio y perfil.
 * [Auditoría v4 §4.1] — Rompe acoplamiento a api.get/post en 5+ archivos.
 * [018A-34] Lecturas/escrituras usan el cliente generado de settings. */

import { unwrapGeneratedResponse } from '../api/client';
import { getSettings, updateSettings } from '../api/generated/settings-handler/settings-handler';

export const SettingsService = {
  /** Obtener únicamente la configuración pública de presentación. */
  async getPublic(): Promise<Record<string, string>> {
    const response = await getSettings();
    return unwrapGeneratedResponse<Record<string, string>>(response, [200]);
  },

  /** Guardar configuraciones parciales. */
  /* [297A-28] El backend movió el guardado a POST /api/admin/settings en el
   * refactor de seguridad 297A-7 (AdminUser + CSRF). GET /api/settings quedó
   * público, pero el POST ya no existe en esa ruta → 405. */
  async save(settings: Record<string, string>): Promise<void> {
    const response = await updateSettings({ settings });
    unwrapGeneratedResponse<void>(response, [204]);
  },

  /** Obtener el contenido de About. */
  async getAboutContent(): Promise<string> {
    const s = await SettingsService.getPublic();
    return s.about_content || '';
  },

  /** Guardar el contenido de About. */
  async saveAboutContent(content: string): Promise<void> {
    return SettingsService.save({ about_content: content });
  },
};
