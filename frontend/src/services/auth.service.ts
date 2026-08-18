/* wandori.us — Auth Service
 * Capa de servicio para autenticación.
 * [Auditoría v4 §4.1] — Rompe acoplamiento a api.post en pages/login.ts.
 * [297A-13] El login puede requerir segundo factor: si la cuenta tiene TOTP
 * activo, el backend responde 202 con un reto de un solo uso y la sesión solo
 * se emite tras verificar el código en /mfa/totp/verify.
 */

import { unwrapGeneratedResponse } from '../api/client';
import {
  login,
  logout,
  mfaVerify,
  me,
  register,
  requestPasswordReset,
  resetPassword,
  totpConfirm,
  totpDisable,
  totpSetup,
  totpStatus,
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

/** Resultado del login: sesión iniciada o segundo factor pendiente. */
export interface LoginResult {
  readonly mfaRequired: boolean;
  readonly challenge: string | null;
}

export interface TotpSetupResult {
  readonly secret: string;
  readonly otpauth_uri: string;
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

  /** Primer paso del login. Si la cuenta exige TOTP, NO emite sesión todavía:
   *  devuelve un reto para verificar con `verifyMfa`. */
  async login(email: string, password: string): Promise<LoginResult> {
    const response = await login({ email, password });
    const data = unwrapGeneratedResponse<{ mfa: string; challenge: string } | null>(response, [202, 204]);
    if (data && data.mfa === 'totp') {
      return { mfaRequired: true, challenge: data.challenge };
    }
    const session = await this.me();
    if (!session.isAuthenticated) {
      throw new Error('La sesión no pudo confirmarse');
    }
    return { mfaRequired: false, challenge: null };
  },

  /** Segundo paso del login: verifica el reto TOTP y emite la sesión. */
  async verifyMfa(challenge: string, code: string): Promise<void> {
    const response = await mfaVerify({ challenge, code });
    unwrapGeneratedResponse<void>(response, [204]);
    await this.me();
  },

  /* [297A-13] MFA TOTP de la cuenta autenticada. */

  async totpStatus(): Promise<{ enabled: boolean }> {
    const response = await totpStatus();
    return unwrapGeneratedResponse<{ enabled: boolean }>(response, [200]);
  },

  /** Inicia el alta: secreto base32 + URI otpauth (un solo uso). */
  async beginTotpSetup(): Promise<TotpSetupResult> {
    const response = await totpSetup();
    return unwrapGeneratedResponse<TotpSetupResult>(response, [200]);
  },

  /** Confirma el alta con un código TOTP y activa el segundo factor. */
  async confirmTotp(code: string): Promise<void> {
    const response = await totpConfirm({ code });
    unwrapGeneratedResponse<void>(response, [204]);
  },

  /** Desactiva TOTP verificando un código válido. */
  async disableTotp(code: string): Promise<void> {
    const response = await totpDisable({ code });
    unwrapGeneratedResponse<void>(response, [204]);
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
