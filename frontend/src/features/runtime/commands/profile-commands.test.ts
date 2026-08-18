/* Tests del comando admin-only 'profile:settings' [297A-29 F3].
 * Importar el módulo registra el comando (side effect). Verifica:
 * - Oculto para no-admin (fail-closed).
 * - Visible/ejecutable para admin.
 * - Ejecuta el toggle registrado por el shell; sin handler => failure. */

import { describe, it, expect, beforeEach } from 'vitest';
import { CommandRegistry } from '../command-registry';
import { setProfileSettingsToggle } from './profile-commands';

describe('profile:settings', () => {
  beforeEach(() => {
    /* Limpiar handler entre tests (fail-closed sin shell montado) */
    setProfileSettingsToggle(null);
  });

  it('está registrado en el registry', () => {
    const cmd = CommandRegistry.get('profile:settings');
    expect(cmd).toBeDefined();
    expect(cmd?.label).toBe('Configurar perfil');
    expect(cmd?.contexts).toContain('toolbar');
  });

  it('está oculto para invitados y autenticados no-admin (adminOnly)', () => {
    expect(CommandRegistry.isAvailable('profile:settings', { capability: 'public' }).state)
      .toBe('hidden');
    expect(CommandRegistry.isAvailable('profile:settings', { capability: 'authenticated' }).state)
      .toBe('hidden');
  });

  it('está habilitado para admin', () => {
    expect(CommandRegistry.isAvailable('profile:settings', { capability: 'admin' }).state)
      .toBe('enabled');
  });

  it('ejecuta el toggle registrado por el shell', async () => {
    const toggle = () => { /* toggle del panel */ };
    setProfileSettingsToggle(toggle);
    const result = await CommandRegistry.execute('profile:settings', { capability: 'admin' });
    expect(result).toEqual({ status: 'success' });
  });

  it('falla de forma cerrada si no hay handler (ventana no montada)', async () => {
    const result = await CommandRegistry.execute('profile:settings', { capability: 'admin' });
    expect(result.status).toBe('failure');
  });

  it('no se ejecuta para no-admin aunque exista handler', async () => {
    let called = false;
    setProfileSettingsToggle(() => { called = true; });
    const result = await CommandRegistry.execute('profile:settings', { capability: 'public' });
    expect(result.status).toBe('failure');
    expect(called).toBe(false);
  });
});
