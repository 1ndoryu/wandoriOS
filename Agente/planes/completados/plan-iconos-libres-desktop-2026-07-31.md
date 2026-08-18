# Plan — Iconos libres del escritorio (297A-20)

> **Fecha:** 2026-07-31
> **Estado:** en planificación; arranca tras aprobación del roadmap.
> **Alcance:** escritorio desktop/tablet (≥768px). Móvil conserva el launcher con `mobileOrder`; no aplica posiciones libres.
> **Fuente:** roadmap 297A-20; overlay por manual de arquitectura §6.1; modelo `GridPosition` ya definido en types.ts.

## Objetivo y límites

Permitir que el usuario arrastre cualquier icono del escritorio a una celda libre de la cuadrícula (snap-grid de 88px, token `--sistema-icono-celda`), con su posición persistida en el overlay personal. El admin publica una disposición base (release) y cada visitante la personaliza sin afectar a otros ni al release público.

**Límites:**
- No es coordenada continua x/y: el OS es snap-grid (coherente con Macintosh 1984 y los tokens).
- Móvil (<768px) no usa posiciones: sigue el orden del launcher.
- El drag existente (reordenar / soltar en carpeta o papelera) no se rompe.
- `mobileOrder` no se contamina con las posiciones desktop (plan maestro §10).

## Estado actual (hallazgos)

- `GridPosition {col,row}` existe en `WorkspaceNode.position`, poblado en `default-release.ts`, mergeado en `merge.ts` y con `moveNodePosition()` en `overlay-mutations.ts`. **Ningún renderizador lo consume.**
- El grid usa CSS auto-flow (`desktop-shell.css` `.desktop-icon-grid`), ordenado por `mobileOrder`.
- El drag (`icon-drag.ts`) hoy solo reordena (`onReorder` → `reorderWorkspaceNodes` → escribe `mobileOrder`).
- La persistencia del overlay (`fieldOverrides`, incluida `position`) ya funciona en `localStorage` y `publishWorkspace()` serializa `position`.

## Fases y checklist

### 1. Contrato de render

- [ ] Decidir resolución de posición: `release.position ?? overlay.position` (el merge ya lo produce) y fallback a auto-flow cuando no hay posición.
- [ ] Decidir que el drag desktop escribe `position` (no `mobileOrder`); el reorder accesible móvil sigue escribiendo `mobileOrder`.

**Gate:** sin cambio de contrato de datos; solo consumo de un campo existente.

### 2. Render por posición

- [ ] `workspace-icon-grid.ts`: emitir `grid-column/grid-row` (o `left/top`) desde `position {col,row}` cuando exista.
- [ ] `desktop-shell.css`: grid explícito de N columnas fijas (celda 88px) para desktop; conservar auto-flow como fallback y el responsive actual.
- [ ] `desktop-responsive.css`: tablet (≥768) conserva el grid posicionado; ≤768 sin cambios (launcher).

**Gate:** type-check + revisión visual en desktop y tablet.

### 3. Drag a celda libre

- [ ] `icon-drag.ts`: al soltar sobre el grid, calcular celda destino (división por tamaño de celda) y llamar a `moveNodePosition()`; mantener el umbral de 6px (click ≠ drag) y el drop a carpeta/papelera.
- [ ] No romper `onReorder` (usado por móvil) — separar ruta desktop vs móvil si hace falta.

**Gate:** drag mueve iconos a celdas, click abre la app, drop a papelera sigue funcionando.

### 4. Colisiones y reencuadre

- [ ] Resolución de colisiones: si la celda destino está ocupada, desplazar el ocupado a la siguiente celda libre (patrón clásico), sin dejar huecos raros ni perder nodos.
- [ ] Reencuadre: al cambiar resolución/breakpoint, los iconos fuera del área visible se recolocan en la celda libre más cercana (referencia `clampWindowBounds`).

**Gate:** sin iconos superpuestos ni fuera del área tras resize.

### 5. Persistencia y publicación

- [ ] Verificar que `moveNodePosition` persiste en `fieldOverrides` (localStorage) y que `publishWorkspace()` publica `position` al release.
- [ ] Flujo: admin ordena → publica → invitado carga la disposición → invitado mueve → queda en su overlay → release intacto.
- [ ] Probar recarga, rebase ante release nuevo y que lo nuevo agregado por admin aparece para usuarios con overlay (por diseño del diff, ya debe funcionar).

**Gate:** prueba manual de los 4 pasos del flujo + recarga.

### 6. Validación

- [ ] Tests unitarios: merge de `position`, colisión, snap, y que `mobileOrder` no cambia al mover en desktop.
- [ ] `npm run type-check`, tests frontend y `npm run task:check -- 297A-20`.
- [ ] Validación visual en navegador: desktop y tablet, arrastre, click, papelera, recarga y publicación.

**Gate:** quality gate PASS + evidencia visual.

## Definition of Done

- [ ] El usuario arrastra iconos a cualquier celda del escritorio y la posición sobrevive a la recarga.
- [ ] El admin publica una disposición y la vista pública la carga; cada visitante personaliza sin afectar a otros.
- [ ] Lo nuevo publicado por el admin aparece para usuarios con estado personalizado.
- [ ] Móvil sigue usando el launcher/`mobileOrder` sin regresiones.
- [ ] Roadmap, completados, manual visual y quality gate sincronizados.

## Archivos previstos

- `frontend/src/features/desktop/workspace-icon-grid.ts`
- `frontend/src/features/desktop/utils/icon-drag.ts` (+ `icon-reorder.ts` si aplica)
- `frontend/src/features/runtime/workspace/overlay-mutations.ts` (revisar `moveNodePosition`)
- `frontend/src/styles/desktop/desktop-shell.css`, `desktop-responsive.css`
- Tests: `merge.test.ts` y nuevos de colisión/snap
