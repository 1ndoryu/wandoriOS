/* [138A-9] Estimación de memoria GPU de la escena: recorre el grafo y suma
 * geometrías/texturas únicas usando la métrica del probe, fuera de la escena.
 */
import * as THREE from 'three';
import {
  estimateGpuMemory,
  type GpuMemoryEstimate,
} from './game-gpu-probe';

export function estimateSceneGpuMemory(scene: THREE.Scene): GpuMemoryEstimate {
  const textures: Parameters<typeof estimateGpuMemory>[0] extends readonly (infer T)[] ? T[] : never[] = [];
  const geometries: Parameters<typeof estimateGpuMemory>[1] extends readonly (infer T)[] ? T[] : never[] = [];
  const seenTextures = new Set<THREE.Texture>();
  const seenGeometries = new Set<THREE.BufferGeometry>();
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
      if (!seenGeometries.has(object.geometry)) {
        seenGeometries.add(object.geometry);
        const position = object.geometry.getAttribute('position');
        const vertexCount = position ? position.count : 0;
        const indexCount = object.geometry.index ? object.geometry.index.count : 0;
        geometries.push({ vertexCount: vertexCount + indexCount, bytesPerVertex: 12 });
      }
    }
    if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments
      || object instanceof THREE.InstancedMesh) {
      const assigned = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of assigned) {
        const candidate = (material as THREE.MeshBasicMaterial & { map?: THREE.Texture }).map;
        if (candidate && !seenTextures.has(candidate)) {
          seenTextures.add(candidate);
          const image = candidate.image as { width?: number; height?: number } | undefined;
          textures.push({
            width: image?.width ?? 0,
            height: image?.height ?? 0,
            bytesPerPixel: 4,
          });
        }
      }
    }
  });
  return estimateGpuMemory(textures, geometries);
}
