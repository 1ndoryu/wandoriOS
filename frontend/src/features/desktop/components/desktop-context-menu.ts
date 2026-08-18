/* wandori.us — Desktop Context Menu
 * Menú contextual del escritorio basado en CommandRegistry.
 * [Plan §2.3/3.2] Clic derecho selecciona target antes de abrir menú.
 * [Auditoría v2] Usa el componente compartido dropdown-menu.ts. */

import { CommandRegistry, type CommandContext, type CommandTarget } from '../../runtime/command-registry';
import { openDropdownMenu, type DropdownMenuItem } from './dropdown-menu';

export interface ContextMenuOptions {
  /** Contexto de menú ('desktop', 'icon', 'folder', 'window', 'taskbar'). */
  context: string;
  /** Targets sobre los que actúa. */
  targets?: readonly CommandTarget[];
  /** Capacidad del usuario actual. */
  capability?: 'public' | 'authenticated' | 'admin';
  /** Presentación que solicita el menú; por defecto desktop. */
  presentationMode?: 'desktop' | 'tablet' | 'mobile';
  /** Clase de presentación opcional; el comportamiento sigue siendo compartido. */
  className?: string;
  /** Posición donde mostrar el menú. */
  x: number;
  y: number;
}

/**
 * Abrir menú contextual del OS.
 * [Plan §2.1] Proyecta CommandRegistry; no mantiene lista paralela.
 * [Auditoría v2] Delega a dropdown-menu.ts para rendering y behavior.
 */
export function openContextMenu(options: ContextMenuOptions): void {
  const ctx: CommandContext = {
    targets: options.targets,
    capability: options.capability,
    presentationMode: options.presentationMode ?? 'desktop',
  };

  const commands = CommandRegistry.getByContext(options.context, ctx);
  if (commands.length === 0) return;

  /* Convertir comandos a DropdownMenuItem[] */
  const items: DropdownMenuItem[] = commands.map(cmd => {
    const availability = cmd.isAvailable ? cmd.isAvailable(ctx) : { state: 'enabled' as const };
    return {
      icon: cmd.icon,
      label: cmd.label,
      shortcut: cmd.shortcut,
      disabled: availability.state === 'disabled',
      onClick: availability.state === 'enabled'
        ? () => { void CommandRegistry.execute(cmd.id, ctx); }
        : undefined,
    };
  });

  openDropdownMenu({
    items,
    ariaLabel: 'Menú contextual',
    positioning: 'fixed',
    className: options.className,
    x: options.x,
    y: options.y,
  });
}
