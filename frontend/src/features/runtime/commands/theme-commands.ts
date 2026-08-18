/* [297A-18] Comando global de tema.
 * Un único comando para todo el OS: barra superior, launcher móvil y teclado.
 * El override explícito se persiste en theme-store; 'system' se alcanza por
 * reset futuro en Configuración (sigue la preferencia del SO). */

import { CommandRegistry, type CommandResult } from '../command-registry';

CommandRegistry.register({
  id: 'theme:toggle',
  label: 'Cambiar tema',
  /* [297A-20] Prueba de usuario: se quito el icono Sun para que quepa el
   * texto + atajo en el menu contextual del escritorio (era el unico item
   * con icono y desplazaba el label). Para revertir: restaurar
   * `icon: Sun` e importar Sun desde 'lucide'. */
  shortcut: 'Meta+Shift+l',
  order: 1,
  contexts: ['desktop', 'mobile', 'shortcut'],
  requires: 'public',
  undoPolicy: 'none',
  analyticsEvent: 'theme.toggled',
  isAvailable: () => ({ state: 'enabled' }),
  execute: async (): Promise<CommandResult> => {
    const { themeStore, resolveTheme } = await import('../theme-store');
    const mode = themeStore.get();
    const current = resolveTheme(mode);
    themeStore.set(current === 'claro' ? 'oscuro' : 'claro');
    return { status: 'success' };
  },
});
