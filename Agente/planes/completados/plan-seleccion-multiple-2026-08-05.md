# Plan — Selección múltiple con mouse en escritorio y Finder (058A-4)

- **Fecha:** 2026-08-05
- **Estado:** completado (archivado 2026-08-05; evidencia en `Agente/completados/tareas-2026-08-05.md`)
- **Tarea:** 058A-4
- **Siguiente paso:** cerrado — fases 1-4 implementadas y validadas (stack + navegador desktop/móvil)

## Objetivo

Permitir seleccionar varios objetos en el escritorio y el Finder con el mouse,
estilo Windows: Ctrl/Shift+clic, rubber band (arrastrar rectángulo desde el
fondo) y drag/operaciones sobre la selección múltiple. Sin regresión en la
presentación móvil (<768) ni en el flujo actual de un solo clic.

## Límites

- Solo interacción con mouse; la selección por teclado (flechas/Shift+flechas)
  queda fuera de alcance.
- No se cambia el modelo de datos: `SelectionState` ya existe en
  `selection-store.ts` (`selectSingle`/`toggleSelect`/`extendSelect`/
  `clearSelection`/`selectBackground`/`isSelected`/`getSelectedIds`).
- La fuente de verdad de la selección es el store; el feedback provisional de la
  banda se aplica como clase CSS sin tocar el store hasta soltar.

## Dependencias

- `selection-store.ts` — infraestructura de multi-selección ya implementada.
- `overlay-mutations.ts` — `moveNodesPosition` batch para drag de grupo.
- `clipboard.ts` — copy/cut ya multi (targets[]).
- `openContextMenu` — ya acepta `targets[]`.

## Fases

### Fase 1 — Estado de selección compartido + Ctrl/Shift+clic (escritorio y Finder)

- [x] `workspace-icon-grid.ts`: importar `toggleSelect`, `extendSelect`,
      `getSelectedIds`; mousedown con `ctrlKey||metaKey` → toggleSelect,
      `shiftKey` → extendSelect(idsInOrder), else selectSingle.
- [x] `finder-preview.ts`: mismo patrón en `createFinderItem` mousedown.
- [x] `finder-preview.ts`: refactor de rendimiento — mantener
      `Map<nodeId, HTMLElement>` de ítems; la suscripción de `selectionStore`
      aplica/remueve `--selected` sobre elementos existentes (nada de re-render
      completo por cambio de selección).
- [x] `workspace-icon-grid.ts`: el suscriptor existente ya re-aplica selección
      sin reconstruir — verificar que sigue funcionando con `toggleSelect`.

**Gate fase 1:** tsc + vitest de selection-store + navegador (Ctrl/Shift+clic en
escritorio y Finder).

### Fase 2 — Rubber band (arrastrar rectángulo)

- [x] Crear `frontend/src/features/desktop/utils/selection-band.ts`:
      `enableSelectionBand({ container, getItems, onApply, additiveKey })`
      con función pura `computeBandHits(bandRect, items)` para tests.
      Banda con clase `.desktop-selection-band`, feedback provisional
      `--banded` en ítems intersectados, `onApply(ids, additive)` al soltar.
- [x] `workspace-icon-grid.ts`: reemplazar el mousedown de fondo
      (`clearSelection`) por la banda (clic sin arrastre = limpiar).
- [x] `finder-preview.ts`: añadir mousedown de fondo del grid → banda
      (aditiva con Ctrl).
- [x] CSS: `.desktop-selection-band` + `.desktop-icon--banded` /
      `.desktop-finder__item--banded` con tokens del sistema en
      `desktop-shell.css`; `position: relative` en `.desktop-finder__grid`.

**Gate fase 2:** tsc + tests `selection-band.test.ts` + navegador (banda en
escritorio y Finder, aditiva con Ctrl, feedback provisional).

### Fase 3 — Drag de grupo + menú contextual multi + comandos

- [x] `icon-drag.ts`: opciones `getGroupIds?` (capturada en pointerdown) y
      `onGroupDrop?` (se invoca en vez de `globalDropHandler` cuando hay grupo).
- [x] `workspace-icon-grid.ts` onPlaceCell: si `draggedId` está en una selección
      desktop multi → calcular delta del plan y aplicar `moveNodesPosition` a
      todos los seleccionados (offset relativo mantenido).
- [x] `finder-preview.ts`: `getGroupIds`/`onGroupDrop` → `moveNodeToParent` de
      todo el grupo al target de drop.
- [x] Menú contextual (escritorio y Finder): si el ítem del clic derecho ya está
      seleccionado → `targets` = todos los seleccionados; si no → selectSingle y
      target único.
- [x] `workspace-node-commands.ts`: `workspace:trash` itera todos los targets
      (confirmación única si hay carpetas; tombstoneSubtree para carpetas);
      `workspace:open` y `workspace:rename` solo con un target
      (`isAvailable` targets.length === 1).

**Gate fase 3:** tsc + tests de comandos si existen + navegador (drag de grupo
en escritorio y Finder, clic derecho sobre multi, eliminar varios).

### Fase 4 — Cierre

- [x] Validación por stack: vitest + tsc + get_errors en archivos editados.
- [x] Navegador desktop y móvil (regresión <768): selección, banda, drag de
      grupo, menú multi, doble clic del Finder sigue abriendo.
- [x] Roadmap actualizado, entrada en `Agente/completados/tareas-2026-08-05.md`,
      lección si aplica, commit `058A-4: ...` y push (sin deploy).

## Gate / criterio de salida (resumen)

- Clic simple selecciona; Ctrl+clic suma/resta; Shift+clic extiende rango.
- Banda de selección desde el fondo con feedback provisional; clic en fondo sin
  arrastre limpia la selección.
- Clic derecho sobre multi-selección abre el menú con las acciones multi.
- Arrastrar un ítem seleccionado mueve todo el grupo (escritorio mantiene el
  layout relativo en el snap-grid; Finder mueve a la carpeta destino).
- `workspace:trash` borra todos los targets; copy/cut siguen multi; paste usa el
  primer target como destino.
- Sin regresión móvil ni en el flujo de un solo clic / doble clic.

## Notas / riesgos

- El drag de grupo en el escritorio aplica un delta a las posiciones de los
  seleccionados sin resolver colisiones del grupo contra otros iconos (Windows
  tampoco lo resuelve al arrastrar un grupo sobre una rejilla snap). Queda
  documentado; la resolución de colisiones de grupo es mejora futura.
- El re-render completo del Finder ante cambios de selección es un problema de
  rendimiento real con la banda: se resuelve con actualización selectiva de
  clases (Map de ítems), nunca con `render()` por selección.
