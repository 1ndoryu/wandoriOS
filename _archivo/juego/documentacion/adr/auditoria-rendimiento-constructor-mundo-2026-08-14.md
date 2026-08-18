# Auditoría de rendimiento — Constructor de mundo (138A-11)

> **Fecha:** 2026-08-14 · **Bloque:** 138A-11 · **Alcance:** generación
> procedural, pasto instanciado, presupuestos y ciclo de vida GPU del
> constructor de mundo. **Método:** benchmark reproducible en vitest,
> spys de geometría/material y revisión de las métricas existentes
> (`readRendererMetrics`, GPU probe, `game-performance-budget.ts`).

## Resumen ejecutivo

Un hallazgo material se corrigió en este bloque: la cuota global de briznas de
pasto no se acumulaba entre pasadas filtradas (pincel), con lo que el campo
podía superar el presupuesto de 10 000 instancias. El resto de la generación
está holgadamente dentro de presupuesto: un mundo 256×256 (máximo del contrato,
256 chunks) se genera en ~16 ms de media. El ciclo de vida GPU no acumula
geometrías ni materiales entre regeneraciones y libera todo en `dispose`.

## Presupuestos verificados

| Presupuesto | Límite | Evidencia |
| --- | --- | --- |
| Chunks de pasto | ≤1024 (`GRASS_FIELD_LIMITS`) | `grass-field.ts`, fail-closed |
| Briznas de pasto | ≤10000 (`GRASS_FIELD_LIMITS`) | fix 138A-11 + test de cuota |
| Chunks del documento | ≤1024 (`MAP_VERSION_LIMITS`) | `assertValidMapVersion` |
| Instancias del documento | ≤10000 (`MAP_VERSION_LIMITS`) | `assertValidMapVersion` |
| Frame P95 | ≤16.7 ms | `GAME_PERFORMANCE_BUDGET` |
| Draw calls / triángulos / geometrías / texturas | 40 / 100k / 80 / 32 | `GAME_PERFORMANCE_BUDGET` |
| Heap JS | ≤256 MB | `GAME_PERFORMANCE_BUDGET` |

## Benchmark reproducible

Test `benchmark reproducible de generación (138A-11)` en
`map-builder.test.ts`: 25 mundos recorriendo 4 shapes × 8 seeds × 5 tamaños
(48→256). Resultado en esta máquina (agente, una pasada):

| Métrica | Valor |
| --- | --- |
| Generación media por mundo | **15.83 ms** |
| Generación máxima | **46.00 ms** |
| Mundo mayor del set | 256×256 → **256 chunks**, 131 072 triángulos |
| Instancias de vegetación (máx.) | 90 |

Las cotas del test (media < 500 ms, máx < 1000 ms) son generosas para CI y
detectan regresiones O(n²), no micro-benchmarks.

## Hallazgos y correcciones

1. **Cuota global de briznas por pasada (corregido):** `rebuildGrass`
   concedía `maxInstances: 10000` a cada pasada filtrada; pintar varias zonas
   acumulaba briznas sin respetar el presupuesto global. Ahora se pasa
   `remaining = 10000 − conservadas` y sin cupo no se generan briznas nuevas.
   Test: la 2ª pasada filtrada recibe `maxInstances = 10000 − kept`.
2. **Doble generación de pasto por cambio (corregido):** `setGrassOptions` +
   `regenerateFromOptions` recalculaban el campo dos veces; ahora una sola
   regeneración. Test: spy de `buildGrassField` cuenta 1 llamada.
3. **Ciclo de vida GPU (verificado, sin fugas):** test nuevo que cuenta
   geometrías/materiales vivos por `scene.traverse` antes y después de 8
   regeneraciones: **mismo número** (sin acumulación), la geometría de un
   mesh anterior se libera al regenerar (`spyOn(dispose)`) y tras `dispose()`
   la escena queda vacía. Patrón correcto del comparador: pasto con geometría
   compartida (solo `mesh.dispose()` por rebuild y `grassGeometry.dispose()`
   una vez en dispose) y `clearGrassMeshes()` antes de `disposeBuiltMode`.

## Notas de arquitectura de rendimiento

- El pasto usa un único `InstancedMesh` por chunk sobre una geometría de mata
  compartida y `instanceColor` (una sola textura/rampa toon): draw calls
  acotados por chunk (≤256 chunks en el mundo mayor).
- La generación es determinista por seed (mismo JSON para mismo seed), lo que
  permite cachés de documento y reproducción de bugs sin estado.
- El pick/pintado trabaja por chunk (`chunkFilter`): una pincelada regenera
  solo la unión de chunks previos/actuales, no el campo completo.
- Las métricas de renderer (`readRendererMetrics` + GPU probe) siguen siendo
  el instrumento de validación en navegador; el benchmark de vitest cubre la
  parte determinista (generación y ciclo de vida de objetos Three).

## Deuda documentada

- **P3 — Generación síncrona en el hilo principal:** `buildMapVersionFromOptions`
  corre en el hilo de UI (16 ms en el mundo mayor, aceptable hoy). Si los
  mundos crecen o se piden en ráfaga, mover la generación pura a un worker
  (el pipeline ya es sin Three/DOM, lo que lo hace trivial).
- **P3 — Césped en estilo bloques:** con `maxGrass = 0` el estilo bloques no
  paga instancias de pasto (barato hoy), pero si se decide mostrarlo debe
  reutilizar la misma geometría compartida y entrar en la misma cuota global.
- **P3 — Presupuesto de bloques:** el mesher de bloques escala por cellSize
  con una sola malla por estilo; si el mundo máximo se combina con cellSize
  máximo (512×512 unidades), revisar el presupuesto de triángulos del renderer
  (100k) con `readRendererMetrics` en navegador.

## Veredicto

Sin fugas de geometría/material tras regeneración, presupuestos verificables
y el único defecto material (cuota de pasto) corregido con test. Gate 138A-11
debe pasar; la validación visual final sigue siendo del usuario en
`/forest-playable`.
