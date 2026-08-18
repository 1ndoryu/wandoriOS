/* wandori.us — Preferences Service
 * Cliente HTTP de preferencias privadas por cuenta.
 * No conoce themeStore ni decide conflictos: solo transporta el contrato API.
 * [018A-34] Usa el contrato generado y deja la resolución de conflictos al sync. */

import { unwrapGeneratedResponse } from '../api/client';
import {
  getPreferences,
  updatePreferences,
} from '../api/generated/preferences-handler/preferences-handler';

export type AccountThemeMode = 'system' | 'claro' | 'oscuro';

export interface UserPreferences {
  readonly theme: AccountThemeMode;
  readonly revision: number;
  readonly updated_at: string;
}

export interface UpdateUserPreferencesRequest {
  readonly theme: AccountThemeMode;
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
