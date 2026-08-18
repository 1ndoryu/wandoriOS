/* GAME-01 — Agua de la isla curva (138A-3, ajustada por feedback 13-ago).
 * Adaptador Three delgado: un único plano toon estático, el MISMO agua que el
 * comparador validó por el usuario. El shader de costa con olas y espuma (y su
 * malla segmentada 120×80) se retiró del modo "Actual": la superficie
 * desplazada se veía como una capa de triángulos encima del agua. El generador
 * puro buildWaterMeshData sigue en game-core para futuras variantes de oleaje.
 * Solo presentación; no alimenta colisión ni simulación. */

import * as THREE from 'three';
import { type WorldBend } from './game-world-bend';
import { buildToonWaterPlane } from './game-toon-water';

/* El plano de agua se extiende más allá del mapa (océano visible como límite). */
export const WATER_MESH_SCALE = 2.4;

export interface CurvedWaterOptions {
  /** Tamaño del mapa que el plano cubre (borde a borde antes de meshScale). */
  readonly width: number;
  readonly depth: number;
  /** Escala del plano respecto al mapa (1 = borde a borde; 2.4 = océano visible). */
  readonly meshScale?: number;
  readonly waterY: number;
  readonly centerX: number;
  readonly centerZ: number;
  /** Rampa toon compartida por todos los materiales lit de la escena. */
  readonly toonRamp: THREE.Texture;
}

export interface CurvedWater {
  readonly mesh: THREE.Mesh;
  /** No-op: el agua plana es estática; se conserva por contrato de update. */
  readonly update: (timeSeconds: number) => void;
  readonly setVisible: (visible: boolean) => void;
  readonly dispose: () => void;
}

export function mountCurvedWater(
  scene: THREE.Scene,
  bend: WorldBend,
  options: CurvedWaterOptions,
): CurvedWater {
  const { width, depth, waterY, centerX, centerZ, toonRamp } = options;
  const meshScale = options.meshScale ?? 1;
  if (!Number.isFinite(meshScale) || meshScale <= 0) {
    throw new Error('escala de agua inválida');
  }

  /* Misma geometría/material que el agua del comparador: helper compartido. */
  const { geometry, material } = buildToonWaterPlane(bend, width * meshScale, depth * meshScale, toonRamp);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 1;
  mesh.position.set(centerX, waterY, centerZ);
  scene.add(mesh);

  return {
    mesh,
    update: () => {},
    setVisible: (visible) => {
      mesh.visible = visible;
    },
    dispose: () => {
      if (mesh.parent) mesh.parent.remove(mesh);
      geometry.dispose();
      material.dispose();
    },
  };
}
