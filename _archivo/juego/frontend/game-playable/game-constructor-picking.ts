/* 138A-15 — Pick/raycast compartido del constructor de mundos: hover, drop
 * de assets y pincel resuelven la celda sobre el grupo visible (comparador
 * del constructor o isla curva) con un solo raycaster reutilizado. */

import * as THREE from 'three';
import { type BlockPick } from './game-curved-island';
import { type TerrainPick } from './game-procedural-comparator';

export interface ConstructorPickDeps {
  readonly host: HTMLElement;
  readonly camera: THREE.PerspectiveCamera;
  readonly island: {
    readonly setHighlight: (pick: BlockPick | null) => void;
    readonly raycastGroup: THREE.Object3D;
    readonly groundHeightAt: (x: number, z: number) => number;
    readonly pickBlock: (x: number, y: number, z: number) => BlockPick | null;
  };
  readonly comparator: {
    readonly raycastGroup: THREE.Object3D;
    readonly groundHeightAt: (x: number, z: number) => number;
    readonly pickTerrain: (x: number, y: number, z: number) => TerrainPick | null;
  };
  readonly panel: {
    readonly setPick: (pick: { i: number; j: number; level: number | null } | null) => void;
  };
  readonly isComparatorVisible: () => boolean;
}

export interface ConstructorPickHandle {
  readonly applyPick: (pick: TerrainPick | BlockPick | null) => void;
  readonly raycastPickAt: (clientX: number, clientY: number) => TerrainPick | BlockPick | null;
  readonly updatePick: (clientX: number, clientY: number) => void;
  readonly pickCellAt: (clientX: number, clientY: number) => TerrainPick | null;
  readonly groundHeightAt: (x: number, z: number) => number;
}

export function createConstructorPicker(deps: ConstructorPickDeps): ConstructorPickHandle {
  const { host, camera, island, comparator, panel, isComparatorVisible } = deps;
  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();

  /* [138A-1] Normaliza el pick de la isla (BlockPick) y del comparador
   * (TerrainPick) a un mismo contrato de panel; el highlight de bloques solo
   * aplica a la isla 128A-1 visible. */
  const applyPick = (pick: TerrainPick | BlockPick | null): void => {
    if (!pick) {
      island.setHighlight(null);
      panel.setPick(null);
      return;
    }
    if (!isComparatorVisible() && pick.level !== null) {
      island.setHighlight(pick as BlockPick);
    } else {
      island.setHighlight(null);
    }
    panel.setPick({ i: pick.i, j: pick.j, level: pick.level });
  };

  /* [138A-9] Raycast compartido: hover, drop de assets y pincel resuelven la
   * celda sobre el grupo visible (comparador del constructor o isla curva). */
  const raycastPickAt = (clientX: number, clientY: number): TerrainPick | BlockPick | null => {
    const rect = host.getBoundingClientRect();
    pointerNdc.set(
      ((clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1,
      -((clientY - rect.top) / Math.max(rect.height, 1)) * 2 + 1,
    );
    raycaster.setFromCamera(pointerNdc, camera);
    const activeGroup = isComparatorVisible() ? comparator.raycastGroup : island.raycastGroup;
    const hit = raycaster.intersectObject(activeGroup, true)[0];
    if (!hit) return null;
    return isComparatorVisible()
      ? comparator.pickTerrain(hit.point.x, hit.point.y, hit.point.z)
      : island.pickBlock(hit.point.x, hit.point.y, hit.point.z);
  };

  const updatePick = (clientX: number, clientY: number): void => {
    applyPick(raycastPickAt(clientX, clientY));
  };

  /* Pick de celdas para el pincel del editor: solo sobre el comparador. */
  const pickCellAt = (clientX: number, clientY: number): TerrainPick | null => {
    if (!isComparatorVisible()) return null;
    return raycastPickAt(clientX, clientY) as TerrainPick | null;
  };

  const groundHeightAt = (x: number, z: number): number =>
    isComparatorVisible()
      ? comparator.groundHeightAt(x, z)
      : island.groundHeightAt(x, z);

  return { applyPick, raycastPickAt, updatePick, pickCellAt, groundHeightAt };
}
