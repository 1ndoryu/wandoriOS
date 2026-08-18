# Auditoría Fase 0 — Inventario y frontera de `glory-render`

> **Fecha:** 2026-08-05 · **Epic:** GAME-02 · **Plan:** `Agente/planes/plan-glory-render-motor-juegos-2026-08-01.md`
> **ADR:** `Agente/documentacion/arquitectura/adr-glory-render-repositorio-agnostico-2026-08-01.md`
> **Objetivo:** clasificar cada módulo de `frontend/src/features/game-core/` (núcleo agnóstico,
> adaptador Three, integración OS, dominio Bosque o backend) y registrar la API pública actual,
> invariantes, límites y dependencias transitivas, sin mover código todavía.

## Resumen ejecutivo

- **15 archivos fuente** en `frontend/src/features/game-core/` (14 módulos + `index.ts`; verificado mecánicamente el 05-ago: sin imports de three/DOM/red/backend, sin imports fuera del paquete, sin ciclos) más 10 archivos de tests (~2 760 líneas incluyendo tests).
- **14 módulos son núcleo agnóstico** (sin DOM, Three, red ni backend): candidatos directos a `glory-render/core`.
- **1 módulo es frontera de realtime**: contrato puro v1 (sin transporte) — candidato a `core`, con semántica de salas que se revisa.
- **0 módulos dependen de Three.js** dentro de `game-core/` (los adaptadores visuales viven fuera: `game-playable-scene.ts`, `game-map-editor-*.ts`, `game-asset-preview.ts`).
- **0 módulos del core conocen identidad/secretos/analytics del OS** — pasa la auditoría de seguridad de la Frontera 0.
- La extracción **no se ejecuta todavía**: falta un segundo consumidor real (criterio de no extracción del plan) y la aprobación del ADR/inventario.

## Clasificación por módulo

Leyenda: **CORE** = núcleo agnóstico (glory-render/core) · **THREE** = adaptador de renderer (glory-render/three) · **OS** = integración con el shell · **BOSQUE** = dominio del juego (wandori.us) · **BACKEND** = contrato server-side.

| Módulo | Líneas (src) | Clasificación | Justificación |
| --- | --- | --- | --- |
| `contracts.ts` | ~50 | CORE | Tipos puros del mundo lógico X/Z: Vector2, MapBounds, colliders, WorldMap, WorldState, snapshots. Sin dependencias. |
| `limits.ts` | ~20 | CORE | Presupuestos del núcleo (velocidad, delta, substep). Sin dependencias. |
| `map-validation.ts` | ~200 | CORE | Validación fail-closed de WorldMap. Solo importa `contracts`/`limits`. |
| `spatial-hash.ts` | ~60 | CORE | Índice espacial determinista de colliders estáticos. Solo `contracts`. |
| `collision.ts` | ~80 | CORE | Movimiento de círculo contra bounds/colliders (moveCircle). Solo `contracts`/`spatial-hash`. |
| `camera-frame.ts` | ~40 | CORE | Transformación de input relativo a cámara orbital (matemática pura, sin Three ni DOM). |
| `simulation.ts` | ~180 | CORE | Tick determinista server-authoritative (world state + inputs → estado). Solo `contracts`/`collision`/`spatial-hash`/`limits`/`map-validation`. |
| `interpolation.ts` | ~40 | CORE | Interpolación pura de snapshots. Solo `contracts`. |
| `map-version.ts` | ~330 | CORE | Contrato de mapa publicado + validación completa (`validateMapVersion`, `assertValidMapVersion`, `mapVersionToWorldMap`). Solo `contracts`/`map-validation`. |
| `map-streaming-contracts.ts` | ~60 | CORE | Límites/contratos del streaming lógico (chunks visibles/cacheados, instancias). Solo `contracts`/`map-version`. |
| `map-streaming.ts` | ~180 | CORE | Streaming lógico acotado (índice de MapVersion validado, eviction). Sin DOM/Three/red. |
| `terrain-mesh.ts` | ~85 | CORE | Datos puros de malla para un TerrainChunk (vértices/índices), sin importar Three; el adaptador visual los sube a GPU. |
| `performance-monitor.ts` | ~80 | CORE | Ventana acotada de muestras de frame; sin analytics ni DOM. |
| `game-realtime.ts` | ~260 | CORE (frontera) | Contrato puro de realtime v1: parseo/validación/serialización de mensajes y límites, **sin WebSocket**. El concepto de "sala"/"ticket" es semántica de Bosque que se documenta como contrato de red, no identidad. |
| `game-core.test.ts` | — | CORE | Vectores de simulación/colisión/streaming deterministas. |
| `camera-frame.test.ts` | — | CORE | Vectores de transformación de cámara. |
| `interpolation.test.ts` | — | CORE | Vectores de interpolación de snapshots. |
| `limits.test.ts` | — | CORE | Vectores de presupuestos. |
| `map-streaming.test.ts` | — | CORE | Vectores de streaming. |
| `map-version.test.ts` | — | CORE | Vectores de validación de mapa. |
| `performance-monitor.test.ts` | — | CORE | Vectores de métricas. |
| `terrain-mesh.test.ts` | — | CORE | Vectores de datos de malla. |
| `game-realtime.test.ts` | — | CORE | Vectores del contrato realtime (incluye `server_restart`, decisión 8). |
| `index.ts` | ~15 | CORE | Re-export público del paquete. |

