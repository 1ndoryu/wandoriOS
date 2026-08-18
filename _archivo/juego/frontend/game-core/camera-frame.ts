/* GAME-01 — Transformación de input relativo a cámara.
 * Las teclas y el pad expresan intención en el marco de la cámara (arriba =
 * alejar la cámara, derecha = derecha de la pantalla), como en los juegos de
 * mundo abierto tipo Genshin; el tick lógico trabaja en espacio de mundo X/Z.
 * Este módulo rota la intención al espacio de mundo usando el azimuth de la
 * cámara orbital sin conocer Three.js ni el DOM. */

import type { Vector2 } from './contracts';

/** Azimuth orbital de la cámara: 0 sitúa la cámara en +Z mirando hacia -Z, y
 * crece en el sentido que gira el arrastre. La rotación resultante cumple:
 *  - az = 0        → (0,-1) se queda en (0,-1)  (adelante = -Z)
 *  - az = π/2      → (0,-1) pasa a (-1, 0)      (adelante = -X, cámara en +X)
 *  - az = π        → (0,-1) pasa a (0, 1)       (adelante = +Z) */
export function rotateInputToWorld(direction: Vector2, azimuth: number): Vector2 {
  if (!Number.isFinite(direction.x) || !Number.isFinite(direction.z)) return { x: 0, z: 0 };
  /* Fail-closed: un azimuth no finito no debe contaminar la simulación; se
   * trata como cámara sin girar (el estado orbital siempre es finito). */
  const safeAzimuth = Number.isFinite(azimuth) ? azimuth : 0;
  const cos = Math.cos(safeAzimuth);
  const sin = Math.sin(safeAzimuth);
  return {
    x: direction.x * cos + direction.z * sin,
    z: -direction.x * sin + direction.z * cos,
  };
}
