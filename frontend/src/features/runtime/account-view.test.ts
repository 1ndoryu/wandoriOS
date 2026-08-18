import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService, DevMailService } from '../../services';
import { authStore } from '../../store';
import { createAccountView } from './account-view';

function mount(): { element: HTMLElement; controller: AbortController } {
  const controller = new AbortController();
  return { element: createAccountView({ signal: controller.signal }), controller };
}

beforeEach(() => {
  vi.restoreAllMocks();
  authStore.set({ isAuthenticated: false, userId: null, capability: 'public' }, 'sync');
});

describe('account-view', () => {
  it('muestra login y accesos de registro y recuperación para invitado', () => {
    const { element } = mount();

    expect(element.getAttribute('aria-label')).toBe('Cuenta');
    expect(element.querySelector('.account-app__title')?.textContent).toBe('cuenta');
    expect(element.querySelector('input[type="email"]')).not.toBeNull();
    expect(element.querySelector('input[type="password"]')).not.toBeNull();
    expect(element.querySelector('[aria-label="Crear cuenta"]')).not.toBeNull();
    expect(element.querySelector('[aria-label="Recuperar acceso"]')).not.toBeNull();
  });

  it('valida campos antes de invocar login', async () => {
    const login = vi.spyOn(AuthService, 'login');
    const { element } = mount();
    element.querySelector<HTMLButtonElement>('.account-app__submit')?.click();

    expect(login).not.toHaveBeenCalled();
    expect(element.querySelector('.account-app__feedback')?.textContent)
      .toBe('completa todos los campos');
  });

  it('invoca AuthService.login con los valores del formulario', async () => {
    const login = vi.spyOn(AuthService, 'login').mockResolvedValue({ mfaRequired: false, challenge: null });
    const { element } = mount();
    const email = element.querySelector<HTMLInputElement>('input[type="email"]');
    const password = element.querySelector<HTMLInputElement>('input[type="password"]');
    if (!email || !password) throw new Error('formulario no montado');
    email.value = 'user@example.com';
    email.dispatchEvent(new Event('input', { bubbles: true }));
    password.value = 'secret';
    password.dispatchEvent(new Event('input', { bubbles: true }));
    element.querySelector<HTMLButtonElement>('.account-app__submit')?.click();

    await vi.waitFor(() => expect(login).toHaveBeenCalledWith('user@example.com', 'secret'));
  });

  it('muestra y envía el formulario de registro desde Cuenta', async () => {
    const register = vi.spyOn(AuthService, 'register').mockResolvedValue({ message: 'ok' });
    vi.spyOn(DevMailService, 'latestVerificationLink').mockResolvedValue(null);
    const { element } = mount();
    element.querySelector<HTMLButtonElement>('[aria-label="Crear cuenta"]')?.click();

    const fields = element.querySelectorAll<HTMLInputElement>('input');
    fields[0].value = 'new@example.com';
    fields[1].value = 'secret';
    fields[2].value = 'secret';
    element.querySelector<HTMLButtonElement>('.account-app__submit')?.click();

    await vi.waitFor(() => expect(register).toHaveBeenCalledWith('new@example.com', 'secret'));
    await vi.waitFor(() => expect(element.textContent).toContain('solicitud recibida'));
  });

  it('pide el código de segundo factor cuando el login responde 202', async () => {
    const login = vi.spyOn(AuthService, 'login').mockResolvedValue({ mfaRequired: true, challenge: 'reto-abc' });
    const verify = vi.spyOn(AuthService, 'verifyMfa').mockResolvedValue(undefined);
    const { element } = mount();
    const email = element.querySelector<HTMLInputElement>('input[type="email"]');
    const password = element.querySelector<HTMLInputElement>('input[type="password"]');
    if (!email || !password) throw new Error('formulario no montado');
    email.value = 'user@example.com';
    password.value = 'secret';
    element.querySelector<HTMLButtonElement>('.account-app__submit')?.click();

    await vi.waitFor(() => expect(login).toHaveBeenCalledWith('user@example.com', 'secret'));
    await vi.waitFor(() => expect(element.textContent).toContain('código de verificación'));

    const code = element.querySelector<HTMLInputElement>('input');
    if (!code) throw new Error('campo de código no montado');
    code.value = '123456';
    element.querySelector<HTMLButtonElement>('.account-app__submit')?.click();

    await vi.waitFor(() => expect(verify).toHaveBeenCalledWith('reto-abc', '123456'));
    await vi.waitFor(() => expect(element.textContent).toContain('sesión iniciada'));
  });

  it('muestra recuperación con respuesta no enumerable', async () => {
    const recover = vi.spyOn(AuthService, 'requestPasswordReset').mockResolvedValue({ message: 'ok' });
    const { element } = mount();
    element.querySelector<HTMLButtonElement>('[aria-label="Recuperar acceso"]')?.click();

    const email = element.querySelector<HTMLInputElement>('input[type="email"]');
    if (!email) throw new Error('formulario no montado');
    email.value = 'user@example.com';
    element.querySelector<HTMLButtonElement>('.account-app__submit')?.click();

    await vi.waitFor(() => expect(recover).toHaveBeenCalledWith('user@example.com'));
    await vi.waitFor(() => expect(element.textContent).toContain('si el correo existe'));
  });

  it('rechaza contraseñas de registro que no coinciden', () => {
    const register = vi.spyOn(AuthService, 'register');
    const { element } = mount();
    element.querySelector<HTMLButtonElement>('[aria-label="Crear cuenta"]')?.click();
    const fields = element.querySelectorAll<HTMLInputElement>('input');
    fields[0].value = 'new@example.com';
    fields[1].value = 'secret';
    fields[2].value = 'different';
    element.querySelector<HTMLButtonElement>('.account-app__submit')?.click();

    expect(register).not.toHaveBeenCalled();
    expect(element.querySelector('.account-app__feedback')?.textContent).toBe('las contraseñas no coinciden');
  });

  it('cambia reactivamente a sesión admin sin remontar la vista', () => {
    const { element } = mount();
    authStore.set({ isAuthenticated: true, userId: 'admin-1', capability: 'admin' }, 'sync');

    expect(element.textContent).toContain('sesión activa · admin');
    expect(element.querySelector('input')).toBeNull();
    expect(element.querySelector('[aria-label="Cerrar sesión"]')).not.toBeNull();
  });

  it('invoca logout desde la vista autenticada', async () => {
    const logout = vi.spyOn(AuthService, 'logout').mockResolvedValue(undefined);
    authStore.set({ isAuthenticated: true, userId: 'user-1', capability: 'authenticated' }, 'sync');
    const { element } = mount();
    element.querySelector<HTMLButtonElement>('[aria-label="Cerrar sesión"]')?.click();

    await vi.waitFor(() => expect(logout).toHaveBeenCalledOnce());
  });

  it('deja de reaccionar después de abortar el contexto', () => {
    const { element, controller } = mount();
    controller.abort();
    authStore.set({ isAuthenticated: true, userId: 'user-1', capability: 'authenticated' }, 'sync');

    expect(element.querySelector('input[type="email"]')).not.toBeNull();
  });
});
