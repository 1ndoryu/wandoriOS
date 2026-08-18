# Materiales: toon/cel shading con tinte violeta

> Código fuente: `C:\tmp\sakura-crossing\src\core\toon.js` (completo) y
> `C:\tmp\sakura-crossing\src\world\trees.js:168-184`.

## 1. La rampa (`gradientMap`)

El cel shading de three funciona con `gradientMap`: una textura 1D en la que
el shader del toon muestrea la banda según el `dot` de la normal con la luz.
Si la textura tiene 3 texels, la luz se cuantiza en 3 niveles; con
`NearestFilter` el salto entre bandas es duro, que es lo que da el look cel.

```js
// toon.js:15-46
const RAMPS = {
  2: [96, 255],
  3: [92, 178, 255],
  4: [80, 142, 202, 255],
  5: [74, 124, 172, 214, 255],
  // high-key ramps: for blossom and other pale masses that must stay light
  // even on the shadow side
  soft: [180, 255],
  soft3: [172, 214, 255],
};

const rampCache = new Map();

export function gradientMap(bands = 3) {
  const key = bands;
  if (rampCache.has(key)) return rampCache.get(key);
  const stops = RAMPS[bands] || RAMPS[3];
  const data = new Uint8Array(stops.length * 4);
  for (let i = 0; i < stops.length; i++) {
    data[i * 4 + 0] = stops[i];
    data[i * 4 + 1] = stops[i];
    data[i * 4 + 2] = stops[i];
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, stops.length, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  rampCache.set(key, tex);
  return tex;
}
```

Lectura de los números:

- Los valores son **niveles de gris 0-255**. `[92, 178, 255]` = banda oscura
  al 36 %, banda media al 70 %, banda clara al 100 %.
- Con `RAMPS[3]` y el muestreo de three (`dotNL * 0.5 + 0.5`), las fronteras
  caen en `dotNL = ±1/3`. El comentario de `palette.js` (laderas) lo explica
  con datos medidos: en 22 000 facetas de una ladera, 66.5 % caen en la banda
  superior y 31 % en la media — la luz directa **no** da forma a pendientes
  suaves; esa forma la da la paleta de materiales (escaleras de 5 tonos).
- Las rampas `soft` y `soft3` son "high-key": empiezan en 180/172 para que
  masas pálidas (flor de cerezo) sigan claras incluso en el lado en sombra.

La caché (`rampCache`) evita recrear texturas: todos los materiales del mundo
comparten la misma `DataTexture` por número de bandas.

## 2. El tinte violeta de sombras (el secreto principal)

El repo parchea el chunk GLSL de three que calcula la irradiancia toon. El
objetivo es que la banda oscura no sea solo "menos luz": sea "menos luz **y
teñida de violeta**".

```js
// toon.js:48-64
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
  if (src && src.includes(TOON_LINE)) {
    patchedChunk = 'uniform vec3 uShadowTint;\n' + src.replace(TOON_LINE, TOON_PATCH);
    patchAvailable = true;
  }
}
```

Por qué funciona: `celBand` es un escalar 0-1. En la banda clara vale ~1, así
que `mix(uShadowTint, vec3(1.0), 1.0)` = blanco y no cambia nada. En la banda
oscura vale ~0, así que la irradiancia se multiplica por `uShadowTint`
(`0x6c5f8c` violeta). El resultado: **las sombras toon son violeta frío, no
negro** — el rasgo más característico del anime cel.

El parche se aplica por material en `applyShadowTint`:

```js
// toon.js:66-86
function applyShadowTint(mat, tint) {
  if (!patchAvailable) return mat;
  const uni = { value: new THREE.Color(tint) };
  mat.userData.shadowTint = uni;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uShadowTint = uni;
    shader.fragmentShader = shader.fragmentShader.replace(
      `#include <${TOON_CHUNK}>`,
      patchedChunk
    );
  };
  const hex = new THREE.Color(tint).getHexString();
  mat.customProgramCacheKey = () => 'celTint_' + hex;
  return mat;
}
```

Notas técnicas importantes para WANDORIUS:

- `customProgramCacheKey` es **obligatorio** cuando parcheas `onBeforeCompile`
  con valores que cambian el programa (aquí, el tinte): si dos materiales con
  distinto tinte compartieran clave, three reutilizaría el programa de uno
  para el otro y el tinte se vería mal. El patrón `worldbend-curved-island-v1`
  de `game-world-bend.ts` ya usa exactamente este mecanismo.
- Los uniforms del parche deben colgar del `shader.uniforms` **dentro** de
  `onBeforeCompile`; declararlos fuera no funciona porque three construye el
  programa con los uniforms del shader.
- El parche depende de la versión de three: `TOON_LINE` debe existir en
  `THREE.ShaderChunk['lights_toon_pars_fragment']`. El clon (0.180) y
  WANDORIUS (0.185) lo tienen; si three cambia esa línea en el futuro, el
  `includes(TOON_LINE)` fallará con `patchAvailable = false` y el mundo seguirá
  funcionando sin tinte (fallback seguro, no un crash).

## 3. La fábrica `cel()` con caché

```js
// toon.js:88-136 (resumido al núcleo)
const matCache = new Map();

