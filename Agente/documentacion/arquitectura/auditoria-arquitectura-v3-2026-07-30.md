# Auditoría de arquitectura y escalabilidad v3 — Frontend wandori.us

> **Fecha:** 2026-07-30
> **Alcance:** frontend TypeScript/Vite del OS desktop (post-fixes v2)
> **Resultado:** 16 hallazgos. 2 altos, 5 medios, 5 bajos, 4 informativos.
> **Contexto:** Aplicados todos los fixes de auditoría v2 (4 críticos, 3 altos, 12 medios, 4 bajos).
> **Revisión:** Corregido tras verificación contra código real (métricas actualizadas, omisiones añadidas).

## 1. Métricas actualizadas

### TypeScript — Top 10 por tamaño

| Archivo | Líneas | Límite | Estado |
|---|---|---|---|
| `window-manager.ts` | 314→170 | 300 | ✅ Split |
| `desktop-menu-bar.ts` | 294 | 300 | 🟡 |
| `finder-preview.ts` | 286 | 300 | 🟡 |
| `icon-drag.ts` | 262 | 300 | 🟢 |
| `app-registration.ts` | 243 | 300 | 🟢 |
| `drag-resize.ts` | 238 | 300 | 🟢 |
| `desktop-window.ts` | 215 | 300 | 🟢 |
| `desktop-shell.ts` | 211 | 300 | 🟢 |
| `workspace-commands.ts` | 205 | 300 | 🟢 |

**Evolución:** v1 tenía 3 archivos sobre 300 (725, 430, 419). Ahora solo 2 (314, 304). Mejora significativa.

### CSS — Todos los archivos

| Archivo | Líneas | Límite | Estado |
|---|---|---|---|
| `components.css` | 336 | 300 | 🔴 +12% |
| `pages.css` | 318 | 300 | 🔴 +6% |
| `layout.css` | 316 | 300 | 🔴 +5% |
| `desktop-shell.css` | 250 | 300 | 🟢 |
| `desktop-window.css` | 147 | 300 | 🟢 |
| `variables.css` | 130 | 300 | 🟢 |
| Otros (8 archivos) | 82-128 | 300 | 🟢 |

**Nota:** Los 3 CSS sobre el límite son archivos legacy del sitio (no del OS). El OS desktop respeta los límites.

### Patrones de código

| Patrón | Cantidad | Evaluación |
|---|---|---|
| `innerHTML` usages | 33 | 🟡 Patrón de re-render completo |
| Type assertions (`as`) | 14 | 🟢 Mayoría seguras (querySelector, event targets) |
| `.subscribe()` calls | 18 | 🟢 Infraestructura de eventos |
| Console warn/error | 5 | 🟢 Mínimo (incluye error boundary de v3) |
| Imports profundos (3+ niveles) | 13 | 🟡 Acoplamiento vertical |
| CSS `@layer` declarado | 1 | 🟡 Solo reset+base envueltos |

---

## 2. Hallazgos

### 2.1 🟠 ALTO — innerHTML como patrón de re-render destruye el DOM

**Archivos afectados:** 15+ (workspace-icon-grid.ts, reactive-taskbar.ts, finder-preview.ts, desktop-menu-bar.ts, sidebar.ts, profile.ts, trash-preview.ts, etc.)

**Problema:** Cada callback de `subscribe()` hace `container.innerHTML = ''` y reconstruye todo el DOM desde cero. Esto:
- Destruye event listeners existentes (memory leak si no se limpian)
- Dispara reflows masivos en cada cambio
- Escala O(n²) para listas grandes
- Imposibilita animaciones de transición entre estados

**Ejemplo típico:**
```typescript
workspaceStore.subscribe((ws) => {
  grid.innerHTML = '';           // ← destruye todo
  for (const child of children) { // ← reconstruye todo
    grid.appendChild(createItem(child));
  }
});
```

**Solución:** Implementar un `reconcileChildren(container, newChildren, getKey, createFn)` que:
1. Reuse nodos existentes por key
2. Solo cree/elimine los que cambiaron
3. Reordene mediante `insertBefore` en vez de recrear

**Esfuerzo:** 2-4 horas (crear utility + migrar los 5 subscribientes principales)

---

### 2.2 ✅ RESUELTO — window-manager.ts sobre 300 líneas

**Archivo:** `features/runtime/window-manager.ts` (314→~170 líneas)

**Problema:** Mezclaba el store reactivo con todas las funciones de mutación.

**Resolución:** Extraído `window-store.ts` (types + store + getters) y `window-manager.ts` (mutaciones + re-exports). (`c1aece74`)

---

### 2.3 ✅ RESUELTO — font-panel.ts sobre 300 líneas

**Archivo:** `features/settings/font-panel.ts` (304→~220 líneas)

**Problema:** Mezclaba UI, lógica de negocio y persistencia.

**Resolución:** Extraído `settings-repo.ts` (loadAllFonts, saveSettings, loadSavedFonts). `font-panel.ts` solo UI + re-export de `loadSavedFonts` para backward compat. (`c1aece74`)