**Ningún módulo** de `game-core/` se clasifica como THREE, OS, BOSQUE o BACKEND en este momento:
los adaptadores Three, el lifecycle `MountedView`, el editor y el realtime transport viven fuera
(`frontend/src/features/desktop/apps/game-playable/`), y el contrato Rust es el mismo contrato
validado en paralelo (`src/models/game_realtime.rs`, `src/models/game_map.rs`).

## API pública actual (re-exports de `index.ts`)

1. `contracts`: `Vector2`, `MapBounds`, `CircleShape`, `AabbShape`, `ColliderShape`, `StaticCollider`, `WorldMap`, `PlayerState`, `WorldState`, `MoveInput`, `SimulationConfig`, `SnapshotEntity`, `WorldSnapshot`.
2. `limits`: `GAME_CORE_LIMITS`.
3. `map-validation`: `assertValidWorldMap`, `validateWorldMap`.
4. `spatial-hash`: `createColliderIndex`.
5. `collision`: `moveCircle`.
6. `camera-frame`: `frameInputFromCamera` (y helpers de base orbital).
7. `simulation`: `DEFAULT_SIMULATION_CONFIG`, `createWorldState`, `simulateTick`, `normalizeState`.
8. `interpolation`: `interpolateSnapshots`.
9. `map-version`: `MAP_VERSION_SCHEMA`, `MAP_VERSION_LIMITS`, tipos `AssetCategory`/`TerrainAnchor`/`GameAssetVersion`/`TerrainChunk`/`TerrainDocument`/`AssetInstance`/`SpawnPoint`/`MapVersion`/`MapValidationIssue`, `validateMapVersion`, `assertValidMapVersion`, `mapVersionToWorldMap`.
10. `map-streaming`: `createMapChunkCache`, `selectVisibleChunks`, `MAP_STREAMING_LIMITS` (y contratos asociados).
11. `terrain-mesh`: `buildTerrainMeshData`.
12. `performance-monitor`: `FramePerformanceMonitor`.
13. `game-realtime`: `GAME_REALTIME_PROTOCOL_VERSION`, `GAME_REALTIME_LIMITS`, tipos de payload/mensaje, `parseGameRealtimeClientMessage`, `validateGameRealtimeServerMessage`, `serializeGameRealtimeServerMessage`, `filterGameRealtimeSnapshot`, `assessGameRealtimeSequence`, `consumeGameRealtimeRateBudget`.

## Invariantes y límites clave

