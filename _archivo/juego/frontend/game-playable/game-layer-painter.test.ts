import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TerrainPick } from './game-procedural-comparator';
import { attachLayerPainter } from './game-layer-painter';

function buildPick(overrides: Partial<TerrainPick> = {}): TerrainPick {
  return {
    i: 4,
    j: 5,
    level: null,
    worldX: 10,
    worldZ: 12,
    height: 1,
    ...overrides,
  };
}

describe('painter de capas (138A-9)', () => {
  let host: HTMLElement;
  let onStroke: ReturnType<typeof vi.fn<(cells: readonly (readonly [number, number])[], ended: boolean) => void>>;
  let now: number;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    onStroke = vi.fn();
    now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    host.remove();
  });

  const attach = (overrides: {
    active?: boolean;
    radius?: number;
    pick?: TerrainPick | null;
  } = {}): (() => void) => {
    const { active = true, radius = 2, pick = buildPick() } = overrides;
    return attachLayerPainter(host, {
      isActive: () => active,
      pickAt: () => pick,
      cellSize: () => 1,
      radius: () => radius,
      onStroke,
    });
  };

  const stroke = (): void => {
    host.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      clientX: 100,
      clientY: 100,
    }));
    /* Primer move: lastCommit=0 → commit intermedio; el segundo acumula
     * celdas sin commit (gap < 120ms) para que el up cierre con ended=true. */
    host.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      pointerId: 1,
      clientX: 100,
      clientY: 100,
    }));
    now = 1010;
    host.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      pointerId: 1,
      clientX: 100,
      clientY: 100,
    }));
    now = 1020;
    host.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true,
      pointerId: 1,
      clientX: 100,
      clientY: 100,
    }));
  };

  it('una pincelada acumula celdas dentro del radio y cierra con ended=true', () => {
    attach();
    stroke();
    expect(onStroke).toHaveBeenCalled();
    const calls = onStroke.mock.calls as unknown as [readonly (readonly [number, number])[], boolean][];
    const finalCall = calls.find(call => call[1] === true);
    expect(finalCall).toBeDefined();
    const cells = finalCall![0];
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.some(cell => cell[0] === 4 && cell[1] === 5)).toBe(true);
    /* Todas las celdas quedan dentro del radio del pincel alrededor del pick. */
    for (const cell of cells) {
      expect(Math.hypot(cell[0] - 4, cell[1] - 5)).toBeLessThanOrEqual(2 + 1e-6);
    }
  });

  it('la primera pincelada con tiempo real emite un commit intermedio (feedback en vivo)', () => {
    attach();
    host.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      clientX: 100,
      clientY: 100,
    }));
    /* Primer move: `lastCommit=0` → gap >= 120ms → commit intermedio. */
    host.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      pointerId: 1,
      clientX: 100,
      clientY: 100,
    }));
    const intermediate = onStroke.mock.calls[0] as [readonly (readonly [number, number])[], boolean];
    expect(intermediate[1]).toBe(false);
    expect(intermediate[0].length).toBeGreaterThan(0);

    /* Siguiente move a 10ms del commit: acumula sin commit; up cierra final. */
    now = 1010;
    host.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      pointerId: 1,
      clientX: 100,
      clientY: 100,
    }));
    now = 1020;
    host.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true,
      pointerId: 1,
      clientX: 100,
      clientY: 100,
    }));
    const calls = onStroke.mock.calls as unknown as [readonly (readonly [number, number])[], boolean][];
    const finalCall = calls.find(call => call[1] === true);
    expect(finalCall).toBeDefined();
  });

  it('no pinta si el pincel está inactivo', () => {
    attach({ active: false });
    stroke();
    expect(onStroke).not.toHaveBeenCalled();
  });

  it('ignora botones que no sean el primario del ratón', () => {
    attach();
    host.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      pointerId: 1,
      pointerType: 'mouse',
      button: 2,
    }));
    host.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      pointerId: 1,
      clientX: 100,
      clientY: 100,
    }));
    host.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }));
    expect(onStroke).not.toHaveBeenCalled();
  });

  it('no pinta sobre aire (pick null)', () => {
    attach({ pick: null });
    stroke();
    expect(onStroke).not.toHaveBeenCalled();
  });

  it('el teardown elimina los listeners y no pinta después', () => {
    const detach = attach();
    detach();
    stroke();
    expect(onStroke).not.toHaveBeenCalled();
  });
});
