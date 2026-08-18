/* wandori.us — Command Registry
 * Registro central de comandos del OS.
 * Contrato canónico (plan §2): cada comando declara ID estable, contexto,
 * capacidades, disponibilidad, icono Lucide, atajo, orden, política de undo
 * y evento analítico. Las superficies proyectan el Registry; no mantienen
 * listas paralelas.
 *
 * [297A-9/10] Contrato transversal de interacción, comandos y medición. */

import type { IconNode } from 'lucide';
import { adminOnlyAvailability, type Capability } from './capability';

/* === Tipos del contrato de comandos === */

/** Disponibilidad de un comando en un contexto dado. */
export type CommandAvailability =
  | { state: 'enabled' }
  | { state: 'disabled'; reason: string }
  | { state: 'hidden' };

/** Resultado de ejecutar un comando. */
export type CommandResult =
  | { status: 'success' }
  | { status: 'failure'; reason: string }
  | { status: 'conflict'; detail?: string }
  | { status: 'cancelled' };

/** Contexto de ejecución del comando. */
export interface CommandContext {
  /** Targets seleccionados sobre los que actúa. */
  readonly targets?: readonly CommandTarget[];
  /** Capacidad del usuario actual ('public' | 'authenticated' | 'admin'). */
  readonly capability?: Capability;
  /** Modo de presentación ('desktop' | 'tablet' | 'mobile'). */
  readonly presentationMode?: 'desktop' | 'tablet' | 'mobile';
}

/** Target sobre el que actúa un comando. */
export interface CommandTarget {
  readonly id: string;
  readonly kind: 'app' | 'folder' | 'resource' | 'window' | 'shortcut';
}

/** Política de undo para este comando. */
export type UndoPolicy =
  | 'none'           /* No reversible (login, pago, publicación) */
  | 'local'          /* Reversible localmente (geometría, rename) */
  | 'compensating';  /* Reversible via comando compensatorio remoto */

/** Definición completa de un comando del OS. */
export interface Command {
  /** Identificador único estable (ej: 'window:close', 'app:open'). */
  readonly id: string;
  /** Etiqueta visible para menús. */
  readonly label: string;
  /** Icono Lucide para menús y toolbar. */
  readonly icon?: IconNode;
  /** Atajo de teclado opcional (ej: 'Ctrl+C', 'Escape'). */
  readonly shortcut?: string;
  /** Orden de aparición en menús. Menor = primero. */
  readonly order?: number;
  /** Contextos donde este comando es relevante. */
  readonly contexts?: readonly string[];
  /** Capacidad mínima requerida. Default: 'public'. */
  readonly requires?: Capability;
  /** Política de undo. Default: 'none'. */
  readonly undoPolicy?: UndoPolicy;
  /** Nombre del evento analítico al ejecutar. */
  readonly analyticsEvent?: string;
  /** Función que determina disponibilidad dado un contexto. */
  readonly isAvailable?: (ctx: CommandContext) => CommandAvailability;
  /** [018A-71] Si el comando representa un estado seleccionable (filtros,
   * vistas, toggles), devuelve true cuando está activo: las superficies
   * muestran un checkmark, patrón de menú de OS. Opcional. */
  readonly isActive?: (ctx: CommandContext) => boolean;
  /** Función a ejecutar. Devuelve CommandResult. */
  readonly execute: (ctx?: CommandContext) => CommandResult | Promise<CommandResult>;
}

/** Envuelve un comando para restringirlo a administradores.
 * [297A-29 F2] Reutilizable para acciones de toolbar/shell visibles solo a
 * admins. El shell no hace if/else por capacidad: el comando declara su
 * disponibilidad y las superficies la proyectan. Fail-closed: capacidad
 * no admin (o ausente) => hidden. */
export function adminOnly<T extends Command>(command: T): T {
  return {
    ...command,
    isAvailable: (ctx) => {
      const admin = adminOnlyAvailability(ctx.capability);
      if (admin.state !== 'enabled') return admin;
      return command.isAvailable ? command.isAvailable(ctx) : { state: 'enabled' };
    },
  };
}

/* === Registry === */

class CommandRegistryClass {
  private commands = new Map<string, Command>();

  /** Registrar un comando. Error silencioso si ya existe (evitar duplicados). */
  register(command: Command): void {
    if (this.commands.has(command.id)) {
      /* [Plan §2.1] Tests prueban que no se puede registrar duplicado */
      console.warn(`[CommandRegistry] duplicate registration: ${command.id}`);
      return;
    }
    this.commands.set(command.id, command);
  }

  /** Registrar múltiples comandos. */
  registerAll(commands: readonly Command[]): void {
    for (const cmd of commands) this.register(cmd);
  }

  /** Ejecutar un comando por ID con contexto opcional. */
  async execute(id: string, ctx?: CommandContext): Promise<CommandResult> {
    const cmd = this.commands.get(id);
    if (!cmd) return { status: 'failure', reason: `unknown command: ${id}` };

    /* Verificar disponibilidad si el comando define isAvailable */
    if (cmd.isAvailable && ctx) {
      const avail = cmd.isAvailable(ctx);
      if (avail.state === 'hidden') {
        return { status: 'failure', reason: 'command not available' };
      }
      if (avail.state === 'disabled') {
        return { status: 'failure', reason: avail.reason };
      }
    }

    return await cmd.execute(ctx);
  }

  /** Obtener un comando por ID. */
  get(id: string): Command | undefined {
    return this.commands.get(id);
  }

  /** Listar todos los comandos registrados, ordenados por order. */
  getAll(): readonly Command[] {
    return Array.from(this.commands.values())
      .sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
  }

  /** Listar comandos con shortcut para el handler de teclado. */
  getWithShortcuts(): readonly Command[] {
    return this.getAll().filter(c => c.shortcut);
  }

  /** Listar comandos cuyo ID empieza con el prefix dado (namespace). */
  getByPrefix(prefix: string): readonly Command[] {
    return this.getAll().filter(cmd => cmd.id.startsWith(prefix));
  }

  /** Listar comandos disponibles para un contexto dado. */
  getByContext(context: string, ctx?: CommandContext): readonly Command[] {
    return this.getAll().filter(cmd => {
      /* Filtrar por contexto si el comando declara contexts */
      if (cmd.contexts && !cmd.contexts.includes(context)) return false;
      /* Filtrar por disponibilidad */
      if (cmd.isAvailable && ctx) {
        const avail = cmd.isAvailable(ctx);
        if (avail.state === 'hidden') return false;
      }
      return true;
    });
  }

  /** Listar comandos para un target específico. */
  getForTarget(target: CommandTarget, ctx?: CommandContext): readonly Command[] {
    return this.getAll().filter(cmd => {
      if (cmd.isAvailable && ctx) {
        const avail = cmd.isAvailable({ ...ctx, targets: [target] });
        if (avail.state === 'hidden') return false;
      }
      return true;
    });
  }

  /** Verificar si un comando está disponible. */
  isAvailable(id: string, ctx: CommandContext): CommandAvailability {
    const cmd = this.commands.get(id);
    if (!cmd) return { state: 'hidden' };
    if (cmd.isAvailable) return cmd.isAvailable(ctx);
    return { state: 'enabled' };
  }
}

/** Instancia singleton del registry. */
export const CommandRegistry = new CommandRegistryClass();
