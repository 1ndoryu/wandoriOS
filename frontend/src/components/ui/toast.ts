/* wandori.us — Toast Notifications
 * Notificaciones minimales B&W. Sin colores, sin sombras. */

import { createEl } from '../../utils/dom';

const toasts: HTMLElement[] = [];
let container: HTMLElement | null = null;

function ensureContainer(): HTMLElement {
  if (!container) {
    container = createEl('div', { className: 'toast-contenedor' });
    document.body.appendChild(container);
  }
  return container;
}

export function showToast(message: string, duration = 3000): void {
  const el = createEl('div', { className: 'toast', textContent: message });
  ensureContainer().appendChild(el);
  toasts.push(el);

  setTimeout(() => {
    el.remove();
    const idx = toasts.indexOf(el);
    if (idx > -1) toasts.splice(idx, 1);
  }, duration);
}
