import { beforeEach, describe, expect, it } from 'vitest';
import { authStore } from '../../../store';
import { createDesktopMenuBar } from './desktop-menu-bar';

beforeEach(() => {
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
  }
  authStore.set({ isAuthenticated: false, userId: null, userEmail: null, capability: 'public' }, 'sync');
});

describe('desktop menu bar account status', () => {
  it('projects guest, authenticated and admin labels from authStore', () => {
    const bar = createDesktopMenuBar();
    document.body.appendChild(bar.element);
    const button = bar.element.querySelector<HTMLButtonElement>('.desktop-menu-bar__account');
    const label = bar.element.querySelector('.desktop-menu-bar__account-label');
    expect(button).not.toBeNull();
    expect(label?.textContent).toBe('Entrar');

    /* [028A-7] El label muestra solo el nombre derivado del email, no
     * "Cuenta · admin". Sin email, fallback por capacidad. */
    authStore.set({ isAuthenticated: true, userId: 'user-1', userEmail: 'maria@example.com', capability: 'authenticated' }, 'sync');
    expect(label?.textContent).toBe('maria');
    authStore.set({ isAuthenticated: true, userId: 'admin-1', userEmail: 'admin@example.com', capability: 'admin' }, 'sync');
    expect(label?.textContent).toBe('admin');

    bar.destroy();
    document.body.innerHTML = '';
  });

  it('stops reacting after destroy', () => {
    const bar = createDesktopMenuBar();
    document.body.appendChild(bar.element);
    const label = bar.element.querySelector('.desktop-menu-bar__account-label');
    bar.destroy();

    authStore.set({ isAuthenticated: true, userId: 'user-1', userEmail: 'maria@example.com', capability: 'authenticated' }, 'sync');
    expect(label?.textContent).toBe('Entrar');
    document.body.innerHTML = '';
  });
});
