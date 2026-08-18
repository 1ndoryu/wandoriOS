/* wandori.us — App Commands
 * Comandos para abrir y enfocar aplicaciones. */

import { CommandRegistry, type CommandContext, type CommandResult } from '../command-registry';
import { focusWindow, findOpenWindow, restoreWindow } from '../window-manager';
import { AppRegistry } from '../app-registry';
import { hasCapability } from '../capability';

CommandRegistry.register({
  id: 'app:open',
  label: 'Abrir aplicación',
  order: 1,
  contexts: ['desktop', 'shortcut', 'taskbar'],
  requires: 'public',
  undoPolicy: 'none',
  analyticsEvent: 'app.opened',
  isAvailable: (ctx) => {
    const appId = ctx.targets?.[0]?.id;
    if (!appId) return { state: 'disabled', reason: 'no app target' };
    const app = AppRegistry.get(appId);
    if (!app) return { state: 'hidden' };
    if (!hasCapability(ctx.capability ?? 'public', app.requires)) return { state: 'hidden' };
    return { state: 'enabled' };
  },
  execute: async (ctx?: CommandContext): Promise<CommandResult> => {
    const appId = ctx?.targets?.[0]?.id;
    if (!appId) return { status: 'failure', reason: 'no app target' };
    const { openAppWindow } = await import('../route-app-adapter');
    await openAppWindow(appId);
    return { status: 'success' };
  },
});

CommandRegistry.register({
  id: 'app:focus',
  label: 'Enfocar aplicación',
  order: 2,
  contexts: ['taskbar', 'shortcut'],
  undoPolicy: 'local',
  analyticsEvent: 'app.focused',
  isAvailable: (ctx) => {
    const appId = ctx.targets?.[0]?.id;
    if (!appId) return { state: 'disabled', reason: 'no app target' };
    const win = findOpenWindow(appId);
    if (!win) return { state: 'hidden' };
    return win.focused
      ? { state: 'disabled', reason: 'already focused' }
      : { state: 'enabled' };
  },
  execute: (ctx?: CommandContext): CommandResult => {
    const appId = ctx?.targets?.[0]?.id;
    if (!appId) return { status: 'failure', reason: 'no app target' };
    const win = findOpenWindow(appId);
    if (!win) return { status: 'failure', reason: 'app not open' };
    if (win.state === 'minimized') restoreWindow(win.instanceId);
    focusWindow(win.instanceId);
    return { status: 'success' };
  },
});
