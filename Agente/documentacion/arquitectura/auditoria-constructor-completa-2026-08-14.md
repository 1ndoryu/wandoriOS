# Auditoría completa del Constructor de mundo (Bosque) — checklist por archivo

> **Fecha:** 2026-08-14 · **Alcance:** todo lo relacionado con el constructor de
> mundo del Bosque (plan 138A-5..14): capa app `game-playable`, pipeline puro
> `game-core` (+ `procedural`), registro/CSS, tests, documentación y gate.
> **Método:** lectura por puntos de entrada (escena → comparador → pipeline
> puro), verificación de contratos, límites, teardown, presupuestos y tests;
> los informes previos 138A-11 se verificaron contra el código real (no se
> dieron por buenos) y cada hallazgo de esta auditoría se contrastó con el
> archivo citado (conteos raw/efectivos al 14-ago-2026).
> **Rama:** `wandorius` (primaria) · **Estado del árbol:** commits locales
> adelante de `origin/wandorius` con WIP del bloque 138A-14 (ver §0).

## 0. Estado del árbol (evidencia)

- `git status`: rama `wandorius`, **commits locales adelante** de
  `origin/wandorius` (bloques previos sin push; cifra variable según el
  momento de la consulta).
  Lista abreviada (fuente canónica: `git status --short`); el WIP del usuario
  incluye además `game-procedural-comparator.ts`(+test), `game-world-constructor.ts`,
  `world-palette.ts`(+test), `game-curved-island-controls.ts`, tests de
  assets/color/texture/layer-editor y el WIP sakura sin trackear
  (`game-constructor-style.ts`, `game-sakura-*.ts`,
  `plan-estilo-sakura-constructor-2026-08-14.md`), todos ajenos a este bloque.
- Modificados (WIP 138A-14, preservados y auditados en su estado actual):
  - `frontend/src/features/desktop/apps/game-playable/game-constructor-assets.ts`
  - `frontend/src/features/desktop/apps/game-playable/game-constructor-persistence.ts` (+ test)
  - `frontend/src/features/desktop/apps/game-playable/game-curved-island-panel.ts` (libera `disposeAssetThumbnails` en destroy)
  - `frontend/src/features/desktop/apps/game-playable/game-playable-scene.ts`
  - `frontend/src/features/game-core/map-edits.ts` (+ test)
  - `frontend/src/styles/desktop/desktop-game-playable.css`
  - `Agente/planes/plan-constructor-mundo-v2-toolkit-edicion-2026-08-14.md`,
    `roadmap.md`, `Agente/completados/tareas-2026-08-14.md`
- Nuevos (sin trackear):
  - `frontend/src/features/desktop/apps/game-playable/game-asset-thumbnails.ts` (+ test)
  - este documento de auditoría

## 1. Checklist de auditoría

Leyenda: `[x]` revisado · `[ ]` pendiente. Cada hallazgo se referencia en §2.
Los conteos de líneas son raw y efectivas (sin comentarios/vacías, métrica del
gate); la tabla completa está en §3.

### A. Pipeline puro `game-core` (núcleo)

- [x] `contracts.ts` — contratos puros X/Z
- [x] `limits.ts` — presupuestos defensivos
- [x] `map-validation.ts` — validación `WorldMap`
- [x] `map-version.ts` — contrato `MapVersion` + validación
- [x] `map-builder.ts` — pipeline opciones → `MapVersion`
- [x] `map-edits.ts` — edición de objetos (transform)
- [x] `map-streaming.ts` / `map-streaming-contracts.ts` — streaming lógico
- [x] `simulation.ts` — tick determinista
- [x] `spatial-hash.ts` — índice espacial
- [x] `collision.ts` — colisión de círculo
- [x] `interpolation.ts` — interpolación de snapshots
- [x] `camera-frame.ts` — rotación de input a mundo
- [x] `performance-monitor.ts` — métricas p50/p95
- [x] `world-palette.ts` — paleta unificada
- [x] `terrain-mesh.ts` — malla de terreno
- [x] `game-realtime.ts` — contratos realtime puros
- [x] `index.ts` — API pública

### B. Procedural (`game-core/procedural`)

- [x] `terrain-options.ts` — opciones + presets
- [x] `heightmap.ts` — heightfield por forma
- [x] `noise.ts` — fbm/hash
- [x] `terrain-layers.ts` — stack de capas (SDF/falloff/blend)
- [x] `grass-field.ts` — campo de césped por chunks
- [x] `sky-options.ts` — opciones de cielo (263 raw / 197 efectivas tras R11;
  presets y límites viven en `sky-presets.ts`/`sky-limits.ts`)
- [x] `water-mesh.ts` — malla de agua
- [x] `rain-mesh.ts` — malla de lluvia
- [x] `vegetation.ts` / `vegetation-mesh.ts` / `vegetation-lowpoly.ts` — vegetación
- [x] `tree-mesh.ts` — árboles low-poly
- [x] `grass-mesh.ts` — malla de césped
- [x] `heightfield-mesh.ts` — malla del heightfield
- [x] `procedural/index.ts` — exports

### C. App `game-playable` — entrada y shell

- [x] `game-playable.ts` — mount/teardown, ventana (240 raw / 184 efectivas;
  shell tras R2; el bucle jugable vive en `game-playable-runtime.ts`)
- [x] `game-playable-runtime.ts` — bucle jugable extraído (320 raw / 277
  efectivas; nuevo tras R2)
- [x] `game-playable-scene.ts` — escena (1151 raw medido a las 20:42 / **880
  efectivas según el gate 138A-15 del 20:19**, warning ALTO nivel-2 con WIP
  ajeno; el reporte previo de 19:50 la marcaba en 1040/nivel-3 y quedó
  superseded)
- [x] `game-playable-input.ts` — entrada (131)
- [x] `game-playable-visual-cache.ts` — caché visual (302 raw / 254 efectivas
  tras R2; batching en `game-playable-visual-cache-batching.ts` y helpers en
  `game-playable-visual-cache-utils.ts`)
- [x] `game-world-constructor.ts` — panel constructor (670 raw / **551
  efectivas según gate 138A-15 (20:19)** con WIP ajeno)
- [x] `game-settings.ts` — settings (174 raw / 132 efectivas tras R2; tabs en
  `game-settings-characters.ts` / `game-settings-assets.ts` /
  `game-settings-activity.ts`)
- [x] `game-scene-utils.ts` / `game-scene-gpu-estimate.ts`
- [x] `game-webgl-capabilities.ts` / `game-gpu-probe.ts`
- [x] `game-renderer-metrics.ts` / `game-performance-budget.ts`

### D. App `game-playable` — cámara y comparador

- [x] `game-camera-controls.ts` / `game-camera-modes.ts`
- [x] `game-curved-island-controls.ts`
- [x] `game-procedural-comparator.ts` (759 raw / **616 efectivas según gate
  138A-15** con WIP ajeno)
- [x] `game-procedural-blocks.ts` / `game-procedural-geometry.ts`
- [x] `game-world-bend.ts`
- [x] `game-fixture-map.ts` / `game-map-source.ts` / `game-map-preview.ts`
- [x] `game-toon-water.ts` / `game-curved-island.ts` / `game-curved-water.ts` / `game-curved-rain.ts` / `game-curved-island-panel.ts`

