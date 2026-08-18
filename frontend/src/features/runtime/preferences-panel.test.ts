/* [297A-26] Tests del panel de preferencias embebido en la ventana Cuenta.
 * [297A-13] El conflicto se resuelve por LWW con aviso en preferences-sync;
 * el panel solo muestra el selector y nunca un bloque de resolución. */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PreferencesService } from '../../services/preferences.service';
import { authStore } from '../../store';
import { themeStore } from './theme-store';
import {
  clearPreferencesSync,
  initPreferencesSync,
  preferencesSyncStore,
  syncPreferencesForUser,
} from './preferences-sync';
import { createPreferencesPanel } from './preferences-panel';

function remote(theme: 'system' | 'claro' | 'oscuro', revision = 0) {
  return { theme, wallpaper: null, font: null, scale: null, revision, updated_at: '2026-07-31T00:00:00.000Z' };
}

let stopSync: (() => void) | null = null;
let panel: { element: HTMLElement; destroy: () => void } | null = null;

function mountPanel(): HTMLElement {
  panel = createPreferencesPanel();
  document.body.append(panel.element);
  return panel.element;
}

beforeEach(() => {
  stopSync?.();
  stopSync = initPreferencesSync();
  clearPreferencesSync();
  themeStore.set('system', 'sync');
  authStore.set({ isAuthenticated: true, userId: 'test-user', capability: 'authenticated' }, 'sync');
  vi.restoreAllMocks();
  panel?.destroy();
  panel = null;
  document.body.innerHTML = '';
});

describe('preferences panel', () => {
  it('muestra siempre la sección de preferencias con el selector de tema', () => {
    const element = mountPanel();

    const title = element.querySelector('.preferences-conflict__title');
    expect(title?.textContent).toBe('preferencias');
    const temas = element.querySelectorAll('.preferences-panel__tema');
    expect(temas.length).toBe(3);
    expect(Array.from(temas).map((t) => t.textContent)).toEqual(['sistema', 'claro', 'oscuro']);
    /* Nunca hay bloque de resolución: el conflicto se resuelve por LWW. */
    expect(element.querySelector('.preferences-conflict')).toBeNull();
  });

  it('marca como activo el tema actual del dispositivo', () => {
    themeStore.set('oscuro', 'user');
    const element = mountPanel();

    const activo = element.querySelector('.preferences-panel__tema[aria-pressed="true"]');
    expect(activo?.textContent).toBe('oscuro');
  });

  it('cambiar el tema desde el selector actualiza el themeStore', () => {
    const element = mountPanel();

    const botonOscuro = Array.from(element.querySelectorAll('.preferences-panel__tema'))
      .find((b) => b.textContent === 'oscuro') as HTMLButtonElement;
    botonOscuro.click();

    expect(themeStore.get()).toBe('oscuro');
  });

  it('refleja un cambio de tema externo (barra superior, atajo)', () => {
    const element = mountPanel();

    themeStore.set('claro', 'user');

    const activo = element.querySelector('.preferences-panel__tema[aria-pressed="true"]');
    expect(activo?.textContent).toBe('claro');
  });

  it('aplica LWW sin mostrar bloque de conflicto cuando el remoto difiere', async () => {
    themeStore.set('claro', 'user');
    vi.spyOn(PreferencesService, 'get').mockResolvedValue(remote('oscuro', 2));

    await syncPreferencesForUser('user-a');
    expect(themeStore.get()).toBe('oscuro');
    expect(preferencesSyncStore.get().status).toBe('ready');

    const element = mountPanel();
    expect(element.querySelector('.preferences-conflict')).toBeNull();
    expect(element.querySelectorAll('.preferences-panel__tema').length).toBe(3);
  });

  it('no muestra bloque de conflicto al limpiar la cuenta', () => {
    themeStore.set('claro', 'user');

    const element = mountPanel();
    expect(element.querySelector('.preferences-conflict')).toBeNull();

    clearPreferencesSync();
    expect(element.querySelector('.preferences-conflict')).toBeNull();
    /* Las preferencias base siguen visibles. */
    expect(element.querySelectorAll('.preferences-panel__tema').length).toBe(3);
  });
});
