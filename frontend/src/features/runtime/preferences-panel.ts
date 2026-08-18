/* wandori.us — Preferences Panel
 * Panel de preferencias embebido en la ventana Cuenta [297A-26].
 * Muestra el selector de tema (sistema/claro/oscuro) siempre.
 * [297A-13] El conflicto se resuelve automáticamente por LWW con aviso no
 * bloqueante (preferences-sync); ya no hay bloque de resolución aquí.
 * No conoce HTTP: cambia el tema vía themeStore (source 'user' → sync remoto). */

import { createEl } from '../../utils/dom';
import { themeStore, type ThemeMode } from './theme-store';

const THEME_MODES: readonly ThemeMode[] = ['system', 'claro', 'oscuro'];

function themeLabel(theme: ThemeMode): string {
  if (theme === 'claro') return 'claro';
  if (theme === 'oscuro') return 'oscuro';
  return 'sistema';
}

/** Selector de tema: tres modos, el actual marcado; cambia vía themeStore. */
function buildThemeSelector(current: ThemeMode): HTMLElement {
  const label = createEl('span', {
    className: 'preferences-panel__etiqueta',
    textContent: 'tema',
  });
  const options = createEl('div', {
    className: 'preferences-panel__temas',
    role: 'group',
    'aria-label': 'Seleccionar tema',
  });

  for (const mode of THEME_MODES) {
    const button = createEl('button', {
      className: 'boton preferences-panel__tema',
      type: 'button',
      textContent: themeLabel(mode),
      'aria-pressed': String(mode === current),
      'aria-label': `tema ${mode}`,
    });
    button.addEventListener('click', () => {
      /* Source por defecto 'user': preferences-sync lo escucha y encola la
       * actualización remota de la preferencia de la cuenta. */
      themeStore.set(mode);
    });
    options.append(button);
  }
  return createEl('div', { className: 'preferences-panel__selector' }, label, options);
}

/** Panel reactivo: preferencias siempre visibles. */
export function createPreferencesPanel(): { element: HTMLElement; destroy: () => void } {
  const element = createEl('div', { className: 'preferences-panel' });
  let stopped = false;

  const render = (): void => {
    if (stopped) return;
    element.replaceChildren();
    const title = createEl('h2', {
      className: 'preferences-conflict__title',
      textContent: 'preferencias',
    });
    const selector = buildThemeSelector(themeStore.get());
    element.append(title, selector);
  };

  /* El selector debe reflejar también cambios externos de tema (barra
   * superior, atajo, launcher móvil), no solo el estado del sync. */
  const stopTheme = themeStore.subscribeSimple(render);
  const destroy = (): void => {
    if (stopped) return;
    stopped = true;
    stopTheme();
  };
  return { element, destroy };
}