### E. App `game-playable` — editor de mapa y capas

- [x] `game-map-editor.ts` (339 raw / 275 efectivas)
- [x] `game-map-editor-core.ts` (389 raw / 294 efectivas; docs de undo/R5)
- [x] `game-map-editor-canvas.ts` / `game-map-editor-height.ts` / `game-map-editor-terrain.ts`
- [x] `game-map-editor-interactions.ts` / `game-map-editor-toolbar.ts`
- [x] `game-layer-brush.ts` / `game-layer-painter.ts`
- [x] `game-layer-editor.ts` (287 raw / 256 efectivas tras R2; fábricas puras
  en `game-layer-factories.ts`)
- [x] `game-block-heightmap.ts` / `game-block-mesher.ts` / `game-block-palette.ts`

### F. App `game-playable` — paneles del constructor

- [x] `game-constructor-controls.ts` / `game-constructor-color.ts` / `game-constructor-texture.ts`
- [x] `game-constructor-assets.ts` (WIP, 283)
- [x] `game-constructor-grass.ts` / `game-constructor-sky.ts`
- [x] `game-constructor-persistence.ts` (WIP, 237)
- [x] `game-world-io.ts`
- [x] `game-character-editor.ts`
- [x] `game-asset-preview.ts` / `game-asset-thumbnails.ts` (nuevo, 291) /
  `game-asset-versions.ts` (159 raw / 135 efectivas tras R2; preview en
  `game-asset-version-preview.ts`, metadata en
  `game-asset-version-metadata.ts`, formateadores en
  `game-asset-version-format.ts`)

### G. App `game-playable` — cielo, realtime, restart

- [x] `game-sky.ts` (185 raw / 156 efectivas tras R6; GLSL en
  `game-sky-shader.ts`) / `game-constructor-sky.ts` (sin GLSL, panel)
- [x] `game-realtime-client.ts` (348 raw / 280 efectivas) / `game-realtime-debounce.ts`
- [x] `game-restart-notice.ts`

### H. Registro, rutas y CSS

- [x] `app-registration-game-routes.ts` / `app-registration-game-playable.ts`
- [x] `desktop-game-playable.css` (WIP, 793 raw / 641 efectivas)

### I. Tests (por módulo; archivos .test.ts)

- [x] `game-core`: contracts/limits/map-validation/map-version/map-builder/map-edits/map-streaming/simulation/collision/interpolation/camera-frame/performance-monitor/game-realtime/world-palette/terrain-mesh (inventariados; suite `game-core.test.ts` 324 tras R7 + módulos individuales)
- [x] `game-core/procedural`: terrain-options/heightmap(+shapes)/noise/sky-options/water-mesh/rain-mesh/vegetation/vegetation-mesh/vegetation-lowpoly/tree-mesh/grass-mesh/grass-field/heightfield-mesh (inventariados; 25 suites)
- [x] `game-core`: terrain-layers (271 tras R8/R9)
- [x] app: playable/lifecycle/teardown/input/visual-cache (suites leídas: teardown 249, lifecycle 366, visual-cache 241)
- [x] app: scene metrics/gpu/webgl/performance-budget
- [x] app: camera-controls/camera-modes
- [x] app: comparador/procedural/block-mesher/block-heightmap/map-preview/map-source/fixture (comparador 576 leído)
- [x] app: map-editor/core/canvas/height/terrain/interactions/toolbar
- [x] app: layer-brush/layer-painter/layer-editor
- [x] app: constructor-controls/color/texture/assets/grass/sky/persistence/world-io/character-editor (persistence 378 leído)
- [x] app: asset-preview/asset-thumbnails/asset-versions/sky/realtime-client/realtime-debounce/restart-notice (realtime-client 514 y sky 91 leídos)
- [x] app: curved-island-panel/water/rain/settings

Detalle de las suites leídas a fondo en §2.4. Inventario completo (archivo →
líneas) en §3.

### J. Documentación y gate

- [x] Plan activo 138A-5..12 + auditorías previas 138A-11 vs código real
  (leído `plan-constructor-mundo-v2-toolkit-edicion-2026-08-14.md`,
  `auditoria-solid-constructor-mundo-2026-08-14.md` y
  `auditoria-rendimiento-constructor-mundo-2026-08-14.md`)
- [x] Gate/verificaciones (type-check, tests) — ver §2.5; los comandos de
  verificación se ejecutan en la fase de resolución (§5)

## 2. Hallazgos

_(cada entrada cita archivo y líneas; los conteos son los reales al 14-ago-2026)_

### 2.1 Pipeline puro `game-core` (A)

**Fortalezas:**

- Frontera DIP sólida: `game-core` no importa Three/DOM/red (verificado en
  `index.ts` y en cada módulo). El mismo contrato `MapVersion` alimenta
  preview, documento y (futuro) backend.
- Validación fail-closed en todos los boundaries: `validateTerrainOptions`,
  `assertValidMapVersion`, `assertWorldMatchesOptions`, `validateWorldMap`,
  `normalizeTerrainLayerStack`, `normalizeGrassFieldOptions`,
  `normalizeSkyOptions`.
- SRP por módulo: opciones, heightfield, mallas, vegetación, césped, capas,
  documento y streaming están separados con contratos tipados.
- Presupuestos defensivos en `limits.ts`/`MAP_VERSION_LIMITS`/`GRASS_FIELD_LIMITS`
  y cuotas en `map-version.ts` (assets 256, chunks 1024, instancias 10 000,
  spawns 64, cellSize 0.25..8).
- Anti-sabotaje: `RESERVED_IDS`, `rejectUnknownKeys`, rechazo de `__proto__`
  en `map-version.ts` y `terrain-layers.ts`; checks de ids duplicados y de
  referencias de assets existentes.

**Hallazgos:**

1. **`map-version.ts` — cobertura de chunks: parcial por diseño, no defecto
   (info, verificado).** `validateTerrain` valida cada chunk (duplicados,
   `chunk fuera de bounds`, tamaños de `heights`/`surfaces`) pero no exige
   que la unión de chunks cubra todo `bounds`. Tras verificar `map-streaming.ts`
   (MapChunkCache indexa los chunks existentes sin exigir cobertura) y el test
   `map-version.test.ts` (documento con 1 chunk sobre bounds 32×32 y cellSize
   2 = cobertura completa real), **mover la cobertura total a `validateTerrain`
   rompería el streaming de mapas parciales**. La comprobación completa vive
   correctamente en `assertWorldMatchesOptions` (`map-builder.ts:296`) para el
   import con opciones. Mejora opcional: exportar un helper reutilizable
   `chunkCoverageIssues(map)` para consumidores estrictos (p. ej. backend)
   sin cambiar el contrato del documento.
2. **`map-builder.ts` — capas aplicadas pero no serializadas en `surfaces`
   del chunk (info/mejora).** `applyTerrainLayerStack` produce `surfaces`, y
   el chunk las incluye, pero `grass-field` solo recibe `vegetationMask` desde
   el pipeline; el documento MapVersion no serializa la máscara de vegetación
   (documentado en `terrain-layers.ts`, OK), así que al exportar/importar las
   capas de vegetación sobreviven en `layers` pero el pasto pintado depende de
   que la escena reaplique el stack. Verificado como decisión documentada.
