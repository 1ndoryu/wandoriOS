/* 138A-15 — Pick compartido del constructor: normalización isla/comparador,
 * raycast por grupo visible y delegación de altura de piso sin WebGL. */

import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createConstructorPicker, type ConstructorPickDeps } from './game-constructor-picking';

function createDeps(overrides: Partial<ConstructorPickDeps> = {}) {
  const island = {
    setHighlight: vi.fn(),
    raycastGroup: new THREE.Group(),
    groundHeightAt: vi.fn(() => 2),
    pickBlock: vi.fn(() => null),
  };
  const comparator = {
    raycastGroup: new THREE.Group(),
    groundHeightAt: vi.fn(() => 5),
    pickTerrain: vi.fn(() => null),
  };
  const panel = { setPick: vi.fn() };
  let comparatorVisible = false;
  return {
    deps: {
      host: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) },
      camera: new THREE.PerspectiveCamera(60, 1, 0.1, 500),
      island,
      comparator,
      panel,
      isComparatorVisible: () => comparatorVisible,
      ...overrides,
    } as ConstructorPickDeps,
    island,
    comparator,
    panel,
    setComparatorVisible: (visible: boolean) => { comparatorVisible = visible; },
  };
}

describe('picking del constructor (138A-15)', () => {
  it('applyPick null limpia highlight de isla y pick del panel', () => {
    const { deps, island, panel } = createDeps();
    const picker = createConstructorPicker(deps);
    picker.applyPick(null);
    expect(island.setHighlight).toHaveBeenCalledWith(null);
    expect(panel.setPick).toHaveBeenCalledWith(null);
  });

  it('sin comparador resalta el bloque de la isla y normaliza el contrato del panel', () => {
    const { deps, island, panel } = createDeps();
    const picker = createConstructorPicker(deps);
    picker.applyPick({ i: 3, j: 4, level: 2, worldX: 1, worldZ: 1, blockCenterY: 1 });
    expect(island.setHighlight).toHaveBeenCalledWith(
      expect.objectContaining({ i: 3, j: 4, level: 2 }),
    );
    expect(panel.setPick).toHaveBeenCalledWith({ i: 3, j: 4, level: 2 });
  });

  it('con el comparador visible no resalta bloques y panel recibe el nivel null', () => {
    const { deps, setComparatorVisible, island, panel } = createDeps();
    setComparatorVisible(true);
    const picker = createConstructorPicker(deps);
    picker.applyPick({ i: 1, j: 2, level: null, worldX: 0, worldZ: 0, height: 0 });
    expect(island.setHighlight).toHaveBeenCalledWith(null);
    expect(panel.setPick).toHaveBeenCalledWith({ i: 1, j: 2, level: null });
  });

  it('raycastPickAt sin impacto devuelve null', () => {
    const { deps } = createDeps();
    const picker = createConstructorPicker(deps);
    expect(picker.raycastPickAt(400, 300)).toBeNull();
  });

  it('pickCellAt solo resuelve sobre el comparador visible', () => {
    const { deps, setComparatorVisible } = createDeps();
    const picker = createConstructorPicker(deps);
    expect(picker.pickCellAt(400, 300)).toBeNull();
    setComparatorVisible(true);
    expect(picker.pickCellAt(400, 300)).toBeNull();
  });

  it('groundHeightAt delega en el grupo visible', () => {
    const { deps, island, comparator, setComparatorVisible } = createDeps();
    const picker = createConstructorPicker(deps);
    expect(picker.groundHeightAt(10, 20)).toBe(2);
    expect(island.groundHeightAt).toHaveBeenCalledWith(10, 20);
    setComparatorVisible(true);
    expect(picker.groundHeightAt(10, 20)).toBe(5);
    expect(comparator.groundHeightAt).toHaveBeenCalledWith(10, 20);
  });
});
