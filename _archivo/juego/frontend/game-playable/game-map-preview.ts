/* GAME-01 — Preview 3D del borrador del Editor de mapa 2D.
 * [297A-70] Muestra el documento en edición con el MISMO pipeline del runtime
 * (buildTerrainMeshData + materiales de superficie), sin un segundo motor:
 * el adaptador materializa los chunks del borrador y marca spawns/instancias
 * con primitivas para lectura rápida. No decide movimiento ni colisiones; el
 * teardown libera geometrías, materiales, RAF, observers y contexto WebGL. */

import * as THREE from 'three';
import {
  buildTerrainMeshData,
  type MapVersion,
} from '../../../game-core';
import { FIXTURE_PROPS } from './game-fixture-map';

export interface PreviewChunkMeshData {
  readonly key: string;
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
  readonly surfaces: Uint8Array;
}

export interface GameMapPreviewHandle {
  readonly canvas: HTMLCanvasElement;
  readonly setDocument: (document: MapVersion) => void;
  readonly destroy: () => void;
}

/** [297A-70] Datos puros de malla para todos los chunks del borrador: misma
 * transformación y cuotas que el runtime (buildTerrainMeshData), sin Three. */
export function buildPreviewChunkData(document: MapVersion): readonly PreviewChunkMeshData[] {
  const { cellSize, bounds, chunks } = document.terrain;
  return chunks.map((chunk) => {
    const data = buildTerrainMeshData(chunk, cellSize, bounds.minX, bounds.minZ);
    return {
      key: `${chunk.x}:${chunk.z}`,
      positions: data.positions,
      indices: data.indices,
      surfaces: data.surfaces,
    };
  });
}

export function createGameMapPreview(host: HTMLElement): GameMapPreviewHandle {
  const scene = new THREE.Scene();
  /* [GAME-01-VIS] Paleta verde stylized coherente con el runtime (05-ago). */
  scene.background = new THREE.Color(0x87ceeb);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.domElement.setAttribute('aria-label', 'Vista previa 3D del borrador del mapa');
  host.appendChild(renderer.domElement);

  const materials = {
    pale: new THREE.MeshToonMaterial({ color: 0xa8d98a }),
    water: new THREE.MeshToonMaterial({ color: 0x3d8bcd }),
    middle: new THREE.MeshToonMaterial({ color: 0x5a9e4b }),
    spawn: new THREE.MeshBasicMaterial({ color: 0x1e4620 }),
  };

  scene.add(new THREE.HemisphereLight(0xfff7e0, 0x3a6b35, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 3.0);
  sun.position.set(-8, 18, 10);
  scene.add(sun);

  const terrainObjects = new Map<string, THREE.Mesh>();
  const markerObjects = new Map<string, THREE.Object3D>();
  const spawnObjects: THREE.Object3D[] = [];
  let currentDocument: MapVersion | null = null;
  let destroyed = false;

  const fitCamera = (): void => {
    if (!currentDocument) return;
    const { bounds } = currentDocument.terrain;
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerZ = (bounds.minZ + bounds.maxZ) / 2;
    const size = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ, 4);
    const distance = size * 1.6;
    camera.position.set(centerX + distance * 0.7, size * 1.1, centerZ + distance * 0.7);
    camera.lookAt(centerX, 0, centerZ);
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

  const syncDocument = (document: MapVersion): void => {
    if (destroyed) return;
    currentDocument = document;
    const data = buildPreviewChunkData(document);

    for (const [key, mesh] of terrainObjects) {
      if (data.some(entry => entry.key === key)) continue;
      scene.remove(mesh);
      mesh.geometry.dispose();
      terrainObjects.delete(key);
    }
    for (const entry of data) {
      const existing = terrainObjects.get(entry.key);
      if (existing) continue;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(entry.positions, 3));
      geometry.setIndex(new THREE.BufferAttribute(entry.indices, 1));
      geometry.clearGroups();
      for (let cell = 0; cell < entry.surfaces.length; cell += 1) {
        geometry.addGroup(cell * 6, 6, surfaceMaterialIndex(entry.surfaces[cell]));
      }
      geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(geometry, [materials.pale, materials.water, materials.middle]);
      terrainObjects.set(entry.key, mesh);
      scene.add(mesh);
    }

    /* Spawns: esferas pequeñas para lectura rápida. */
    for (const object of spawnObjects) scene.remove(object);
    spawnObjects.length = 0;
    for (const spawn of document.spawnPoints) {
      const sphere = new THREE.Mesh(new THREE.SphereGeometry(spawn.radius, 12, 8), materials.spawn);
      sphere.position.set(spawn.position.x, 0.3, spawn.position.z);
      spawnObjects.push(sphere);
      scene.add(sphere);
    }

    /* Instancias conocidas del fixture: marcadores según el prop. */
    for (const [id, object] of markerObjects) {
      scene.remove(object);
      markerObjects.delete(id);
    }
    for (const instance of document.instances) {
      const prop = FIXTURE_PROPS.find(p => p.id === instance.id);
      if (!prop) continue;
      const marker = new THREE.Mesh(
        new THREE.ConeGeometry(0.35, 1.1, 6),
        materials.spawn,
      );
      marker.position.set(instance.position.x, 0.6, instance.position.z);
      markerObjects.set(instance.id, marker);
      scene.add(marker);
    }

    fitCamera();
    renderFrame();
  };

  let resizeObserverCleanup: () => void = () => {};
  const onResize = (): void => resize();
  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(onResize);
    observer.observe(host);
    /* [297A-70] El observer se guarda para retirarlo en destroy. */
    resizeObserverCleanup = () => observer.disconnect();
  } else {
    window.addEventListener('resize', onResize);
    resizeObserverCleanup = () => window.removeEventListener('resize', onResize);
  }

  resize();

  return {
    canvas: renderer.domElement,
    setDocument: syncDocument,
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      resizeObserverCleanup();
      for (const mesh of terrainObjects.values()) {
        scene.remove(mesh);
        mesh.geometry.dispose();
      }
      terrainObjects.clear();
      for (const object of markerObjects.values()) scene.remove(object);
      markerObjects.clear();
      for (const object of spawnObjects) scene.remove(object);
      spawnObjects.length = 0;
      Object.values(materials).forEach(material => material.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}

function surfaceMaterialIndex(surface: number): number {
  return surface === 1 ? 1 : surface === 2 ? 2 : 0;
}
