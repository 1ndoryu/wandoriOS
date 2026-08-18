/* wandori.us — Preferences Panel
 * Panel de preferencias embebido en la ventana Cuenta [297A-26].
 * Siempre muestra la preferencia de tema (sistema/claro/oscuro) con su
 * selector; cuando el sync detecta un conflicto entre dispositivo y cuenta,
 * añade debajo la resolución (conservar local / usar remoto).
 * No conoce HTTP: cambia el tema vía themeStore (source 'user' → sync remoto)
 * y delega el conflicto en resolvePreferencesConflict(). */

import { createEl } from '../../utils/dom';
import { themeStore, type ThemeMode } from './theme-store';
import {
  preferencesSyncStore,
  resolvePreferencesConflict,
  type PreferencesSyncState,
} from './preferences-sync';

const THEME_MODES: readonly ThemeMode[] = ['system', 'claro', 'oscuro'];

function themeLabel(theme: PreferencesSyncState['remoteTheme']): string {
  if (theme === 'claro') return 'claro';
  if (theme === 'oscuro') return 'oscuro';
  return 'sistema';
}

function buildConflictContent(state: PreferencesSyncState): HTMLElement {
  const localTheme = themeStore.get();
  const title = createEl('h2', {
    className: 'preferences-conflict__title',
    textContent: 'preferencia actualizada',
  });
  const message = createEl('p', {
    className: 'preferences-conflict__message',
    textContent: 'Esta cuenta tiene una preferencia diferente. Elige cuál conservar.',
  });
  const values = createEl('dl', { className: 'preferences-conflict__values' });
  values.append(
    createEl('dt', { textContent: 'en este dispositivo' }),
    createEl('dd', { textContent: themeLabel(localTheme) }),
    createEl('dt', { textContent: 'en tu cuenta' }),
    createEl('dd', { textContent: themeLabel(state.remoteTheme) }),
  );

  /* [018A-64] Mismas etiquetas simplificadas que el conflicto de overlay:
   * paralelas y sin jerga de dominio. */
  const keepLocal = createEl('button', {
    className: 'boton preferences-conflict__action',
    type: 'button',
    textContent: 'conservar lo de este dispositivo',
    'aria-label': 'Conservar la preferencia de este dispositivo',
  });
  const useRemote = createEl('button', {
    className: 'boton preferences-conflict__action',
    type: 'button',
    textContent: 'usar lo de mi cuenta',
    'aria-label': 'Usar la preferencia de mi cuenta',
  });
  const actions = createEl('div', { className: 'preferences-conflict__actions' }, keepLocal, useRemote);

  const section = createEl('section', {
    className: 'preferences-conflict',
    'aria-label': 'Preferencia en conflicto',
  }, title, message, values, actions);

  keepLocal.addEventListener('click', () => {
    resolvePreferencesConflict('local');
  });
  useRemote.addEventListener('click', () => {
    resolvePreferencesConflict('remote');
  });
  return section;
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

/** Panel reactivo: preferencias siempre visibles; conflicto solo si existe. */
export function createPreferencesPanel(): { element: HTMLElement; destroy: () => void } {
  const element = createEl('div', { className: 'preferences-panel' });
  let stopped = false;

  const render = (): void => {
    if (stopped) return;
    const state = preferencesSyncStore.get();
    element.replaceChildren();
    const title = createEl('h2', {
      className: 'preferences-conflict__title',
      textContent: 'preferencias',
    });
    const selector = buildThemeSelector(themeStore.get());
    element.append(title, selector);
    if (state.status === 'conflict') {
      element.append(buildConflictContent(state));
    }
  };

  /* El selector debe reflejar también cambios externos de tema (barra
   * superior, atajo, launcher móvil), no solo el estado del sync. */
  const stopSync = preferencesSyncStore.subscribe(render);
  const stopTheme = themeStore.subscribeSimple(render);
  const destroy = (): void => {
    if (stopped) return;
    stopped = true;
    stopSync();
    stopTheme();
  };
  return { element, destroy };
}
