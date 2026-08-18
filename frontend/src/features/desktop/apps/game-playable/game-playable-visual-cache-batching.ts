/* GAME-01 — Batching por materiales del cache visual (fixture del constructor).
 * Agrupa los meshes del prototipo por identidad de geometría+material
 * (WeakMap de ids por instancia) para fusionarlos en un solo InstancedMesh.
 * Pura y testeable con prototipos sintéticos. */

import * as THREE from 'three';

export interface PrototypeMeshGroup {
  readonly geometry: THREE.BufferGeometry;
  readonly material: THREE.Material;
  readonly localMatrices: THREE.Matrix4[];
}

/** Batching por materiales: agrupa los meshes del prototipo por identidad de
 * geometría+material (WeakMap de ids por instancia), fusionando meshes que
 * comparten ambos en un solo grupo. Pura y testeable con prototipos sintéticos. */
export function groupMeshesByMaterial(prototype: THREE.Group): PrototypeMeshGroup[] {
  const geometryIds = new WeakMap<THREE.BufferGeometry, number>();
  const materialIds = new WeakMap<THREE.Material, number>();
  const groups: PrototypeMeshGroup[] = [];
  let nextId = 0;
  const idFor = <T extends object>(value: T, ids: WeakMap<T, number>): number => {
    const existing = ids.get(value);
    if (existing !== undefined) return existing;
    ids.set(value, nextId);
    nextId += 1;
    return nextId - 1;
  };
  prototype.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    if (Array.isArray(child.material)) return;
    const geometryId = idFor(child.geometry, geometryIds);
    const materialId = idFor(child.material, materialIds);
    const existing = groups.find(group =>
      idFor(group.geometry, geometryIds) === geometryId
      && idFor(group.material, materialIds) === materialId);
    if (existing) {
      existing.localMatrices.push(child.matrixWorld.clone());
    } else {
      groups.push({
        geometry: child.geometry,
        material: child.material,
        localMatrices: [child.matrixWorld.clone()],
      });
    }
  });
  return groups;
}
