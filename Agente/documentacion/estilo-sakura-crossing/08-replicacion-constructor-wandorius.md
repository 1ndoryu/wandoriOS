# Replicación en el constructor de WANDORIUS

> **Objetivo:** aplicar el estilo tipo Sakura Crossing sobre los assets
> existentes del constructor de mundos JS (`/forest-playable`), sin rehacer
> modelos. Este documento es la guía operativa: gap analysis, pasos
> concretos con archivos, presupuestos y tests/teardown que hay que respetar.

## 0. Aviso de decisión vigente

El roadmap del 13-ago decidió para el Bosque: **"Genshin-like, low poly verde
stylized, cámara orbital libre; sin tinta como destino"**. Esta guía documenta
cómo probar el estilo Sakura Crossing (que **sí** usa tinta visible, sombras
violeta y paleta pastel) **sin cambiar esa decisión**: se implementa como
prueba opcional/reversible (banderas `enabled.ink`/`enabled.grade` y paleta
editable, como el clon) y el usuario decide si la adopta.

## 1. Qué tiene hoy el constructor (estado real, 14-ago)

Archivo principal: `frontend/src/features/desktop/apps/game-playable/game-playable-scene.ts`.

| Aspecto | Estado actual | Diferencia con Sakura Crossing |
| ------- | ------------- | ------------------------------ |
| Renderer | `antialias: true`, `powerPreference: 'low-power'`, `setPixelRatio(≤1.5)` | AA por rasterizador en vez de FXAA; sin pipeline |
| Shadow map | **Desactivado** | Sakura usa PCF 2048 + bias/normalBias |
| Postprocesado | **No existe** | Sakura: rtScene → ink → grade → fxaa |
| Background/fog | `0xaecfc4` (verde grisáceo) | Sakura: `0xe6ecf7` (gris-azul claro) |
| Luces | hemi 1.0 `(0xdcefe8, 0xffcf8a)`, sun 1.2 `@(6,10,4)`, rim 0.4 | Sakura: sun 2.25 + fill 1.08 frío + bounce 0.34 violeta + hemi con suelo violeta |
| Rampa toon | `createToonRamp()`: 4 bandas `[0.58, 0.75, 0.89, 1.0]`, sin tinte | Sakura: rampas 2-5 bandas + parche `uShadowTint` violeta |
| Outlines | No existe | Sakura: ink screen-space + hull invertido |
| Paleta | `WORLD_PALETTE_DEFAULTS` (13 claves, saturada) | Sakura: paleta pastel teal/violeta |
| Agua | `MeshToonMaterial` con rampa compartida, 32×32, `polygonOffset`, `renderOrder=1` | Misma técnica base; falta el tinte violeta y el grade |
| game-core | Puro, sin Three/DOM | El estilo vive en la capa de presentación (igual que en el clon: `src/core/` visual es del runtime) |
| Teardown | Estricto: `disposeScene` + `toonRamp.dispose()` + `renderer.dispose()` + `forceContextLoss()` | Hay que añadir `pipeline.dispose()` sin romper el test |

El código que ya **prepara el terreno**:

- `game-world-bend.ts` ya usa el patrón `onBeforeCompile` +
  `customProgramCacheKey = () => 'worldbend-curved-island-v1'`, exactamente el
  mecanismo que necesita el parche `uShadowTint` del toon.
- `game-toon-water.ts` ya centraliza el agua toon (lección 138A-4: un
  material por montaje, nunca por regeneración).
- `game-procedural-comparator.ts` ya comparte UN `MeshToonMaterial`
  `vertexColors` para terreno/props y un solo material de agua (test fija
  `buildToonWaterPlane` llamado 1 vez por montaje).
- `game-block-palette.ts` re-exporta `WORLD_PALETTE_DEFAULTS`: cambiar la
  paleta no toca meshers, solo tokens.

## 2. Plan de replicación por pasos (orden de costo creciente)

### Paso 1 — Tinte violeta en la rampa toon (cambio más barato, mayor impacto)

En `game-playable-scene.ts`, sustituir `createToonRamp()` por la versión del
clon con caché y añadir el parche `applyShadowTint`:

