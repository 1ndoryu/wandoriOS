/* 138A-12 — Skydome procedural y ambiente del Constructor de mundo.
 * Adaptación de la referencia "Skydome — Procedural Painted Clouds"
 * (artefacto Claude) orientada a rendimiento: un solo ShaderMaterial con
 * value noise + fbm billow, domain warp, self-shadow barato de 2 pasos,
 * paleta posterizada (deep/shadow/mid/light/high) y disco+glow solar.
 * La cúpula sigue a la cámara (mesh radio 260 con frustumCulled=false) y
 * las luces direccional + hemisférica se sincronizan al mismo vector solar
 * que el shader. Sin async: los presupuestos verificables (1 mesh + 1
 * material + 2 luces, teardown total) se cubren en los tests de ciclo de
 * vida y en las métricas del renderer. */

import * as THREE from 'three';
import {
  normalizeSkyOptions,
  sunDirectionFromOptions,
  type SkyOptions,
} from '../../../game-core';
import { SKY_FRAGMENT_SHADER, SKY_VERTEX_SHADER } from './game-sky-shader';

/** Radio de la cúpula: supera la cota del frustum (camera.far ~500) y el
 *  mapa máximo (±256 u con cellSize 2); al seguir a la cámara nunca se ve
 *  el borde de la esfera. */
export const SKY_DOME_RADIUS = 260;
export const SKY_DOME_SEGMENTS = 48;

export interface SkyDomeHandle {
  readonly mesh: THREE.Mesh;
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  /** Aplica opciones completas (paleta + sol + nubes) a uniforms y luces. */
  readonly update: (options: SkyOptions) => void;
  /** Avanza el reloj del shader (viento/evolución). */
  readonly updateTime: (seconds: number) => void;
  /** Mantiene la cúpula centrada en la cámara (llamar cada frame). */
  readonly followCamera: (position: THREE.Vector3) => void;
  /** Quita mesh+luces de la escena y libera material y geometría. */
  readonly dispose: () => void;
}

/** Monta la cúpula de cielo y las luces del ambiente. `options` se
 *  normaliza fail-closed; la escena conserva su `scene.background`/niebla
 *  para el terreno y puede pintar el horizonte con la paleta del mundo. */
