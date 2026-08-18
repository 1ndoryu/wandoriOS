# Plan — Iconos del escritorio: grid, placeholder y rejilla de debug coherentes

> **Fecha:** 2026-08-05 · **Estado:** en curso — el usuario probó el 05-ago y **falla**; corrección pendiente (Fase 5.5)
> **Fuentes:** `frontend/src/features/desktop/workspace-icon-grid.ts`, `frontend/src/features/desktop/utils/icon-grid.ts`,
> `frontend/src/features/desktop/utils/icon-reorder.ts`, `frontend/src/features/desktop/utils/icon-drag.ts`,
> `frontend/src/features/desktop/utils/debug-grid-overlay.ts`, `frontend/src/styles/desktop/desktop-shell.css`,
> `frontend/src/styles/variables.css` (tokens `--sistema-icono-*`).

## Problema (reportado por el usuario, 05-ago)

El grid de iconos del escritorio "está mal", hay fallas, y el **placeholder** de arrastre (dónde se
va a poner el icono) junto con las **rejillas rojas de debug** (Ctrl+Shift+G) no son coherentes con
las celdas reales donde aterrizan los iconos.

**Síntoma adicional (05-ago, usuario):** "los iconos interactúan extraños cuando los juntas — se
altera todo en vez de alterarse 1 solo". Al arrastrar un icono sobre otro (o arrastrar uno con una
selección múltiple residual), el movimiento no es puntual: se desplazan varios iconos, se superponen
o el grid entero se reordena de golpe.

## Causas raíz identificadas (por código)

1. **`justify-content: space-between` horizontal no se replica.** El grid declara
   `grid-template-columns: repeat(auto-fill, 88px)` con `justify-content: space-between` y
   `direction: rtl`. Con auto-fill el eje horizontal queda lleno solo si el ancho es múltiplo
   exacto de `(88 + gap)`; si sobra espacio, `space-between` lo reparte entre columnas y **ningún
   cálculo lo replica** — `getGridMetrics` calcula `columns = floor((width + gap)/(cell + gap))` y
   `getCellAt`/`positionCellHighlight`/`debugGridOverlay` usan `col * (cellWidth + columnGap)`
   (gaps uniformes). El highlight y la rejilla roja quedan desfasados de la celda real. Solo
   `rowGapEffective` (058A-1) replica la distribución vertical; falta el equivalente horizontal
   (**`columnGapEffective`**).

