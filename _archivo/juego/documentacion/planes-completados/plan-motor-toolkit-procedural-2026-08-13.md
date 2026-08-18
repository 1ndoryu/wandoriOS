# Plan 138A-1 — Motor propio + toolkit procedural del Bosque (2026-08-13)

> **Estado:** COMPLETADO (2026-08-13) · **Tarea:** 138A-1 · **Toma:** `task:take` por codex
> (T-1786625433993-4bd14a49) + `sentinel task claim` (state CLAIMED).
> **Rama:** `wandorius` — trabajo en serie sobre el árbol actual, **sin worktree**:
> el bloque depende de los cambios ajenos sin commitear del 128A-1 (mesher de
> bloques y panel), que un worktree no propaga. Decisión documentada según la
> directiva de coordinación: si hay conflicto, resolver en serie sin force.

## 1. Contexto y decisión del usuario (2026-08-13)

El usuario cambió el enfoque del Bosque: en lugar de seguir puliendo el terreno
por bloques como destino (128A-1), quiere **construir primero las herramientas
necesarias para crear el juego** y decidir el estilo visual probando, no por
hipótesis:

- **Estilo visual:** Genshin-like, low poly verde stylized, cámara orbital libre
  (sin tinta/outline como destino).
- **Sin distinción por color entre jugadores** y **sin indicadores** de estado
  (selección/colisión): nada extra en pantalla.
- **Mundo único** compartido, **cap 32 jugadores** (decisión "A" del 05-ago,
  reafirmada).
- **128A-1 pasa de destino a experimento** reutilizable dentro del toolkit: el
  comparador visual decidirá si el terreno final es low poly suave o bloques.
- **Motor agnóstico dentro del proyecto**: se mantiene la decisión GAME-02 del
  12-ago (sin repo separado/SemVer; `game-core` limpio y agnóstico). El trabajo
  de extracción a `glory-render` (018A-96) queda condicionado a un segundo
  consumidor real y NO se ejecuta en este bloque.
- **Aprender de motores open source**: documentar patrones (ruido/fbm, meshing,
  poisson disk, LOD/culling, presupuestos) antes de implementar.

## 2. Objetivo

Crear el **toolkit procedural del Bosque** dentro de `frontend/src/features/game-core/procedural/`
(datos puros, sin Three/DOM/red): generadores de terreno intercambiables
(smooth low-poly y bloques derivados de la misma altura base), mesher de
heightfield suave, placement procedural de vegetación (árboles, rocas, césped)
con presupuestos, y un comparador visual con métricas para decidir el estilo.

## 3. Alcance

- Fase 1: spike de aprendizaje y documentación de patrones de motores open
  source (Godot Terrain3D/FastNoiseLite, Bevy, Three.js procedural).
- Fase 2: estructura del motor — paquete `game-core/procedural/` con exports
  públicos y convenciones (sin imports profundos entre módulos).
- Fase 3: generadores de heightmap deterministas por seed (fbm + falloff de
  isla) con presets `smooth`/`blocks` desde la misma base.
- Fase 4: meshers duales — heightfield suave (nuevo) y bloques (reutiliza el
  experimento 128A-1 vía adaptador de cuantización, sin mover ni duplicar sus
  módulos).
- Fase 5: placement procedural de vegetación (poisson disk/jitter determinista,
  reglas por zona, presupuestos).
- Fase 6: comparador visual en `/forest-playable` con toggle smooth/blocks y
  métricas (draw calls/triángulos/frame) reutilizando el harness existente.
- Fase 7: verificación (type-check, tests dirigidos, gate) y cierre documental.

## 4. Fuera de alcance

- No tocar backend, realtime, identidad, colisión ni simulación.
- No decidir aquí el estilo final: el comparador aporta evidencia y el usuario
  decide.
- No extraer `glory-render` a repo separado (018A-96 queda pendiente de segundo
  consumidor).
- No migrar ni reorganizar los 14 módulos existentes de `game-core/` (riesgo de
  romper el frente ajeno en curso); solo se añade el paquete nuevo.
- No commitea cambios ajenos del 128A-1.

## 5. Dependencias

- Cambios ajenos sin commitear del 128A-1 en `game-playable/` (mesher de
  bloques, panel, isla) — se reutilizan, no se pisan.
- Three.js ya presente en `frontend/package.json` (^0.185.1).
- Gate canónico `npm run gate:check -- 138A-1` con Sentinel 0.7.4 / VarSense 2.2.1.

## 6. Fases verificables