```ts
// Nuevo: game-sakura-toon.ts (presentación, NO game-core)
const RAMPS: Record<string, number[]> = {
  2: [96, 255],
  3: [92, 178, 255],
  4: [80, 142, 202, 255],
  soft: [180, 255],
};
const rampCache = new Map<string, THREE.DataTexture>();

export function gradientMap(bands: number | string = 3): THREE.DataTexture {
  const key = String(bands);
  const cached = rampCache.get(key);
  if (cached) return cached;
  const stops = RAMPS[key] ?? RAMPS[3];
  const data = new Uint8Array(stops.length * 4);
  stops.forEach((v, i) => {
    data[i * 4] = v; data[i * 4 + 1] = v;
    data[i * 4 + 2] = v; data[i * 4 + 3] = 255;
  });
  const tex = new THREE.DataTexture(data, stops.length, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  rampCache.set(key, tex);
  return tex;
}

/* Parche del chunk lights_toon_pars_fragment, como el clon (toon.js:48-86). */
const TOON_CHUNK = 'lights_toon_pars_fragment';
const TOON_LINE =
  'vec3 irradiance = getGradientIrradiance( geometryNormal, directLight.direction ) * directLight.color;';
const TOON_PATCH = `
  vec3 celBand = getGradientIrradiance( geometryNormal, directLight.direction );
  vec3 irradiance = celBand * mix( uShadowTint, vec3( 1.0 ), celBand ) * directLight.color;`;

export function applyShadowTint(mat: THREE.MeshToonMaterial, tint = 0x6c5f8c): void {
  const src = THREE.ShaderChunk[TOON_CHUNK];
  if (!src?.includes(TOON_LINE)) return; // fallback seguro si three cambia
  const patched = 'uniform vec3 uShadowTint;\n' + src.replace(TOON_LINE, TOON_PATCH);
  const uni = { value: new THREE.Color(tint) };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uShadowTint = uni;
    shader.fragmentShader = shader.fragmentShader.replace(`#include <${TOON_CHUNK}>`, patched);
  };
  const hex = new THREE.Color(tint).getHexString();
  mat.customProgramCacheKey = () => 'celTint_' + hex;   // clave única por tinte
}
```

Integración:

- Cada material de `materials`/`figureMaterials`/agua/terreno del comparador
  debe pasar por `applyShadowTint` **después** de `bend.apply` (los dos
  parches conviven: uno en vertex, otro en fragment).
- Vegetación y masas suaves: `receiveShadow = false`, `castShadow = true`
  (lección de `trees.js:184`), o las copas se vuelven violeta oscuro.
- El `customProgramCacheKey` debe incluir **ambos** parches (bend + tinte),
  p. ej. `'worldbend-v1-celTint_' + hex`, para que three no mezcle programas.

### Paso 2 — Shadow map + luces 2+1

En `mountGamePlayableScene`:

```ts
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.NoToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const sun = new THREE.DirectionalLight(0xfff1d8, 2.25);
sun.position.set(-52, 62, 56);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -34;  /* ajustar al radio de streaming (STREAM_MAX_DISTANCE) */
sun.shadow.camera.right = 34;
sun.shadow.camera.top = 34;
sun.shadow.camera.bottom = -34;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 200;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.035;

const fill = new THREE.DirectionalLight(0xa9bdf5, 1.08);
fill.position.set(48, 26, -44);
const bounce = new THREE.DirectionalLight(0xd8cbe8, 0.34);
bounce.position.set(10, -18, 40);
const hemi = new THREE.HemisphereLight(0xdcecff, 0xb6a6c6, 1.12);
```

Consideraciones específicas del constructor:

- La cámara de sombra debe seguir al **personaje** (como `seatLight` del
  clon), no quedarse estática, para que las sombras cercanas tengan resolución
  completa y no parpadeen al regenerar el mundo.
- Las mallas del comparador (bloques/suave) y del agua deben marcar
  `castShadow`/`receiveShadow` coherentes; el agua toon normalmente no recibe
  sombra del fondo (puede proyectar).
- `powerPreference: 'low-power'` + shadow map 2048: medir con el probe de GPU
  existente (`game-gpu-probe.ts`, `game-renderer-metrics.ts`) antes de subir a
  4096; el clon usa 2048.

### Paso 3 — Pipeline ink → grade → fxaa

Crear `game-sakura-pipeline.ts` copiando la clase `Pipeline` del clon
(`post.js:203-306`) con sus tres shaders. Cambios de integración:

```ts
// game-playable-scene.ts
const pipeline = new SakuraPipeline(renderer, scene, camera);