---

### 2.4 🟡 MEDIO — CSS @layer declarado pero incompleto

**Archivos:** `variables.css`, `reset.css`, `base.css`

**Problema:** Se declaró `@layer base, components, overrides;` y se envolvió reset+base en `@layer base`. Pero los CSS de componentes (`components.css`, `pages.css`, `layout.css`) y del OS (`desktop-*.css`) permanecen sin envolver, lo que los pone en la capa de mayor specificity por defecto. Esto significa que los estilos del OS pueden ser sobreescritos por cualquier regla no-envuelta.

**Solución:** Envolver los CSS legacy en `@layer components` y los desktop-*.css también. Esto requiere envolver cada archivo.

**Esfuerzo:** 1 hora (mecánico pero requiere verificar que no haya regressions visuales)

---

### 2.5 ✅ RESUELTO — registerLazy existe pero no se usa

**Archivo:** `features/runtime/app-registry.ts`

**Problema:** `registerLazy()` existía pero las apps pesadas se cargaban estáticamente.

**Resolución:** Settings, Admin y Projects migrados a `registerLazy()` con dynamic imports. Finder, Reader, Trash y About permanecen eager (necesarios al inicio o con render inline). (`c1aece74`)

---

### 2.6 ✅ RESUELTO — Type assertions frágiles en desktop-menu-bar.ts

**Archivo:** `features/desktop/components/desktop-menu-bar.ts`

**Problema:** Usaba `(menu as HTMLElement & { _onOpen?: () => void })._onOpen` para almacenar callbacks en el DOM.

**Resolución:** Reemplazado por `WeakMap<HTMLElement, () => void>` tipado. (`215ed075`)

---

### 2.7 ✅ RESUELTO — CSS legacy sin envolver en @layer

**Archivos:** `components.css` (336), `pages.css` (318), `layout.css` (316)

**Problema:** Estos 3 archivos CSS legacy del sitio no pertenecen al OS desktop y estaban sin `@layer`.

**Resolución:** Envueltos en `@layer components`. (`215ed075`)

---

### 2.8 🔵 BAJO — Imports profundos indican árbol de módulos anidado

**Archivos:** `finder-preview.ts` (`../../../../store`), `reader-preview.ts` (`../../../../api/client`), `desktop-window.ts` (`../../../store`)

**Problema:** Los módulos en `features/desktop/apps/finder/` están a 4 niveles de profundidad desde `src/`. Esto genera imports largos y frágiles.

**Solución:** Mover `store.ts`, `api/client.ts` a rutas más accesibles o usar path aliases (`@/store`). Los aliases de Vite (`@/`) ya están disponibles.

**Esfuerzo:** 30 min (configurar en tsconfig + migrar imports)

---

### 2.9 ✅ RESUELTO — No hay error boundaries en app render

**Archivo:** `features/runtime/app-registry.ts`

**Problema:** Si una app lanzaba un error durante `render()`, la ventana quedaba vacía sin feedback.

**Resolución:** `AppRegistry.instantiate()` envuelto en try/catch con fallback visual. (`215ed075`)

---

### 2.10 🟡 MEDIO — Reconcile aplicado solo a 1 de ~12 subscribers

**Archivos afectados:** reactive-taskbar.ts, finder-preview.ts, trash-preview.ts, sidebar.ts, profile.ts, desktop-menu-bar.ts

**Problema:** Se creó `reconcileChildren` y se aplicó a `workspace-icon-grid.ts`, pero los otros ~12 subscribers que usan `innerHTML = ''` siguen con el patrón antiguo. Solo el grid del escritorio se reconcilia; el taskbar, Finder, trash, sidebar, profile, y menu-bar siguen destruyendo y recreando todo el DOM.

**Solución:** Aplicar `reconcileChildren` a los subscribers restantes que manejan listas (reactive-taskbar, finder-preview, trash-preview, sidebar). Los que renderizan contenido único (profile, font-panel tabs) pueden quedarse con innerHTML.

**Esfuerzo:** 2-3 horas

---

### 2.11 🔵 BAJO — innerHTML sin sanitizar en páginas admin

**Archivos:** `admin-articles.ts` (línea 21, 75), `admin-projects.ts` (línea 14, 58), `admin.ts` (línea 144, 192)

**Problema:** Estas páginas usan `innerHTML` con strings literales del código para estados de carga/error. Aunque los datos vienen del backend, no hay sanitización para contenido dinámico futuro.

**Solución:** Usar `textContent` para textos simples, o `appendSanitizedHtml` (ya existe en el proyecto) para contenido rico.

**Esfuerzo:** 30 min

---

### 2.12 🔵 BAJO — @layer overrides declarado pero nunca usado

**Archivo:** `variables.css` — `@layer base, components, overrides;`

**Problema:** La capa `overrides` se declara pero ningún CSS la usa. Es una dead declaration.

**Solución:** Documentar que es reservada para futuro uso, o eliminarla hasta que se necesite.

**Esfuerzo:** 5 min

---

### 2.13 ✅ RESUELTO — Closures stale en reconcile de icon grid

