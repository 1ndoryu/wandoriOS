/* [138A-9] Utilidades de escena compartidas (rampa toon y teardown de
 * geometrías/materiales), extraídas de la escena jugable.
 */
import * as THREE from 'three';
import { type ForestMaterials } from '../game-shared/forest-models';

/* Rampa toon de 4 bandas compartida por todos los materiales lit (arena,
 * roca, agua, follaje y figura). El dato vive en espacio lineal: no debe
 * pasar por gestión de color. */
export function createToonRamp(): THREE.DataTexture {
  const steps = [0.58, 0.75, 0.89, 1.0];
  const data = new Uint8Array(steps.length * 4);
  steps.forEach((value, index) => {
    const band = Math.round(value * 255);
    data[index * 4] = band;
    data[index * 4 + 1] = band;
    data[index * 4 + 2] = band;
    data[index * 4 + 3] = 255;
  });
  const texture = new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export function disposeObjectGeometries(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
      child.geometry.dispose();
    }
  });
}

export function disposeScene(
  scene: THREE.Scene,
  sharedMaterials: ForestMaterials,
  extraMaterials: readonly THREE.Material[] = [],
): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>([...Object.values(sharedMaterials), ...extraMaterials]);
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
      geometries.add(object.geometry);
      const assigned = Array.isArray(object.material) ? object.material : [object.material];
      assigned.forEach(material => materials.add(material));
    }
  });
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(material => material.dispose());
  scene.clear();
}