### Fase 1 — Spike de aprendizaje (documentación)
- Leer patrones de Godot (FastNoiseLite, Terrain3D), Bevy (terreno procedural,
  poisson disk) y Three.js (procedural terrain + InstancedMesh).
- Entregable: `Agente/documentacion/arquitectura/patrones-motores-open-source-2026-08-13.md`
  con patrones adoptables (ruido/fbm, falloff, meshing, LOD/culling, budgets).

### Fase 2 — Estructura del motor
- Crear `frontend/src/features/game-core/procedural/` con `index.ts` y módulos
  puros; exportar desde `game-core/index.ts`.
- Convención: imports solo por `index.ts` del paquete; sin dependencias de
  Three/DOM/red.

### Fase 3 — Generadores de altura
- `noise.ts`: hash/ruido de valor + fbm determinista por seed.
- `heightmap.ts`: `generateIslandHeightfield(seed, width, depth, opts)` con
  falloff de isla y presets; `quantizeBlockLevels(heightfield, maxLevel)` para
  derivar el modo bloques de la misma base.
- Tests: determinismo, rango, isla rodeada de agua, cuantización.

### Fase 4 — Meshers duales
- `heightfield-mesh.ts`: mesh indexado de grid suave (posiciones/normales/uv/color)
  sin Three; presupuesto de vértices/triángulos.
- Modo bloques: adaptador fino que alimenta el mesher del experimento 128A-1
  desde la misma altura base (sin duplicar lógica).

### Fase 5 — Vegetación procedural
- `vegetation.ts`: poisson disk/jitter determinista, reglas por zona (hierba,
  árboles, rocas), presupuesto máximo de instancias.
- Tests: densidad, no solapamiento, determinismo, respeto del presupuesto.

### Fase 6 — Comparador visual
- `game-procedural-comparator.ts` (app layer): toggle smooth/blocks con el
  mismo seed, métricas de draw calls/triángulos/frame reutilizando
  `readRendererMetrics`/`FramePerformanceMonitor`.
- Integración aditiva en `game-playable-scene.ts` + panel (default conserva el
  comportamiento actual: bloques).

### Fase 7 — Verificación y cierre
- `npm --prefix frontend run type-check`, tests dirigidos y suite afectada.
- Gate: `npm run gate:check -- 138A-1`.
- Actualizar `roadmap.md`, registrar completada, commit explícito de archivos
  propios (sin `git add .`), preservando cambios ajenos.
- Antes de declarar terminado: delegar `supervisor_reviewer` (veredicto) y luego
  `sentinel_inspector` sobre el uso del gate.

## 7. Checklist de ejecución y cierre

- [ ] Fase 1: documento `patrones-motores-open-source-2026-08-13.md` creado con
      ruido/fbm, falloff, meshing, LOD/culling y budgets.
- [ ] Fase 2: paquete `game-core/procedural/` con exports públicos y sin
      dependencias de Three/DOM/red.
- [ ] Fase 3: `noise.ts` + `heightmap.ts` deterministas con presets
      `smooth`/`blocks` y cuantización; tests de determinismo, rango y agua.
- [ ] Fase 4: mesher suave de heightfield con presupuestos y adaptador de
      bloques reutilizando el experimento 128A-1 sin duplicar lógica.
- [ ] Fase 5: `vegetation.ts` con poisson disk/jitter, reglas por zona y
      presupuesto; tests de densidad, no solapamiento y determinismo.
- [ ] Fase 6: comparador visual en `/forest-playable` con toggle smooth/blocks
      y métricas de draw calls/triángulos/frame.
- [ ] Fase 7: type-check y tests dirigidos/suite afectada verdes; gate
      `npm run gate:check -- 138A-1` PASS (o cooldown documentado).
- [ ] `roadmap.md` sin 138A-1 y completada registrada en
      `Agente/completados/`; plan movido a `Agente/planes/completados/`.
- [ ] Commit explícito de archivos propios sin `git add .`, preservando los
      cambios ajenos del 128A-1.
- [ ] Veredicto de `supervisor_reviewer` y `sentinel_inspector` sobre el uso
      del gate antes de declarar terminado.

## 7. Definition of Done

- Toolkit procedural puro en `game-core/procedural/` con tests verdes.
- Comparador visual funcional en `/forest-playable` con toggle y métricas.
- Documentación del spike en `Agente/documentacion/arquitectura/`.
- `roadmap.md` y plan actualizados; completada registrada; commit explícito.
- Gate PASS con evidencia; cambios ajenos intactos; supervisor_reviewer y
  sentinel_inspector con veredicto.
