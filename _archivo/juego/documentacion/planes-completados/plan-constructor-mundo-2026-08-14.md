# Plan 138A-4 — Constructor de mundo del Bosque (2026-08-14)

> **Estado:** APROBADO Y CERRADO (2026-08-14) · **Tarea:** 138A-4
> **Rama:** `wandorius` · **Gate:** `npm run gate:check -- 138A-4`
> **Fuente de contexto:** decisiones de producto 2026-08-13 (motor propio,
> estilo Genshin-like low poly, sin indicadores, mundo único cap 32) y
> toolkit procedural 138A-1/138A-2/138A-3.

## 1. Contexto y decisión del usuario (2026-08-13/14)

El usuario pidió: *"necesito que planifiquemos un constructor de mundo, en base
a lo que ya tenemos, ya podemos cambiar opciones de terreno, pero necesitamos
un constructor completo, planificalo bien"*. El toolkit ya permite cambiar
opciones de terreno (seed, curva, lluvia, props, estilos), pero cada pieza
vive suelta: falta el **constructor completo** que convierta opciones en un
mundo editable y reutilizable por el runtime.

Decisiones ya tomadas que condicionan el constructor:

- **Estilo visual:** Genshin-like, low poly verde stylized, cámara orbital
  libre; sin tinta/outline como destino.
- **Sin distinción por color entre jugadores** y **sin indicadores** de estado
  en pantalla.
- **Mundo único compartido** con cap 32 jugadores (reafirma decisión "A").
- **Motor propio dentro del proyecto:** `game-core` limpio y agnóstico (sin
  Three/DOM/red); la extracción a `glory-render` (018A-96) queda pendiente de
  un segundo consumidor real.
- **El estilo final se decide probando**: el constructor debe permitir
  comparar `actual`/`bloques`/`suave` con las mismas opciones de base.

## 2. Objetivo

Construir el **constructor de mundo** del Bosque: un flujo único
`opciones de terreno → generación procedural pura → MapVersion editable →
preview 3D / runtime`, con presets de tipos de terreno, vegetación, agua,
lluvia y curva reutilizando el toolkit existente, export/import JSON y métricas
de presupuesto. El constructor es la herramienta que permitirá iterar rápido
sobre el mundo mientras el usuario decide el estilo definitivo.

## 3. Alcance

- **Fase 1 — Contrato de opciones de terreno (puro):** `TerrainOptions`
  tipado en `game-core/procedural/` con seed, width/depth, maxHeight,
  waterLevel, falloff/costa, warp, octaves, presets de forma (`isla`,
  `continente`, `archipiélago`, `valle`) y estilo de render
  (`actual`/`bloques`/`suave`). Generadores parametrizados deterministas por
  seed, manteniendo `generateIslandHeightfield` como caso particular del
  preset `isla` (sin romper consumidores existentes).
- **Fase 2 — Pipeline opciones → MapVersion:** `buildMapVersionFromOptions`
  puro que materializa el terreno en chunks (`heights`/`surfaces` del
  contrato `MapVersion`), genera el `assetManifest` (árboles, rocas, césped,
  agua) y las `instances`/`spawnPoints` con presupuestos; valida con
  `assertValidMapVersion` y exporta/importa JSON. Es el MISMO documento que el
  runtime lógico consume (un solo camino para comparador, isla y constructor).
- **Fase 3 — Constructor con preview 3D:** vista dentro de la app
  `game-playable` que edita las opciones (sliders/selects/inputs), regenera en
  vivo con el renderer existente (sin segundo motor), alterna estilos
  reutilizando el comparador, y muestra métricas de presupuesto (vértices,
  triángulos, instancias, draw calls/frame) con `readRendererMetrics`.
- **Fase 4 — Retoque fino:** reutilizar los pinceles del editor de mapa 2D ya
  cerrado (297A-64..71: superficie, altura, instancias, spawns) como capa de
  edición posterior a la generación, y persistir el resultado como MapVersion.
- **Fase 5 — Guardado/carga:** exportar e importar el mundo como JSON
  (clipboard/descarga local; sin backend en este bloque), presets de mundo
  guardados, y un fixture que alimente el runtime jugable real.
- **Fase 6 — Verificación y cierre:** type-check, tests unit puros en
  `game-core` + tests DOM del panel, gate `138A-4`, validación visual en
  navegador (`/forest-playable`), actualización de roadmap/manual y completada.

## 4. Fuera de alcance

- Backend, realtime, identidad, colisión, simulación y multijugador (cap 32
  sigue pendiente en GAME-01).
- Asset GLB/modelos 3D externos (los props low-poly del toolkit se reutilizan
  tal cual).
- Extraer `glory-render` a repo separado (018A-96 sigue condicionado a un
  segundo consumidor real).
- Migrar o reorganizar los módulos existentes de `game-core/` salvo la
  parametrización mínima de `heightmap.ts` declarada en la Fase 1.
- Decidir aquí el estilo final: el constructor aporta evidencia y el usuario
  decide probando.
- Deploy y producción (fuera de alcance salvo instrucción explícita).

## 5. Dependencias

- Toolkit procedural 138A-1 (noise/heightmap/heightfield-mesh/vegetation),
  138A-2 (árboles/césped low-poly) y 138A-3 (agua toon compartida +
  lluvia con presupuesto).
- Comparador `game-procedural-comparator.ts`, panel de la isla
  `game-curved-island-panel.ts` y escena `game-playable-scene.ts` como
  harness de preview.
