/* wandori.us — Modal
 * Modal overlay B&W. Cierra con click fuera o Escape. */

import { createEl } from '../../utils/dom';

export interface ModalOptions {
  titulo?: string;
  contenido: HTMLElement | HTMLElement[];
  ancho?: string;
  /** Evita cerrar accidentalmente flujos que requieren una decisión explícita. */
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  ariaLabelledby?: string;
  onClose?: () => void;
}

export function createModal(options: ModalOptions): { close: () => void } {
  const {
    contenido,
    ancho = '560px',
    closeOnBackdrop = true,
    closeOnEscape = true,
    ariaLabelledby,
    onClose,
  } = options;

  const cuerpo = createEl('div', { className: 'modal-cuerpo' });
  if (Array.isArray(contenido)) {
    cuerpo.append(...contenido);
  } else {
    cuerpo.appendChild(contenido);
  }

  const modal = createEl('div', {
    className: 'modal-contenido',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-labelledby': ariaLabelledby,
  }, cuerpo);
  modal.style.maxWidth = ancho;

  const overlay = createEl('div', { className: 'modal-overlay' }, modal);
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  let closed = false;
  const handleEsc = (e: KeyboardEvent): void => {
    if (closeOnEscape && e.key === 'Escape') close();
  };

  const close = (): void => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', handleEsc);
    overlay.remove();
    document.body.style.overflow = '';
    onClose?.();
  };

  overlay.addEventListener('click', (e) => {
    if (closeOnBackdrop && e.target === overlay) close();
  });

  document.addEventListener('keydown', handleEsc);

  return { close };
}
