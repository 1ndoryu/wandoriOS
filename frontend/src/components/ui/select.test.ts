/* wandori.us — Select Component Tests
 * [018A-82] Dropdown nativo del OS: apertura/cierre, selección, teclado y
 * ARIA. Cubre la sustitución del <select> nativo del navegador que no
 * consumía la identidad visual del OS. */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSelect } from './select';

describe('createSelect', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renderiza etiqueta y botón con la opción seleccionada', () => {
    const field = createSelect({
      label: 'estado',
      options: [
        { value: 'draft', label: 'borrador' },
        { value: 'published', label: 'publicado' },
      ],
      value: 'published',
    });
    document.body.appendChild(field);

    const label = field.querySelector('.campo-etiqueta');
    expect(label?.textContent).toBe('estado');
    const button = field.querySelector('.campo-select') as HTMLButtonElement;
    expect(button.textContent).toBe('publicado');
    expect(button.getAttribute('aria-haspopup')).toBe('listbox');
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('abre el menú al hacer clic y muestra las opciones', () => {
    const field = createSelect({
      options: [
        { value: 'a', label: 'opción a' },
        { value: 'b', label: 'opción b' },
      ],
      value: 'a',
    });
    document.body.appendChild(field);

    const button = field.querySelector('.campo-select') as HTMLButtonElement;
    const menu = field.querySelector('.campo-select__menu') as HTMLElement;
    expect(menu.hidden).toBe(true);

    button.click();
    expect(menu.hidden).toBe(false);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    const options = menu.querySelectorAll('[role="option"]');
    expect(options.length).toBe(2);
    expect(options[0].textContent).toBe('opción a');
  });

  it('selecciona una opción, cierra el menú y dispara onChange', () => {
    const onChange = vi.fn();
    const field = createSelect({
      options: [
        { value: 'a', label: 'opción a' },
        { value: 'b', label: 'opción b' },
      ],
      value: 'a',
      onChange,
    });
    document.body.appendChild(field);

    const button = field.querySelector('.campo-select') as HTMLButtonElement;
    const menu = field.querySelector('.campo-select__menu') as HTMLElement;
    button.click();

    const optionB = menu.querySelectorAll('[role="option"]')[1] as HTMLElement;
    optionB.click();

    expect(menu.hidden).toBe(true);
    expect(button.textContent).toBe('opción b');
    expect(onChange).toHaveBeenCalledWith('b');
    expect(optionB.getAttribute('aria-selected')).toBe('true');
  });

  it('cierra al hacer clic fuera', () => {
    const field = createSelect({
      options: [{ value: 'a', label: 'opción a' }],
      value: 'a',
    });
    document.body.appendChild(field);

    const button = field.querySelector('.campo-select') as HTMLButtonElement;
    const menu = field.querySelector('.campo-select__menu') as HTMLElement;
    button.click();
    expect(menu.hidden).toBe(false);

    document.body.click();
    expect(menu.hidden).toBe(true);
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('navega con flechas y selecciona con Enter', () => {
    const onChange = vi.fn();
    const field = createSelect({
      options: [
        { value: 'a', label: 'opción a' },
        { value: 'b', label: 'opción b' },
        { value: 'c', label: 'opción c' },
      ],
      value: 'a',
      onChange,
    });
    document.body.appendChild(field);

    const button = field.querySelector('.campo-select') as HTMLButtonElement;
    const menu = field.querySelector('.campo-select__menu') as HTMLElement;
    button.click();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(onChange).toHaveBeenCalledWith('c');
    expect(menu.hidden).toBe(true);
    expect(button.textContent).toBe('opción c');
  });

  it('cierra con Escape y devuelve el foco al botón', () => {
    const field = createSelect({
      options: [{ value: 'a', label: 'opción a' }],
      value: 'a',
    });
    document.body.appendChild(field);

    const button = field.querySelector('.campo-select') as HTMLButtonElement;
    const menu = field.querySelector('.campo-select__menu') as HTMLElement;
    button.click();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(menu.hidden).toBe(true);
    expect(document.activeElement).toBe(button);
  });
});
