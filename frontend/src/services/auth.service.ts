/* wandori.us — Auth Service
 * Capa de servicio para autenticación.
 * [Auditoría v4 §4.1] — Rompe acoplamiento a api.post en pages/login.ts.
 * API consistente con otros servicios: errores se propagan como ApiError.
 * [018A-34] El servicio usa el contrato generado; conserva la sincronización
 * de stores como responsabilidad de dominio. */

import { unwrapGeneratedResponse } from '../api/client';
import {
  login,
  logout,
  me,
  register,
  requestPasswordReset,
  resetPassword,
  verifyEmail,
} from '../api/generated/auth/auth';
import { authStore, type AuthCapability } from '../store';
import { showToast } from '../components/ui/toast';
import { clearPreferencesSync, syncPreferencesForUser } from '../features/runtime/preferences-sync';
import { clearClipboard } from '../features/runtime/workspace/workspace-store';

export interface MeResult {
  isAuthenticated: boolean;
  userId: string | null;
  capability: AuthCapability;
}

interface MeResponse {
  id: string;
  email: string;
  role?: 'user' | 'admin';
}

function capabilityFromRole(role?: MeResponse['role']): AuthCapability {
  return role === 'admin' ? 'admin' : 'authenticated';
}

export const AuthService = {
  /** Crear cuenta: la sesión solo se habilita después de verificar el correo. */
  async register(email: string, password: string): Promise<{ message: string }> {
    const response = await register({ email, password });
    return unwrapGeneratedResponse<{ message: string }>(response, [202]);
  },

  async verifyEmail(token: string): Promise<{ message: string }> {
    const response = await verifyEmail({ token });
    return unwrapGeneratedResponse<{ message: string }>(response, [200]);
  },

  async requestPasswordReset(email: string): Promise<{ message: string }> {
    const response = await requestPasswordReset({ email });
    return unwrapGeneratedResponse<{ message: string }>(response, [202]);
  },

  async resetPassword(token: string, password: string): Promise<void> {
    const response = await resetPassword({ token, password });
    unwrapGeneratedResponse<void>(response, [204]);
  },

  /** Iniciar sesión con email y contraseña.
   *  Lanza ApiError si las credenciales son inválidas (consistente con otros servicios). */
  async login(email: string, password: string): Promise<void> {
    /* [018A-63] El backend responde 204 (cookie en Set-Cookie, sin cuerpo),
     * consistente con logout/resetPassword; la capacidad se confirma en /me.
     * El contrato utoipa se corrigió a 204; regenerar cliente tras restart. */
    const response = await login({ email, password });
    unwrapGeneratedResponse<void>(response, [204]);
    const session = await this.me();
    if (!session.isAuthenticated) {
      throw new Error('La sesión no pudo confirmarse');
    }
  },

  /** Cerrar sesión. */
  async logout(): Promise<void> {
    try {
      const response = await logout();
      unwrapGeneratedResponse<void>(response, [204]);
    } catch {
      /* La cookie puede haber expirado; el estado local se limpia igual, pero
       * el fallo queda observable para diagnóstico y no se silencia. */
      showToast('no se pudo cerrar la sesión remota; se limpió la sesión local');
    }
    clearPreferencesSync();
    clearClipboard();
    authStore.set({ isAuthenticated: false, userId: null, userEmail: null, capability: 'public' });
  },

  /** Verificar sesión actual. */
  async me(): Promise<MeResult> {
    try {
      const response = await me();
      const res = unwrapGeneratedResponse<MeResponse>(response, [200]);
      const capability = capabilityFromRole(res.role);
      authStore.set({ isAuthenticated: true, userId: res.id, userEmail: res.email ?? null, capability });
      await syncPreferencesForUser(res.id);
      return { isAuthenticated: true, userId: res.id, capability };
    } catch {
      clearPreferencesSync();
      authStore.set({ isAuthenticated: false, userId: null, capability: 'public' });
      return { isAuthenticated: false, userId: null, capability: 'public' };
    }
  },
};
