# Plan: Reordenamiento de iconos por arrastre con grid (móvil + escritorio)

> **Tarea propuesta:** 297A-22
> **Fecha:** 2026-07-31
> **Estado:** 🟡 implementación técnica completada; validación visual/E2E pendiente
> **Decisión aplicada:** Opción 1 — `mobilePosition {col,row}`, grid compacto de 2/3 columnas, `mobileOrder` solo como fallback legacy y comandos accesibles limitados a presentación móvil
> **Siguiente paso:** ejecutar validación visual/E2E en 320/360/390/768+; no confundir el gate automatizado con evidencia de interacción real

## 1. Objetivo y límites

**Problema:** los iconos no deben reordenarse mediante "Mover arriba / Mover abajo"
(swap de índices). El usuario quiere **arrastre + grid** en ambas superficies:
escritorio y móvil.

- El escritorio ya tiene drag + snap-grid (`position {col,row}`) desde 297A-20.
- El móvil implementa long press → modo edición → drag por celdas; soltar sin mover abre menú contextual. Los comandos move prev/next son solo alternativa accesible y escriben `mobilePosition`.

**Objetivo:** que el launcher móvil reordene por arrastre sobre un grid de celdas
(como el escritorio), y eliminar/quitar del flujo el reorden por swap de índices.

**Límites (no se toca en este plan):**
- Backend, API, migraciones de BD.
- Identidad visual (tokens/chrome ya aprobados).
- Comandos de ventanas, deep links, analytics.
- Otras superficies (taskbar, menús de barra superior).

## 2. Hallazgos de investigación (estado actual, 2026-07-31)

### Modelo de datos (diagnóstico histórico; contrato vigente al final del plan)
- `position?: GridPosition {col,row}` — snap-grid desktop/tablet (≥769px).
  `types.ts:47-51`.
- `mobileOrder?: number` — índice plano legacy por padre; solo fallback para nodos sin `mobilePosition`. No es política de orden para Finder ni `getChildren`.
- `mobilePosition?: GridPosition` — posición persistente canónica del launcher móvil en 3 columnas; el viewport de 2 columnas solo proyecta ese orden sin mutar el overlay.
- `fieldOverrides` permite override de `position | mobilePosition | label | parentId | mobileOrder`.

### Launcher móvil (`mobile-shell.ts`) — diagnóstico inicial
- Estado inicial auditado: ordenaba solo por `mobileOrder` y no tenía posición móvil persistente.
- Contrato vigente: `sortMobileNodes()` usa `mobilePosition` y deriva `mobileOrder` solo para datos legacy; CSS usa 3 columnas y 2 hasta 480px.
- `bindLongPressDrag` distingue tap, menú al soltar sin mover y drag después del umbral; el menú contextual sigue siendo el componente compartido.

### Comandos de reorden — diagnóstico inicial y contrato vigente
- `workspace:move-up` (order 44) / `workspace:move-down` (order 45),
  `contexts: ['icon']`, en `workspace-reorder-commands.ts`.
- Diagnóstico inicial: `reorderTarget` hacía swap de índices y escribía `mobileOrder`.
- Contrato vigente: los comandos accesibles calculan la celda anterior/siguiente y escriben `mobilePosition`; solo están disponibles con `presentationMode: 'mobile'`.
- En escritorio el drag conserva `position`; no se usa un swap móvil para cambiar la presentación desktop.

### Escritorio (≥769px)
- Drag con Pointer Events en `icon-drag.ts`: si `onPlaceCell` y width ≥769 → modo
  placement por celda (`getCellAt` + `planPlacement` con colisiones) → `moveNodesPosition`
  escribe `position`. Si no → fallback `findReorderIndex`/`onReorder` (índice `mobileOrder`).
- Nodos sin `position` rellenan huecos con `grid-auto-flow: dense` según `mobileOrder`.
- Geometría pura y testeada en `utils/icon-grid.ts` (+ 37 tests de 297A-20).

### Tests
- Cubren geometría desktop (icon-grid, placement, reflow) y long press móvil.
- **No hay tests de reorder móvil ni del drag `icon-drag.ts`/`icon-reorder.ts`.**

## 3. Requisitos del cambio (derivados de la petición)

