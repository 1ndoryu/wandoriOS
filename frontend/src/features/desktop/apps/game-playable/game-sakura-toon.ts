/* 138A-15 — Toon cel con tinte violeta compartido (estilo Sakura Crossing).
 * Adaptación de `C:\tmp\sakura-crossing\src\core\toon.js` para el
 * Constructor de mundo:
 * - `gradientMap(bands)`: rampas 2-5 bandas con caché módulo-nivel; las
 *   cacheadas son compartidas y NUNCA se disponen individualmente
 *   (`isCachedRamp` marca la propiedad para que el teardown no las libere).
 * - `applyShadowTint`: parchea el chunk `lights_toon_pars_fragment` para
 *   teñir las bandas oscuras hacia violeta. A diferencia del clon (un
 *   uniform por material), aquí hay UN uniform compartido por escena que se
 *   muta en runtime sin recompilar; el parche envuelve un `onBeforeCompile`
 *   previo (p. ej. el bend) y compone su `customProgramCacheKey`.
 * Referencia completa: `Agente/documentacion/estilo-sakura-crossing/02-materiales-toon-cel.md`. */

import * as THREE from 'three';

/** Rampas del clon (toon.js): índices 96..255 en 2-5 bandas + rampas suaves
 *  para masas pálidas (flor de sakura). La rampa del Bosque se conserva en
 *  `createToonRamp` (game-scene-utils); aquí vive la familia sakura. */
const RAMPS: Readonly<Record<string, readonly number[]>> = {
  '2': [96, 255],
  '3': [92, 178, 255],
  '4': [80, 142, 202, 255],
  '5': [74, 124, 172, 214, 255],
  soft: [180, 255],
  soft3: [172, 214, 255],
};

/** Caché módulo-nivel: los materiales comparten UNA textura por clave y el
 *  toggle de estilo no recrea rampas (ownership en el teardown de escena). */
const rampCache = new Map<string, THREE.DataTexture>();

const CACHED_RAMP_FLAG = '__sakuraCachedRamp' as const;

/** Devuelve la rampa toon para `bands` (2..5 o 'soft'/'soft3') con caché. */
export function gradientMap(bands: number | string = 3): THREE.DataTexture {
  const key = String(bands);
  const cached = rampCache.get(key);
  if (cached) return cached;
  const stops = RAMPS[key] ?? RAMPS['3'];
  const data = new Uint8Array(stops.length * 4);
  stops.forEach((value, index) => {
    data[index * 4] = value;
    data[index * 4 + 1] = value;
    data[index * 4 + 2] = value;
    data[index * 4 + 3] = 255;
  });
  const texture = new THREE.DataTexture(data, stops.length, 1, THREE.RGBAFormat);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  (texture as THREE.DataTexture & { [CACHED_RAMP_FLAG]?: boolean })[CACHED_RAMP_FLAG] = true;
  rampCache.set(key, texture);
  return texture;
}

/** True si la textura es una rampa de la caché compartida: el teardown no
 *  debe disponerla (otras escenas/montajes pueden seguir usándola). */
export function isCachedRamp(texture: THREE.Texture): boolean {
  return (texture as THREE.Texture & { [CACHED_RAMP_FLAG]?: boolean })[CACHED_RAMP_FLAG] === true;
}

const TOON_CHUNK = 'lights_toon_pars_fragment';
const TOON_LINE =
  'vec3 irradiance = getGradientIrradiance( geometryNormal, directLight.direction ) * directLight.color;';
const TOON_PATCH = `
  vec3 celBand = getGradientIrradiance( geometryNormal, directLight.direction );
  vec3 irradiance = celBand * mix( uShadowTint, vec3( 1.0 ), celBand ) * directLight.color;`;

let patchAvailable = false;
let patchedChunk = '';
{
  const src = THREE.ShaderChunk[TOON_CHUNK];
  if (typeof src === 'string' && src.includes(TOON_LINE)) {
    patchedChunk = 'uniform vec3 uShadowTint;\n' + src.replace(TOON_LINE, TOON_PATCH);
    patchAvailable = true;
  }
}

export interface ShadowTintUniform {
  readonly value: THREE.Color;
}

/** Neutral (0xffffff) = sin tinte; violeta (0x6c5f8c) = look sakura. */
export function createShadowTintUniform(tint = 0xffffff): ShadowTintUniform {
  return { value: new THREE.Color(tint) };
}

/** Parchea un MeshToonMaterial para teñir sus bandas oscuras con `uniform`.
 *  Idempotente por material; si three cambió el chunk, no-op (fallback
 *  seguro). Envuelve `onBeforeCompile` previo y compone la cache key. */
export function applyShadowTint(
  material: THREE.MeshToonMaterial,
  uniform: ShadowTintUniform,
): THREE.MeshToonMaterial {
  const flagged = material as THREE.MeshToonMaterial & { __shadowTintPatched?: boolean };
  if (flagged.__shadowTintPatched) return material;
  if (!patchAvailable) return material;
  flagged.__shadowTintPatched = true;

  const previousCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (previousCompile) previousCompile(shader, renderer);
    shader.uniforms.uShadowTint = uniform;
    shader.fragmentShader = shader.fragmentShader.replace(
      `#include <${TOON_CHUNK}>`,
      patchedChunk,
    );
  };

  const previousKey = material.customProgramCacheKey;
  /* Clave fija compartida: el programa es idéntico para todos los materiales
   * y el color real se muta en runtime vía el uniform de escena. */
  const composedKey = () =>
    (previousKey ? previousKey() + '|' : '') + 'celTint_shared';
  material.customProgramCacheKey = composedKey;
  return material;
}

/** Aplica el tinte a todo material MeshToonMaterial alcanzable desde
 *  `scene` (y colecciones extra, p. ej. materiales de figuras). */
export function tintToonMaterials(
  scene: THREE.Object3D,
  uniform: ShadowTintUniform,
  extraCollections: readonly THREE.Material[] = [],
): void {
  const seen = new Set<THREE.MeshToonMaterial>();
  const visit = (material: THREE.Material): void => {
    if (material instanceof THREE.MeshToonMaterial && !seen.has(material)) {
      seen.add(material);
      applyShadowTint(material, uniform);
    }
  };
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      const assigned = Array.isArray(object.material) ? object.material : [object.material];
      assigned.forEach(visit);
    }
  });
  extraCollections.forEach(visit);
}
