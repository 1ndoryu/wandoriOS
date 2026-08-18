/* Tests para getDiffSummary — resumen puro de cambios pendientes en el overlay. */

import { describe, it, expect } from 'vitest';
import { getDiffSummary } from './diff';
import type { WorkspaceOverlay } from './types';

const EMPTY_OVERLAY: WorkspaceOverlay = {
  version: 1,
  addedItems: {},
  fieldOverrides: {},
  tombstones: [],
};

describe('getDiffSummary', () => {
  it('debe reportar overlay vacío como sin cambios', () => {
    const result = getDiffSummary(EMPTY_OVERLAY);
    expect(result.isEmpty).toBe(true);
    expect(result.added).toBe(0);
    expect(result.modified).toBe(0);
    expect(result.removed).toBe(0);
    expect(result.text).toContain('Sin cambios');
  });

  it('debe contar elementos añadidos', () => {
    const overlay: WorkspaceOverlay = {
      ...EMPTY_OVERLAY,
      addedItems: {
        'node-1': { id: 'node-1', parentId: 'desktop', type: 'folder', label: 'Carpeta' },
        'node-2': { id: 'node-2', parentId: 'desktop', type: 'app', label: 'App', refId: 'reader' },
      },
    };
    const result = getDiffSummary(overlay);
    expect(result.isEmpty).toBe(false);
    expect(result.added).toBe(2);
    expect(result.modified).toBe(0);
    expect(result.removed).toBe(0);
    expect(result.text).toContain('2 nuevos');
  });

  it('debe contar elementos modificados', () => {
    const overlay: WorkspaceOverlay = {
      ...EMPTY_OVERLAY,
      fieldOverrides: {
        'node-1': { label: 'Nuevo nombre' },
        'node-2': { position: { col: 1, row: 2 } },
        'node-3': { parentId: 'other-folder' },
      },
    };
    const result = getDiffSummary(overlay);
    expect(result.isEmpty).toBe(false);
    expect(result.added).toBe(0);
    expect(result.modified).toBe(3);
    expect(result.removed).toBe(0);
    expect(result.text).toContain('3 modificados');
  });

  it('debe contar elementos eliminados', () => {
    const overlay: WorkspaceOverlay = {
      ...EMPTY_OVERLAY,
      tombstones: ['node-1', 'node-2'],
    };
    const result = getDiffSummary(overlay);
    expect(result.isEmpty).toBe(false);
    expect(result.added).toBe(0);
    expect(result.modified).toBe(0);
    expect(result.removed).toBe(2);
    expect(result.text).toContain('2 eliminados');
  });

  it('debe contar todos los tipos de cambios juntos', () => {
    const overlay: WorkspaceOverlay = {
      ...EMPTY_OVERLAY,
      addedItems: { 'a': { id: 'a', parentId: 'desktop', type: 'folder', label: 'A' } },
      fieldOverrides: { 'b': { label: 'Mod' } },
      tombstones: ['c'],
    };
    const result = getDiffSummary(overlay);
    expect(result.isEmpty).toBe(false);
    expect(result.added).toBe(1);
    expect(result.modified).toBe(1);
    expect(result.removed).toBe(1);
    expect(result.text).toContain('1 nuevo');
    expect(result.text).toContain('1 modificado');
    expect(result.text).toContain('1 eliminado');
  });

  it('debe usar singular para 1 elemento', () => {
    const overlay: WorkspaceOverlay = {
      ...EMPTY_OVERLAY,
      addedItems: { 'a': { id: 'a', parentId: 'desktop', type: 'folder', label: 'A' } },
    };
    const result = getDiffSummary(overlay);
    expect(result.text).toContain('1 nuevo');
    expect(result.text).not.toContain('1 nuevos');
  });

  it('debe usar plural para múltiples elementos', () => {
    const overlay: WorkspaceOverlay = {
      ...EMPTY_OVERLAY,
      addedItems: {
        'a': { id: 'a', parentId: 'desktop', type: 'folder', label: 'A' },
        'b': { id: 'b', parentId: 'desktop', type: 'folder', label: 'B' },
      },
    };
    const result = getDiffSummary(overlay);
    expect(result.text).toContain('2 nuevos');
  });
});