1. El launcher móvil reordena por **arrastre** (gesto táctil), no por menú swap.
2. El arrastre móvil suelta sobre **celdas de un grid** (como el escritorio).
3. "Mover arriba / abajo" deja de ser el mecanismo de reorden (se elimina o se
   reemplaza por una alternativa accesible que opere sobre celdas).
4. La organización móvil persiste en el overlay (`fieldOverrides`) y sobrevive
   reload/sync, sin contaminar el layout desktop.
5. Se mantiene el requisito de accesibilidad del plan móvil 297A-12 §9:
   "No depender solo de long press; mover arriba/abajo disponible como comando
   accesible" → el reorden por drag **necesita una alternativa no gestual**.

## 4. Tensiones y decisiones de diseño a resolver en revisión

### 4.1 ¿Grid móvil con huecos o apretado?
- **Escritorio**: posición libre (permite huecos).
- **Pantalla de inicio real** (iOS/Android): grid apretado, sin huecos; al mover
  un icono los demás se desplazan.
- **Recomendación:** móvil = grid **apretado** (3 columnas, sin huecos) reusando
  `planPlacement` (que ya desplaza al ocupante). Escritorio conserva posición libre.

### 4.2 ¿Un solo campo de posición o dos?
- `position` (desktop) depende del ancho auto-fill; el launcher móvil es de
  columnas fijas (3/2). **Una misma col/row no es válida para ambos.**
- **Recomendación:** añadir `mobilePosition {col,row}` (launcher) y dejar
  `position` (desktop/tablet). `mobileOrder` se deprecia a "orden de fallback"
  para nodos sin `mobilePosition` y para compat con datos existentes.
- Alternativa a evaluar: derivar `mobileOrder` del orden de `mobilePosition`.

### 4.3 ¿Qué pasa con `getChildren` y el orden de render? (resuelto)
- `getChildren` devuelve hijos sin política de presentación; Finder conserva el orden de contenido del workspace.
- Solo el launcher llama explícitamente a `sortMobileNodes`, resolviendo `mobilePosition` y luego `mobileOrder` como fallback.
- En escritorio, los nodos sin `position` siguen el flujo del grid sin recibir preferencias móviles.

### 4.4 ¿Cómo convive el long press con el drag táctil?
- Hoy: long press 500ms → menú; mover >10px cancela.
- **Recomendación (patrón estándar):** mantener pulsado activa "modo edición";
  si luego hay movimiento >umbral → **drag**; si se suelta sin movimiento → **menú**.
  Es decir, el menú se abre al soltar sin arrastrar, no durante el long press.
  Umbral de drag y `touch-action` gestionados para no competir con el scroll.

### 4.5 Alternativa accesible (requisito 297A-12 §9)
- **Recomendación:** reemplazar `workspace:move-up/down` por comandos que operan
  sobre la celda (`Mover a celda anterior/siguiente` en el grid móvil, y en el
  escritorio mover la `position` una celda). Se elimina del menú del escritorio
  el swap sin efecto visible.
- Pregunta abierta: ¿se mantienen como comandos de teclado/lista, o se reemplazan
  por el drag + alternativa de lista propia?

## 5. Opciones de modelo (a elegir en revisión)

### Opción 1 — Paridad completa (recomendada)
Launcher móvil con `mobilePosition {col,row}` + drag por celdas + grid apretado.
`mobileOrder` deprecado a fallback. Máxima coherencia con el escritorio; más
cambio (types, merge, render, gesto, migración de datos).

### Opción 2 — Drag por índice (mínima)
Mantener `mobileOrder`, pero añadir drag táctil que reordena el índice al soltar
sobre una celda (reusar `findReorderIndex`). No hay posición libre móvil; el
"grid" es solo visual (soltar en celdas). Menos cambio, pero no da celdas
persistentes en móvil.

**Recomendación:** Opción 1, porque la petición pide explícitamente "arrastre y
con grid" en móvil, con paridad de comportamiento.

## 6. Fases propuestas (solo al aprobar el plan)

