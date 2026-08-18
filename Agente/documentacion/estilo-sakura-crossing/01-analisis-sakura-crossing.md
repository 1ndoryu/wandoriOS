# Análisis: cómo Sakura Crossing logra su estilo

> Repo: `C:\tmp\sakura-crossing` · Dependencias: `three ^0.180.0` + `vite ^6`
> (WANDORIUS usa `three 0.185.1`, compatible con todo lo que se cita aquí).

## La tesis central

Sakura Crossing **no consigue su aspecto por los assets**: no tiene assets
binarios visuales (solo audio `.mp3` y JPGs de documentación; cero
imágenes/modelos externos). Consigue el aspecto por un **pipeline visual de
5 capas** aplicado sobre geometría procedural sencilla. Eso es exactamente lo
que hace
replicable: si tu constructor ya coloca objetos y terreno, el 70-80 % del
estilo llega con materiales, luces, sombras, outlines y postprocesado, sin
tocar un solo modelo.

## Pilar 1 — Cel shading con tinte violeta (`src/core/toon.js`)

Todo lo iluminado de la escena usa `MeshToonMaterial` con una **rampa de
gradiente de 2-5 bandas** (textura 1D con `NearestFilter`) en lugar de un
falloff suave. Sobre eso, el repo parchea el chunk GLSL `lights_toon_pars_fragment`
de three para que la banda oscura no sea "el color más oscuro", sino
"el color multiplicado por un tinte violeta":

```glsl
// toon.js:51-55 (TOON_PATCH)
vec3 celBand = getGradientIrradiance( geometryNormal, directLight.direction );
vec3 irradiance = celBand * mix( uShadowTint, vec3( 1.0 ), celBand ) * directLight.color;
```

El tinte por defecto es `0x6c5f8c` (violeta frío). Esa decisión de hue shift
en las sombras es, según los comentarios del propio repo, "la mayor parte de
lo que separa 'anime cel' de 'low poly 3D'".

Detalles clave:

- Rampas por número de bandas: `2:[96,255]`, `3:[92,178,255]`,
  `4:[80,142,202,255]`, `5:[74,124,172,214,255]`, más `soft:[180,255]` y
  `soft3:[172,214,255]` para masas pálidas (sakura) que deben seguir claras
  a la sombra.
- `flatShading: true` en la fábrica `cel()` → facetas planas, estética low poly.
- Caché de materiales por firma de parámetros (`matCache`) → decenas de
  shader programs compartidos en toda la calle.
- Los árboles desactivan `receiveShadow` en las copas (`trees.js:184`) porque
  la rampa solo modela luz directa: si el shadow map anula el sol, la copa cae
  a ambiental y se vuelve un "lump violeta oscuro".

Detalle completo: [02-materiales-toon-cel.md](02-materiales-toon-cel.md).

## Pilar 2 — Paleta única + texturas procedurales (`palette.js` + `textures.js`)

Todos los colores viven en una sola constante `PAL` (`palette.js:7`), con una
estrategia deliberada y comentada: **blancos cálidos** (p. ej. `wallWhite
0xfaf6ef`, `cloud 0xfdfaf8`), **gris-violeta para carretera** (`road
0x8e8a9c`), **verdes teal** (`grass 0x86ab84`, `leaf 0x5aa578`), rosas pálidos
(`blossom 0xfbc6d8`) y **solo 4 acentos saturados** (rojo/amarillo/azul/teal)
reservados para objetos focales.

Las texturas se dibujan con Canvas2D al arranque (`textures.js:16-38`):
carteles, persianas, máquinas expendedoras, táctil, pétalos y nubes. Regla
interna: formas planas y de baja frecuencia, nunca ruido fotográfico.

Detalle completo: [03-paleta-texturas-procedurales.md](03-paleta-texturas-procedurales.md).

## Pilar 3 — Iluminación anime 2+1 (`src/main.js`)

El renderer se configura "duro" (sin AA, sin tone mapping, sin sRGB por
gestión automática) y la escena se ilumina con el esquema clásico de anime:

```js
// main.js:45-78
const sun = new THREE.DirectionalLight(PAL.sun, 2.25);        // cálido 0xfff1d8
sun.position.set(-52, 62, 56);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
// ... cámara de sombra ±34, near 1, far 200, bias -0.0004, normalBias 0.035

const fill = new THREE.DirectionalLight(PAL.fill, 1.08);      // frío 0xa9bdf5
fill.position.set(48, 26, -44);                               // cuarto opuesto

const bounce = new THREE.DirectionalLight(0xd8cbe8, 0.34);    // violeta, desde abajo
bounce.position.set(10, -18, 40);

const hemi = new THREE.HemisphereLight(PAL.hemiSky, PAL.hemiGround, 1.12);
```

