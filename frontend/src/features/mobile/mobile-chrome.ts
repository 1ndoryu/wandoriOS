/* wandori.us — Mobile Chrome
 * Chrome de presentación móvil compartido por launcher y apps full-screen.
 * MobileShell coordina estado; este módulo solo construye controles visuales.
 * [297A-12] */

import { ArrowLeft, Circle, createElement } from 'lucide';
import { createEl } from '../../utils/dom';

export function createAppHeader(title: string): HTMLElement {
  return createEl('header', { className: 'movilApp__cabecera' },
    createEl('span', { className: 'movilMarca', ariaHidden: 'true' }),
    createEl('h1', { className: 'movilApp__titulo', textContent: title }),
    createEl('span', { ariaHidden: 'true' }),
  );
}

export function createNavigation(
  hasApp: boolean,
  goBack: () => void,
  goHome: () => void,
): HTMLElement {
  const navigation = createEl('nav', {
    className: 'movilNavegacion',
    ariaLabel: 'Navegación del sistema',
  });
  const back = createEl('button', {
    type: 'button',
    className: 'movilNavegacion__control',
    ariaLabel: 'Atrás',
  }, createElement(ArrowLeft));
  const home = createEl('button', {
    type: 'button',
    className: 'movilNavegacion__control',
    ariaLabel: 'Ir al inicio',
  }, createElement(Circle));
  back.disabled = !hasApp;
  back.addEventListener('click', goBack);
  home.addEventListener('click', goHome);
  navigation.append(back, home);
  return navigation;
}
