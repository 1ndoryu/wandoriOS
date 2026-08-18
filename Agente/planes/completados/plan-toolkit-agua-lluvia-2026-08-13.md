# Plan 138A-3 — Toolkit de agua y lluvia + split de la isla curva (2026-08-13)

> **Estado:** COMPLETADO · **Tarea:** 138A-3 · **Toma:** `task:take` por codex.
> **Rama:** `wandorius` — trabajo en serie sobre el árbol actual, **sin worktree**:
> el working tree contiene cambios ajenos sin commitear (roadmap y planes
> cancelados) que un worktree no propaga; se preservan y no se commitean.

## 1. Contexto y decisión del usuario (2026-08-13)

El enfoque del Bosque es construir **herramientas/motor propio** para iterar
rápido y decidir el estilo visual probando (138A-1: toolkit procedural;
138A-2: árboles low-poly y césped por matas; 128A-1: experimento de bloques
reutilizable). La referencia visual aprobada (Curved Island) incluye **agua,
lluvia, bending y niebla**, y el revisor del cierre 128A-1 declaró una deuda:
`game-curved-island.ts` (399 líneas) excede el límite de 300 y mezcla
terreno/agua/shore/lluvia → dividir en `game-curved-water.ts` +
`game-curved-rain.ts`.

Este bloque:

- Lleva el **agua (mesh + shore/espuma) y la lluvia (streaks deterministas)**
  al toolkit procedural como datos puros, igual que el resto del paquete.
- **Saldar la deuda** del split de `game-curved-island.ts` usando esos
  generadores desde los adaptadores Three de la capa app.
- Hace que el **comparador** (`/forest-playable`) muestre el MISMO agua real
  (costa con espuma, niebla) en ambos modos `bloques`/`suave`, para que el
  usuario compare estilos 1:1 con la referencia visual.

## 2. Objetivo

Ampliar `frontend/src/features/game-core/procedural/` con generadores puros de
agua y lluvia (deterministas, con presupuestos y validación fail-closed),
refactorizar la isla curva en tres módulos delgados (terreno/highlight,
agua, lluvia) y conectar el agua compartida al comparador sin cambiar la
gramática visual actual (mismo shader de costa y misma lluvia).

## 3. Alcance

- Fase 1: **`water-mesh.ts`** (toolkit, datos puros): `buildWaterMeshData(opts)`
  genera grid indexado en el plano XZ (posiciones y=0, uvs, índices con
  orientación cara-arriba idéntica al `PlaneGeometry` rotado actual y phase de
  onda por vértice determinista vía `hash2`). Validaciones de ancho/profundo/
  segmentos (1..256) y presupuesto de vértices/triángulos.
- Fase 1: **`rain-mesh.ts`** (toolkit, datos puros): `buildRainStreakData(opts)`
  genera streaks deterministas (ángulo, radio con raíz cuadrada, phase y
  longitud por gota) con presupuesto máximo; sustituye los `Math.random()` del
  builder actual.
- Fase 2: **`game-curved-water.ts`** (app): extrae `buildShoreTexture` (mask
  tierra/océano desenfocada), el ShaderMaterial de costa actual y el mesh desde
  `buildWaterMeshData`; expone `setShore(landMask)`, `update(t)` (sincroniza
  niebla del scene), `setVisible` y `dispose`. ≤300 líneas.
- Fase 2: **`game-curved-rain.ts`** (app): extrae el rig de lluvia actual
  usando `buildRainStreakData`; expone `setAnchor/setTime/setAmount/setVisible/
  dispose`. ≤300 líneas.
- Fase 2: **`game-curved-island.ts`** refactorizado: delega agua/lluvia a los
  nuevos módulos, `regenerate()` refresca la shore, y baja de 399 a ≤300
  líneas. Sin cambio de comportamiento visual.
- Fase 3: **`game-procedural-comparator.ts`**: el agua toon plana se sustituye
  por `mountCurvedWater` compartida (misma shore/espuma/niebla en ambos modos);
  `regenerate` refresca la shore desde el heightfield y `update` anima el agua.
- Fase 4: verificación (type-check, tests dirigidos, suite afectada, gate,
  navegador) y cierre documental con veredictos de revisor.

## 4. Fuera de alcance

- No tocar backend, realtime, identidad, colisión ni simulación.
- No decidir aquí el estilo final (sigue el comparador + usuario).
- No migrar los módulos existentes de `game-core/procedural/` (solo se añaden
  `water-mesh` y `rain-mesh` y se exportan).
- No cambiar el shader de agua/lluvia ni las métricas del comparador: la
  refactorización debe ser visualmente neutra.
- Los cambios ajenos sin commitear (roadmap, planes cancelados) se preservan
  durante el bloque; por instrucción del usuario (13-ago) se commitean y
  pushean en el cierre, sin barrerlos en el commit de implementación.

## 5. Dependencias

