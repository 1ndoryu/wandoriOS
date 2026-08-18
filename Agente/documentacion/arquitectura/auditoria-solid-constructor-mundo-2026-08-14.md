# Auditoría SOLID/arquitectura — Constructor de mundo (138A-11)

> **Fecha:** 2026-08-14 · **Bloque:** 138A-11 · **Alcance:** `game-core`,
> comparador, paneles, escena, renderer metrics, realtime y teardown del
> constructor de mundo (`plan-constructor-mundo-v2-toolkit-edicion-2026-08-14.md`).
> **Método:** lectura por puntos de entrada (escena → comparador → pipeline
> puro), verificación de contratos y teardown, y revisión del gate
> (límites de líneas, accessos DOM/window, non-null assertions).

## Resumen ejecutivo

La arquitectura del constructor se sostiene en una frontera clara y sana:
`game-core` es un pipeline puro sin Three/DOM/red (DIP respetado), los
adaptadores visuales viven en la capa app y el panel no decide estado de
juego. Se corrigieron 4 hallazgos materiales en este bloque:

1. Doble rebuild del pasto al cambiar terreno+pasto a la vez.
2. Cuota global de briznas no acumulada en pasadas filtradas (pincel).
3. Colisión de 3ª persona de punto único (se hunde en colinas intermedias).
4. Import sin validación cruzada opciones↔mapa.

Queda deuda documentada (líneas de escena/paneles, `updateCamera` orbital en
la escena, límite de 150 líneas en utils superado por `game-camera-controls.ts`,
acceso DOM fuera del boundary y césped en estilo bloques como pregunta abierta
al usuario).

## Hallazgos por módulo

### `frontend/src/features/game-core/` — pipeline puro (SRP/OCP/DIP fuertes)

- **Bien:** cada módulo tiene un solo motivo de cambio (opciones, heightfield,
  meshes, vegetación, césped, documento MapVersion, capas). El comparador y la
  escena consumen contratos tipados (`TerrainOptions`, `MapVersion`,
  `TerrainLayer`, `GrassFieldOptions`), no implementaciones.
- **Bien:** validación fail-closed en los boundaries (`validateTerrainOptions`,
  `assertValidMapVersion`, `normalizeGrassFieldOptions`, `validateGrassFieldOptions`).
- **Corregido (138A-11):** `parseSerializedWorld` validaba opciones y mapa por
  separado pero no cruzaba: un JSON con opciones y documento de mundos
  distintos entraba silenciosamente. Nueva `assertWorldMatchesOptions`
  (`map-builder.ts`) exige bounds = ±width×cellSize/2, mismo cellSize y chunks
  completos con coordenadas 0..chunksX/Z. Tests negativos en
  `map-builder.test.ts`.
- **Verificado (no es deuda):** el campo `style` no está muerto: `map-builder.ts`
  lo usa para `maxTrees = 0` en suave, `terrain-options.ts` lo valida y la
  escena lo aplica en `applyTerrainMode`. El error de lectura de import ya se
  reporta en la UI (`game-world-constructor.ts` → 'error: no se pudo leer el
  archivo'), no es silencioso.

### `game-procedural-comparator.ts` (717 líneas)

- **Corregido (138A-11) — doble rebuild:** la escena llamaba
  `setGrassOptions` (rebuild de pasto) seguido de `regenerateFromOptions`
  (rebuild completo que incluye pasto). `regenerateFromOptions` acepta ahora
  `(options, grass?)` y la escena hace una sola regeneración. Test con spy de
  `buildGrassField` (1 llamada por cambio).
- **Corregido (138A-11) — cuota global:** `rebuildGrass` concedía 10000
  briznas a cada pasada filtrada (pincel), pudiendo superar el presupuesto
  global acumulado. Ahora calcula `remaining = 10000 − conservadas` y lo pasa
  como `maxInstances`; sin cupo no genera y la retirada ya liberó sus meshes.
  Test verifica `maxInstances = 10000 − kept` en la 2ª pasada.
- **Deuda:** el módulo concentra agua, terreno (dos estilos), pasto, props del
  documento y pick. SRP razonable para un "comparador", pero >300 líneas
  (gate: `limite-lineas`). La separación natural sería extraer el stack de
  pasto (`game-constructor-grass` de datos + este montaje) y el bloque de
  documento a módulos propios; queda ticketizado para la siguiente refactor
  de líneas.

### `game-playable-scene.ts` (1102 líneas) y `game-camera-controls.ts` (237)

- **Corregido (138A-11) — colisión 3ª persona:** la cámara solo muestreaba su
  propio punto; se hundía en colinas intermedias del tramo jugador→cámara.
  Nuevo helper puro `resolveThirdPersonCollision(camera, cameraTarget,
  groundHeightAt, clearance, samples)` en `game-camera-controls.ts` (muestreo
  del segmento, eleva al máximo suelo+despeje) y la escena lo usa. Tests
  unitarios con `groundHeightAt` inyectado en `game-camera-controls.test.ts`.
- **Parcial (de 138A-9):** vuelo libre, primera persona, rotación de mirada y
  bounds ya viven en `game-camera-controls.ts`. La órbita/3ª persona
  (`updateCamera`, líneas 685-740) y los handlers de entrada siguen en la
  escena; es la deuda mayor de SRP de este bloque.
- **Deuda:** 1102 líneas (gate `limite-lineas-nivel-2`: duplica el límite).
  No se tapa con disable; la refactor avanza por extracciones verificadas
  (cámara primero, luego inputs/niebla/highlight). `game-camera-controls.ts`
  supera el límite de utils (150): 237 líneas, aceptable mientras siga siendo
  un controlador puro sin estado, pero documentado.

### Paneles (`game-settings.ts` 706, `game-world-constructor.ts` 603,
`game-playable.ts` 546, `game-layer-editor.ts` 458, `game-map-editor.ts` 339,
`game-constructor-*.ts` ≤254)