- El core **nunca importa** DOM, Three.js, WebSocket, fetch, storage, identidad, analytics ni secretos; todo input cruza validación fail-closed (claves exactas, valores finitos, cuotas).
- Números: solo `number` finito o `safe integer`; direcciones normalizadas (≤ 1 por eje); deltas acotados por `maxDeltaSeconds`; substeps acotados por `maxSubstepDistance`.
- Cuotas: `GAME_CORE_LIMITS` (velocidad, delta, substep), `MAP_VERSION_LIMITS` (assets 256, chunks 1024, instancias 10 000, spawns 64, mundo 4096), `MAP_STREAMING_LIMITS` (chunks visibles 9, cacheados 12, instancias visibles 512, assets 128), `GAME_REALTIME_LIMITS` (bytes 512/4096, players 8, msgs/s 20, salto de secuencia 1024, etc.).
- Errores: explícitos (throw con mensaje o resultado `ok/error`), nunca excepciones silenciosas; el parseo de realtime rechaza control characters igual que Rust (`char::is_control`).
- Serialización estable: mensajes realtime con envelope `{v, type, payload}` y `deny_unknown_fields` equivalente; snapshots con `snapshotSequence` para orden.

## Dependencias transitivas (dirigidas)

```
game-core/
  contracts.ts ← (base, sin dependencias)
  limits.ts ← (base)
  map-validation.ts → contracts, limits
  spatial-hash.ts → contracts
  collision.ts → contracts, spatial-hash
  camera-frame.ts → contracts
  simulation.ts → contracts, collision, spatial-hash, limits, map-validation
  interpolation.ts → contracts
  map-version.ts → contracts, map-validation
  map-streaming-contracts.ts → contracts, map-version
  map-streaming.ts → map-streaming-contracts, map-version, contracts
  terrain-mesh.ts → contracts, map-version (tipos)
  performance-monitor.ts → (base)
  game-realtime.ts → contracts (Vector2)
  index.ts → todos
```

No hay ciclos. `contracts`/`limits` son la base; todo lo demás apunta hacia ellos (DIP limpio).

## Duplicación probable en un segundo juego (sin abstraer todavía)

- Simulación + colisión + spatial hash: cualquier juego top-down o arena (ej. recolector 2D) los reutiliza tal cual.
- Interpolación de snapshots y orden por secuencia: patrón server-authoritative universal.
- Streaming acotado de mundo (chunks visibles/cacheados): aplicable a cualquier mundo por trozos.
- Presupuestos y validación fail-closed: receta de contrato reutilizable.
- **No se extrae nada** hasta tener el segundo caso real (criterio del plan: "no se abstrae solo porque podría servir").

## Semántica que permanece en Bosque (no entra al motor)

- Editor de mapa 2D y preview 3D (`game-map-editor-*.ts`), catálogo de assets/personajes, perfil y auditoría.
- Adaptador Three de la escena (`game-playable-scene.ts`), cámara orbital con drag/pinch y materiales por tono.
- Realtime transport (`game-realtime-client.ts`), tickets/sesiones, sala única del mundo, migración coordinada (decisión 8), banner de reinicio.
- Integración `MountedView`/WindowManager, comandos del toolbar, configuración y paneles admin.
- Contrato server-side Rust (mismo esquema, validado en paralelo).

## Gate de la Frontera 0

- [x] Auditoría de `game-core/` con clasificación por módulo (este documento).
- [ ] Registrar API pública, invariantes, errores, límites y dependencias transitivas — hecho en las secciones anteriores; falta review.
- [ ] Identificar duplicación probable sin extraer — hecho (sección anterior).
- [ ] Elegir integración inicial (submódulo fijado + dependencia local) — **pendiente de decisión**, no bloquea.
- [ ] Política de licencias, versionado, changelog, CI, gate y propietarios — **pendiente**, se define al crear el repo (Fase 1).
- Auditoría de cierre (SOLID/rendimiento/escala/seguridad/observabilidad): SOLID ✓ (sin ciclos, DIP base); seguridad ✓ (sin identidad/secretos en el core); rendimiento/escala/observabilidad se miden con el segundo consumidor.

**Estado:** inventario completado; la extracción queda pendiente de segundo caso real y decisión de integración (no mover código todavía).
