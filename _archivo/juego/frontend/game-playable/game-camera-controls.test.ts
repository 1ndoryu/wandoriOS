import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  CAMERA_GROUND_CLEARANCE,
  resolveThirdPersonCollision,
} from './game-camera-controls';

describe('game-camera-controls — colisión de 3ª persona (138A-11)', () => {
  const makeCamera = (y: number): THREE.PerspectiveCamera => {
    const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 500);
    camera.position.set(0, y, 10);
    return camera;
  };

  it('eleva la cámara por el máximo suelo+despeje del segmento jugador→cámara', () => {
    const camera = makeCamera(1);
    const target = new THREE.Vector3(0, 0, 0);
    /* Colina intermedia de altura 5 en el punto medio del tramo: un muestreo
     * de punto único (solo el final) nunca la vería. */
    const groundHeightAt = (x: number, z: number): number => (Math.abs(x) < 0.1 && Math.abs(z - 5) < 0.1 ? 5 : 0);

    resolveThirdPersonCollision(camera, target, groundHeightAt);
    expect(camera.position.y).toBeGreaterThanOrEqual(5 + CAMERA_GROUND_CLEARANCE);
  });

  it('nunca baja la cámara si el terreno es más bajo que su altura actual', () => {
    const camera = makeCamera(8);
    const target = new THREE.Vector3(0, 0, 0);
    resolveThirdPersonCollision(camera, target, () => 0);
    expect(camera.position.y).toBe(8);
  });

  it('respeta una altura libre mayor (suelo + despeje) en cualquier punto del tramo', () => {
    const camera = makeCamera(2);
    const target = new THREE.Vector3(0, 0, 0);
    const samples = 4;
    const groundHeightAt = (_x: number, z: number): number => {
      /* Rampa lineal: altura = 3 + 0.6·z (el punto más alto está en la cámara). */
      return 3 + 0.6 * z;
    };
    resolveThirdPersonCollision(camera, target, groundHeightAt, CAMERA_GROUND_CLEARANCE, samples);
    const highest = 3 + 0.6 * camera.position.z;
    expect(camera.position.y).toBeGreaterThanOrEqual(highest + CAMERA_GROUND_CLEARANCE);
  });
});
