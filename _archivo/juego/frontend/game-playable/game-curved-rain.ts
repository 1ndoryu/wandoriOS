/* GAME-01 — Lluvia de la isla curva (138A-3). Adaptador Three delgado sobre
 * buildRainStreakData del toolkit procedural; extraído de game-curved-island.ts
 * (deuda declarada en el cierre 128A-1): LineSegments animado por shader que
 * sigue al jugador. Solo presentación; sin colisión ni simulación. */

import * as THREE from 'three';
import { buildRainStreakData } from '../../../game-core';
import { WORLD_BEND_PARS, type WorldBend } from './game-world-bend';

export interface CurvedRainOptions {
  /** Número de gotas (1100 en la isla actual). */
  readonly count: number;
  /** Radio del cilindro de lluvia en unidades de mundo. */
  readonly area: number;
  /** Longitud del ciclo vertical del shader. */
  readonly span: number;
  /** Altura máxima de las gotas sobre el ancla. */
  readonly top: number;
  readonly seed?: number;
}

export interface CurvedRain {
  readonly mesh: THREE.LineSegments;
  readonly setAnchor: (x: number, y: number, z: number) => void;
  readonly setTime: (t: number) => void;
  /** 0..1; con 0 oculta el conjunto. */
  readonly setAmount: (amount: number) => void;
  readonly setVisible: (visible: boolean) => void;
  readonly dispose: () => void;
}

export function mountCurvedRain(
  scene: THREE.Scene,
  bend: WorldBend,
  options: CurvedRainOptions,
): CurvedRain {
  const { count, area, span, top } = options;
  const data = buildRainStreakData({ count, area, span, seed: options.seed ?? 1337 });
  const uniforms = {
    uTime: { value: 0 },
    uAnchor: { value: new THREE.Vector3() },
    uArea: { value: area },
    uTop: { value: top },
    uSpan: { value: span },
    uBendOrigin: bend.uniforms.uBendOrigin,
    uBendDown: bend.uniforms.uBendDown,
    uBendPull: bend.uniforms.uBendPull,
    uBendClamp: bend.uniforms.uBendClamp,
  };
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
  geometry.setAttribute('aRand', new THREE.BufferAttribute(data.random, 3));
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: WORLD_BEND_PARS + `
      attribute vec3 aRand;
      uniform float uTime, uArea, uTop, uSpan;
      uniform vec3 uAnchor;
      varying float vA;
      void main(){
        float y = uAnchor.y + uTop - mod(aRand.y + uTime * 15.0, uSpan);
        vec3 wp = vec3(uAnchor.x + aRand.x, y + position.y, uAnchor.z + aRand.z);
        vA = 1.0 - smoothstep(0.55, 1.0, length(aRand.xz) / uArea);
        vec4 mv = viewMatrix * vec4(applyWorldBend(wp), 1.0);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      precision mediump float;
      varying float vA;
      void main(){ gl_FragColor = vec4(0.93, 0.98, 1.0, vA * 0.34); }
    `,
  });
  const mesh = new THREE.LineSegments(geometry, material);
  mesh.frustumCulled = false;
  scene.add(mesh);

  let amount = 0.6;
  mesh.visible = amount > 0.001;

  return {
    mesh,
    setAnchor: (x, y, z) => uniforms.uAnchor.value.set(x, y, z),
    setTime: (t) => { uniforms.uTime.value = t; },
    setAmount: (next) => {
      amount = Math.max(0, Math.min(1, next));
      mesh.visible = amount > 0.001;
    },
    setVisible: (visible) => {
      mesh.visible = visible && amount > 0.001;
    },
    dispose: () => {
      scene.remove(mesh);
      geometry.dispose();
      material.dispose();
    },
  };
}