- El **sol cálido** cuantiza en bandas vía la rampa.
- El **fill frío** lleva el lado sombreado: las sombras son *coloreadas*, no
  oscuras.
- El **bounce violeta** evita que las caras inferiores queden negro plano.
- La **hemisfera con `hemiGround 0xb6a6c6`** (violeta) asegura que ninguna
  sombra muera a negro, reforzando el mismo tinte del parche toon.
- `PCFShadowMap` + `normalBias 0.035` elimina *shadow acne* sin parches
  visibles; la cámara de sombra sigue al jugador en una rejilla para que las
  sombras no parpadeen al caminar.

Detalle completo: [04-iluminacion-sombras.md](04-iluminacion-sombras.md).

## Pilar 4 — Outlines dobles (tinta + hull)

Hay **dos sistemas de línea**, con papeles distintos:

1. **Tinta screen-space** (`post.js:22-98`): un shader que lee el depth buffer
   y calcula la **segunda diferencia de profundidad lineal** en X e Y. Una
   primera diferencia mancharía cualquier superficie oblicua; la segunda es
   plana sobre superficies planas y solo salta en siluetas y pliegues reales.
   La curvatura convexa inka fuerte; la cóncava, débil (como las líneas de
   contacto de un animador). Fade 40→98 unidades y corte en el cielo.
2. **Hull invertido** (`outline.js:15-125`): para objetos protagonistas (el
   tren, los portones, las expendedoras), una cáscara BackSide empujada por
   normales suavizadas y desplazada en clip space para que la línea tenga
   grosor constante en píxeles a cualquier distancia.

Detalle completo: [05-outlines-tinta.md](05-outlines-tinta.md).

## Pilar 5 — Color grading + cielo pintado (`post.js` + `sky.js`)

El postprocesado hace el trabajo de "fotografía anime":

- **Split-tone:** `k = smoothstep(0.02, 0.55, l)`; `c *= mix(0xada8d0, 0xfff7e8, k)`
  → sombras violeta frío, luces papel cálido.
- **Saturación 1.12**, **lift 0.032** (las sombras nunca se aplastan a negro),
  **vignette 0.15** y **warmth 0.05** (`c += vec3(w, w*0.45, 0)*l*0.35`).
- Conversión manual a sRGB al final (el render target es `NoColorSpace`).
- El cielo es una cúpula `ShaderMaterial` con **banding intencional**
  (`uBands 26`, cuantización al 35 %) que lee como fondo pintado, no como cielo
  físico; nubes billboard planas y colinas distantes como siluetas unlit.
- Niebla `Fog(PAL.fog, 44, 205)` y clear color `PAL.fog`.

Detalle completo: [06-color-grading-postprocesado.md](06-color-grading-postprocesado.md)
y [07-cielo-atmosfera.md](07-cielo-atmosfera.md).

## Mapa de archivos del clon

| Archivo | Rol en el estilo |
| ------- | ---------------- |
| `src/core/toon.js` | Fábrica `cel()`/`flat()`, rampas, parche `uShadowTint`. |
| `src/core/palette.js` | Única paleta del mundo. |
| `src/core/post.js` | `Pipeline` (rtScene → ink → grade → fxaa). |
| `src/core/outline.js` | `hullOutline` / `hullOutlineTree` (hull invertido). |
| `src/core/sky.js` | Cúpula, nubes, colinas distantes. |
| `src/core/textures.js` | Todas las texturas procedurales Canvas2D. |
| `src/main.js` | Renderer, luces 2+1, cámara, loop, teclas O/G. |
| `src/world/trees.js` | Árboles (blobs faceteados, `receiveShadow=false`). |

## Qué significa para el constructor de WANDORIUS

El estado actual de `game-playable-scene.ts` ya usa `MeshToonMaterial` con una
rampa de 4 bandas, pero **sin tinte violeta, sin shadow map, sin
postprocesado y con una paleta de bloques saturada**. El orden de ataque
recomendado (con costo creciente) es:

1. Parche `uShadowTint` sobre la rampa actual (patrón de `game-world-bend.ts`).
2. Shadow map + luces 2+1.
3. Pipeline ink/grade/fxaa.
4. Paleta Sakura sobre `BLOCK_COLORS`.

El detalle paso a paso está en
[08-replicacion-constructor-wandorius.md](08-replicacion-constructor-wandorius.md).
