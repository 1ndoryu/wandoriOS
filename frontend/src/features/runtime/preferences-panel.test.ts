/* [297A-26] Tests del panel de preferencias embebido en la ventana Cuenta.
 * Verifica que las preferencias (tema) siempre se muestran y que el bloque de
 * conflicto solo aparece cuando el sync está en estado conflict. */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PreferencesService } from '../../services/preferences.service';
import { authStore } from '../../store';
import { themeStore } from './theme-store';
import {
  clearPreferencesSync,
  initPreferencesSync,
  preferencesSyncStore,
  resolvePreferencesConflict,
  syncPreferencesForUser,
} from './preferences-sync';
import { createPreferencesPanel } from './preferences-panel';

function remote(theme: 'system' | 'claro' | 'oscuro', revision = 0) {
  return { theme, revision, updated_at: '2026-07-31T00:00:00.000Z' };
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
    /* Sin conflicto: no se muestra el bloque de resolución. */
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

  it('muestra el bloque de conflicto cuando el sync está en conflict', async () => {
    themeStore.set('claro', 'user');
    vi.spyOn(PreferencesService, 'get').mockResolvedValue(remote('oscuro', 2));

    await syncPreferencesForUser('user-a');
    expect(preferencesSyncStore.get().status).toBe('conflict');

    const element = mountPanel();

    const conflicto = element.querySelector('.preferences-conflict');
    expect(conflicto).not.toBeNull();
    expect(conflicto?.querySelector('.preferences-conflict__title')?.textContent)
      .toBe('preferencia actualizada');
    expect(conflicto?.querySelectorAll('.preferences-conflict__action').length).toBe(2);
  });

  it('permite conservar el dispositivo y oculta el conflicto tras resolver', async () => {
    themeStore.set('claro', 'user');
    vi.spyOn(PreferencesService, 'get').mockResolvedValue(remote('oscuro', 2));
    vi.spyOn(PreferencesService, 'update').mockResolvedValue(remote('claro', 3));

    await syncPreferencesForUser('user-a');
    const element = mountPanel();
    expect(element.querySelector('.preferences-conflict')).not.toBeNull();

    const conservar = Array.from(element.querySelectorAll('.preferences-conflict__action'))
      .find((b) => b.textContent === 'conservar lo de este dispositivo') as HTMLButtonElement;
    conservar.click();

    await vi.waitFor(() => expect(preferencesSyncStore.get().status).toBe('ready'));
    expect(element.querySelector('.preferences-conflict')).toBeNull();
    /* La sección de preferencias sigue visible tras resolver. */
    expect(element.querySelector('.preferences-conflict__title')?.textContent).toBe('preferencias');

    /* Limpieza: resolver remoto en el test para no dejar estado pendiente. */
    resolvePreferencesConflict('remote');
  });

  it('permite usar la preferencia de la cuenta', async () => {
    themeStore.set('claro', 'user');
    vi.spyOn(PreferencesService, 'get').mockResolvedValue(remote('oscuro', 2));

    await syncPreferencesForUser('user-a');
    const element = mountPanel();

    const usarCuenta = Array.from(element.querySelectorAll('.preferences-conflict__action'))
      .find((b) => b.textContent === 'usar lo de mi cuenta') as HTMLButtonElement;
    usarCuenta.click();

    expect(themeStore.get()).toBe('oscuro');
    expect(preferencesSyncStore.get().status).toBe('ready');
    expect(element.querySelector('.preferences-conflict')).toBeNull();
  });

  it('no muestra el bloque de conflicto al limpiar la cuenta', () => {
    themeStore.set('claro', 'user');
    preferencesSyncStore.set({
      userId: 'user-a',
      revision: 2,
      remoteTheme: 'oscuro',
      status: 'conflict',
    }, 'sync');

    const element = mountPanel();
    expect(element.querySelector('.preferences-conflict')).not.toBeNull();

    clearPreferencesSync();
    expect(element.querySelector('.preferences-conflict')).toBeNull();
    /* Las preferencias base siguen visibles. */
    expect(element.querySelectorAll('.preferences-panel__tema').length).toBe(3);
  });
});