- Toolkit 138A-1/138A-2 ya cerrado (`noise.ts` con `hash2`, convenciones de
  validación y tests).
- Experimentos 128A-1 sin commitear en `game-playable/` (isla curva, panel,
  comparador) — se reutilizan, no se pisan.
- Three.js ya presente; `WORLD_BEND_PARS`/`WorldBend` de `game-world-bend.ts`.
- Gate canónico `npm run gate:check -- 138A-3` con Sentinel 0.7.4 / VarSense
  2.2.1 y `GLORY_AGENT_ID=codex`.

## 6. Fases verificables

### Fase 1 — Toolkit de agua y lluvia (datos puros)
- `water-mesh.ts`: `buildWaterMeshData({ width, depth, segmentsX?, segmentsZ?,
  seed? })` → `{ positions, uvs, indices, wavePhase, vertexCount,
  triangleCount }`; orientación de índices con normal +Y; phase en [0,1) por
  vértice; validaciones fail-closed.
- `rain-mesh.ts`: `buildRainStreakData({ count, area, span, seed?, length?,
  speed? })` → `{ positions, random, count, area, span, speed }`; radio con
  raíz cuadrada, phase en [0, span), presupuesto máximo 4096.
- Exports en `procedural/index.ts`.
- Tests: determinismo, dimensiones/grid, rango, presupuesto, errores.

### Fase 2 — Split de la isla curva (deuda 128A-1)
- `game-curved-water.ts`: shore mask (tierra/océano + blur 3 pasadas), shader
  de costa (deep/shallow/foam/niebla), mesh desde `buildWaterMeshData`
  (segmentos 120×80 actuales), `setShore`, `update`, `setVisible`, `dispose`.
- `game-curved-rain.ts`: streaks desde `buildRainStreakData` (1100 gotas,
  área 26, span 21, top 15), shader actual, `setAnchor/setTime/setAmount`.
- `game-curved-island.ts`: importa ambos rigs, elimina builders inline,
  `regenerate` refresca shore, `setRain/setVisible/dispose` delegan; ≤300
  líneas; sin cambio visual.

### Fase 3 — Comparador con agua 1:1
- Sustituir el agua toon estática por `mountCurvedWater` (misma costa/espuma/
  niebla en `bloques` y `suave`); shore desde `heights >= waterLevel`;
  `update(t)` anima el agua; `dispose` libera.

### Fase 4 — Verificación y cierre
- `npm --prefix frontend run type-check`; vitest procedural + suite
  `game-playable`; gate `npm run gate:check -- 138A-3`.
- Validación en navegador real `/forest-playable` (dev server propio + stub
  API) con capturas en ambos modos; verificar agua/lluvia/split sin regresiones.
- `roadmap.md` actualizado (entrada 138A-3; queda sin commitear junto a edits
  ajenos), completada en `Agente/completados/tareas-2026-08-13.md`, plan a
  `Agente/planes/completados/`.
- Commit explícito de implementación → commit docs de cierre → commit
  veredictos; delegar `supervisor_reviewer` y `sentinel_inspector` antes de
  declarar terminado; liberar claims de ambas capas.

## 7. Checklist de ejecución y cierre

- [x] Fase 1: `water-mesh.ts` + `rain-mesh.ts` con validaciones y exports.
- [x] Fase 1: tests de determinismo, rango, presupuesto y errores verdes.
- [x] Fase 2: `game-curved-water.ts` y `game-curved-rain.ts` (≤300 líneas c/u).
- [x] Fase 2: `game-curved-island.ts` ≤300 líneas, delegando agua/lluvia.
- [x] Fase 3: comparador usa `mountCurvedWater` en ambos modos.
- [x] Fase 4: type-check y vitest (procedural + game-playable) verdes.
- [x] Fase 4: gate `npm run gate:check -- 138A-3` PASS.
- [x] Fase 4: navegador `/forest-playable` abierto por el usuario para probar
      (captura automatizada no disponible: el runtime node_repl no ejecuta).
- [x] Fase 4: completada registrada, plan a completados, roadmap actualizado.
- [x] Fase 4: commits explícitos (implementación → docs → edits ajenos) sin
      `git add .`; por instrucción del usuario, los edits ajenos pendientes se
      commitean y pushean.
- [x] Fase 4: veredictos `supervisor_reviewer` y `sentinel_inspector`; claims
      liberados en ambas capas.

## 8. Definition of Done

- Toolkit ampliado con agua/lluvia puros, deterministas y con tests.
- Isla curva dividida en terreno/agua/lluvia (ningún módulo >300 líneas) sin
  regresión visual.
- Comparador con el mismo agua real en ambos modos para decidir estilo 1:1.
- type-check, tests y gate PASS; navegador abierto por el usuario.
- Completada + plan archivado + roadmap con entrada cerrada de 138A-3 (el
  analyzer docs exige conservar el taskId); commits explícitos;
  veredictos de revisor registrados y claims liberados.
