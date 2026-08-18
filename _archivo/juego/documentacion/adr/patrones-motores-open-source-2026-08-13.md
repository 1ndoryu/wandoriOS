# Patrones de motores open source adoptables (spike 138A-1)

> **Estado:** vigente · **Tarea:** 138A-1 Fase 1 · **Fecha:** 2026-08-13
> **Propósito:** documentar los patrones que el toolkit procedural de
> `game-core/procedural/` adopta, aprendidos de motores y ejemplos open source,
> antes de implementar. No es una copia de código: son decisiones de diseño con
> referencia verificable.

## 1. Ruido y fbm — FastNoiseLite (Godot)

**Referencia:** [FastNoiseLite — Godot docs](https://docs.godotengine.org/en/4.4/classes/class_fastnoiselite.html);
[glusoft — make a procedural terrain using FastNoiseLite](https://glusoft.com/godot-tutorials/make-procedural-terrain-FastNoiseLite/)

Patrones adoptados:

- **Ruido de valor + interpolación suave (fade quintic o cúbica)** es suficiente
  para terreno stylized y es barato en CPU; Perlin/Simplex se reserva cuando se
  necesite isotropía direccional o derivadas (normales, erosion).
- **fbm = suma de octavas** con frecuencia duplicada y amplitud a la mitad
  (lacunarity 2, persistence 0.5); normalizar por la suma de amplitudes para
  que el resultado no dependa del número de octavas.
- **Seed separado por octava** (derivar con `seed + i * prime`) mantiene el
  determinismo y evita que todas las octavas colapsen al mismo patrón.
- **Warping de coordenadas** (desplazar la entrada con un segundo fbm de baja
  frecuencia) rompe el "look cuadriculado" y produce costas orgánicas; es el
  patrón que ya usa `game-block-heightmap.ts` con `warp`.

## 2. Forma de isla — falloff + máscara de costa

**Referencia:** kcstuff — [Procedural Terrain Generation in Bevy](https://kcstuff.com/blog/procedural-generation-bevy);
NiklasTreml — [bevy-terrain](https://github.com/NiklasTreml/bevy-terrain) (capas de ruido de distinta frecuencia/amplitud)

Patrones adoptados:

- **Máscara = 1 − distancia normalizada** (superelipse con exponente para
  redondear esquinas) **+ warp**; por debajo de un umbral de costa es océano.
- **Banda costera**: mapear la máscara `[COAST, COAST+width] → [0,1]` para que
  la orilla sea playa y el interior suba de altura; el mismo patrón ya valida
  `game-block-heightmap.ts`.
- **Capa base + capa de detalle** (frecuencia baja/gran amplitud + frecuencia
  alta/pequeña amplitud) da terreno leíble sin ruido visual (lección de
  bevy-terrain).

## 3. Meshing — heightfield indexado vs voxel/bloques

**Referencia:** Bevy Procedural Earth — [Part 1: Mesh](https://blog.graysonhead.net/posts/bevy-proc-earth-1/);
`game-block-mesher.ts` (experimento 128A-1, ya en el repo)

Patrones adoptados:

- **Un heightfield (grid 2D) → mesh indexado**: 2 triángulos por celda,
  vértices compartidos; la normal se calcula por producto vectorial de las
  diagonales (cheap) o por acumulación de caras (correcto para costas).
- **Mesher de bloques = caras visibles solo donde el vecino es más bajo o
  océano** (face culling por vecindad), con AO/jitter por celda para leer la
  altura "por bloques". Este patrón ya existe en `game-block-mesher.ts` y se
  reutiliza como modo `blocks`, sin duplicarlo.
- **Misma altura base para ambos modos**: `smooth` usa el float del heightfield;
  `blocks` cuantiza con umbrales. Así el comparador visual aísla la variable
  "estilo de malla" del resto de la generación.

## 4. Vegetación — poisson disk + instancing

**Referencia:** three.js — [InstancedMesh docs](https://threejs.org/docs/pages/InstancedMesh.html);
[Optimizing 3M Instanced Grass in Three.js (discourse)](https://discourse.threejs.org/t/performance-optimizing-3m-instanced-grass-in-three-js/81286)

Patrones adoptados:

- **InstancedMesh por especie** (misma geometría/material): miles de instancias
  en 1 draw call; nunca un Mesh por hoja de césped.
- **Placement determinista por seed** con jitter (rechazo por cercanía tipo
  poisson disk simplificado): evita aglomeraciones y solapamiento con árboles.
- **Presupuesto explícito por zona** (césped/árboles/rocas) y **límite máximo
  de instancias por chunk**; la densidad decae con la distancia (LOD por
  instancing) para que el costo sea predecible.

## 5. Culling, LOD y presupuestos

**Referencia:** three.js InstancedMesh performance (draw calls como cuello de
botella CPU→GPU); harness existente `FramePerformanceMonitor` y
`evaluateGamePerformanceBudget` del Bosque

Patrones adoptados:

- **Culling circular por distancia** al centro de streaming (ya usado en
  `game-playable-scene.ts` con `STREAM_MAX_DISTANCE`); se reutiliza, no se
  duplica.
- **LOD del terreno**: resolución de grid baja lejos / alta cerca (futuro; hoy
  el comparador mide el costo para decidir si hace falta).
- **Métricas de cierre**: draw calls, triángulos, frame ms y memoria estimada
  antes/después de cada cambio de modo; la decisión de estilo se apoya en
  números, no en hipótesis.

## 6. Decisiones que NO se adoptan (con motivo)

- **Terrain3D completo de Godot** (clipmap, control de materiales, costuras):
  excede el alcance del prototipo; el toolkit empieza por heightfield puro.
- **WASM/Rust en el cliente**: el stack del proyecto es Vanilla TS; el core
  puro TS ya es suficiente para los tamaños del Bosque (48×32) y evita
  toolchain paralelo.
- **CDLOD/ROAM**: overkill mientras no exista evidencia de presupuesto roto; se
  registra como mejora si el comparador lo exige.

## 7. Evidencia y fuentes

- Godot: FastNoiseLite (ruido/fbm) y glusoft tutorial (generación con perlin).
- Bevy: kcstuff (isla por perlin + máscara), bevy-terrain (capas de ruido),
  Bevy Procedural Earth (mesh indexado).
- Three.js: docs de InstancedMesh y discourse de césped instanciado (budgets y
  draw calls).
- Propios del repo: `game-block-heightmap.ts`, `game-block-mesher.ts`,
  `game-playable-scene.ts` (culling/streaming) y `game-performance-budget.ts`.