// en resize(): pipeline.setSize(width, height) en vez de solo renderer.setSize
// en render(): pipeline.render() en vez de renderer.render(scene, camera)
// en destroy(): pipeline.dispose() ANTES de renderer.dispose()/forceContextLoss()
```

Obligatorio para no romper la arquitectura actual:

- `renderer.setPixelRatio(1)` y `antialias: false` (el pipeline controla la
  resolución y el FXAA sustituye al AA).
- `outputColorSpace = SRGBColorSpace` y `toneMapping = NoToneMapping` (el
  grade convierte a sRGB manualmente).
- Teardown: `pipeline.dispose()` debe liberar `rtScene`/`rtA`/`rtB` y los
  quads; el test `game-playable-teardown.test.ts` exige que `destroy()` sea
  idempotente y que `forceContextLoss()` siga ejecutándose.
- Banderas `enabled.ink`/`enabled.grade` (teclas O/G como el clon) para poder
  apagar la tinta si el usuario mantiene la decisión "sin tinta".
- `setOutlineResolution` si se añade el hull (paso 4).

### Paso 4 — Outlines hull (opcional, para objetos protagonistas)

Si el usuario adopta la tinta, copiar `outline.js` (hull invertido) y llamar
`hullOutlineTree` sobre los props/personajes destacados, con
`setOutlineResolution(pipeline.size.x, pipeline.size.y)` sincronizado en
`resize()`. Sin la tinta, este paso se omite.

### Paso 5 — Paleta Sakura sobre `WORLD_PALETTE_DEFAULTS`

Los tokens ya están separados (138A-8): cambiar valores en
`frontend/src/features/game-core/world-palette.ts` (o añadir un preset) no
toca meshers. Equivalencias orientativas actual → Sakura:

| Clave | Actual (WANDORIUS) | Sugerida Sakura | Base |
| ----- | ------------------ | --------------- | ---- |
| `grass` | `0x86c65c` | `0x86ab84` | `PAL.grass` |
| `dirt` | `0x9b6b46` | `0xc9bfae` | `PAL.dirt` |
| `sand` | `0xe8d8a0` | `0xdccaa6` | `PAL.sand` |
| `sandSide` | `0xd3bf86` | `0xcfc6bc` | `PAL.stoneWarm` |
| `trunk` | `0x8a5a34` | `0x9a8082` | `PAL.trunk` (marrón malva) |
| `leaf` | `0x63b543` | `0x5aa578` | `PAL.leaf` (teal) |
| `leafDark` | `0x4c9233` | `0x3f7f60` | `PAL.leafDeep` |
| `rock` | `0x9d9d96` | `0xc6c0cb` | `PAL.stone` |
| `rockDark` | `0x7d7d78` | `0xa39daf` | `PAL.stoneDark` |
| `waterDeep` | `0x36a79e` | `0x6d90ad` | `PAL.waterDeep` |
| `waterShallow` | `0x63c9bb` | `0x93b8ce` | `PAL.water` |
| `foam` | `0xeafbf5` | `0xcadff0` | `PAL.waterSky` (o `0xf2f7fa` `lakeGlint`) |
| `sky` | `0xaecfc4` | `0xe6ecf7` | `PAL.fog` |

Reglas de la paleta Sakura (detalle en
[03-paleta-texturas-procedurales.md](03-paleta-texturas-procedurales.md)):

- Blancos cálidos (muros/paneles) en vez de blancos neutros.
- Verdes con sesgo teal, nunca verde saturado.
- Un solo color cálido por zona (tierra/arena apagada).
- 4 acentos saturados solo para objetos focales (props del constructor).
- Si se añaden masas rosas (sakura), usar rampa `soft` + tintes rosados y
  `receiveShadow=false`.

### Paso 6 — Agua toon con tinte violeta

`game-toon-water.ts` ya construye el `MeshToonMaterial` compartido. Solo falta:

```ts
const material = bend.apply(new THREE.MeshToonMaterial({
  color: BLOCK_COLORS.waterShallow,  // ahora tono Sakura
  gradientMap: toonRamp,
}));
applyShadowTint(material);            // tinte violeta en bandas oscuras
```

Respetar el test del comparador: `buildToonWaterPlane` se llama **una vez por
montaje**; la regeneración solo recrea geometría, nunca material.

## 3. Presupuestos de rendimiento a mantener

| Métrica | Clon Sakura | Constructor actual | Objetivo al replicar |
| ------- | ----------- | ------------------ | -------------------- |
| Resolución RT | 1.5-2× con `pixelBudget 4.6e6` | `pixelRatio ≤ 1.5` directo | Pipeline con presupuesto, `setPixelRatio(1)` |
| Shadow map | 2048 PCF, sigue al jugador | ninguno | 2048 PCF, sigue al jugador |
| Materiales | Caché por firma (decenas) | Compartidos por montaje | Caché + compartidos; nunca por instancia/clic |
| Draw calls | ~5 800 en vista pesada | medidos con `renderer.info` | Medir con `game-renderer-metrics` tras cada paso |
| Pases fullscreen | 3 (ink, grade, fxaa) | 0 | 3 quads, coste bajo |

El proyecto ya tiene probes de GPU/memoria (`game-gpu-probe.ts`,
`game-renderer-metrics.ts`, `game-performance-budget.ts`) y tests de presupuesto;
cada paso debe cerrar con esas métricas antes de avanzar (la auditoría 138A-11
ya está planificada para esto).

## 4. Fronteras y tests a respetar

- **`game-core` es puro (sin Three/DOM/red):** todo el estilo (rampas,
  parches, pipeline, paleta de presentación) vive en
  `frontend/src/features/desktop/apps/game-playable/` (o en `game-shared/` si
  se comparte). No importar Three en `game-core`.
- **Teardown:** `game-playable-teardown.test.ts` exige `destroy()` idempotente,
  liberación de RAF/listeners/GPU. El pipeline añade `dispose()` de RT y
  quads; no quitar `forceContextLoss()`.
- **Material único del agua:** `game-procedural-comparator.test.ts` fija
  `buildToonWaterPlane` llamado 1 vez por montaje (fuga de GPU = fallo).
- **Paleta:** `world-palette.ts` es la fuente de verdad (138A-8); `BLOCK_COLORS`
  solo re-exporta. Los tests de validación de paleta cubren las 13 claves.
- **Rampa:** la actual `createToonRamp` se usa en escena, isla curva y
  comparador; al sustituirla, actualizar los tres consumidores y `toonRamp.dispose()`.

## 5. Orden de ejecución sugerido (prueba incremental)

1. **Paso 1 solo** (tinte violeta): es el 70 % del cambio perceptivo con el
   menor riesgo; validar en `/forest-playable` sin tocar renderer ni luces.
2. **Paso 2** (sombras + luces): validar sombras, sin parpadeo al regenerar.
3. **Paso 3** (pipeline): validar ink/grade con teclas O/G; medir frame ms.
4. **Pasos 5-6** (paleta + agua): validar el conjunto 1:1 con la referencia.
5. **Paso 4** (hull): solo si el usuario confirma la tinta como dirección.

Cada paso con su gate (`npm run gate:check -- <ID>`), type-check, tests y
validación visual del usuario; el push siempre con autorización.

## 6. Qué NO hay que hacer

- No rehacer assets: la tesis del clon es que el estilo vive en el pipeline.
- No tocar `game-core` con Three: el motor puro sigue siendo agnóstico.
- No crear un material por clic/regeneración (fugas GPU; lección 138A-4).
- No usar `gradientMap` sin `NearestFilter` (se pierde el corte cel) ni sin
  `NoColorSpace` (la rampa debe estar en espacio lineal).
- No olvidar `customProgramCacheKey` al parchear (bend + tinte): sin clave
  única, three reutiliza programas con uniforms de otro material.
- No dejar la tinta como irreversible: la decisión vigente del Bosque es
  "sin tinta"; el pipeline debe permitir apagarla (banderas O/G).

