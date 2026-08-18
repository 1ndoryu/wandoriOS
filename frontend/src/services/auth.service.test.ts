import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as generatedAuth from '../api/generated/auth/auth';
import { authStore } from '../store';
import { AuthService } from './auth.service';

describe('AuthService.login', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    authStore.set({ isAuthenticated: false, userId: null, capability: 'public' }, 'sync');
  });

  it('rechaza si login responde pero /auth/me no confirma la sesión', async () => {
    /* [018A-66] Login responde 204 sin cuerpo; el test verifica primero ese
     * contrato generado y después la confirmación independiente de /me. */
    vi.spyOn(generatedAuth, 'login').mockResolvedValue({
      data: undefined,
      status: 204,
      headers: new Headers(),
    });
    vi.spyOn(generatedAuth, 'me').mockRejectedValue(new Error('sesión no confirmada'));

    await expect(AuthService.login('user@example.com', 'secret'))
      .rejects.toThrow('La sesión no pudo confirmarse');
    expect(authStore.get().isAuthenticated).toBe(false);
  });
});