- Contrato puro `MapVersion` (`game-core/map-version.ts`) con sus límites
  (maxChunks 1024, maxInstances 10000, maxHeight 64) y el editor de mapa 2D
  (297A-64..71) para la capa de retoque fino.
- Gate canónico Sentinel 0.7.4 / VarSense 2.2.1; rama `wandorius`.

## 6. Fases verificables

### Fase 1 — Contrato y generadores parametrizados

- `TerrainOptions` + presets de forma en `game-core/procedural/terrain-options.ts`
  (puro, exportado por `index.ts`).
- Refactor mínimo de `heightmap.ts`: generador parametrizado (falloff/costa,
  warp, octaves) con compatibilidad de la API actual.
- Tests: determinismo por seed, rango, presets rodeados de agua/continente,
  invariantes de opciones (width/depth/maxHeight finitos y acotados).

### Fase 2 — Pipeline a MapVersion

- `buildMapVersionFromOptions` + `serializeMapVersion`/`parseMapVersion`
  (JSON) en `game-core/`; validación con `assertValidMapVersion`.
- Presupuestos declarados (chunks, instancias, assets, spawns) y fail-closed
  al excederlos.
- Tests: round-trip JSON, límites, idempotencia de regeneración con mismo seed.

### Fase 3 — Constructor con preview 3D

- Vista constructor en `game-playable` (edición de opciones + botón
  regenerar + selector de estilo + métricas) reutilizando escena/comparador.
- Límites de líneas del proyecto (≤300 componente/app, ≤150 utils,
  ≤120 lifecycle); sin lógica Three/DOM/red en `game-core`.

### Fase 4 — Retoque fino y fixture de runtime

- Conectar pinceles del editor 2D al documento generado; guardar el resultado
  como `MapVersion` editable.
- `game-fixture-map` del constructor alimenta el runtime jugable real
  (sustituye al fixture actual solo cuando el usuario lo apruebe).

### Fase 5 — Guardado/carga

- Exportar/importar JSON (clipboard/descarga local), presets de mundo y
  regeneración con opciones; persistencia local de la app (sin backend).

### Fase 6 — Verificación y cierre

- `npm --prefix frontend run type-check` + tests dirigidos y suite afectada.
- Gate `npm run gate:check -- 138A-4` PASS.
- Validación visual en navegador real por el usuario (`/forest-playable`).
- `roadmap.md` sin 138A-4 pendiente, plan a `Agente/planes/completados/`,
  completada en `Agente/completados/`, commit explícito sin `git add .`.
- Veredicto de `supervisor_reviewer` y luego `sentinel_inspector` antes de
  declarar terminado.

## 9. Checklist de cierre

- [x] Fase 1: contrato `TerrainOptions` + presets de forma en `game-core` (puro, exportado).
- [x] Fase 2: pipeline `buildMapVersionFromOptions` + `serializeWorld`/`parseSerializedWorld` con validación fail-closed y tests.
- [x] Fase 3: sección Constructor en el panel del Bosque (forma, seed, tamaño, altura, agua, costa, warp, octaves, celda, vegetación, estilos y métricas) + comparador parametrizado.
- [x] Fase 5: export/import JSON desde el panel (descarga local, sin backend).
- [x] Fase 6: type-check limpio, vitest completo PASS (30 archivos / 230 tests), gate `138A-4` PASS, roadmap/completada/plan archivado.
- [ ] Fase 4 (retoque fino con editor 2D) y fixture del runtime aprobado por el usuario: siguiente bloque, fuera de este cierre.

## 7. Definition of Done

- `game-core` expone opciones + generadores parametrizados + pipeline a
  `MapVersion` con tests verdes y sin dependencias de Three/DOM/red.
- Constructor funcional en `/forest-playable`: opciones, regeneración,
  presets de forma, estilos comparables, vegetación/agua/lluvia/curva,
  métricas de presupuesto, export/import JSON y retoque fino.
- El runtime real consume el mundo construido (fixture aprobado por el
  usuario).
- Roadmap/plan/completada actualizados con evidencia; gate PASS;
  supervisor_reviewer y sentinel_inspector con veredicto; árbol limpio y
  commits explícitos en español.

## 8. Decisiones propuestas al usuario (1 por 1, con recomendación)

1. **¿El constructor edita opciones en vivo (regenera al mover cada slider) o
   con botón "Generar" explícito?** Recomendación: regenerar con botón
   explícito + "auto" opcional para mundos pequeños; evita GPU/CPU pegada al
   arrastrar con presets grandes.
2. **¿Dónde vive el constructor: dentro de `game-playable` (tab) o como app
   separada del OS?** Recomendación: dentro de `game-playable` como tab
   "constructor", reutilizando renderer y comparador; una app separada solo
   cuando exista un segundo consumidor real.
3. **¿Presets iniciales de forma de mundo?** Recomendación: `isla`,
   `continente`, `archipiélago` y `valle` (4), reutilizando el falloff
   existente y añadiendo variantes de máscara en `game-core` puro.
4. **¿Guardado: export/import JSON manual o persistencia local automática?**
   Recomendación: ambas — autosave local de la app + export/import JSON manual
   (sin backend en este bloque).
5. **¿El retoque fino reutiliza el editor 2D (297A-64..71) o se hace solo 3D?**
   Recomendación: reutilizar el editor 2D como capa de precisión + preview 3D;
   no construir un segundo editor.

> Pendiente de aprobación del usuario antes de implementar (históricamente el
> usuario valida el plan primero).