2. **`direction: rtl` duplica fórmulas y es fuente de desfase.** El grid es RTL (col 0 = derecha,
   crece a la izquierda) y hay **tres implementaciones** de la geometría RTL: `getCellAt`
   (`right - x`), `positionCellHighlight` (`right - (col+1)*cell - col*gap`) y `debugGridOverlay`
   (`rect.width - (col+1)*cell - col*gap`). Ya se corrigió una vez (297A-20: "antes se restaba un
   gap de más") pero siguen siendo fórmulas paralelas propensas a divergir. La incoherencia entre
   el highlight (positionCellHighlight) y la rejilla (debugGridOverlay) indica que divergen otra vez.

3. **`cellWidth` se mide desde el primer icono, no del track.** `getGridMetrics` toma
   `cellWidth = first.getBoundingClientRect().width`, que es `--sistema-icono-celda` (88px) solo
   porque `.desktop-icon--interactive { width: var(--sistema-icono-celda) }`. Si el item cambia de
   ancho (label largo, overflow, tema), la geometría del snap-grid deja de coincidir con los tracks
   reales del CSS grid. Debería medirse el **track declarado** (`gridTemplateColumns`) o derivarse
   de `(width - (columns-1)*gap) / columns`, no del item.

4. **Rejilla de debug es "DEPURACION TEMPORAL" que quedó pegada.** `debug-grid-overlay.ts` y
   `.desktop-icon-grid--depurar`/`__debug`/`__debug-celda` (borde rojo + col,row) están marcados
   "PENDIENTE: eliminar" (297A-20) pero siguen en producción con atajo Ctrl+Shift+G. Además su
   geometría usa el mismo `col * (cellWidth + gap)` sin `columnGapEffective`, así que **la propia
   herramienta de diagnóstico miente** sobre dónde caen las celdas.

5. **Sin tests de geometría real (DOM).** `icon-grid.test.ts` solo prueba lógica pura con métricas
   mockeadas; `getGridMetrics`/`getCellAt`/`positionCellHighlight` no tienen un test con un grid
   real montado (jsdom) que fije la geometría frente a `space-between` y RTL. La falla se cuela
   porque nadie verifica "el highlight cae exactamente sobre la celda real".

6. **El drag de grupo se decide por la selección en el DROP, no por el gesto.** En
   `workspace-icon-grid.ts`, `onPlaceCell` consulta `selectionStore.get()` al soltar:
   `isGroup = source === 'desktop' && selectedIds.length > 1 && selectedIds.includes(draggedId)`.
   No captura el gesto al iniciar el pointerdown (a diferencia de `enableDrag`, que sí captura
   `groupIds` pero el escritorio no lo usa). Consecuencia: si queda una selección múltiple residual
   (banda de selección, Ctrl+clic), arrastrar UN icono mueve TODOS los seleccionados — "se altera
   todo en vez de alterarse 1 solo". Además la decisión puede cambiar entre el inicio y el drop si
   la selección cambia a mitad del gesto.

7. **El grupo no resuelve colisiones ni clampa al grid.** `buildGroupPlacementMoves` aplica el
   mismo delta a cada miembro sin resolver colisiones contra los no seleccionados (se superponen) y
   sin clampear a `metrics.columns/rows` (los miembros pueden quedar fuera de bounds y crear tracks
   implícitos — el caso documentado en 058A-1). `planPlacement` solo resuelve la colisión del
   arrastrado. Cuando el usuario encoge la ventana, `reflowPositions` reempaqueta TODOS los nodos
   posicionados en orden fila/col para arreglar overlaps/fuera-de-bounds: el "arreglo" altera todo
   el escritorio de golpe en vez de solo los iconos implicados.

## Objetivo

Un único cálculo de geometría de celdas (con `columnGapEffective` y RTL) consumido por
`getCellAt`, el highlight de arrastre y la rejilla de debug, verificado con tests DOM sobre un grid
real, y sin código de depuración visible para el usuario final.

## Fases

### Fase 1 — Unificar la geometría del grid (columnaGapEffective) ✅ cerrada (05-ago, commit)

- [x] Añadir `columnGapEffective` a `GridMetrics` replicando la distribución horizontal de
  `justify-content: space-between/around/evenly` (mismo patrón que `rowGapEffective`).
- [x] Medir `cellWidth` desde el track real: prioridad a `gridTemplateColumns` parseada
  (auto-fill → derivar track de `(width - (columns-1)*gap)/columns`), fallback al primer item.
- [x] Extraer un helper único `cellOriginAt(col, row, metrics)` (LTR y RTL) y usarlo en
  `getCellAt`, `positionCellHighlight` y `debugGridOverlay.render` (eliminar las tres fórmulas
  paralelas).
- [x] Tests DOM (jsdom): montar un grid real con `repeat(auto-fill, 88px)` + `space-between` + RTL,
  con y sin sobrante, y verificar que `getCellAt(celda real)` → `col,row` exacto y que
  `cellOriginAt` devuelve el origen del track (comparado con el rect del icono posicionado).
  `icon-grid-dom.test.ts` (9 tests; el stub de layout es la verdad de referencia en jsdom).

**Evidencia F1:** suite frontend completa 713/713, type-check limpio, reviewer sin bloqueantes.

**Gate F1:** `cellOriginAt` es la única fuente de geometría; tests DOM verdes con sobrante
horizontal y RTL. — ✅ CUMPLIDO

### Fase 2 — Coherencia del placeholder de arrastre

- [x] Tests DOM: `positionCellHighlight` (modo placement) posiciona el highlight en el origen del
  track con sobrante distribuido — cubierto en `icon-grid-dom.test.ts` (LTR y RTL, con y sin
  sobrante; el rect del highlight = celda destino real).
- [ ] Verificar en navegador que el highlight (`desktop-icon-drop-target`) cae exactamente sobre la
  celda destino al arrastrar (con y sin sobrante horizontal, desktop ≥769 y tablet).
- [ ] Ajustar el `transition: left/top` para que el placeholder no "baile" entre celdas con
  sobrante distribuido (con la geometría unificada el highlight ya no oscila; decisión: mantener
  el transition de 0.1s y validarlo en navegador).

**Gate F2:** el placeholder coincide con la celda destino en desktop y tablet; tests verdes.
(Partial: tests DOM verdes; verificación en navegador pendiente con F5.)

### Fase 3 — Interacción de grupo predecible (se altera 1 solo, o el grupo completo conscientemente) ✅ cerrada (05-ago)

- [x] Capturar el grupo al INICIO del gesto (pointerdown): `enableDrag` consulta `getGroupIds` en
  pointerdown y entrega `groupIds` a `onPlaceCell` (firma ampliada); `workspace-icon-grid.ts` pasa
  `getGroupIds: () => getSelectedIds().filter(id => isSelected(id, 'desktop'))` (solo la superficie
  escritorio, 018A-95). La decisión ya no relee la selección en el drop.
- [x] Regla Windows: `shouldGroupDrag(groupIds, draggedId)` — arrastrar un icono **seleccionado**
  mueve el grupo; arrastrar un icono **no seleccionado** (aunque quede selección residual) mueve
  solo ese y el mousedown reemplaza la selección. El clic simple sobre un seleccionado conserva la
  selección (058A-4).
- [x] Resolver colisiones del grupo: `buildGroupPlacementMoves` ahora recibe `metrics`, clampa cada
  miembro a `columns/rows` y desplaza a los ocupantes NO seleccionados a la celda libre más
  cercana (`nearestFreeCell`); nunca se superponen ni crean tracks implícitos (autogrow solo con
  grid completamente lleno, misma política que `planPlacement`).
- [x] Reflow por resize: `reflowPositions` solo devuelve moves que realmente cambian y solo corre
  cuando cambian `columns/rows`; con la geometría unificada y el grupo resuelto no reempaqueta
  todo el grid (verificado por tests preexistentes).
- [x] Tests: `icon-group-drag.test.ts` (11) — delta del grupo, clamp a bounds, desplazamiento del
  ocupante, null sin position, `planDesktopPlacement` con selección residual (se altera solo ese)
  y grupo completo, y conjunto final sin duplicados ni fuera de bounds. `planDesktopPlacement`
  extrae la decisión del `onPlaceCell` para poder testearla.

**Evidencia F3:** gate `task:check -- 018A-97` PASS (sentinel/varsense/type-check), suite completa
pendiente de CI/full (cooldown del guard).

**Gate F3:** con selección múltiple residual, arrastrar un icono no seleccionado altera solo ese;
arrastrar uno seleccionado mueve el grupo sin superposiciones ni fuera-de-bounds; reflow no
reordena todo el grid. — ✅ CUMPLIDO (validación en navegador pendiente en F5)

### Fase 4 — Rejilla de debug coherente o retirada ✅ cerrada (05-ago)

Decisión: **retirada** — es depuración temporal (297A-20) y el DoD exige sin código de depuración
en producción.

- [x] Borrar `debug-grid-overlay.ts` (commit F1) y el atajo Ctrl+Shift+G en `workspace-icon-grid.ts`
  (este bloque: se eliminó `createDebugGridOverlay`/`onKeyDown` y sus refresh en `doReflow`).
- [x] Retirar el CSS de depuración: `.desktop-icon-grid--depurar`, `.desktop-icon-grid__debug` y
  `.desktop-icon-grid__debug-celda` fuera de `desktop-shell.css` (sin `#ff0000` en producción).
- [x] VarSense sin clases huérfanas ni tokens rotos (gate PASS 0 warnings de varsense).

**Gate F4:** sin código de depuración visible en producción. — ✅ CUMPLIDO

### Fase 5 — Verificación final (parcial; pendientes de navegador/CI)

- [x] Type-check + gate `task:check -- 018A-97` PASS (local-light: sentinel/varsense/type-check).
- [x] Suite frontend completa + build: **724/724 PASS** (96 archivos) y `vite build` de producción
  OK el 05-ago (verificado localmente con `vitest run` + `vite preview` sobre el dist).
- [ ] Navegador real desktop 1440×900 y 1024×768: arrastrar iconos, soltar en celdas libres y
  ocupadas (resolución de colisión), reflow al encoger/agrandar ventana, y el placeholder cae
  sobre la celda marcada. Pendiente de sesión con viewport ≥768 (el preview de la app quedó
  fijado en 660px; la geometría ya está cubierta por los tests DOM de F1/F2).
- [x] Móvil (<768): verificado el 05-ago — el preview (660px) muestra el launcher móvil
  (región "Sistema móvil" + lista de apps), sin grid de escritorio: sin posicionamiento libre
  (el reorder por índice sigue siendo el fallback).

**Gate F5 / DoD:** grid coherente en desktop/tablet, placeholder exacto, drag de grupo predecible
(sin alterar iconos no implicados), sin rejillas rojas en producción, suite + navegador verdes.

### Fase 5.5 — Prueba real del usuario (05-ago) 🔴 NO corregido → bloque de corrección

Estado abierto el mismo 05-ago: **el usuario probó en el navegador real con el fix aplicado y el
problema persiste.** Registro textual del usuario: "lo suelto en un lugar y aparece en otro; al
acercarlo a otro se mueven varios iconos en vez de 1". El fix automatizado (F1–F4) no resolvió la
interacción real.

- [ ] Reproducir el caso reportado en un viewport desktop ≥769 (1440×900 / 1024×768): (a) arrastrar
  un icono y soltarlo para comprobar la celda final vs. el highlight; (b) acercar un icono a otro
  (o arrastrar con selección residual) y comprobar que solo se mueve el que se arrastra, sin
  reordenar varios iconos a la vez.
- [ ] Diagnosticar en vivo qué hipótesis de F1–F3 no se cumple: medición del grid real
  (`gridTemplateColumns`/sobrante de `space-between`), `cellOriginAt` vs rect de la celda destino,
  y la captura del grupo en `pointerdown` (`getGroupIds`) en el flujo real del escritorio.
- [ ] Corregir el desfase detectado y cerrar con validación visual real del usuario (checks finales
  del DoD). No marcar el gate como cerrado sin esa validación.

**Gotcha registrado:** el preview anterior quedó anclado a 660px (presentación móvil), por lo que la
geometría RTL/`space-between` de escritorio nunca se validó en vivo; los tests DOM, aunque verdes,
usan un stub de layout (jsdom) que puede no reflejar el layout real del grid.

### Fase 6 — Causa raíz real: distribución VERTICAL por contenido 🔴 → ✅ corregida (06-ago)

**Diagnóstico en navegador real (06-ago, reflow forzado en 1440×900):** el fix de F1–F4 dejó el
síntoma porque la geometría seguía desfasada en el eje VERTICAL, y eso explica los DOS síntomas del
usuario:

- `.desktop-icon-grid { align-content: space-between }` reparte el sobrante vertical entre las
  filas que el CONTENIDO materializa (con `grid-auto-rows` + `grid-auto-flow: dense`), NO entre las
  que caben por altura. Medido: grid de 836px de alto con 2 filas de iconos (26 items) → el
  navegador coloca la fila 2 en **top 772px** (reparte los 676px de sobrante entre la única pareja
  de filas existente); `getGridMetrics` asumía `rows = floor((836+32)/(64+32)) = 9` y repartía el
  sobrante entre 8 gaps → predecía la fila 2 en **top 96.5px**. Desfase real: **~675px**.
- Con ese desfase, `getCellAt` mapeaba el cursor a una fila incorrecta al soltar: el icono
  "aparecía en otro lugar" (síntoma 1) y, al caer sobre la celda de un icono existente,
  `planPlacement` desplazaba al ocupante y al siguiente → "se mueven varios iconos en vez de 1"
  (síntoma 2). La regla de grupo de F3 era correcta; el desplazamiento en cadena venía de drops en
  celdas ocupadas por la geometría errónea.
- El gotcha del preview a 660px era real: con 1 fila o el layout móvil el desfase vertical no se
  manifiesta; solo aparece con ≥2 filas en desktop.

**Fix aplicado (06-ago):** `align-content: space-between` → `align-content: start` en
`desktop-shell.css`. Con `start` las filas arrancan deterministas desde arriba: la fila `r` está en
`r * (64 + 32)` y coincide 1:1 con la fórmula de `getGridMetrics`/`cellOriginAt` (verificado en
navegador: 26 items → filas en 0 y 96, no 0 y 772). Es el mismo criterio que el Finder (018A-93:
alinea al inicio). El eje horizontal conserva `space-between` + `columnGapEffective` (medido: la
fórmula coincide con el navegador, gaps efectivos 20.67). La distribución vertical por contenido era
inherentemente impredecible (cada drop que materializa una fila nueva redistribuye todo el grid) y
por eso ningún cálculo JS podía replicarla.

- [x] CSS: `align-content: start` con comentario que explica por qué (desfase vertical real).
- [x] Test DOM: stub de `alignContent` actualizado a `start` + test nuevo "con sobrante VERTICAL y
  align-content: start, rowGapEffective = rowGap (filas deterministas)".
- [x] Comentarios en `icon-grid.ts` (`rowGapEffective`) actualizados: en producción == rowGap.
- [x] Validación en navegador real: harness con el CSS exacto del grid a 1440px, reflow forzado,
  13 y 26 items — actual (space-between) vs. fix (start); fix coincide con la fórmula.

**Gate F6 / DoD:** filas deterministas desde arriba; el highlight coincide con la celda real en
desktop con ≥2 filas (verificado en navegador por geometría); la validación visual final del
usuario queda pendiente de su sesión real.

## Pruebas obligatorias

- Unit/DOM: `icon-grid.test.ts` (nuevos tests de `columnGapEffective` y `cellOriginAt`), tests de
  `icon-reorder` (highlight), tests de `icon-group-drag` (delta + clamp + colisión) y de
  `onPlaceCell` con selección residual, suite completa del frontend.
- Navegador: desktop 1440/1024, tablet, móvil; arrastre con sobrante horizontal y RTL; grupo de 2-3
  iconos seleccionados (arrastrar seleccionado vs. no seleccionado); resize con grupo fuera de
  bounds.
- Gate: `npm run task:check -- <ID>` y `--full` cuando el bloque cierre.

## Criterio de salida

- Un único helper de geometría (`cellOriginAt`) alimenta getCellAt, highlight y debug.
- El placeholder coincide con la celda real al arrastrar (verificado en navegador).
- El drag de grupo se decide por el gesto (pointerdown), no por la selección del drop; arrastrar un
  icono no seleccionado altera solo ese; el grupo se mueve sin superposiciones ni fuera-de-bounds.
- El reflow por resize no reordena todo el grid salvo overlap/fuera-de-bounds real.
- La rejilla roja de debug no aparece en producción (o es dev-only y coherente).
- Los tests DOM fijan la geometría frente a `space-between` + RTL para que no regrese.
