/* wandori.us — Confirm Dialog
 * Dialogo de confirmacion minimalista B&W. */

import { createEl } from '../../utils/dom';

export function showConfirm(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const msg = createEl('p', { className: 'confirm-mensaje', textContent: message });

    const btnSi = createEl('button', { className: 'boton', textContent: 'confirmar' });
    const btnNo = createEl('button', { className: 'boton', textContent: 'cancelar' });

    const acciones = createEl('div', { className: 'confirm-acciones' }, btnNo, btnSi);
    const contenido = createEl('div', { className: 'confirm-contenido' }, msg, acciones);
    const overlay = createEl('div', { className: 'confirm-overlay' }, contenido);

    const cleanup = (result: boolean) => {
      overlay.remove();
      resolve(result);
    };

    btnSi.addEventListener('click', () => cleanup(true));
    btnNo.addEventListener('click', () => cleanup(false));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cleanup(false);
    });

    document.addEventListener('keydown', function handler(e) {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', handler);
        cleanup(false);
      }
    });

    document.body.appendChild(overlay);
    btnNo.focus();
  });
}
