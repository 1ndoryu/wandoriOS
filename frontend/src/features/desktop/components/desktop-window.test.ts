/* [297A-29 F2] Tests del toolbar reactivo a capacidad.
 * La capacidad se lee en vivo (authStore) y los grupos con items todos hidden
 * (p.ej. acciones admin-only) se ocultan/muestran sin reabrir la ventana. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authStore } from '../../../store';
import { CommandRegistry, adminOnly, type Command } from '../../runtime/command-registry';
import { createAppToolbar, createDesktopWindow } from './desktop-window';
import { createEl } from '../../../utils/dom';
import type { AppToolbarGroup } from '../../runtime/app-registry';

/* Mock del dropdown: el test solo valida visibilidad/reactividad del toolbar,
 * no el render del menú (que depende de layout/viewport). */
vi.mock('./dropdown-menu', () => ({
  openDropdownMenu: vi.fn(),
}));

function makeCmd(id: string): Command {
  return {
    id,
    label: id,
    execute: () => ({ status: 'success' }),
  };
}

beforeEach(() => {
  authStore.set({ isAuthenticated: false, userId: null, capability: 'public' }, 'sync');
});

describe('createAppToolbar (reactivo a capacidad)', () => {
  it('oculta un grupo cuyos items son todos admin-only para no-admin', () => {
    CommandRegistry.register(adminOnly(makeCmd('test:toolbar-admin-cmd')));
    const groups: AppToolbarGroup[] = [
      { label: 'Admin', items: ['test:toolbar-admin-cmd'] },
    ];
    const toolbar = createAppToolbar(groups);
    document.body.appendChild(toolbar.element);

    const buttons = toolbar.element.querySelectorAll('.desktop-app-toolbar__item');
    expect(buttons.length).toBe(0);
    toolbar.destroy();
    document.body.innerHTML = '';
  });

  it('muestra el grupo admin-only tras login como admin (en vivo)', () => {
    CommandRegistry.register(adminOnly(makeCmd('test:toolbar-admin-cmd-2')));
    const groups: AppToolbarGroup[] = [
      { label: 'Admin', items: ['test:toolbar-admin-cmd-2'] },
    ];
    const toolbar = createAppToolbar(groups);
    document.body.appendChild(toolbar.element);

    expect(toolbar.element.querySelectorAll('.desktop-app-toolbar__item').length).toBe(0);

    /* Login admin sin recrear el toolbar: el grupo aparece */
    authStore.set({ isAuthenticated: true, userId: 'admin-1', capability: 'admin' }, 'sync');
    const buttons = toolbar.element.querySelectorAll('.desktop-app-toolbar__item');
    expect(buttons.length).toBe(1);
    expect(buttons[0].textContent).toBe('Admin');

    toolbar.destroy();
    document.body.innerHTML = '';
  });

  it('mezcla grupos públicos y admin-only según capacidad', () => {
    CommandRegistry.register(adminOnly(makeCmd('test:toolbar-admin-cmd-3')));
    const groups: AppToolbarGroup[] = [
      { label: 'Ventana', items: [{ id: 'test:toolbar-public', label: 'Público' }] },
      { label: 'Admin', items: ['test:toolbar-admin-cmd-3'] },
    ];
    const toolbar = createAppToolbar(groups);
    document.body.appendChild(toolbar.element);

    const labels = Array.from(toolbar.element.querySelectorAll('.desktop-app-toolbar__item'))
      .map(b => b.textContent);
    expect(labels).toEqual(['Ventana']);

    authStore.set({ isAuthenticated: true, userId: 'admin-1', capability: 'admin' }, 'sync');
    const labelsAdmin = Array.from(toolbar.element.querySelectorAll('.desktop-app-toolbar__item'))
      .map(b => b.textContent);
    expect(labelsAdmin).toEqual(['Ventana', 'Admin']);

    toolbar.destroy();
    document.body.innerHTML = '';
  });

  it('destroy cancela la suscripción (logout no re-renderiza)', () => {
    CommandRegistry.register(adminOnly(makeCmd('test:toolbar-admin-cmd-4')));
    const groups: AppToolbarGroup[] = [
      { label: 'Admin', items: ['test:toolbar-admin-cmd-4'] },
    ];
    const toolbar = createAppToolbar(groups);
    document.body.appendChild(toolbar.element);

    authStore.set({ isAuthenticated: true, userId: 'admin-1', capability: 'admin' }, 'sync');
    expect(toolbar.element.querySelectorAll('.desktop-app-toolbar__item').length).toBe(1);

    toolbar.destroy();
    authStore.set({ isAuthenticated: false, userId: null, capability: 'public' }, 'sync');
    expect(toolbar.element.querySelectorAll('.desktop-app-toolbar__item').length).toBe(1);
    document.body.innerHTML = '';
  });
});

/* [018A-1 F4] Prevención: la franja de acciones es parte del chrome de la
 * ventana — hija directa de .desktop-window, DESPUÉS del body (fuera de su
 * padding y de su scroll). Si una app deja de aportar actions, no debe
 * quedar una franja vacía visible. */
describe('createDesktopWindow (slot de acciones)', () => {
  it('coloca la franja de acciones después del body como última hija', () => {
    const content = createEl('div', { className: 'contenido-prueba' });
    const actions = createEl('div', { className: 'desktop-window__actions' });
    const win = createDesktopWindow({ title: 'Prueba', content, actions });

    const body = win.element.querySelector('.desktop-window__body');
    const bar = win.element.querySelector('.desktop-window__actions');
    expect(body).not.toBeNull();
    expect(bar).not.toBeNull();
    expect(win.element.lastElementChild).toBe(bar);
    expect(body!.contains(bar)).toBe(false);

    win.destroy();
    document.body.innerHTML = '';
  });

  it('sin actions no crea franja alguna', () => {
    const content = createEl('div', { className: 'contenido-prueba' });
    const win = createDesktopWindow({ title: 'Prueba', content });

    expect(win.element.querySelector('.desktop-window__actions')).toBeNull();
    expect(win.element.lastElementChild).toBe(
      win.element.querySelector('.desktop-window__body'),
    );

    win.destroy();
    document.body.innerHTML = '';
  });
});