- **Bien (SRP/ISP):** cada panel es un módulo con un contrato de props y
  callbacks (`onChange`, `onGrassChange`, `onLayersChange`, `onEditObjects`),
  y el constructor los orquesta sin lógica de render por duplicado.
- **Deuda:** `game-settings.ts`, `game-world-constructor.ts`, `game-playable.ts`
  y `game-layer-editor.ts` exceden 300 líneas (gate `limite-lineas`; el editor
  de capas está a 417 efectivas). Los paneles colapsables por sección (138A-8)
  redujeron la complejidad visual pero no el tamaño del archivo.

### Renderer metrics / GPU / presupuestos

- **Bien:** `game-performance-budget.ts`, `game-renderer-metrics.ts` y
  `game-gpu-probe.ts` son módulos pequeños (≤163 líneas) con contratos
  separados y tests propios. No requieren cambios.

## Fixes aplicados (resumen)

| Hallazgo | Fix | Evidencia |
| --- | --- | --- |
| Doble rebuild de pasto | `regenerateFromOptions(options, grass?)` + escena | test `regenerateFromOptions con pasto hace UN solo rebuild` |
| Cuota global de briznas | `remaining = maxInstances − kept` | test `la cuota global se reparte entre pasadas filtradas` |
| Colisión 3ª persona | `resolveThirdPersonCollision` (segmento) | `game-camera-controls.test.ts` |
| Import sin validación cruzada | `assertWorldMatchesOptions` | tests negativos en `map-builder.test.ts` |

## Deuda documentada

- **P1 — Líneas de la escena:** extraer órbita/3ª persona y handlers de
  `updateCamera` a `game-camera-controls.ts` (SRP); después inputs/niebla.
- **P2 — Líneas de paneles:** dividir `game-settings.ts` (706) y
  `game-world-constructor.ts` (603) por secciones; el resto ya sigue ese patrón.
- **P2 — Acceso DOM fuera del boundary:** warnings `dom-access-outside-platform`
  y `window-reference-outside-platform` del gate en la capa app; revisar con
  `conducta-global` y el boundary de plataforma.
- **P3 — Non-null assertions:** 6 `!` por archivo en varios módulos de la capa
  app (gate info); tipar los contratos en vez de afirmar.
- **Pregunta abierta al usuario — césped en estilo bloques:** el césped vive
  en el grupo suave y `maxGrass = 0` en bloques; NO se cambió unilateralmente.
  Decidir si bloques debe mostrar pasto instanciado (misma geometría) o
  mantenerse sin él.

## Veredicto

Los defectos materiales se corrigieron con tests; la deuda restante es
estructural (tamaño de archivos) y está ticketizada en el plan. Gate 138A-11
debe pasar con warnings de límites documentados (no bloqueantes).