3. **`simulation.ts` — `createColliderIndex` se reconstruye en cada tick (P3).**
   El índice espacial se crea dentro de `simulateTick` por llamada
   (`simulation.ts:165`). Con muchos colliders y muchos jugadores es trabajo
   repetido; aceptable hoy (mapas pequeños), pero cacheable por objeto `map`
   (WeakMap) porque el contrato es inmutable. **Resuelto en este turno (§5-R7):**
   caché WeakMap con reconstrucción por identidad de `map.colliders` y por
   granularidad (`maxSubstepDistance`). Invariante: no mutar `map.colliders`
   en sitio (misma referencia = mismo índice); reemplazar el array o el mapa
   (el editor ya reemplaza el MapVersion al aplicar ediciones).
4. **`collision.ts` — `collides` re-verifica shape con map de colliders por
   movimiento (info).** Correcto y determinista; sin hallazgo material.
5. **`map-edits.ts` — `removeInstancesIfPresent` ignora ids desconocidos en
   silencio (decisión documentada [138A-14]).** El comentario lo justifica
   para no romper restauración tras cambiar seed. Riesgo: un typo de id en el
   llamador se traga sin error. Mantener, pero conviene un wrapper estricto en
   la capa app para validar el set contra el documento antes de llamar.
6. **`map-streaming.ts` — `MapChunkCache` reconstruye el índice completo en el
   constructor (P3).** Para 1024 chunks × 10 000 instancias es O(n) una sola
   vez; bien acotado, pero la clase se instancia por ventana; reutilizable si
   se cachea por `map.id`.
7. **`performance-monitor.ts` — `record` usa `shift()` O(n) (P3).** Máximo 120
   muestras, costo trivial; sin acción.
8. **`terrain-layers.ts` — `containsCell` es búsqueda lineal desde el final
   (P2 confirmado).** Una capa painted de 16 384 celdas sobre un mundo 256×256
   con AABB disperso recorre hasta 16 384 comparaciones por celda (peor caso
   ~1e9 comparaciones en el mundo máximo). Está acotado por `maxPaintedCells`,
   pero un `Set` de celdas precomputado por capa hace el apply O(zona).
   **Resuelto en este turno (§5-R8):** Set de celdas por capa painted en
   `applyTerrainLayerStack`; se eliminó `containsCell`.
9. **`terrain-layers.ts` — `shapeCellBounds` recorta el falloff en TODAS las
   formas (P2 confirmado, más amplio que lo reportado en 138A-11).**
   `circle` absorbe solo `radius` (no `falloffRadius`), `curve` absorbe solo
   los puntos de la polilínea (no `±halfWidth` ni `falloffRadius`) y `polygon`
   absorbe solo los vértices. Las celdas a distancia `d ∈ (0, falloffRadius]`
   fuera de la forma reciben peso > 0 con falloffs lineales/smooth/gauss/dome/
   spike, pero quedan fuera del AABB iterado → bordes del falloff sin pintar.
   Fix: inflar el AABB por `reach(shape) + falloffRadius` (curve: `halfWidth`).
   **Resuelto en este turno (§5-R9):** `shapeCellBounds` absorbe el falloff en
   todas las formas y painted usa el rect de celda completo (bordes, no centro).
10. **`heightmap.ts` — `shapeMask('continente')` y `valle` no están cubiertos
    por la fórmula histórica (info).** Comentado como intencional; tests
    `heightmap-shapes.test.ts` cubren las cuatro formas.

### 2.2 Procedural (B)

**Fortalezas:**

- Módulos de datos puros sin Three/DOM/red; el adaptador visual vive en la
  capa app (index.ts de procedural exporta solo datos y validadores).
- Presupuestos fail-closed: `GRASS_FIELD_LIMITS` (≤1024 chunks, ≤10 000
  briznas, chunkSize 16), `WATER_MESH_MAX_SEGMENTS` (≤256), `RAIN_MESH_MAX_STREAKS`
  (≤4096), `SKY_LIMITS` (rangos por campo) y `TERRAIN_OPTIONS_LIMITS`
  (width/depth 16..256 y múltiplos de 16, cuota de chunks width/16×depth/16).
- Determinismo: `hash2`/`valueNoise`/`fbm2` usan solo aritmética entera e
  IEEE-754 sin `Math.random`; mismo seed → mismo heightfield, misma
  distribución de vegetación y mismas fases de agua/lluvia.
- `terrain-layers.ts` es el módulo más rico del toolkit: SDF de círculo/polínea/
  polígono/painted, falloff con 6 curvas, blend `set/add/max/min`, taper,
  `mergePaintedCells` deduplica con cuota y rechaza `__proto__`.
- `grass-field.ts` divide el grid por chunks de 16 celdas y devuelve briznas
  en coordenadas de celda con jitter; el comparador sube un único InstancedMesh
  por chunk y solo regenera la zona afectada (`chunkFilter`).
- Gramática de mallas compartida: `vegetation-mesh.ts` (pushBox/pushQuad/rgb)
  reutilizada por `tree-mesh.ts`, `grass-mesh.ts` y `vegetation-lowpoly.ts`
  sin duplicar generadores.
- `heightfield-mesh.ts` produce normales por diferencias finitas, rampa por
  banda (arena/hierba/roca) y superficies por celda (ids 0..15) sin GPU.

**Hallazgos:**

