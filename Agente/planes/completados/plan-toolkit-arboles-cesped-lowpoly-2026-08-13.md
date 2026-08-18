# Plan 138A-2 — Toolkit procedural: árboles low-poly y césped por matas

> **Fecha:** 2026-08-13 · **Estado:** COMPLETADO · **Rama:** wandorius

## 1. Objetivo

Ampliar el toolkit procedural (138A-1) con **generadores de malla deterministas
para árboles low-poly (tronco cónico + ramas + copa por clusters) y césped por
matas de briznas**, y que el comparador de `/forest-playable` use ese detalle en
el modo `suave` para que el usuario pruebe el estilo Genshin-like con evidencia
visual, no por hipótesis.

## 2. Límites

- Datos puros en `frontend/src/features/game-core/procedural/`: sin Three/DOM/red;
  misma convención que 138A-1 (imports solo por `index.ts` del paquete hacia
  fuera, relativos dentro).
- No se toca el experimento 128A-1 ni `game-playable-scene.ts` (archivo con
  hunks ajenos sin commitear); el comparador ya está commiteado y es seguro
  editarlo.
- Módulos ≤150 líneas (límite de utils); si un generador lo excede, se divide.
- Sin repo separado ni SemVer (decisión GAME-02, 12-ago): vive en `game-core`.

## 3. Dependencias

- 138A-1 (toolkit procedural) — completado y commiteado.
- `noise.ts` (hash2), `vegetation.ts` (placements), `vegetation-mesh.ts`
  (paleta y helpers de malla).

## 4. Fases verificables

### Fase 1 — `tree-mesh.ts`
- `buildTreeMeshData(seed, options)` en espacio local (base en y=0): tronco
  cónico de 4 caras, 2 anillos de ramas (3 por anillo, ángulo determinista) y
  copa por clusters (cima + tips de ramas), con paleta del toolkit.
- Reutiliza helpers exportados de `vegetation-mesh.ts` (pushQuad/pushBox/rgb)
  para no duplicar lógica; hash determinista compartido (`hash01` en `noise.ts`).

### Fase 2 — `grass-mesh.ts`
- `buildGrassClumpMeshData(seed, options)`: mata de N briznas (default 7, máx
  24) en anillo con jitter, cada brizna de 2 quads cruzados con doblado
  determinista; paleta del toolkit.

### Fase 3 — `vegetation-lowpoly.ts` + limpieza de hash
- `buildLowPolyVegetationMeshData(placements, palette)`: árboles y césped con
  los nuevos generadores; rocas conservan la caja toon (sin duplicar código).
- `noise.ts` exporta `hash01` (hash para coordenadas fraccionarias) y
  `vegetation-mesh.ts` deja de duplicar su hash local (hallazgo de la revisión
  de 138A-1).

### Fase 4 — Comparador
- `game-procedural-comparator.ts`: el modo `suave` usa
  `buildLowPolyVegetationMeshData` (mismo seed, mismas métricas de stats).
- Exports públicos del paquete en `procedural/index.ts`.

### Fase 5 — Verificación y cierre
- Tests nuevos: determinismo, invariantes de mesh (counts, índices en rango,
  valores finitos), presupuestos y traducción de placements.
- `npm --prefix frontend run type-check` + vitest dirigido (procedural +
  game-playable) + suite afectada.
- Gate: `npm run gate:check -- 138A-2` (PASS o cooldown documentado).
- Roadmap/completada actualizados; commit explícito de archivos propios (sin
  `git add .`); plan movido a `Agente/planes/completados/`.
- Revisión: `supervisor_reviewer` (veredicto) y `sentinel_inspector` (uso del
  gate) antes de declarar terminado.

## 5. Definition of Done

- Módulos puros con tests verdes y type-check limpio.
- Comparador con vegetación low-poly (árboles + césped) en modo suave.
- Gate PASS con evidencia; cambios ajenos intactos; claims liberados.
- Roadmap, completada y plan archivado actualizados; commit explícito.

## 6. Checklist de ejecución

- [x] Fase 1: `tree-mesh.ts` con tronco cónico, ramas y copa por clusters.
- [x] Fase 2: `grass-mesh.ts` con matas de briznas y doblado determinista.
- [x] Fase 3: `vegetation-lowpoly.ts` + exports en `procedural/index.ts`.
- [x] Fase 4: comparador en modo `suave` con vegetación low-poly.
- [x] Tests nuevos (tree-mesh, grass-mesh, vegetation-lowpoly) y type-check.
- [ ] Gate `138A-2` PASS y cierre documental (roadmap/completada/plan archivado).
- [ ] Revisión delegada y claims liberados.