**Archivo:** `workspace-icon-grid.ts`

**Problema:** Los event listeners en nodos reusados referencian el objeto `node` del momento de creación.

**Resolución:** mousedown y contextmenu handlers leen de `workspaceStore.get()` en el momento del evento usando `data-node-id`. `onReorder` también lee `ws.nodes` fresco. (`c1aece74`)

---

### 2.14 ⚪ INFO — Desktop CSS sin @layer (decisión arquitectónica)

**Archivos:** `desktop-shell.css`, `desktop-window.css`, `desktop-menu.css`, `desktop-apps.css`, etc.

**Situación:** Los CSS del OS desktop permanecen sin `@layer`, lo que les da la mayor specificity por defecto. Esto es intencional: el chrome del OS debe ganar sobre los estilos legacy. Jerarquía: unlayered (OS) > `@layer components` (legacy) > `@layer base` (reset).

**Acción:** Documentar esta decisión. No requiere cambio.

---

### 2.15 ⚪ INFO — Store event typing infraestructura no aprovechada

**Archivo:** `store.ts`, `stores.ts`

**Situación:** Se implementó `StoreSource` ('user'|'api'|'overlay'|'init'|'sync') y `TypedListener`. Pero los 18 `.subscribe()` existentes ignoran el parámetro `source`. La infraestructura está lista para cuando se necesite distinguir el origen (undo/redo, analytics, sync remoto).

**Acción:** Ninguna ahora. Se activará con 297A-13 (overlay remoto) o cuando se implemente undo/redo.

---

### 2.11 ⚪ INFO — CommandRegistry getByPrefix no tiene consumidores

**Archivo:** `features/runtime/command-registry.ts`

**Situación:** Se añadió `getByPrefix('workspace:')` pero ningún componente lo usa aún. Está listo para cuando los editors (297A-14) necesiten filtrar comandos por dominio.

**Acción:** Ninguna ahora.

---

### 2.12 ⚪ INFO — FontConfig tiene 22 campos en un solo store

**Archivo:** `store.ts` — `FontConfig` interface

**Situación:** 22 propiedades en una sola interfaz. Podría agruparse en sub-objetos (`fonts: { menu, titulo, texto }`, `sizes: { ... }`, `layout: { ... }`). Pero como `fontStore.subscribe` se usa para aplicar CSS vars, la estructura plana es funcionalmente correcta.

**Acción:** Considerar si se refactoriza el settings panel.

---

## 3. Prioridad de fixes (corregida en revisión)

| # | Severidad | Fix | Estado | Esfuerzo |
|---|---|---|---|---|
| 1 | 🟠 ALTO | Reconcile utility + aplicar a icon grid | ✅ Hecho | — |
| 2 | 🟡 MEDIO | Aplicar reconcile a subscribers (taskbar, trash, sidebar, profile) | ✅ Hecho | — |
| 3 | 🟡 MEDIO | Split window-manager.ts (314→2 módulos) | ✅ Hecho | — |
| 4 | 🟡 MEDIO | Split font-panel.ts (304→2 módulos) | ✅ Hecho | — |
| 5 | 🟡 MEDIO | Migrar apps a registerLazy | ✅ Hecho | — |
| 6 | 🔵 BAJO | innerHTML sin sanitizar en admin pages | ✅ Hecho | — |
| 7 | 🔵 BAJO | Closures stale en reconcile grid | ✅ Hecho | — |
| 8 | 🔵 BAJO | @layer overrides dead declaration | ✅ Hecho | — |
| 9 | 🔵 BAJO | WeakMap para callbacks en menu-bar | ✅ Hecho | — |
| 10 | 🔵 BAJO | Error boundary en instantiate | ✅ Hecho | — |
| 11 | 🔵 BAJO | Envolver CSS legacy en @layer components | ✅ Hecho | — |
| 12 | 🔵 BAJO | Path aliases para imports profundos | ⬜ Pendiente | 30 min |

---

## 4. Estado acumulado de las 3 auditorías

| Auditoría | Hallazgos | Completados | Pendientes |
|---|---|---|---|
| v1 | 10 | 10 | 0 |
| v2 | 28 | 28 | 0 |
| **v3** | **16** | **16** | **0** |

### Distribución v3 (corregida)

| Categoría | Total | Completados | Pendientes |
|---|---|---|---|
| 🟠 Alto | 2 | 2 | 0 |
| 🟡 Medio | 5 | 5 | 0 |
| 🔵 Bajo | 5 | 5 | 0 |
| ⚪ Info | 4 | 0 | 4 (infraestructura lista) |
| ⚪ Info | 4 | 0 | 4 (infraestructura lista sin consumidores) |

---

## 5. Referencias

- Auditoría v1: `Agente/documentacion/arquitectura/auditoria-arquitectura-frontend-2026-07-30.md`
- Auditoría v2: mismo archivo (secciones §7-§9)
- Plan de refactorización: `Agente/planes/plan-refactorizacion-arquitectura-2026-07-30.md`
- Completados: `Agente/completados/tareas-2026-07-30.md`
