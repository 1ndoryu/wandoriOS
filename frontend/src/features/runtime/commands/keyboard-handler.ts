/* wandori.us — Keyboard Handler
 * Handler global de atajos de teclado del OS. [Plan §2.1] */

import { CommandRegistry, type CommandContext } from '../command-registry';
import { windowStore } from '../window-manager';

/* [018A-90] Ctrl+V pega dentro de la carpeta abierta del Finder enfocado
 * (antes CommandRegistry.execute se llamaba sin ctx y pegaba siempre en el
 * escritorio). Sin ventana del Finder enfocada, el destino es el escritorio. */
function buildPasteContext(): CommandContext | undefined {
  const focused = windowStore.get().find((w) => w.focused && w.appId === 'finder');
  const folderId = focused?.params?.folderId;
  if (!folderId) return undefined;
  return { targets: [{ id: folderId, kind: 'folder' }] };
}

export function initKeyboardShortcuts(): () => void {
  const onKeyDown = (e: KeyboardEvent): void => {
    const target = e.target as HTMLElement;
    if (
      target.tagName === 'INPUT'
      || target.tagName === 'TEXTAREA'
      || target.isContentEditable
    ) {
      if (e.key !== 'Escape') return;
    }

    const commands = CommandRegistry.getWithShortcuts();
    for (const cmd of commands) {
      if (matchesShortcut(e, cmd.shortcut!)) {
        e.preventDefault();
        const ctx = cmd.id === 'workspace:paste' ? buildPasteContext() : undefined;
        void CommandRegistry.execute(cmd.id, ctx);
        return;
      }
    }
  };

  document.addEventListener('keydown', onKeyDown);
  return () => { document.removeEventListener('keydown', onKeyDown); };
}

function matchesShortcut(e: KeyboardEvent, shortcut: string): boolean {
  const parts = shortcut.toLowerCase().split('+');
  const key = parts[parts.length - 1];
  const modifiers = parts.slice(0, -1);

  const keyMatch = e.key.toLowerCase() === key || (key.length === 1 && e.code.toLowerCase() === `key${key}`);
  if (!keyMatch) return false;

  for (const mod of modifiers) {
    switch (mod) {
      case 'meta':
      case 'cmd':
        if (!e.metaKey) return false;
        break;
      case 'ctrl':
        if (!e.ctrlKey) return false;
        break;
      case 'alt':
        if (!e.altKey) return false;
        break;
      case 'shift':
        if (!e.shiftKey) return false;
        break;
    }
  }

  return true;
}
