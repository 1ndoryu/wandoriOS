/* [297A-18] Botón global de tema (UI atómica).
 * Único toggle del OS; reutilizado por la barra superior (desktop) y el
 * launcher móvil. Refleja el tema resuelto y ejecuta el comando compartido
 * theme:toggle (una sola fuente de verdad). Icono Lucide de 1px, etiqueta
 * accesible y estado aria-pressed. */

import { createElement, Moon, Sun } from 'lucide';
import { createEl } from '../../utils/dom';
import { themeStore, resolveTheme } from '../../features/runtime/theme-store';
import { CommandRegistry } from '../../features/runtime/command-registry';

export interface ThemeToggleButton {
  readonly element: HTMLButtonElement;
  readonly destroy: () => void;
}

export function createThemeToggleButton(className: string): ThemeToggleButton {
  let destroyed = false;
  const button = createEl('button', { type: 'button', className });

  function render(): void {
    if (destroyed) return;
    const theme = resolveTheme(themeStore.get());
    const next = theme === 'claro' ? 'oscuro' : 'claro';
    const icon = createElement(theme === 'claro' ? Sun : Moon);
    icon.classList.add('temaToggle__icono');
    button.replaceChildren(icon);
    button.setAttribute('aria-label', `Cambiar a tema ${next === 'claro' ? 'claro' : 'oscuro'}`);
    button.setAttribute('aria-pressed', theme === 'oscuro' ? 'true' : 'false');
    button.title = button.getAttribute('aria-label') ?? '';
  }
  render();

  const stop = themeStore.subscribeSimple(render);
  button.addEventListener('click', () => {
    void CommandRegistry.execute('theme:toggle');
  });

  return {
    element: button,
    destroy: () => {
      destroyed = true;
      stop();
      button.remove();
    },
  };
}
