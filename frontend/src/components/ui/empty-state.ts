/* [317A-2] Estado vacio universal.
 * Todos los "no hay X" / "error al cargar" del sistema pasan por createVacio:
 * texto centrado que ocupa 100% ancho+alto, primera letra mayuscula, rol
 * status para lectores de pantalla. El wrapper div permite el centrado flex;
 * el <p> interno lleva el estilo de texto (ver .vacio en components.css). */
import { createEl } from '../../utils/dom';

export function createVacio(text: string): HTMLElement {
  const capitalizado = text.length > 0 ? text.charAt(0).toUpperCase() + text.slice(1) : text;
  return createEl(
    'div',
    { className: 'vacio', role: 'status' },
    createEl('p', { textContent: capitalizado }),
  );
}
