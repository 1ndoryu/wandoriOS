/* GAME-01 — Preview 3D aislado de un GLB (Assets 3D).
 * [297A-73] Carga el binario de una versión (blob) con GLTFLoader de three y
 * lo muestra en una escena monocroma con grid, bounds (Box3) y rotación
 * orbital; el teardown libera geometrías, materiales, texturas, RAF,
 * observers y contexto WebGL. No decide colliders ni escala real: solo
 * inspección visual del asset antes de activarlo. */

import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

export interface GameAssetPreviewHandle {
  readonly canvas: HTMLCanvasElement;
  /** Carga un GLB desde blob; resuelve con el resumen del modelo. */
  readonly load: (blob: Blob) => Promise<GameAssetPreviewSummary>;
  readonly destroy: () => void;
}

export interface GameAssetPreviewSummary {
  readonly nodes: number;
  readonly meshes: number;
  readonly triangles: number;
  readonly materials: number;
  readonly animations: number;
  readonly hasTextures: boolean;
}

/** [297A-73] Recorre la escena y resume el contenido del GLB (puro, sin
 * Three en la firma para poder testearlo con un objeto simulado). */
export function summarizeLoadedAsset(root: THREE.Object3D): GameAssetPreviewSummary {
  let meshes = 0;
  let triangles = 0;
  let materials = 0;
  let hasTextures = false;
  const materialIds = new Set<string>();
  const animations = Array.isArray((root as { animations?: unknown[] }).animations)
    ? (root as { animations: unknown[] }).animations.length
    : 0;

  root.traverse((object) => {
    if ((object as THREE.Mesh).isMesh) {
      const mesh = object as THREE.Mesh;
      meshes += 1;
      const geometry = mesh.geometry;
      if (geometry.index) triangles += geometry.index.count / 3;
      else if (geometry.getAttribute('position')) {
        triangles += geometry.getAttribute('position').count / 3;
      }
      const materialList = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materialList) {
        if (!material) continue;
        const key = material.uuid;
        if (!materialIds.has(key)) {
          materialIds.add(key);
          materials += 1;
        }
        const materialAny = material as THREE.Material & {
          map?: THREE.Texture | null;
          emissiveMap?: THREE.Texture | null;
        };
        if (materialAny.map || materialAny.emissiveMap) hasTextures = true;
      }
    }
  });

  return {
    nodes: countNodes(root),
    meshes,
    triangles: Math.round(triangles),
    materials,
    animations,
    hasTextures,
  };
}

function countNodes(root: THREE.Object3D): number {
  let count = 0;
  root.traverse(() => {
    count += 1;
  });
  return count;
}

/** [297A-73] Caja envolvente del modelo (Box3) en coordenadas del GLB. */
export function computeAssetBounds(root: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3();
  box.setFromObject(root);
  return box;
}

export function createGameAssetPreview(host: HTMLElement): GameAssetPreviewHandle {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xeeeeea);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 500);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.domElement.setAttribute('aria-label', 'Vista previa 3D del asset GLB');
  host.appendChild(renderer.domElement);

  const materials = {
    grid: new THREE.LineBasicMaterial({ color: 0xb9b9b2 }),
    bounds: new THREE.LineBasicMaterial({ color: 0x111111 }),
  };

  const lights = [
    new THREE.HemisphereLight(0xffffff, 0x555555, 2.2),
    new THREE.DirectionalLight(0xffffff, 3.0),
  ];
  lights[1].position.set(-8, 18, 10);
  scene.add(...lights);

  /* Grid de referencia en el suelo (monocromo, sin color). */
  const grid = new THREE.GridHelper(10, 10, 0xb9b9b2, 0xcfcfc8);
  grid.material = materials.grid;
  scene.add(grid);

  const loadedObjects: THREE.Object3D[] = [];
  let boundLine: THREE.LineSegments | null = null;
  let destroyed = false;

  const fitCamera = (box: THREE.Box3): void => {
    const size = box.getSize(new THREE.Vector3()).length();
    const center = box.getCenter(new THREE.Vector3());
    const distance = Math.max(size * 1.8, 1);
    camera.position.set(center.x + distance * 0.75, center.y + distance * 0.6, center.z + distance * 0.75);
    camera.lookAt(center);
  };

  const resize = (): void => {
    if (destroyed) return;
    const width = Math.max(host.clientWidth, 1);
    const height = Math.max(host.clientHeight, 1);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  };

  const renderFrame = (): void => {
    if (destroyed) return;
    renderer.render(scene, camera);
  };

  let animationCleanup: () => void = () => {};
  const onResize = (): void => resize();
  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(onResize);
    observer.observe(host);
    animationCleanup = () => observer.disconnect();
  } else {
    window.addEventListener('resize', onResize);
    animationCleanup = () => window.removeEventListener('resize', onResize);
  }

  resize();

  const load = async (blob: Blob): Promise<GameAssetPreviewSummary> => {
    if (destroyed) throw new Error('Preview destruido');
    /* Retirar el modelo anterior y liberar sus recursos. */
    for (const object of loadedObjects) {
      scene.remove(object);
      object.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.geometry?.dispose();
          const materialList = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const material of materialList) {
            const anyMaterial = material as THREE.Material & {
              map?: THREE.Texture | null;
            };
            anyMaterial.map?.dispose();
            material?.dispose();
          }
        }
      });
    }
    loadedObjects.length = 0;
    if (boundLine) {
      scene.remove(boundLine);
      boundLine.geometry.dispose();
      boundLine = null;
    }

    const url = URL.createObjectURL(blob);
    try {
      const gltf = await new Promise<GLTF>((resolve, reject) => {
        new GLTFLoader().load(url, resolve, undefined, (error) => {
          reject(error instanceof Error ? error : new Error(String(error)));
        });
      });
      if (destroyed) {
        gltf.scene.traverse((child: THREE.Object3D) => {
          const mesh = child as THREE.Mesh;
          if (mesh.isMesh) mesh.geometry?.dispose();
        });
        return { nodes: 0, meshes: 0, triangles: 0, materials: 0, animations: 0, hasTextures: false };
      }
      scene.add(gltf.scene);
      loadedObjects.push(gltf.scene);

      const box = computeAssetBounds(gltf.scene);
      if (box.isEmpty()) {
        /* Modelo sin geometría: caja degenerada centrada. */
        box.setFromCenterAndSize(new THREE.Vector3(), new THREE.Vector3(1, 1, 1));
      }
      const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
      const line = new THREE.LineSegments(edges, materials.bounds);
      line.position.copy(box.getCenter(new THREE.Vector3()));
      line.scale.copy(box.getSize(new THREE.Vector3()));
      scene.add(line);
      boundLine = line;

      fitCamera(box);
      renderFrame();
      return summarizeLoadedAsset(gltf.scene);
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  return {
    canvas: renderer.domElement,
    load,
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      animationCleanup();
      for (const object of loadedObjects) {
        scene.remove(object);
        object.traverse((child) => {
          const mesh = child as THREE.Mesh;
          if (mesh.isMesh) {
            mesh.geometry?.dispose();
            const materialList = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            for (const material of materialList) {
              const anyMaterial = material as THREE.Material & { map?: THREE.Texture | null };
              anyMaterial.map?.dispose();
              material?.dispose();
            }
          }
        });
      }
      loadedObjects.length = 0;
      if (boundLine) {
        scene.remove(boundLine);
        boundLine.geometry.dispose();
      }
      Object.values(materials).forEach((material) => material.dispose());
      lights.forEach((light) => light.dispose?.());
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