export function mountSkyDome(scene: THREE.Scene, options: SkyOptions): SkyDomeHandle {
  const normalized = normalizeSkyOptions(options);
  const uniforms: Record<string, THREE.IUniform> = {
    uTime: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color(normalized.sun) },
    uSunInfluence: { value: normalized.sunInfluence },
    uSunSize: { value: normalized.sunSize },
    uSunGlow: { value: normalized.sunGlow },
    uZenith: { value: new THREE.Color(normalized.zenith) },
    uHorizon: { value: new THREE.Color(normalized.horizon) },
    uGround: { value: new THREE.Color(normalized.ground) },
    uCDeep: { value: new THREE.Color(normalized.deep) },
    uCShadow: { value: new THREE.Color(normalized.shadow) },
    uCMid: { value: new THREE.Color(normalized.mid) },
    uCLight: { value: new THREE.Color(normalized.light) },
    uCHigh: { value: new THREE.Color(normalized.high) },
    uMode: { value: normalized.mode },
    uHighStart: { value: normalized.highStart },
    uBandTop: { value: normalized.bandTop },
    uBandLow: { value: normalized.bandLow },
    uCoverage: { value: normalized.coverage },
    uScale: { value: normalized.scale },
    uSquash: { value: normalized.squash },
    uPuff: { value: normalized.puff },
    uEdge: { value: normalized.edge },
    uWarp: { value: normalized.warp },
    uOctaves: { value: normalized.octaves },
    uBands: { value: normalized.bands },
    uPosterize: { value: normalized.posterize },
    uShadowStr: { value: normalized.shadowStr },
    uStepScale: { value: normalized.stepScale },
    uSilver: { value: normalized.silver },
    uDrift: { value: normalized.drift },
    uEvolve: { value: normalized.evolve },
    uSeed: { value: normalized.seed },
    uHaze: { value: normalized.haze },
    uL2On: { value: normalized.layer2 ? 1 : 0 },
    uL2Coverage: { value: normalized.l2Coverage },
    uL2Scale: { value: normalized.l2Scale },
    uL2Opacity: { value: normalized.l2Opacity },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: SKY_VERTEX_SHADER,
    fragmentShader: SKY_FRAGMENT_SHADER,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const geometry = new THREE.SphereGeometry(SKY_DOME_RADIUS, SKY_DOME_SEGMENTS, Math.floor(SKY_DOME_SEGMENTS * 0.75));
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  scene.add(mesh);

  const sun = new THREE.DirectionalLight(normalized.sun, 1);
  scene.add(sun, sun.target);

  const hemi = new THREE.HemisphereLight(normalized.mid, normalized.deep, 0.7);
  scene.add(hemi);

  let currentOptions = normalized;
  const applySun = (): void => {
    const direction = sunDirectionFromOptions(currentOptions.sunEl, currentOptions.sunAz);
    (uniforms.uSunDir.value as THREE.Vector3).set(direction[0], direction[1], direction[2]);
    sun.position.set(direction[0] * 160, direction[1] * 160, direction[2] * 160);
    sun.target.position.set(0, 0, 0);
    sun.intensity = Math.max(0, direction[1]) * 1.35 * currentOptions.sunInfluence;
    hemi.intensity = 0.35 + 0.35 * currentOptions.sunInfluence;
  };
  const applyPalette = (): void => {
    (uniforms.uZenith.value as THREE.Color).setHex(currentOptions.zenith);
    (uniforms.uHorizon.value as THREE.Color).setHex(currentOptions.horizon);
    (uniforms.uGround.value as THREE.Color).setHex(currentOptions.ground);
    (uniforms.uSunColor.value as THREE.Color).setHex(currentOptions.sun);
    (uniforms.uCDeep.value as THREE.Color).setHex(currentOptions.deep);
    (uniforms.uCShadow.value as THREE.Color).setHex(currentOptions.shadow);
    (uniforms.uCMid.value as THREE.Color).setHex(currentOptions.mid);
    (uniforms.uCLight.value as THREE.Color).setHex(currentOptions.light);
    (uniforms.uCHigh.value as THREE.Color).setHex(currentOptions.high);
    sun.color.setHex(currentOptions.sun);
    hemi.color.setHex(currentOptions.mid);
    hemi.groundColor.setHex(currentOptions.deep);
  };
  const applyNumeric = (): void => {
    uniforms.uMode.value = currentOptions.mode;
    uniforms.uHighStart.value = currentOptions.highStart;
    uniforms.uBandTop.value = currentOptions.bandTop;
    uniforms.uBandLow.value = currentOptions.bandLow;
    uniforms.uCoverage.value = currentOptions.coverage;
    uniforms.uScale.value = currentOptions.scale;
    uniforms.uSquash.value = currentOptions.squash;
    uniforms.uPuff.value = currentOptions.puff;
    uniforms.uEdge.value = currentOptions.edge;
    uniforms.uWarp.value = currentOptions.warp;
    uniforms.uOctaves.value = currentOptions.octaves;
    uniforms.uBands.value = currentOptions.bands;
    uniforms.uPosterize.value = currentOptions.posterize;
    uniforms.uShadowStr.value = currentOptions.shadowStr;
    uniforms.uStepScale.value = currentOptions.stepScale;
    uniforms.uSilver.value = currentOptions.silver;
    uniforms.uDrift.value = currentOptions.drift;
    uniforms.uEvolve.value = currentOptions.evolve;
    uniforms.uSeed.value = currentOptions.seed;
    uniforms.uHaze.value = currentOptions.haze;
    uniforms.uL2On.value = currentOptions.layer2 ? 1 : 0;
    uniforms.uL2Coverage.value = currentOptions.l2Coverage;
    uniforms.uL2Scale.value = currentOptions.l2Scale;
    uniforms.uL2Opacity.value = currentOptions.l2Opacity;
    uniforms.uSunInfluence.value = currentOptions.sunInfluence;
    uniforms.uSunSize.value = currentOptions.sunSize;
    uniforms.uSunGlow.value = currentOptions.sunGlow;
  };
  applyPalette();
  applyNumeric();
  applySun();

  return {
    mesh,
    sun,
    hemi,
    update(next: SkyOptions): void {
      currentOptions = normalizeSkyOptions(next);
      applyPalette();
      applyNumeric();
      applySun();
    },
    updateTime(seconds: number): void {
      uniforms.uTime.value = seconds;
    },
    followCamera(position: THREE.Vector3): void {
      mesh.position.copy(position);
    },
    dispose(): void {
      scene.remove(mesh);
      scene.remove(sun, sun.target, hemi);
      geometry.dispose();
      material.dispose();
    },
  };
}
