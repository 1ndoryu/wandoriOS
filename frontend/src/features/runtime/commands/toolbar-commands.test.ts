/* Tests del comando admin-only 'game:settings' [297A-63].
 * Importar el módulo registra el comando (side effect). Verifica:
 * - Oculto para no-admin (fail-closed).
 * - Visible/ejecutable para admin.
 * - Dispara el evento game:settings sobre la ventana enfocada del Bosque
 *   (la app alterna su contenido: juego ↔ configuración), sin modal. */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CommandRegistry } from '../command-registry';
import { windowStore } from '../window-manager';

import './toolbar-commands';

describe('game:settings', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('está registrado en el registry', () => {
    const cmd = CommandRegistry.get('game:settings');
    expect(cmd).toBeDefined();
    expect(cmd?.label).toBe('Configuración del Bosque');
    expect(cmd?.contexts).toContain('toolbar');
  });

  it('está oculto para invitados y autenticados no-admin (adminOnly)', () => {
    expect(CommandRegistry.isAvailable('game:settings', { capability: 'public' }).state)
      .toBe('hidden');
    expect(CommandRegistry.isAvailable('game:settings', { capability: 'authenticated' }).state)
      .toBe('hidden');
  });

  it('está habilitado para admin', () => {
    expect(CommandRegistry.isAvailable('game:settings', { capability: 'admin' }).state)
      .toBe('enabled');
  });

  it('dispara el evento game:settings sobre la ventana enfocada del Bosque', async () => {
    const content = document.createElement('section');
    const dispatchSpy = vi.spyOn(content, 'dispatchEvent');
    vi.spyOn(windowStore, 'get').mockReturnValue([
      {
        instanceId: 'win-1',
        appId: 'game-playable',
        title: 'Bosque · prueba',
        focused: true,
        content,
      } as never,
    ]);

    const result = await CommandRegistry.execute('game:settings', { capability: 'admin' });
    expect(result).toEqual({ status: 'success' });
    const event = dispatchSpy.mock.calls[0]?.[0] as CustomEvent | undefined;
    expect(event?.type).toBe('game:settings');
  });

  it('no se ejecuta para no-admin aunque la ventana esté enfocada', async () => {
    const content = document.createElement('section');
    const dispatchSpy = vi.spyOn(content, 'dispatchEvent');
    vi.spyOn(windowStore, 'get').mockReturnValue([
      {
        instanceId: 'win-1',
        appId: 'game-playable',
        title: 'Bosque · prueba',
        focused: true,
        content,
      } as never,
    ]);

    const result = await CommandRegistry.execute('game:settings', { capability: 'public' });
    expect(result.status).toBe('failure');
    expect(dispatchSpy).not.toHaveBeenCalled();
  });
});
