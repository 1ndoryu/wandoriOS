# Estilo Sakura Crossing — Índice y pipeline visual completo

> **Fecha:** 2026-08-14 · **Tarea:** 138A-13 · **Estado:** documentación de
> investigación (no cambia la decisión visual vigente del Bosque).
> **Repo analizado:** [Kenton-GMI/sakura-crossing](https://github.com/Kenton-GMI/sakura-crossing),
> clon de solo lectura en `C:\tmp\sakura-crossing` (Three.js `^0.180.0` + Vite).

## Qué pregunta responde esta carpeta

El usuario tiene un constructor de terrenos/mundos en JS (WANDORIUS,
`/forest-playable`) cuyos assets no tienen el estilo anime/cel de *Sakura
Crossing*. La pregunta es: **¿se puede forzar ese estilo desde el renderizado,
sin rehacer los assets?** La respuesta, confirmada con el código real del
clon, es sí: el estilo sale del pipeline visual, no de los modelos.

La explicación que dio el usuario ya apuntaba a las piezas correctas:

```text
TU JUEGO ACTUAL
modelos + texturas + escenario
          ↓
reemplazar/ajustar materiales      → toon/cel shading
          ↓
iluminación Sakura                 → sol cálido + fill frío + bounce violeta
          ↓
outlines                           → ink screen-space + hull invertido
          ↓
color grading                      → split-tone + saturación + vignette
          ↓
ESTILO TIPO SAKURA CROSSING
```

El clon demuestra la tesis de forma todavía más fuerte: **no tiene ni un solo
asset binario visual** (solo audio `.mp3` y JPGs de documentación; cero
imágenes/modelos externos). Todos los modelos son geometría procedural
(`SphereGeometry`, `IcosahedronGeometry`, `ShapeGeometry`, meshes unidas) y
toda textura es un `CanvasTexture` dibujado con Canvas2D al arranque
(`src/core/textures.js`). El estilo es 100 % pipeline: materiales
`MeshToonMaterial`, un parche GLSL que tiñe las sombras de violeta, luces
anime 2+1, dos sistemas de tinta y un postprocesado de 3 pases.

## Pipeline visual completo

```text
                         ┌──────────────────────────────────────────┐
   escena 3D             │  Pipeline (src/core/post.js:203)          │
  ──────────────┐        │                                          │
  MeshToonMaterial       │  rtScene (color HalfFloat + depth)       │
  + tinte violeta  │     │     │                                    │
  luces 2+1        │     │     ▼                                    │
  sombras PCF 2048 │ ──► │  ink pass   — tinta screen-space          │
  cielo + niebla   │     │     │         (2ª diferencia de depth)    │
  ──────────────┘        │     ▼                                    │
                         │  grade pass — color grading anime         │
                         │     │         (split-tone → sRGB)        │
                         │     ▼                                    │
                         │  fxaa pass  — limpia la tinta → pantalla  │
                         └──────────────────────────────────────────┘
```

Orden real del render (`post.js:270`):

1. `renderer.render(scene, camera)` → `rtScene` (color HalfFloat + DepthTexture).
2. `ink` lee color + profundidad, dibuja líneas donde la 2ª diferencia de
   profundidad lineal supera un umbral → `rtA`.
3. `grade` aplica split-tone, saturación, lift, vignette y calor, y convierte
   a sRGB → `rtB` (o pantalla si FXAA está apagado).
4. `fxaa` anti-aliasa la imagen final → pantalla.

## Los 4 pilares (resumen ejecutivo)

| Pilar | Qué hace | Dónde vive en el clon | Guía |
| ----- | -------- | --------------------- | ---- |
| **Cel shading con tinte violeta** | `MeshToonMaterial` + rampa de 2-5 bandas + parche GLSL que multiplica las bandas oscuras por `uShadowTint` (`0x6c5f8c`); las sombras nunca son negro, son violeta frío. | `src/core/toon.js:15-136` | [02-materiales-toon-cel.md](02-materiales-toon-cel.md) |
| **Paleta y texturas procedurales** | Una sola paleta `PAL` con blancos cálidos, gris-violeta, verdes teal y 4 acentos; cero assets binarios: Canvas2D en caliente. | `src/core/palette.js:7`, `src/core/textures.js` | [03-paleta-texturas-procedurales.md](03-paleta-texturas-procedurales.md) |
| **Iluminación anime 2+1** | Sol cálido 2.25, fill frío 1.08 desde el cuarto opuesto, bounce violeta 0.34 desde abajo + hemisfera; sombras PCF 2048 con `normalBias`, cámara de sombra que sigue al jugador. | `src/main.js:25-78,143-168` | [04-iluminacion-sombras.md](04-iluminacion-sombras.md) |
| **Outlines dobles** | Tinta screen-space por 2ª diferencia de profundidad (todas las siluetas, con concavidad débil) + hull invertido para objetos protagonistas (tren, puertas, máquinas). | `src/core/post.js:22-98`, `src/core/outline.js:15-125` | [05-outlines-tinta.md](05-outlines-tinta.md) |
| **Color grading + cielo** | Split-tone (sombra violeta `0xada8d0` → luz papel `0xfff7e8`), saturación 1.12, lift, vignette, calor; cielo con banding intencional y nubes planas. | `src/core/post.js:100-191`, `src/core/sky.js:12-140` | [06-color-grading-postprocesado.md](06-color-grading-postprocesado.md) y [07-cielo-atmosfera.md](07-cielo-atmosfera.md) |

## Tensión con la decisión visual vigente de WANDORIUS

El roadmap del 13-ago decidió para el Bosque: **"Genshin-like, low poly verde
stylized, cámara orbital libre; sin tinta como destino"**. Esta carpeta es una
referencia de investigación: documenta cómo se logra el estilo Sakura Crossing
**por si el usuario decide probarlo**, pero no modifica la decisión vigente.
La guía [08-replicacion-constructor-wandorius.md](08-replicacion-constructor-wandorius.md)
resalta explícitamente dónde choca el estilo Sakura (tinta visible, sombras
violeta, paleta pastel) con la decisión actual, para que la prueba de estilo
sea una decisión informada y reversible.

## Cómo leer las guías

1. **Empieza por [01-analisis-sakura-crossing.md](01-analisis-sakura-crossing.md)**:
   el mapa de qué hace el repo y en qué archivo.
2. **Sigue el orden del pipeline** (02 → 07): cada guía profundiza una capa
   con el código real del clon (GLSL y JS), las constantes exactas y el "por
   qué" de cada decisión.
3. **Termina en [08-replicacion-constructor-wandorius.md](08-replicacion-constructor-wandorius.md)**:
   gap analysis contra el estado actual del constructor de WANDORIUS y pasos
   concretos de implementación con archivos y tests.

## Referencias del clon (rutas absolutas, solo lectura)

- `C:\tmp\sakura-crossing\src\main.js` — entrada, renderer, luces, loop.
- `C:\tmp\sakura-crossing\src\core\toon.js` — cel shading + tinte violeta.
- `C:\tmp\sakura-crossing\src\core\palette.js` — paleta única.
- `C:\tmp\sakura-crossing\src\core\post.js` — pipeline ink/grade/fxaa.
- `C:\tmp\sakura-crossing\src\core\outline.js` — hull invertido.
- `C:\tmp\sakura-crossing\src\core\sky.js` — cielo, nubes, colinas.
- `C:\tmp\sakura-crossing\src\core\textures.js` — texturas Canvas2D.
- `C:\tmp\sakura-crossing\src\world\trees.js` — árboles (lección `receiveShadow`).