export function cel(opts = {}) {
  const {
    color = 0xffffff, bands = 3, tint = 0x6c5f8c, flat = true,
    map = null, emissive = null, emissiveIntensity = 1,
    transparent = false, opacity = 1, side = THREE.FrontSide,
    alphaTest = 0, depthWrite = null, fog = true,
    alphaMap = null, vertexColors = false, cache = true,
  } = opts;

  const key = cache && !map && !alphaMap
    ? [color, bands, tint, flat, emissive, emissiveIntensity, transparent,
       opacity, side, alphaTest, depthWrite, fog, vertexColors].join('|')
    : null;
  if (key && matCache.has(key)) return matCache.get(key);

  const mat = new THREE.MeshToonMaterial({
    color, gradientMap: gradientMap(bands), flatShading: flat,
    map, alphaMap, transparent, opacity, side, alphaTest, fog, vertexColors,
    emissive: emissive === null ? 0x000000 : emissive,
    emissiveIntensity,
  });
  if (depthWrite !== null) mat.depthWrite = depthWrite;
  applyShadowTint(mat, tint);
  if (key) matCache.set(key, mat);
  return mat;
}
```

Decisiones que importan:

- **Caché por firma de parámetros**: toda la calle comparte unas decenas de
  materiales (y por tanto de programas GLSL). En un constructor de mundos esto
  es crítico: si cada bloque crea un material nuevo, el número de programas
  explode y el rendimiento cae.
- **`flatShading: true`** por defecto: facetas planas, look low poly.
- **`tint` por material**: no es un color global; cada material puede tener su
  tinte (la flor de cerezo usa tintes rosados `0xe2c3d2`, `0xd8b2c6`,
  `0xc99cba` para no volverse gris).
- **`emissive` con `null → 0x000000`**: los materiales no emiten salvo que se
  pida explícitamente (paneles, luces).

## 4. `flat()` — material unlit para siluetas y cielo

```js
// toon.js:138-162
export function flat(opts = {}) {
  const {
    color = 0xffffff, map = null, transparent = false, opacity = 1,
    side = THREE.FrontSide, alphaTest = 0, depthWrite = null, fog = true,
    cache = true, toneMapped = true,
  } = opts;
  const key = cache && !map
    ? [color, transparent, opacity, side, alphaTest, depthWrite, fog, toneMapped].join('|')
    : null;
  if (key && flatCache.has(key)) return flatCache.get(key);
  const mat = new THREE.MeshBasicMaterial({
    color, map, transparent, opacity, side, alphaTest, fog, toneMapped,
  });
  if (depthWrite !== null) mat.depthWrite = depthWrite;
  if (key) flatCache.set(key, mat);
  return mat;
}
```

Se usa para cielo, colinas lejanas, paneles brillantes y vidrio: objetos que
deben leerse como **pintura plana** (sin luz). En el fondo de un mundo anime,
la lejanía no se ilumina: se pinta.

## 5. Lección de los árboles: `receiveShadow = false` en copas

La copa de sakura se construye como 3 `InstancedMesh` de blobs
`IcosahedronGeometry(1, 1)` faceteados, uno por tono de rosa. Y explícitamente
**no recibe sombra**:

```js
// trees.js:177-191
const BLOB_TINT = [0xe2c3d2, 0xd8b2c6, 0xc99cba];
blobs.forEach((list, i) => {
  if (!list.length) return;
  const inst = new THREE.InstancedMesh(
    blobGeo,
    cel({ color: BLOB_TONES[i], bands: 'soft', tint: BLOB_TINT[i] }),
    list.length
  );
  list.forEach((m, k) => inst.setMatrixAt(k, m));
  inst.castShadow = true;
  /* Blossom does not *receive* shadow. ... */
  inst.receiveShadow = false;   // trees.js:184
  ...
});
```

Por qué (comentario del propio repo): **la rampa solo modela luz directa**.
Cuando el shadow map anula el sol, la copa cae a ambiental y, con el tinte
violeta, se convierte en un "lump violeta oscuro". Apagar `receiveShadow`
hace que la copa se comporte como se pinta en el anime: una masa high-key
cuya forma interna la dan sus 3 tonos, iluminada igual en cualquier sitio.
**Sigue proyectando sombra** (`castShadow = true`), que es lo que salpica el
suelo de manchas. Los árboles verdes (`buildGrove` línea 409) y los cedros
(línea 607) hacen lo mismo.

**Lección para el constructor de WANDORIUS:** cualquier objeto con rampa
high-key (vegetación, masas suaves) debe tener `receiveShadow = false` y
`castShadow = true`. La rampa y el shadow map son sistemas que pelean; la
sombra recibida va a la iluminación ambiental y rompe la estética cel.

## 6. Checkpoint de implementación (en WANDORIUS)

- Reemplazar `createToonRamp()` (4 bandas lineales `[0.58,0.75,0.89,1.0]`) por
  la versión con caché de `gradientMap`, añadiendo rampas `soft` para
  vegetación.
- Añadir `applyShadowTint` (parche `lights_toon_pars_fragment` con
  `uShadowTint`) siguiendo el patrón de `onBeforeCompile` +
  `customProgramCacheKey` ya usado en `game-world-bend.ts`.
- Poner `receiveShadow = false` en copas/masas y `castShadow = true`.
- Mantener `flatShading: true` en los materiales de terreno/props.

Ver [08-replicacion-constructor-wandorius.md](08-replicacion-constructor-wandorius.md)
para el plan de integración completo con tests y teardown.

