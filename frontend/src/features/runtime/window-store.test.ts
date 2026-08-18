/* wandori.us — Window Store Tests
 * [Auditoría v4 §6.1] Tests para lógica pura de clampWindowBounds y generateWindowId. */

import { describe, it, expect, beforeEach } from 'vitest';
import { clampWindowBounds, generateWindowId, generateNextZIndex, _resetWindowCountersForTest as resetWindowCounters, setWorkspaceBounds } from './window-store';

beforeEach(() => {
  resetWindowCounters();
  setWorkspaceBounds(1200, 800);
});

describe('clampWindowBounds', () => {
  it('clampa x para que no exceda workspaceW - minVisible', () => {
    const result = clampWindowBounds(1500, 100, 400, 300);
    expect(result.x).toBeLessThanOrEqual(1200 - 60); // workspaceW - minVisible
  });

  it('clampa x para que no sea menor que -w + minVisible', () => {
    const result = clampWindowBounds(-500, 100, 400, 300);
    expect(result.x).toBeGreaterThanOrEqual(-400 + 60); // -w + minVisible
  });

  it('clampa y para que no sea menor que 0', () => {
    const result = clampWindowBounds(100, -100, 400, 300);
    expect(result.y).toBe(0);
  });

  it('clampa y para que no exceda workspaceH - titleH', () => {
    const result = clampWindowBounds(100, 900, 400, 300);
    expect(result.y).toBeLessThanOrEqual(800 - 24); // workspaceH - titleH = 776
  });

  it('clampa w para que no exceda workspaceW', () => {
    const result = clampWindowBounds(100, 100, 2000, 300);
    expect(result.w).toBe(1200);
  });

  it('clampa h para que no exceda workspaceH', () => {
    const result = clampWindowBounds(100, 100, 400, 2000);
    expect(result.h).toBe(800);
  });

  it('no modifica bounds validos', () => {
    const result = clampWindowBounds(100, 100, 400, 300);
    expect(result).toEqual({ x: 100, y: 100, w: 400, h: 300 });
  });

  it('clampa con workspace pequeño', () => {
    setWorkspaceBounds(320, 480);
    const result = clampWindowBounds(100, 100, 500, 300);
    expect(result.w).toBe(320);
    expect(result.h).toBe(300); // 300 < 480, no se clamp
  });

  it('mantiene ventana parcialmente visible incluso con coordenadas extremas', () => {
    // x debería clampiarse para que al menos 60px de la ventana sean visibles
    const result = clampWindowBounds(-1000, -1000, 400, 300);
    expect(result.x).toBe(-400 + 60); // -w + minVisible = -340
    expect(result.y).toBe(0);
  });
});

describe('generateWindowId', () => {
  it('genera IDs incrementales', () => {
    expect(generateWindowId()).toBe('win-1');
    expect(generateWindowId()).toBe('win-2');
    expect(generateWindowId()).toBe('win-3');
  });

  it('se resetea con resetWindowCounters', () => {
    generateWindowId();
    generateWindowId();
    resetWindowCounters();
    expect(generateWindowId()).toBe('win-1');
  });
});

describe('generateNextZIndex', () => {
  it('genera z-index incrementales desde 10', () => {
    expect(generateNextZIndex()).toBe(10);
    expect(generateNextZIndex()).toBe(11);
    expect(generateNextZIndex()).toBe(12);
  });

  it('se resetea con resetWindowCounters', () => {
    generateNextZIndex();
    generateNextZIndex();
    resetWindowCounters();
    expect(generateNextZIndex()).toBe(10);
  });
});
