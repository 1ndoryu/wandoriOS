import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { computeAssetBounds, summarizeLoadedAsset } from './game-asset-preview';

function makeRoot(): { root: THREE.Object3D; meshes: THREE.Mesh[] } {
  const root = new THREE.Object3D();
  const meshes: THREE.Mesh[] = [];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
  geometry.setIndex([0, 1, 2, 2, 3, 4]);
  const shared = new THREE.MeshToonMaterial({ color: 0x111111 });
  const textured = new THREE.MeshToonMaterial({
    color: 0x111111,
    map: new THREE.Texture(),
  });
  const first = new THREE.Mesh(geometry, shared);
  const second = new THREE.Mesh(geometry, [shared, textured]);
  root.add(first, second);
  meshes.push(first, second);
  return { root, meshes };
}

describe('summarizeLoadedAsset', () => {
  it('cuenta nodos, mallas, triángulos, materiales y texturas', () => {
    const { root, meshes } = makeRoot();
    const summary = summarizeLoadedAsset(root);

    /* 1 raíz + 2 mallas = 3 nodos; ambas mallas comparten la geometría con
     * 6 índices → 2 triángulos cada una = 4; 2 materiales únicos (shared
     * compartido); una textura presente. */
    expect(summary.nodes).toBe(3);
    expect(summary.meshes).toBe(2);
    expect(summary.triangles).toBe(4);
    expect(summary.materials).toBe(2);
    expect(summary.hasTextures).toBe(true);
    expect(summary.animations).toBe(0);

    for (const mesh of meshes) {
      mesh.geometry.dispose();
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of list) {
        const anyMaterial = material as THREE.Material & { map?: THREE.Texture | null };
        anyMaterial.map?.dispose();
        material.dispose();
      }
    }
  });

  it('reporta animaciones detectadas en el GLB', () => {
    const { root, meshes } = makeRoot();
    (root as { animations?: unknown[] }).animations = [
      { name: 'idle' },
      { name: 'walk' },
    ];
    const summary = summarizeLoadedAsset(root);
    expect(summary.animations).toBe(2);

    for (const mesh of meshes) {
      mesh.geometry.dispose();
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of list) {
        const anyMaterial = material as THREE.Material & { map?: THREE.Texture | null };
        anyMaterial.map?.dispose();
        material.dispose();
      }
    }
  });

  it('no cuenta mallas sin geometría como triángulos', () => {
    const root = new THREE.Object3D();
    const empty = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
    root.add(empty);
    const summary = summarizeLoadedAsset(root);
    expect(summary.meshes).toBe(1);
    expect(summary.triangles).toBe(0);
    empty.geometry.dispose();
    (empty.material as THREE.Material).dispose();
  });
});

describe('computeAssetBounds', () => {
  it('calcula la caja envolvente a partir del objeto', () => {
    const root = new THREE.Object3D();
    const geometry = new THREE.BoxGeometry(2, 4, 6);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    mesh.position.set(1, 2, 3);
    root.add(mesh);

    const box = computeAssetBounds(root);
    expect(box.min.x).toBeCloseTo(0);
    expect(box.max.x).toBeCloseTo(2);
    expect(box.min.y).toBeCloseTo(0);
    expect(box.max.y).toBeCloseTo(4);
    expect(box.min.z).toBeCloseTo(0);
    expect(box.max.z).toBeCloseTo(6);
    geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  });
});
