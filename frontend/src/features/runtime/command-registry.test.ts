/* Tests para command-registry.ts [Auditoría v4 §6.1] */
import { describe, it, expect, vi } from 'vitest';
import {
  adminOnly,
  CommandRegistry,
  type Command,
  type CommandContext,
  type CommandResult,
} from './command-registry';

/* Helper para crear comandos de prueba */
function makeCmd(overrides: Partial<Command> & Pick<Command, 'id'>): Command {
  return {
    label: overrides.id,
    execute: () => ({ status: 'success' }),
    ...overrides,
  };
}

/* Nota: CommandRegistry es un singleton. Los tests acumulan estado entre sí.
 * Usamos IDs únicos por test para evitar colisiones. */

describe('CommandRegistry', () => {
  describe('register', () => {
    it('registra un comando y lo recupera por ID', () => {
      const cmd = makeCmd({ id: 'test:register-1' });
      CommandRegistry.register(cmd);
      expect(CommandRegistry.get('test:register-1')).toBe(cmd);
    });

    it('ignora registro duplicado (silencioso con warn)', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const cmd1 = makeCmd({ id: 'test:dup-1', label: 'first' });
      const cmd2 = makeCmd({ id: 'test:dup-1', label: 'second' });
      CommandRegistry.register(cmd1);
      CommandRegistry.register(cmd2);
      expect(CommandRegistry.get('test:dup-1')?.label).toBe('first');
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe('registerAll', () => {
    it('registra múltiples comandos de una vez', () => {
      const cmds = [
        makeCmd({ id: 'test:multi-1' }),
        makeCmd({ id: 'test:multi-2' }),
        makeCmd({ id: 'test:multi-3' }),
      ];
      CommandRegistry.registerAll(cmds);
      expect(CommandRegistry.get('test:multi-1')).toBeDefined();
      expect(CommandRegistry.get('test:multi-2')).toBeDefined();
      expect(CommandRegistry.get('test:multi-3')).toBeDefined();
    });
  });

  describe('execute', () => {
    it('ejecuta un comando registrado', async () => {
      const execute = vi.fn<() => CommandResult>(() => ({ status: 'success' }));
      CommandRegistry.register(makeCmd({ id: 'test:exec-1', execute }));
      const result = await CommandRegistry.execute('test:exec-1');
      expect(result).toEqual({ status: 'success' });
      expect(execute).toHaveBeenCalled();
    });

    it('retorna failure para comando desconocido', async () => {
      const result = await CommandRegistry.execute('test:nonexistent');
      expect(result.status).toBe('failure');
      expect(result).toHaveProperty('reason');
    });

    it('pasa el contexto al execute', async () => {
      const execute = vi.fn<() => CommandResult>(() => ({ status: 'success' }));
      CommandRegistry.register(makeCmd({ id: 'test:exec-ctx', execute }));
      const ctx: CommandContext = { capability: 'admin' };
      await CommandRegistry.execute('test:exec-ctx', ctx);
      expect(execute).toHaveBeenCalledWith(ctx);
    });

    it('retorna failure si isAvailable retorna hidden', async () => {
      CommandRegistry.register(makeCmd({
        id: 'test:hidden-1',
        isAvailable: () => ({ state: 'hidden' }),
      }));
      const result = await CommandRegistry.execute('test:hidden-1', {});
      expect(result.status).toBe('failure');
    });

    it('retorna failure si isAvailable retorna disabled', async () => {
      CommandRegistry.register(makeCmd({
        id: 'test:disabled-1',
        isAvailable: () => ({ state: 'disabled', reason: 'no selection' }),
      }));
      const result = await CommandRegistry.execute('test:disabled-1', {});
      expect(result.status).toBe('failure');
      if (result.status === 'failure') {
        expect(result.reason).toBe('no selection');
      }
    });

    it('ejecuta si isAvailable retorna enabled', async () => {
      const execute = vi.fn<() => CommandResult>(() => ({ status: 'success' }));
      CommandRegistry.register(makeCmd({
        id: 'test:enabled-1',
        execute,
        isAvailable: () => ({ state: 'enabled' }),
      }));
      await CommandRegistry.execute('test:enabled-1', {});
      expect(execute).toHaveBeenCalled();
    });

    it('soporta execute async (Promise<CommandResult>)', async () => {
      CommandRegistry.register(makeCmd({
        id: 'test:async-1',
        execute: async () => {
          await new Promise(r => setTimeout(r, 5));
          return { status: 'success' };
        },
      }));
      const result = await CommandRegistry.execute('test:async-1');
      expect(result.status).toBe('success');
    });
  });

  describe('get', () => {
    it('retorna undefined para ID no registrado', () => {
      expect(CommandRegistry.get('test:nonexistent-get')).toBeUndefined();
    });
  });

  describe('getAll', () => {
    it('retorna comandos ordenados por order', () => {
      CommandRegistry.register(makeCmd({ id: 'test:order-3', order: 30 }));
      CommandRegistry.register(makeCmd({ id: 'test:order-1', order: 10 }));
      CommandRegistry.register(makeCmd({ id: 'test:order-2', order: 20 }));
      const all = CommandRegistry.getAll();
      const ids = all.map(c => c.id);
      expect(ids.indexOf('test:order-1')).toBeLessThan(ids.indexOf('test:order-2'));
      expect(ids.indexOf('test:order-2')).toBeLessThan(ids.indexOf('test:order-3'));
    });

    it('comandos sin order van al final (default 100)', () => {
      CommandRegistry.register(makeCmd({ id: 'test:no-order', order: undefined }));
      CommandRegistry.register(makeCmd({ id: 'test:with-order', order: 1 }));
      const all = CommandRegistry.getAll();
      const withOrderIdx = all.findIndex(c => c.id === 'test:with-order');
      const noOrderIdx = all.findIndex(c => c.id === 'test:no-order');
      expect(withOrderIdx).toBeLessThan(noOrderIdx);
    });
  });

  describe('getWithShortcuts', () => {
    it('retorna solo comandos con shortcut', () => {
      CommandRegistry.register(makeCmd({ id: 'test:shortcut-yes', shortcut: 'Ctrl+S' }));
      CommandRegistry.register(makeCmd({ id: 'test:shortcut-no' }));
      const withShortcuts = CommandRegistry.getWithShortcuts();
      expect(withShortcuts.some(c => c.id === 'test:shortcut-yes')).toBe(true);
      expect(withShortcuts.some(c => c.id === 'test:shortcut-no')).toBe(false);
    });
  });

  describe('getByPrefix', () => {
    it('retorna comandos cuyo ID empieza con el prefix', () => {
      CommandRegistry.register(makeCmd({ id: 'finder:open' }));
      CommandRegistry.register(makeCmd({ id: 'finder:new-folder' }));
      CommandRegistry.register(makeCmd({ id: 'window:close' }));
      const finderCmds = CommandRegistry.getByPrefix('finder:');
      expect(finderCmds.some(c => c.id === 'finder:open')).toBe(true);
      expect(finderCmds.some(c => c.id === 'finder:new-folder')).toBe(true);
      expect(finderCmds.some(c => c.id === 'window:close')).toBe(false);
    });
  });

  describe('getByContext', () => {
    it('filtra por contexto declarado', () => {
      CommandRegistry.register(makeCmd({ id: 'test:ctx-desktop', contexts: ['desktop'] }));
      CommandRegistry.register(makeCmd({ id: 'test:ctx-any' }));
      const desktopCmds = CommandRegistry.getByContext('desktop');
      expect(desktopCmds.some(c => c.id === 'test:ctx-desktop')).toBe(true);
      /* Sin contexts declarados → aparece en todos los contextos */
      expect(desktopCmds.some(c => c.id === 'test:ctx-any')).toBe(true);
    });

    it('excluye comandos hidden en el contexto dado', () => {
      CommandRegistry.register(makeCmd({
        id: 'test:ctx-hidden',
        contexts: ['desktop'],
        isAvailable: () => ({ state: 'hidden' }),
      }));
      const desktopCmds = CommandRegistry.getByContext('desktop', {});
      expect(desktopCmds.some(c => c.id === 'test:ctx-hidden')).toBe(false);
    });
  });

  describe('getForTarget', () => {
    it('retorna comandos para un target específico', () => {
      CommandRegistry.register(makeCmd({ id: 'test:target-1' }));
      const cmds = CommandRegistry.getForTarget({ id: 'node-1', kind: 'folder' });
      expect(cmds.some(c => c.id === 'test:target-1')).toBe(true);
    });

    it('excluye comandos hidden para el target', () => {
      CommandRegistry.register(makeCmd({
        id: 'test:target-hidden',
        isAvailable: () => ({ state: 'hidden' }),
      }));
      const cmds = CommandRegistry.getForTarget({ id: 'node-1', kind: 'folder' }, {});
      expect(cmds.some(c => c.id === 'test:target-hidden')).toBe(false);
    });
  });

  describe('isAvailable', () => {
    it('retorna enabled para comando sin isAvailable', () => {
      CommandRegistry.register(makeCmd({ id: 'test:avail-default' }));
      expect(CommandRegistry.isAvailable('test:avail-default', {})).toEqual({ state: 'enabled' });
    });

    it('retorna hidden para comando no registrado', () => {
      expect(CommandRegistry.isAvailable('test:avail-unknown', {})).toEqual({ state: 'hidden' });
    });

    it('delega en isAvailable del comando', () => {
      CommandRegistry.register(makeCmd({
        id: 'test:avail-custom',
        isAvailable: (ctx) =>
          ctx.capability === 'admin' ? { state: 'enabled' } : { state: 'disabled', reason: 'admin only' },
      }));
      expect(CommandRegistry.isAvailable('test:avail-custom', { capability: 'admin' })).toEqual({ state: 'enabled' });
      expect(CommandRegistry.isAvailable('test:avail-custom', { capability: 'public' })).toEqual({ state: 'disabled', reason: 'admin only' });
    });
  });

  /* [297A-29 F2] Comando genérico admin-only: el shell no hace if/else por
   * capacidad, el comando declara su disponibilidad y las superficies la proyectan. */
  describe('adminOnly', () => {
    it('envuelve un comando restringiéndolo a admin', async () => {
      const execute = vi.fn<() => CommandResult>(() => ({ status: 'success' }));
      const base = makeCmd({ id: 'test:admin-only-1', execute });
      CommandRegistry.register(adminOnly(base));

      /* Admin: disponible y ejecuta */
      expect(CommandRegistry.isAvailable('test:admin-only-1', { capability: 'admin' })).toEqual({ state: 'enabled' });
      await CommandRegistry.execute('test:admin-only-1', { capability: 'admin' });
      expect(execute).toHaveBeenCalled();

      /* No-admin: hidden y falla fail-closed */
      expect(CommandRegistry.isAvailable('test:admin-only-1', { capability: 'authenticated' })).toEqual({ state: 'hidden' });
      const denied = await CommandRegistry.execute('test:admin-only-1', { capability: 'authenticated' });
      expect(denied.status).toBe('failure');
    });

    it('compone con el isAvailable existente del comando base', () => {
      const base = makeCmd({
        id: 'test:admin-only-comp-1',
        isAvailable: (ctx) =>
          ctx.targets?.length ? { state: 'enabled' } : { state: 'disabled', reason: 'no target' },
      });
      CommandRegistry.register(adminOnly(base));

      /* Admin + target: enabled */
      expect(CommandRegistry.isAvailable('test:admin-only-comp-1', {
        capability: 'admin', targets: [{ id: 'x', kind: 'folder' }],
      })).toEqual({ state: 'enabled' });

      /* No-admin: hidden antes incluso de evaluar el base */
      expect(CommandRegistry.isAvailable('test:admin-only-comp-1', { capability: 'public' })).toEqual({ state: 'hidden' });
    });
  });
});
