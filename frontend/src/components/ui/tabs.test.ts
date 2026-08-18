/* wandori.us — Barra de pestañas universal (tests)
 * [317A-1] Verifica: render por definición, estado activo (clase + aria-selected),
 * tab inicial, onSwitch por clic y cambio programático con select(). */

import { describe, it, expect, vi } from 'vitest';
import { createTabs } from './tabs';

const DEFS = [
  { id: 'articulos', label: 'articulos' },
  { id: 'proyectos', label: 'proyectos' },
  { id: 'productos', label: 'productos' },
];

function tabButtons(bar: ReturnType<typeof createTabs>): HTMLButtonElement[] {
  return Array.from(bar.el.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
}

describe('createTabs (barra de pestañas universal)', () => {
  it('renderiza una pestaña por definición con role tab y su etiqueta', () => {
    const bar = createTabs({ tabs: DEFS });
    const buttons = tabButtons(bar);
    expect(buttons).toHaveLength(3);
    expect(buttons.map(b => b.textContent)).toEqual(['articulos', 'proyectos', 'productos']);
    expect(bar.el.getAttribute('role')).toBe('tablist');
  });

  it('marca la primera pestaña activa por defecto (clase + aria-selected)', () => {
    const bar = createTabs({ tabs: DEFS });
    const [a, b, c] = tabButtons(bar);
    expect(a.classList.contains('barra-tabs__tab--activa')).toBe(true);
    expect(a.getAttribute('aria-selected')).toBe('true');
    expect(b.classList.contains('barra-tabs__tab--activa')).toBe(false);
    expect(b.getAttribute('aria-selected')).toBe('false');
    expect(c.getAttribute('aria-selected')).toBe('false');
    expect(bar.getActive()).toBe('articulos');
  });

  it('respeta el tab inicial indicado', () => {
    const bar = createTabs({ tabs: DEFS, initial: 'productos' });
    const [a, , c] = tabButtons(bar);
    expect(c.classList.contains('barra-tabs__tab--activa')).toBe(true);
    expect(a.classList.contains('barra-tabs__tab--activa')).toBe(false);
    expect(bar.getActive()).toBe('productos');
  });

  it('llama onSwitch al hacer clic y mueve el estado activo', () => {
    const onSwitch = vi.fn();
    const bar = createTabs({ tabs: DEFS, onSwitch });
    const [, b] = tabButtons(bar);
    b.click();
    expect(onSwitch).toHaveBeenCalledWith('proyectos');
    expect(b.classList.contains('barra-tabs__tab--activa')).toBe(true);
    expect(bar.getActive()).toBe('proyectos');
  });

  it('select() cambia el tab programáticamente y dispara onSwitch', () => {
    const onSwitch = vi.fn();
    const bar = createTabs({ tabs: DEFS, onSwitch });
    bar.select('productos');
    expect(onSwitch).toHaveBeenLastCalledWith('productos');
    expect(bar.getActive()).toBe('productos');
    const [a, , c] = tabButtons(bar);
    expect(c.getAttribute('aria-selected')).toBe('true');
    expect(a.getAttribute('aria-selected')).toBe('false');
  });

  it('dispara onSwitch con el tab inicial al construirse', () => {
    const onSwitch = vi.fn();
    createTabs({ tabs: DEFS, initial: 'proyectos', onSwitch });
    expect(onSwitch).toHaveBeenCalledWith('proyectos');
  });
});
