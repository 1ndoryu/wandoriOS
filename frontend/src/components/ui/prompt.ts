/* wandori.us — Prompt Dialog
 * [018A-90] Diálogo de entrada de texto B&W, mismo patrón visual que
 * showConfirm (confirm.ts). window.prompt() no está soportado en el navegador
 * integrado y rompe consistencia visual; este diálogo cubre ambos casos.
 * Resuelve string | null: string = confirmado, null = cancelado (Escape o
 * botón cancelar). Enter en el input confirma. */

import { createEl } from '../../utils/dom';
import { createInput } from './input';

export function showPrompt(message: string, defaultValue = ''): Promise<string | null> {
  return new Promise((resolve) => {
    const msg = createEl('p', { className: 'confirm-mensaje', textContent: message });
    const campo = createInput({ value: defaultValue });

    const btnSi = createEl('button', { className: 'boton', textContent: 'confirmar' });
    const btnNo = createEl('button', { className: 'boton', textContent: 'cancelar' });

    const acciones = createEl('div', { className: 'confirm-acciones' }, btnNo, btnSi);
    const contenido = createEl('div', { className: 'confirm-contenido' }, msg, campo, acciones);
    const overlay = createEl('div', { className: 'confirm-overlay' }, contenido);

    const entrada = campo.querySelector('input') as HTMLInputElement;

    const cleanup = (result: string | null) => {
      overlay.remove();
      resolve(result);
    };

    btnSi.addEventListener('click', () => cleanup(entrada.value));
    btnNo.addEventListener('click', () => cleanup(null));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cleanup(null);
    });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', onKey);
        cleanup(null);
      } else if (e.key === 'Enter') {
        document.removeEventListener('keydown', onKey);
        cleanup(entrada.value);
      }
    };
    document.addEventListener('keydown', onKey);

    document.body.appendChild(overlay);
    entrada.focus();
    entrada.select();
  });
}