11. **`sky-options.ts` — 372 raw / 303 efectivas, supera el límite (P2,
    ya ticketizado).** El plan 138A-12 ya lo registró ("303 líneas efectivas…
    dividir") pero el archivo no se dividió. La separación natural es
    `sky-presets.ts` (paletas + presets) y `sky-limits.ts` (rangos + rangos
    de validación), dejando contrato + validación/normalización en el módulo
    base. **Resolución planificada (§5-R11).**
12. **`water-mesh.ts` — `wavePhase` se emite pero el shader anima por posición
    (P3/info).** El atributo está documentado como "reservada para variantes de
    oleaje por vértice"; hasta el mundo máximo son 65 649 floats (~264 KB) de
    datos no consumidos. Mantener (documentado) o retirar cuando se decida la
    variante por vértice.
13. **`rain-mesh.ts` — distribución circular por raíz cuadrada + phase por gota
    (verificado, sin hallazgo).** Counts y parámetros validados; 6 floats por
    gota, sin trabajo por frame (el shader anima).
14. **`grass-mesh.ts`/`tree-mesh.ts`/`vegetation-lowpoly.ts` — mallas por
    instancia en arrays planos (info).** La presentación las traduce a
    geometrías Three; bajo los presupuestos actuales (≤10 000 briznas, ≤90
    props en el mundo mayor) el costo de build es despreciable.

### 2.3 Capa app `game-playable` (C–H)

**Fortalezas:**

- **`game-playable.ts` — destroy idempotente y abort fail-closed.** `disposed`
  corta todos los caminos (líneas 80, 106, 133, 156, 168, 194, 214, 231, 256);
  teardown del panel, input y escena; `destroy()` doble no lanza (test).
- **`game-playable-scene.ts` — pipeline con presupuestos y teardown total.** La
  escena orquesta render/cámara/skydome/comparador/panel/streaming/painter/
  drop/persistencia (ver hallazgo 15).
- **`game-procedural-comparator.ts` — ciclo de vida GPU sin fugas.** Geometría
  de pasto compartida (`grassGeometry` único, `mesh.dispose()` por rebuild,
  `clearGrassMeshes()` antes de rebuild/dispose), `regenerateFromOptions`
  acepta `grass?` para UN solo rebuild (test: 1 llamada a `buildGrassField`),
  cuota global de briznas por pasada (`remaining = maxInstances − kept`),
  dispose ordenado. Verificado en 138A-11 y re-verificado aquí.
- **`game-settings.ts` — WeakMap de generaciones.** `gameCharacterListGenerations`/
  `gameAssetListGenerations`/`gameMapEditorCleanups` (líneas 54-56) evitan
  tocar DOM desmontado en cargas asíncronas; fortaleza real de teardown.
- **`game-realtime-client.ts` — reconexión con backoff 1s→30s + jitter.**
  4001 = identidad reemplazada (NO reintenta, línea 271), 4002 = mundo
  reiniciado (SÍ reintenta y recarga versión, línea 279); `joined` resetea la
  secuencia (línea 192); errores transitorios del transporte reintentan.
- **`game-sky.ts` — 1 mesh + 2 luces sincronizadas.** `frustumCulled=false`,
  cúpula sigue a la cámara, `dispose()` doble seguro y updates sin duplicar
  recursos (test 91 líneas).
- **`game-curved-island.ts` — visibilidad combinada correcta.**
  `setHighlight`/`setVisible` operan sobre `islandVisible && highlightShown`
  (líneas 119-120); dispose limpio.
- **`game-block-mesher.ts` — datos puros sin THREE.** Caras laterales SOLO
  donde el vecino es más bajo u océano (líneas 3-4, 163-175), AO en la base,
  top hierba/arena; el adaptador sube los buffers.
- **`game-layer-painter.ts` — sesión acotada.** `MAX_SESSION_CELLS = 4096`,
  commits intermedios cada 120 ms, `stopImmediatePropagation` para que el
  pincel no propague a la escena.
- **`game-map-editor-height.ts` — vértices compartidos 1/2/4 chunks.**
  Actualizar una esquina propaga a todos los chunks que la comparten; commit
  solo si algún vértice cambió.
- **`game-asset-thumbnails.ts` — caché FIFO 256 + requestIdleCallback.**
  `disposeAssetThumbnails` libera renderer/cola/caché y `disposed` vuelve a
  false al final (diseño "reutilizable" documentado; ver hallazgo 22).
- **`game-layer-editor.ts`/`game-constructor-*.ts` — contratos de props y
  callbacks tipados** (`onChange`, `onGrassChange`, `onLayersChange`,
  `onEditObjects`); los paneles no deciden estado de juego.
- **`game-map-editor.ts` — el comentario "queda <300 líneas" es CORRECTO en
  métrica efectiva** (339 raw / 275 efectivas). No es hallazgo; se corrige el
  dato para no duplicar deuda inexistente.
- **`game-realtime-debounce.ts` / `game-restart-notice.ts` / registro y rutas —
  pequeños y con teardown (53/103/47/13 líneas), sin hallazgos.**

**Hallazgos:**

15. **`game-playable-scene.ts` — la mayor deuda SRP (P2, warning ALTO).**
    Orquesta render, cámara (incl. órbita/3ª persona en la escena,
    líneas 685-740), skydome, comparador, panel, streaming, painter, drop y
    persistencia. En la captura inicial 1136 raw / 896 efectivas propias y
    rozaba el umbral del gate (`limite-lineas`: 300 · nivel-2: 600 warning
    ALTO · nivel-3: 900 error). El reporte de las 19:50 la marcaba en 1040
    efectivas → nivel-3 ERROR, pero ese reporte quedó **superseded**: el gate
    fresco **138A-15 (20:19, PASS)** la reporta en **880 efectivas → warning
    ALTO nivel-2** (nota: la métrica del gate difiere de la propia del MD por
    cómo cuenta comentarios, y el WIP ajeno siguió moviendo el archivo: raw
    1151 medido a las 20:42). Extracción recomendada (ya ticketizada en
    auditoría 138A-11): órbita/3ª persona y handlers a
    `game-camera-controls.ts`, después inputs/niebla/highlight.
    **Resolución planificada (§5-R1).**
16. **Paneles y comparador por encima del límite (P2, tabla en §3).**
    Afectaban `game-settings.ts` (605), `game-world-constructor.ts` (551
    según gate 138A-15), `game-procedural-comparator.ts` (616 según gate
    138A-15), `game-playable.ts` (455), `game-layer-editor.ts` (417),
    `game-playable-visual-cache.ts` (313) y `game-asset-versions.ts` (306).
    **Resuelto parcialmente en R2 (los 5 archivos NO WIP):** splits por
    extracción verbatim con API estable y verificación tests+type-check
    (§5-R2); quedan pendientes por ser WIP ajeno `game-world-constructor.ts`
    y `game-procedural-comparator.ts` (separación por secciones ya
    ticketizada).
17. **`desktop-game-playable.css` — 793 raw / 641 efectivas, muy por encima
    del límite CSS (P2).** El WIP 138A-14 añadió 1 línea más. Dividir por
    secciones (escena, panel, editor, cielo, thumbnails) en archivos por
    feature e importarlos desde el registro. **Resolución planificada (§5-R3).**
18. **`game-map-editor-core.ts` — `commit` clona con `JSON.parse(JSON.stringify)`
    (P3).** `heights`/`surfaces` son `number[]` planos en `MapVersion`, así
    que el round-trip no pierde datos; el costo es O(n) por op con cap de 50
    undo. `hasChanges` compara `JSON.stringify` O(n) contra `baseDocument`
    (línea 380). Correcto hoy; si el documento crece, migrar a clon estructural
    con arrays tipados y diff por firma.
19. **`game-sky.ts` — GLSL inline grande (P3, mantenimiento).** El shader
    (~150 líneas GLSL en template string) vive dentro del adaptador; no viola
    límites pero dificulta revisión. Extraer a `game-sky-shader.ts` (string
    puro) sin cambiar comportamiento.
20. **`game-asset-versions.ts` — 306 efectivas, superaba el límite por poco
    (P2).** Split natural: versión/validación vs. lista/UI. **Resuelto en
    R2:** panel (135), preview (51), metadata (119) y formateadores (22);
    API estable (consumidores re-exportan desde `game-asset-versions.ts`).
21. **`game-curved-island-panel.ts` — destroy ahora libera miniaturas**
    (WIP 138A-14, diff verificado): `disposeAssetThumbnails()` se llama al
    destruir el panel. Correcto; el teardown queda balanceado.
22. **`game-asset-thumbnails.ts` — `disposed = false` al final de dispose
    (info/diseño).** Es "reutilizable" por diseño (el panel puede remontarse
    sin recargar WebGL). Si se quiere semántica de una sola vez, cambiar el
    contrato; no es un bug con el uso actual (panel único).
23. **Registro/rutas — sin hallazgos.** `app-registration-game-routes.ts` (13)
    y `app-registration-game-playable.ts` (47) son delgados; la app se carga
    lazy/full-bleed con teardown.
24. **WIP ajeno en curso rompe el type-check global (info, 20:25).**
    `game-constructor-persistence.ts` (WIP del usuario, mtime 20:25:16)
    cambió a mitad del bloque R2 y su test espera
    `createRemovedInstancesStore`/`normalizeRemovedInstanceIds` y el campo
    `removedInstanceIds` que el fuente aún no exporta (TS2305/TS2353/TS7006).
    No se toca (WIP ajeno); el scoped type-check de los módulos de R2 pasa
    limpio. Verificado con `git diff --stat` y `tsc --noEmit -p` (excluyendo
    solo ese test). Avisar al dueño de 138A-14 para que complete el contrato
    o ajuste el test.
25. **Gates frescos 20:17/20:19 superseden el SETUP ERROR y dejan el bloque
    R2 fuera de alcance (info).** El árbol de reportes cambió durante la
    sesión: **138A-14 PASS (58 archivos, 20:17)** y **138A-15 PASS (61
    archivos, 20:19)**, ambos con las 4 etapas en verde (sentinel 0 errores,
    varsense 0, frontend 0, docs 0). Verificado en
    `.quality-reports/check/138A-{14,15}/latest.md`. Ese PASS es **previo al
    estado final del bloque R2 (~20:40)**: `scope-manifest.json` de 138A-15
    NO cubre `game-playable.ts`, `game-playable-runtime.ts`, `game-settings.ts`,
    `game-settings-characters.ts`, `game-settings-assets.ts` ni
    `game-settings-activity.ts`; `game-layer-editor.ts` y
    `game-layer-factories.ts` entran con hash distinto al actual; el MD de
    auditoría también derivó después del gate. Corrección: gate fresco
    (`npm run gate:check -- <ID>`) sobre el estado final del bloque — queda
    pendiente de decisión del usuario por el WIP ajeno en curso (hallazgo 24).
26. **`mixed-barrel-logic` en nuestros barrels de R2/R4 (P3, warning).** El
    gate 138A-15 (20:19) marca `game-playable-visual-cache.ts:1` y
    `map-builder.ts:1` por mezclar re-export y lógica ejecutable. Es
    consecuencia del patrón de split con re-export desde el módulo principal
    (API estable). No rompe el gate (warning, no error), pero la corrección
    limpia es mover los re-exports a un barrel dedicado (`index.ts`/módulo
    puro) separado de la implementación.

### 2.4 Tests (I) — suites verificadas

Inventario completo (37 suites app + 25 game-core) en §3. Suites leídas a
fondo y verificadas contra el código:

- **`game-playable-teardown.test.ts` (249):** destroy idempotente y abortable;
  RAF cancelado (`cancelAnimationFrame` stub); listeners de window/document
  balanceados (spy add/remove); `ResizeObserver.disconnect`; socket close y
  removeListener; abort fail-closed. ✓
- **`game-playable-lifecycle.test.ts` (366):** rehidratación por `authStore`
  (publicada vs fixture), context loss, 12 montajes/destroys sin retención,
  mapa publicado/fixture fail-closed. ✓
- **`game-constructor-persistence.test.ts` (378, WIP):** clave versionada,
  JSON corrupto/versión desconocida → null (fail-closed), paleta/panel/capas/
  pasto/cielo/removidos reaplicados, store reaplica y descarta ids muertos. ✓
- **`game-procedural-comparator.test.ts` (576):** agua 1 solo material,
  paridad de cellSize, `maxTrees = 0` en suave, presupuesto global de pasto
  por pasada filtrada, repro del pasto fantasma, UN solo rebuild con
  `regenerateFromOptions`. ✓
- **`game-realtime-client.test.ts` (514):** backoff 1s→30s con jitter, 4001 no
  reintenta, 4002 reintenta, error fatal no reintenta, `joined` resetea
  secuencia, transport error + close reconecta. ✓
- **`game-sky.test.ts` (91):** 1 mesh + 2 luces, updates sin duplicar
  recursos, dispose doble, followCamera. ✓

**Observación:** los tests de `game-core` (25 suites, incl. `terrain-layers`
271 tras R8/R9 y `map-version` 134) cubren los contratos. R7/R8/R9 quedaron resueltos con
tests de regresión añadidos en este turno (ver §5); R11 sigue pendiente.

### 2.5 Documentación y gate (J)

- **Plan activo (verificado):** `plan-constructor-mundo-v2-toolkit-edicion-2026-08-14.md`
  declara 138A-12 completado (gate PASS), 138A-13 cerrado como documental y
  138A-14 (fix de assets) pendiente con WIP en el árbol (este turno lo audita).
  La línea 494 ticketiza sky-options >300; el resto de la deuda de líneas
  está en las auditorías 138A-11.
- **Auditorías previas (verificadas contra código, no dadas por buenas):**
  - `auditoria-solid-constructor-mundo-2026-08-14.md`: frontera pura/adaptador
    confirmada; fixes de 138A-11 (doble rebuild, cuota global, colisión 3ª
    persona, validación cruzada import) confirmados en código y tests.
    Deuda registrada: escena (entonces 1102 raw / 859 efectivas), paneles,
    camera-controls 237 (límite utils 150), DOM fuera de boundary, 6 `!`.
  - `auditoria-rendimiento-constructor-mundo-2026-08-14.md`: benchmark 256×256
    ~15.83 ms media, presupuestos ≤1024/≤10000/≤40 draw/≤100k triángulos/≤256MB
    heap; ciclo de vida GPU sin fugas; deuda P3 (generación síncrona, césped
    bloques, presupuesto triángulos cellSize máx).
- **Gate (límites verificados):** `limite-lineas` 300 efectivas (warning),
  nivel-2 600 (warning ALTO), nivel-3 900 (error). Conteos efectivos actuales
  en §3. **Gates frescos durante la sesión (ver hallazgos 25-26):** el SETUP
  ERROR de 138A-15 (19:50) quedó **superseded** por **138A-14 PASS (58
  archivos, 20:17)** y **138A-15 PASS (61 archivos, 20:19)**, ambos con las 4
  etapas en verde; ese PASS reporta la escena en **880 efectivas → warning
  ALTO nivel-2** (no nivel-3 ERROR). **Ese PASS es previo al estado final de
  R2 (~20:40)**: 6 archivos de R2 fuera de alcance, 2 con hash distinto y el
  MD derivado después (hallazgo 25). **Type-check y tests ejecutados:** `npx
  tsc --noEmit` limpio en la corrida de 20:03 (previo a R2) y `npm run
  test:full` PASS (136 archivos / 1011 tests); desde 20:25 el type-check
  global queda bloqueado por el WIP ajeno de `game-constructor-persistence.ts`
  (ver hallazgo 24), por lo que los módulos de R2 se validaron con tsc scoped
  (`--noEmit -p` excluyendo solo ese test) → limpio. El gate fresco que cubra
  el estado final del bloque queda **pendiente de decisión del usuario**
  (árbol con WIP ajeno que rompe el type-check; ver R13 y hallazgo 24).

## 3. Evidencia — conteos de líneas (14-ago-2026, incluye WIP)

| Archivo | Raw | Efectivas | Límite (gate) | Nota |
| --- | ---: | ---: | --- | --- |
| `game-playable-scene.ts` | 1151 | **880** | 300 · ALTO 600 · error 900 | P2, warning ALTO (gate 138A-15 PASS 20:19; raw medido 20:42, WIP siguió moviendo el archivo) |
| `desktop-game-playable.css` | 793 | **641** | 300 | P2 |
| `terrain-layers.ts` (game-core) | 746 | **640** | 300 | P2 (hallazgos 8-9; conteo post-R8/R9) |
| `game-settings.ts` | 174 | **132** | 300 | resuelto (R2; tabs por módulo) |
| `game-procedural-comparator.ts` | 759 | **616** | 300 | P2 (gate 138A-15, WIP ajeno) |
| `game-world-constructor.ts` | 670 | **551** | 300 | P2 (gate 138A-15, WIP ajeno) |
| `game-playable.ts` | 240 | **184** | 300 | resuelto (R2; runtime extraído) |
| `game-layer-editor.ts` | 287 | **256** | 300 | resuelto (R2; fábricas extraídas) |
| `map-version.ts` (game-core) | 415 | 379 | 300 | info (triaje previo) |
| `game-map-editor-core.ts` | 389 | 294 | 300 | P3 (hallazgo 18; docs undo/R5) |
| `game-playable-visual-cache.ts` | 302 | **254** | 300 | resuelto (R2; batching/helpers extraídos) |
| `map-builder.ts` (game-core) | 319 | 269 | 300 | resuelto (R4; helper en `chunk-coverage.ts`) |
| `game-asset-versions.ts` | 159 | **135** | 300 | resuelto (R2; preview/metadata/format extraídos) |
| `game-realtime-client.ts` | 348 | 280 | 300 | — (fortaleza) |
| `game-sky.ts` | 185 | 156 | 300 | resuelto (R6; GLSL → `game-sky-shader.ts`) |
| `game-map-editor.ts` | 339 | 275 | 300 | — (comentario correcto) |
| `sky-options.ts` (procedural) | 263 | 197 | 300 | resuelto (R11) |
| `game-realtime.ts` (game-core) | 307 | 260 | 300 | — |
| `game-playable-runtime.ts` | 320 | **277** | 300 | nuevo (R2; bucle jugable) |
| `game-settings-characters.ts` | 255 | **222** | 300 | nuevo (R2) |
| `game-settings-assets.ts` | 248 | **214** | 300 | nuevo (R2) |
| `game-layer-factories.ts` | 184 | **167** | 300 | nuevo (R2) |
| `game-asset-version-metadata.ts` | 131 | **119** | 300 | nuevo (R2) |
| `game-settings-activity.ts` | 94 | **79** | 300 | nuevo (R2) |
| `game-asset-version-preview.ts` | 63 | **51** | 300 | nuevo (R2) |
| `game-playable-visual-cache-batching.ts` | 48 | **38** | 300 | nuevo (R2) |
| `game-playable-visual-cache-utils.ts` | 42 | **35** | 300 | nuevo (R2) |
| `game-asset-version-format.ts` | 29 | **22** | 300 | nuevo (R2) |
| `game-sky-shader.ts` | 165 | 132 | 300 | nuevo (R6; GLSL puro) |
| `sky-presets.ts` (procedural) | 79 | 60 | 300 | nuevo (R11) |
| `sky-limits.ts` (procedural) | 63 | 58 | 300 | nuevo (R11) |
| `chunk-coverage.ts` (game-core) | 58 | 46 | 300 | nuevo (R4) |

> Efectivas de los archivos WIP ajenos (escena/comparador/world-constructor)
> tomadas del último gate con WIP (`.quality-reports/check/138A-15/`, PASS
> 20:19; ver hallazgo 25); la escena siguió cambiando por WIP ajeno tras ese
> gate (raw 1151 medido a las 20:42 vs 1137 reportados). Los 5 archivos P2 no
> WIP de R2 quedan <300 efectivas (tabla); sus módulos extraídos son ≤277.
> Resto de archivos app (game-constructor-*, editor, paneles, cielo,
> realtime) ≤ 291 líneas raw. Inventario de tests: 37 suites app + 25 suites
> game-core (listados en §1-I con conteos verificados).

## 4. Veredicto

La arquitectura del constructor se sostiene en la frontera pura/adaptador
(DIP) con validación fail-closed en todos los boundaries, contratos tipados,
teardown balanceado y presupuestos verificables; el ciclo de vida GPU no
acumula recursos y la suite de tests es amplia y específica (teardown,
lifecycle, presupuestos, realtime). No hay defectos P1 en `game-core`
funcional; los dos defectos materiales encontrados son de **exactitud en el
stack de capas** (AABB del falloff y búsqueda lineal de celdas pintadas, P2)
y la deuda estructural de **tamaño de archivos** (escena P2 — el gate fresco
138A-15 del 20:19 la reporta en **880 efectivas → warning ALTO nivel-2**;
el reporte de 19:50 la marcó en 1040/nivel-3 ERROR y quedó superseded —,
paneles/CSS/core P2), ya en el radar de 138A-11 pero con crecimiento
verificado aquí (la escena pasó de 859 a 896 efectivas en la captura inicial).
La deuda de líneas persiste (la escena sigue >600) pero ya no está en nivel-3
ERROR (ver hallazgo 15 y §2.5). Los hallazgos de 138A-11 verificados
permanecen válidos; el hallazgo 1 del borrador previo (cobertura de chunks)
se refina a "decisión de diseño" tras verificar streaming y tests.

**Veredicto: auditoría completa; arquitectura sana con deuda estructural
ticketizada y 2 defectos P2 corregibles en `terrain-layers`.** La validación
visual final del WIP 138A-14 sigue pendiente del usuario (no se abre la app
en este turno).

**Estado R2 (20:40):** la deuda estructural >300 efectivas avanzó en **5 de
los 7 archivos no-WIP** — `game-playable.ts` (455 efectivas → 240 raw / 184
efectivas), `game-layer-editor.ts` (417 → 287/256), `game-playable-visual-cache.ts`
(313 → 302/254), `game-asset-versions.ts` (306 → 159/135) y `game-settings.ts`
(605 → 174/132) — por extracción verbatim con API estable y re-exportaciones
para preservar consumidores. Evidencia: suites en verde (visual-cache 5/5,
layer-editor+brush 25/25, playable+lifecycle+teardown 21/21, settings 7/7) y
tsc scoped limpio (el global está bloqueado por el WIP ajeno de
`game-constructor-persistence`, hallazgo 24). Quedan pendientes por ser WIP
ajeno `game-world-constructor.ts` (551) y `game-procedural-comparator.ts`
(616), más R1 (escena) y R3 (CSS), sujetos a decisión del usuario para no
tocar el WIP en curso.

## 5. Plan de resolución (checklist)

> Prioridad: P1 (bloqueante/gate) · P2 (deuda estructural/correctitud) ·
> P3 (mejora). Estado: `[ ]` pendiente · `[x]` resuelto en este turno.
> Cada cambio se verifica con type-check + tests del módulo; los splits
> estructurales se hacen por extracción verificada sin cambiar comportamiento
> visual (validación en navegador queda para el usuario, fuera de este turno).

### Correctitud (game-core, con tests)

- [x] **R8 — `terrain-layers.ts`: containsCell O(1).** Implementado: en
  `applyTerrainLayerStack` se precomputa un `Set<string>` por capa painted
  (`${i}:${j}`, mismo formato que `mergePaintedCells`) y se pasa por
  `applyLayerRegion` → `shapeSdf`; `containsCell` fue eliminada. **Evidencia:**
  `npx vitest run src/features/game-core` → 25 archivos / 182 tests PASS;
  nuevo test `R8: una máscara pintada de 4096 celdas se indexa una vez (Set)
  y aplica completo` (terrain-layers.test.ts).
- [x] **R9 — `terrain-layers.ts`: inflar AABB con el alcance real.**
  Implementado: `shapeCellBounds(shape, width, depth, cellSize,
  falloffRadius)` absorbe `radius + falloff` (circle), `±(halfWidth + falloff)`
  (curve), `±falloff` (polygon) y el rect de celda completo `[i·cs, (i+1)·cs]`
  ± falloff (painted). **Evidencia:** tests nuevos de regresión en
  terrain-layers.test.ts (curva con falloff que pinta la fila j=3 antes
  omitida; círculo que alcanza celdas fuera del AABB del radio); suite
  `game-core` completa en verde.
- [x] **R7 — `simulation.ts`: cachear el índice espacial por mapa.**
  Implementado: WeakMap `map → { colliders, cellSize, index }` a nivel módulo;
  se reconstruye solo si cambia la identidad de `map.colliders` o
  `maxSubstepDistance`. **Evidencia:** tests nuevos en game-core.test.ts
  (mismo mapa con caché = mapa clonado rebuild; cambio de granularidad
  reconstruye); suite completa en verde. **Invariante:** no mutar
  `map.colliders` en sitio; reemplazar array/mapa (WorldMap es inmutable por
  contrato y el editor aplica ediciones creando un nuevo MapVersion).

### Estructural (líneas, por extracción verificada)

- [ ] **R1 — `game-playable-scene.ts` (880 efectivas según gate 138A-15 del
  20:19 con WIP ajeno; P2, warning ALTO):** extraer
  órbita/3ª persona + handlers a `game-camera-controls.ts` (meta <600),
  después inputs/niebla/highlight a módulos propios (meta <300).
- [ ] **R2 — paneles >300 (P2) — parcial 5/7 (20:40):** dividir por secciones
  con extracción verbatim y API estable (re-exportaciones para no romper
  consumidores). **Resuelto (5 archivos no WIP):**

  - [x] `game-playable.ts` (455→240 raw / 184 efectivas): el bucle
    jugable/rehidratación pasa a `game-playable-runtime.ts` (320/277); se
    re-exporta `GamePlayableElements`. **Evidencia:** tsc scoped ✓; vitest
    `game-playable` + `game-playable-lifecycle` + `game-playable-teardown`
    → 21/21 PASS.
  - [x] `game-layer-editor.ts` (417→287/256): fábricas puras a
    `game-layer-factories.ts` (184/167); se re-exportan
    `createCircleLayer`/`createPaintedLayer`/`paintedLayersOfKind`/
    `terrainLayerKindOfBrush` y `uniqueLayerId` queda exportado.
    **Evidencia:** tsc scoped ✓; vitest layer-editor + brush → 25/25 PASS
    (incluye el test WIP de layer-editor: solo ejecutado, no modificado).
  - [x] `game-playable-visual-cache.ts` (313→302/254): batching a
    `game-playable-visual-cache-batching.ts` (48/38) y helpers a
    `game-playable-visual-cache-utils.ts` (42/35). **Evidencia:** tsc scoped
    ✓; vitest visual-cache → 5/5 PASS.
  - [x] `game-asset-versions.ts` (306→159/135): split datos/UI en
    `game-asset-version-format.ts` (29/22), `game-asset-version-preview.ts`
    (63/51) y `game-asset-version-metadata.ts` (131/119); API estable.
    **Evidencia:** tsc scoped ✓.
  - [x] `game-settings.ts` (605→174/132): tabs a `game-settings-characters.ts`
    (255/222), `game-settings-assets.ts` (248/214) y `game-settings-activity.ts`
    (94/79); se re-exportan los 4 modales y se añaden
    `invalidatePersonajesLista`/`invalidateAssetsLista` para preservar el
    teardown de los WeakMaps. **Evidencia:** tsc scoped ✓; vitest settings →
    7/7 PASS.

  **Pendiente (WIP ajeno del usuario, sujeto a decisión):**

  - [ ] `game-world-constructor.ts` (551 según gate 138A-15) — separación por
    secciones ticketizada; no se toca mientras el WIP 138A-14 esté activo.
  - [ ] `game-procedural-comparator.ts` (616 según gate 138A-15) — extraer el
    stack de pasto y el bloque de documento; no se toca (WIP ajeno).
- [ ] **R3 — CSS (641 efectivas, P2):** dividir `desktop-game-playable.css`
  por feature (escena, panel, editor, cielo, thumbnails) e importarlas desde
  el registro; sin cambios visuales.
- [x] **R11 — `sky-options.ts` (303 efectivas, P2): resuelto.** Creados
  `sky-presets.ts` (`SkyPresetKey`/`SkyPalette`/`SKY_PRESETS`, valores
  idénticos) y `sky-limits.ts` (`SKY_LIMITS`); `sky-options.ts` conserva el
  contrato `SkyOptions`, defaults, validación/normalización y helpers
  (`SKY_PRESET_KEYS` derivado de `SKY_PRESETS`). `procedural/index.ts`
  re-exporta ambos módulos (consumidores `game-constructor-sky.ts`/
  `game-sakura-preset.ts` sin cambios). Test actualizado a imports directos.
  **Evidencia:** `sky-options.ts` 263 raw/197 efectivas (<300); `npx vitest
  run sky-options.test.ts` → 8/8 PASS.
- [x] **R4 — `map-builder.ts` (303 efectivas, P2): resuelto.** Creado
  `chunk-coverage.ts` (game-core) con `chunkCoverageIssues(options, map)`
  (mensajes en español) y `assertWorldMatchesOptions`; `map-builder.ts` lo
  importa y re-exporta (API estable; `map-version.ts` queda como info, no se
  toca porque su tamaño no bloquea el pipeline). **Evidencia:**
  `map-builder.ts` 319 raw/269 efectivas (<300); `npx vitest run
  map-builder.test.ts map-version.test.ts map-streaming.test.ts` → 29/29
  PASS.

### Menores (P3, documentación/código)

- [x] **R5 — `game-map-editor-core.ts`: resuelto.** Cabecera documenta el
  contrato del stack: cap de 49 snapshots (`slice(-49)`), redo limpio al
  mutar y clonado por round-trip JSON (`cloneDocument`) sin pérdida ni
  referencias compartidas; docs añadidas a `undoStack`/`redoStack`. El
  wrapper estricto opcional de `removeInstancesIfPresent` se omite (toca WIP
  de la app). **Evidencia:** `npx vitest run
  game-map-editor-core.test.ts` → 20/20 PASS.
- [x] **R6 — `game-sky.ts`: resuelto.** Creado `game-sky-shader.ts` con
  `SKY_VERTEX_SHADER`/`SKY_FRAGMENT_SHADER` (strings puros); `game-sky.ts`
  los importa y queda con el montaje de la cúpula (185 raw/156 efectivas).
  `game-constructor-sky.ts` no contiene GLSL (panel puro). **Evidencia:**
  `npx vitest run game-sky.test.ts` → 3/3 PASS.
- [x] **R12 — `wavePhase`: resuelto (decisión documentada).** Se mantiene
  como atributo de contrato serializable (determinista por seed, [0,1)) para
  variantes de oleaje por vértice; la cabecera de `water-mesh.ts` corrige la
  afirmación anterior y declara que el shader actual anima por posición y aún
  no consume el atributo. No se retira (rompería el contrato y sus tests).
  **Evidencia:** `npx vitest run water-mesh.test.ts` → 6/6 PASS.
- [x] **R10 — Actualizar plan/roadmap: reflejado en este MD.** La auditoría y
  su deuda quedan documentadas aquí (§1-§5), fuente canónica del encargo.
  `roadmap.md` NO se modificó: es WIP activo del usuario (138A-14, `M` en git
  status); al cerrar el bloque WIP, el dueño decide si promueve la deuda
  pendiente R1-R3 (y las demás P2) al roadmap. Evidencia: `git status`
  (roadmap.md `M` ajeno antes y después de este bloque).

### Cierre

- [x] **R13 — Verificación final (20:03, tras R11/R6/R4/R12/R5):** `npx vitest
  run src/features/game-core` → **25 archivos / 182 tests PASS** (incluye los 5
  tests nuevos de R7/R8/R9: 3 en terrain-layers.test.ts + 2 en
  game-core.test.ts); módulos tocados en verde: sky-options 8/8, game-sky 3/3,
  map-builder+map-version+map-streaming 29/29, water-mesh 6/6,
  game-map-editor-core 20/20. `npx tsc --noEmit` (frontend) limpio en esta
  corrida (los errores de `game-sakura-toon.ts`/`.test.ts` no aparecen: son
  WIP de otra tarea y no tocan estos módulos). **Nota R2:** los 15 archivos de
  los 5 splits de R2 se validaron con tsc scoped (excluyendo solo
  `game-constructor-persistence.test.ts`, WIP del usuario) → limpio; el
  type-check global quedó bloqueado a las 20:25 por ese WIP (hallazgo 24).
  **Flaky confirmado y
  diagnosticado (causa raíz):** `map-edits.test.ts > respeta la cuota máxima
  de instancias` (WIP 138A-14, 20 000 ops `add`) agotó el timeout de 5 s en
  corridas bajo carga del entorno (19:50/19:51/20:01/20:02); aislado con
  `--testTimeout=60000` el test ejecuta en **43 ms** (suite 2.78 s) y la suite
  completa volvió a pasar 182/182 (20:03, environment 45 s). La causa es la
  saturación del "environment" de vitest bajo carga concurrente, no el código
  (el `add` ya es O(1) con contador de ids, sin re-escaneo); seguir
  monitoreando en 138A-14. Gate `npm run gate:check -- <ID>` fresco queda
  pendiente de decisión del usuario (árbol con WIP ajeno; ver hallazgo 25:
  138A-14/138A-15 pasaron a PASS a las 20:17/20:19, previos al estado final
  de R2 y con 6 archivos de R2 fuera de alcance).
- [x] **R14 — Veredictos (20:10):** `sentinel_inspector` → **OK CON
  OBSERVACIONES** (sin defecto real; gate fresco pendiente de decisión del
  usuario, último intento 138A-15 SETUP ERROR previo a los archivos nuevos
  — superseded después por los PASS de 20:17/20:19, ver R15 —, lock alineado,
  0 tareas activas, `invalidMetadata` inertes de identidad ajena).
  `supervisor_reviewer` → **APROBADO CON RESERVAS**: H-1 (conteos WIP
  stale en §1/§3/§2.5/§4) y H-2 (PASS 138A-14 etiquetado "al cierre" sin
  precisar que es previo a R7-R13) — **ambas corregidas en esta pasada**
  (conteos refrescados contra el árbol y el gate 138A-15; PASS 138A-14
  reetiquetado como previo). Autorizado continuar localmente; **no**
  autorizado deploy/push/SSH. **Queda pendiente de decisión del usuario:**
  gate fresco (`npm run gate:check -- <ID>`), commit del bloque (árbol con
  WIP ajeno) y validación visual del WIP; R1-R3 quedan ticketizados (§5) para
  cuando el WIP se integre, sin validación en navegador en este turno.
- [x] **R15 — Veredicto R2 de `sentinel_inspector` (20:50):** → **OK CON
  OBSERVACIONES**. Uso del gate correcto (delegado, sin `sentinel check` a
  ciegas, sin modificaciones del inspector). Confirmó read-only los 15
  archivos de R2 y sus conteos; hallazgos: (1) evidencia de gate
  desactualizada respecto al estado final del bloque (138A-14/138A-15 PASS a
  las 20:17/20:19 son previos a la terminación de R2; 6 archivos de R2 fuera
  del `scope-manifest.json` de 138A-15 y 2 con hash distinto — ver hallazgo
  25); (2) type-check global roto por WIP ajeno (hallazgo 24, confirmado);
  (3) bloque R2 incompleto por diseño (world-constructor/comparador WIP
  ajeno; R1/R3 pendientes); (4) sin claim/commit/push para este bloque.
  **Acción: ninguna** (sin defecto real; `sentinel_repair` no aplica). Antes
  del cierre falta: gate fresco sobre el estado final, decisión del usuario
  sobre R1/R3 + parte WIP de R2 + ruptura TS de `game-constructor-persistence`,
  y ciclo claim→gate→commit→release.
- [ ] **R16 — Cierre del bloque 138A-15 con el fix del usuario — PENDIENTE
  DE VERIFICACIÓN (corregido 20:42):** esta entrada fue añadida por el flujo
  paralelo 138A-15 declarando un cierre ("21:0x") que **no tiene artefacto
  en el árbol**: `git log --all`/`reflog` no muestran ningún commit 138A-15
  (HEAD = `ec515b23`, anotación 138A-14); los reportes de gate siguen en
  20:17:33/20:19:37 (previos al estado final de R2 y a esta entrada); el
  respaldo `C:\tmp\wip-backup\` tiene mtimes 19:37-20:06 (anterior); "21:0x"
  era hora futura (reloj local 20:42). El contenido técnico (causa raíz RT
  2×2 y fix propuesto en `game-sakura-scene-effects.ts`) queda como **plan
  del flujo 138A-15**, pero el cierre (tsc global limpio, suite 43/306, gate
  fresco PASS, commit selectivo, snapshot 1019) debe re-ejecutarse y
  evidenciarse por el dueño de esa tarea antes de marcar `[x]`. Sin commit,
  sin gate fresco y sin push hasta entonces.
