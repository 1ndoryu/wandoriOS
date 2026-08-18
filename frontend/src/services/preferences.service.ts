/* wandori.us — Preferences Service
 * Cliente HTTP de preferencias privadas por cuenta.
 * No conoce themeStore ni decide conflictos: solo transporta el contrato API.
 * [018A-34] Usa el contrato generado y deja la resolución de conflictos al sync.
 * [297A-29] Se amplía con la apariencia del panel de control: wallpaper, fuente
 * y escala (valores efectivos ya resueltos con el default del admin). */

import { unwrapGeneratedResponse } from '../api/client';
import {
  getPreferences,
  updatePreferences,
} from '../api/generated/preferences-handler/preferences-handler';

export type AccountThemeMode = 'system' | 'claro' | 'oscuro';

export interface UserPreferences {
  readonly theme: AccountThemeMode;
  /** Fondo efectivo: '' = default del OS (trama). */
  readonly wallpaper: string | null;
  /** Fuente efectiva: 'system' | 'mono' | 'sans'. */
  readonly font: string | null;
  /** Escala efectiva (factor). */
  readonly scale: number | null;
  readonly revision: number;
  readonly updated_at: string;
}

export interface UpdateUserPreferencesRequest {
  /** Campos opcionales: solo los presentes se actualizan (merge por campo). */
  readonly theme?: AccountThemeMode;
  /** `''` vuelve a heredar el default del admin. */
  readonly wallpaper?: string;
  readonly font?: string;
  /** `0` vuelve a heredar el default del admin. */
  readonly scale?: number;
  readonly expected_revision: number;
}

export const PreferencesService = {
  async get(): Promise<UserPreferences> {
    const response = await getPreferences();
    return unwrapGeneratedResponse<UserPreferences>(response, [200]);
  },

  async update(request: UpdateUserPreferencesRequest): Promise<UserPreferences> {
    const response = await updatePreferences(request);
    return unwrapGeneratedResponse<UserPreferences>(response, [200]);
  },
};
