/* [317A-2] Tests del estado vacio universal (createVacio). */
import { describe, expect, it } from 'vitest';
import { createVacio } from './empty-state';

describe('createVacio', () => {
  it('renderiza un wrapper div.vacio con rol status', () => {
    const el = createVacio('no hay articulos');
    expect(el.tagName).toBe('DIV');
    expect(el.className).toBe('vacio');
    expect(el.getAttribute('role')).toBe('status');
  });

  it('capitaliza la primera letra del texto', () => {
    const el = createVacio('no hay articulos');
    const p = el.querySelector('p');
    expect(p?.textContent).toBe('No hay articulos');
  });

  it('respeta textos ya capitalizados', () => {
    const el = createVacio('No se pudo abrir la app.');
    expect(el.querySelector('p')?.textContent).toBe('No se pudo abrir la app.');
  });

  it('no rompe con string vacio', () => {
    const el = createVacio('');
    expect(el.querySelector('p')?.textContent).toBe('');
  });
});
