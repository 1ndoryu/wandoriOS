/* GAME-01 — Plano de agua toon compartido (138A-3, corrección 13-ago).
 * Única fuente de verdad de la geometría/material del agua estática: el
 * comparador procedural y la isla curva montan exactamente la MISMA
 * configuración (subdivisión 32×32 + polygonOffset anti z-fighting), porque
 * ya se rompió una vez y el drift produjo el bug visual del usuario.
 * El generador puro buildWaterMeshData queda en game-core para futuras
 * variantes de oleaje; aquí solo hay presentación. */

import * as THREE from 'three';
import { type WorldBend } from './game-world-bend';
import { BLOCK_COLORS } from './game-block-palette';

/* Subdivisión necesaria para el bend: la curva de mundo (dist²×down) se evalúa
 * por vértice y con un plano 1×1 el interior se interpola entre esquinas
 * dobladas (quedaba decenas de unidades bajo el fondo marino en el modo
 * Suave). 32×32 sigue la parábola con error < 0.15 en la escala del mapa. */
const TOON_WATER_SEGMENTS = 32;

export interface ToonWaterPlane {
  readonly geometry: THREE.PlaneGeometry;
  readonly material: THREE.MeshToonMaterial;
}

/* Geometría pura del plano de agua: única fuente de verdad de subdivisión y
 * orientación. El comparador la reutiliza al redimensionar el agua SIN crear
 * un material nuevo por regeneración (un material por montaje, no por clic). */
export function buildToonWaterPlaneGeometry(sizeX: number, sizeZ: number): THREE.PlaneGeometry {
  const geometry = new THREE.PlaneGeometry(sizeX, sizeZ, TOON_WATER_SEGMENTS, TOON_WATER_SEGMENTS);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

export function buildToonWaterPlane(
  bend: WorldBend,
  sizeX: number,
  sizeZ: number,
  toonRamp: THREE.Texture,
): ToonWaterPlane {
  const geometry = buildToonWaterPlaneGeometry(sizeX, sizeZ);
  const material = bend.apply(new THREE.MeshToonMaterial({
    color: BLOCK_COLORS.waterShallow,
    gradientMap: toonRamp,
  }));
  material.polygonOffset = true;
  material.polygonOffsetFactor = -1;
  material.polygonOffsetUnits = -1;
  return { geometry, material };
}