- [x] **Fase 0 — Revisión y decisión.** Opción 1, grid compacto, `mobileOrder` fallback y comandos accesibles móviles.
- [x] **Fase 1 — Modelo de datos.** `mobilePosition` en tipos, merge, overlay, release default y validación Rust.
- [x] **Fase 2 — Launcher snap-grid.** Columnas 3/2, orden explícito por `mobilePosition` y navegación fuera del grid editable.
- [x] **Fase 3 — Drag táctil.** Long press, umbral, ghost, drop por celda, compactación y batch de overlay.
- [x] **Fase 4 — Separación de superficies.** Finder no hereda orden móvil; desktop conserva `position`.
- [x] **Fase 5 — Alternativa accesible.** Move prev/next opera sobre celdas y solo está disponible en presentación móvil.
- [x] **Fase 6 — Compatibilidad.** `mobileOrder` queda como fallback de lectura; no se elimina mientras existan overlays legacy.
- [x] El launcher usa `touch-action: manipulation` en sus controles y `touch-action: none` solo durante edición, evitando que el gesto compita con zoom de doble toque. *(297A-22, ajuste preventivo)*
- [ ] **Fase 7 — Validación visual/E2E.** 320/360/390/768+, drag táctil real, foco, teclado, reload/sync y móvil↔tablet.

## 7. Gate y criterio de salida

**Gate por fase:** cada fase pasa `npm run task:check -- 297A-22` (o el ID
asignado) + tests de la fase antes de avanzar.

**Criterio final (Definition of Done):**
- [x] El launcher móvil reordena por arrastre sobre celdas y persiste en overlay; la suite cubre el plan geométrico y el merge sin contaminar desktop.
- [x] "Mover arriba/abajo" dejó de ser swap de índices y opera sobre `mobilePosition` como alternativa móvil accesible.
- [x] Desktop conserva posición libre (297A-20) sin cambiar su contrato.
- [x] Requisito 297A-12 §9 cumplido en código: existe alternativa no gestual.
- [ ] Validación visual/E2E en 320/360/390/768+ con drag táctil, foco, teclado y zoom 200%.
- [x] Plan, roadmap, contrato móvil y trazabilidad actualizados; Sentinel queda a cargo de detectar regresiones de contrato.

## 8. Decisiones adoptadas en la revisión técnica

1. Móvil usa grid compacto sin huecos; persiste una geometría canónica de 3 columnas y proyecta a 2 columnas sin reescribir el overlay; desktop conserva `position` independiente.
2. `mobilePosition` es la posición persistente móvil; `mobileOrder` se conserva como fallback de lectura para datos antiguos.
3. El drag móvil requiere long press; soltar sin movimiento abre menú contextual y mover después del umbral inicia drag.
4. El botón de navegación está fuera del grid editable.
5. `workspace:move-up/down` se conserva únicamente como alternativa accesible en presentación móvil y escribe `mobilePosition`, no `mobileOrder`.
6. El overlay remoto acepta/valida `mobilePosition`; no se cambia la API ni se añade migración de BD.

## 9. Preguntas abiertas históricas (resueltas; solo trazabilidad)

1. ¿Móvil con grid apretado (sin huecos, como pantalla de inicio) o con huecos
   (como el escritorio)? → Recomendado: apretado.
2. ¿Opción 1 (paridad con `mobilePosition`) u Opción 2 (drag por índice)?
   → Recomendado: Opción 1.
3. ¿"Mover arriba/abajo": se eliminan del menú o se convierten en comandos
   accesibles sobre celdas? → Recomendado: convertir en accesibles sobre celdas.
4. ¿El menú contextual del launcher se abre al soltar sin arrastrar (patrón
   estándar) o se mantiene el long press actual + drag tras él?
5. ¿`mobileOrder` se elimina del todo (tras migrar datos) o queda como orden de
   fallback permanente?

## 9. Enlaces

- Roadmap: `roadmap.md` (297A-22 implementación técnica completada; validación visual/E2E pendiente).
- Plan móvil base: `Agente/planes/plan-experiencia-movil-launcher-2026-07-29.md`
  (requisito accesibilidad §9, invariantes §2).
- Iconos libres escritorio: `Agente/planes/completados/plan-iconos-libres-desktop-2026-07-31.md`.
- Manual arquitectura: `Agente/documentacion/arquitectura/manual-arquitectura-wandorius-2026-07-29.md`.
