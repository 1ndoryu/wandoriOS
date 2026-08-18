/* GAME-01 — Bending de mundo estilo "Curved Island".
 * Referencia: Agente/usuario/referencia-visual-curved-island-2026-08-12.md.
 * El truco es 100% visual: el vertex shader lleva cada vértice a espacio mundo,
 * lo hunde `dist² × curve` respecto del origen del bend y lo proyecta. La
 * simulación/colisión sigue siendo plana; aquí solo se curva la presentación.
 *
 * La pieza se comparte como UN único objeto de uniforms por escena, de modo que
 * todos los materiales parcheados apuntan a la misma referencia y una sola
 * asignación por frame actualiza el mundo entero.
 */

import * as THREE from 'three';

export interface WorldBendUniforms {
  readonly uBendOrigin: { value: THREE.Vector3 };
  readonly uBendDown: { value: number };
  readonly uBendPull: { value: number };
  readonly uBendClamp: { value: number };
}

export interface WorldBend {
  readonly uniforms: WorldBendUniforms;
  /** Parchea un material para que obedezca la curva. Idempotente por material. */
  apply: <T extends THREE.Material>(material: T) => T;
  setOrigin: (x: number, y: number, z: number) => void;
  setCurvature: (down: number, pull: number) => void;
}

/* Preset "cozy" del estudio: curva suave que hunde el horizonte sin exagerar. */
const DEFAULT_DOWN = 0.010;
const DEFAULT_PULL = 0.004;
const BEND_CLAMP = 75.0;

/* Pars compartido: también lo consume el ShaderMaterial del agua del estilo
 * Curved Island, que no pasa por onBeforeCompile. */
export const WORLD_BEND_PARS = `
uniform vec3  uBendOrigin;
uniform float uBendDown;
uniform float uBendPull;
uniform float uBendClamp;
vec3 applyWorldBend(vec3 wp){
  vec2  d    = wp.xz - uBendOrigin.xz;
  float len  = length(d);
  vec2  dir  = len > 0.0001 ? d / len : vec2(0.0);
  float dist = min(len, uBendClamp);
  float d2   = dist * dist;
  wp.y  -= d2 * uBendDown;
  wp.xz -= dir * d2 * uBendPull;
  return wp;
}
`;

/* Reemplaza `project_vertex` conservando el instancing de three (los props van
 * en InstancedMesh): modelMatrix * instanceMatrix * transformed = mundo. */
const BEND_PROJECT = `
  vec4 bentWorld = modelMatrix * vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    bentWorld = modelMatrix * instanceMatrix * vec4( transformed, 1.0 );
  #endif
  bentWorld.xyz = applyWorldBend( bentWorld.xyz );
  vec4 mvPosition = viewMatrix * bentWorld;
  gl_Position = projectionMatrix * mvPosition;
`;

const CACHE_KEY = 'worldbend-curved-island-v1';

export function createWorldBend(): WorldBend {
  const uniforms: WorldBendUniforms = {
    uBendOrigin: { value: new THREE.Vector3(0, 0, 0) },
    uBendDown: { value: DEFAULT_DOWN },
    uBendPull: { value: DEFAULT_PULL },
    uBendClamp: { value: BEND_CLAMP },
  };

  const patch = (shader: {
    uniforms: Record<string, THREE.IUniform>;
    vertexShader: string;
  }): void => {
    shader.uniforms.uBendOrigin = uniforms.uBendOrigin;
    shader.uniforms.uBendDown = uniforms.uBendDown;
    shader.uniforms.uBendPull = uniforms.uBendPull;
    shader.uniforms.uBendClamp = uniforms.uBendClamp;
    shader.vertexShader = WORLD_BEND_PARS
      + shader.vertexShader.replace('#include <project_vertex>', BEND_PROJECT);
  };

  const apply = <T extends THREE.Material>(material: T): T => {
    if ((material as T & { __bendPatched?: boolean }).__bendPatched) return material;
    (material as T & { __bendPatched?: boolean }).__bendPatched = true;
    material.onBeforeCompile = patch;
    material.customProgramCacheKey = () => CACHE_KEY;
    return material;
  };

  return {
    uniforms,
    apply,
    setOrigin: (x, y, z) => uniforms.uBendOrigin.value.set(x, y, z),
    setCurvature: (down, pull) => {
      uniforms.uBendDown.value = down;
      uniforms.uBendPull.value = pull;
    },
  };
}
