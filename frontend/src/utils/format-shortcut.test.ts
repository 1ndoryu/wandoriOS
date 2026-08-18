/* wandori.us — formatShortcut tests
 * [297A-20] Verifica la conversión de atajos del CommandRegistry a glifos. */

import { describe, expect, it } from 'vitest';
import { formatShortcut } from './format-shortcut';

describe('formatShortcut', () => {
  it('convierte Meta+Shift+l en glifos', () => {
    expect(formatShortcut('Meta+Shift+l')).toBe('⌘⇧L');
  });

  it('convierte atajos con Ctrl en minúscula', () => {
    expect(formatShortcut('ctrl+c')).toBe('⌃C');
  });

  it('convierte flechas', () => {
    expect(formatShortcut('Ctrl+ArrowUp')).toBe('⌃↑');
    expect(formatShortcut('Ctrl+Shift+ArrowRight')).toBe('⌃⇧→');
  });

  it('convierte teclas sueltas', () => {
    expect(formatShortcut('Escape')).toBe('esc');
    expect(formatShortcut('Meta+m')).toBe('⌘M');
  });

  it('conserva tokens desconocidos', () => {
    expect(formatShortcut('F5')).toBe('F5');
    expect(formatShortcut('Alt+F4')).toBe('⌥F4');
  });
});
