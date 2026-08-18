/* wandori.us — Mobile Account Control
 * Control de sesión del launcher móvil. Proyecta authStore y delega la apertura
 * a la app Cuenta; no mantiene estado de autenticación paralelo.
 * [297A-13] */

import { UserRound, createElement } from 'lucide';
import { createEl } from '../../utils/dom';
import { authStore, authAccountName } from '../../store';

export interface MobileAccountControl {
  readonly element: HTMLButtonElement;
  readonly destroy: () => void;
}

export function createMobileAccountControl(onOpen: () => void): MobileAccountControl {
  let destroyed = false;
  const button = createEl('button', {
    type: 'button',
    className: 'movilLauncher__cuenta',
    ariaLabel: 'Iniciar sesión',
  }, createElement(UserRound), createEl('span', { className: 'movilLauncher__cuenta-label' }));
  const label = button.querySelector('.movilLauncher__cuenta-label');
  const stop = authStore.subscribe((state) => {
    if (destroyed || !label) return;
    /* [028A-7] Solo el nombre del usuario, sin el prefijo "cuenta ·".
     * En móvil se mantiene el estilo en minúsculas. */
    label.textContent = state.isAuthenticated
      ? authAccountName(state)
      : 'entrar';
    button.setAttribute('aria-label', state.isAuthenticated ? 'Abrir Cuenta' : 'Iniciar sesión');
  });
  button.addEventListener('click', onOpen);

  return {
    element: button,
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      stop();
      button.remove();
    },
  };
}
