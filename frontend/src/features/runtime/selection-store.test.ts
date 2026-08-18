/* [058A-4] Tests de selectMany (selección por banda de arrastre).
 * selectSingle/toggleSelect/extendSelect ya estaban cubiertos por el flujo
 * existente; esta función nueva se prueba de forma aislada sobre el store. */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  selectionStore,
  selectMany,
  selectSingle,
  clearSelection,
} from './selection-store';

describe('selectMany', () => {
  beforeEach(() => {
    clearSelection();
  });

  it('reemplaza la selección sin additive', () => {
    selectMany(['a', 'b'], 'desktop');
    const st = selectionStore.get();
    expect(st.selectedIds).toEqual(['a', 'b']);
    expect(st.lastSelectedId).toBe('b');
    expect(st.source).toBe('desktop');
    expect(st.isBackground).toBe(false);
  });

  it('con lista vacía y sin additive deja la selección vacía', () => {
    selectSingle('x', 'desktop');
    selectMany([], 'desktop');
    const st = selectionStore.get();
    expect(st.selectedIds).toEqual([]);
    expect(st.isBackground).toBe(false);
    expect(st.source).toBe('desktop');
  });

  it('con additive une con la selección actual sin duplicar', () => {
    selectMany(['a', 'b'], 'desktop');
    selectMany(['b', 'c'], 'desktop', { additive: true });
    const st = selectionStore.get();
    expect(st.selectedIds).toEqual(['a', 'b', 'c']);
    expect(st.lastSelectedId).toBe('c');
  });

  it('con additive y lista vacía conserva la selección actual', () => {
    selectMany(['a'], 'desktop');
    selectMany([], 'desktop', { additive: true });
    expect(selectionStore.get().selectedIds).toEqual(['a']);
  });

  it('el source distingue superficies (escritorio vs Finder)', () => {
    selectMany(['a'], 'desktop');
    selectMany(['b'], 'finder');
    expect(selectionStore.get().selectedIds).toEqual(['b']);
    expect(selectionStore.get().source).toBe('finder');
  });
});
