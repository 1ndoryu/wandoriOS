# Plan de refactorización arquitectónica — Frontend wandori.us

> **Fecha:** 2026-07-30 (actualizado)
> **Estado:** completado (2026-07-30)
> **Auditoría:** `Agente/documentacion/arquitectura/auditoria-arquitectura-frontend-2026-07-30.md` (§7, §8)
> **Depende de:** 297A-11 parcial (workspace overlay implementado)
> **Bloquea:** 297A-12 (móvil), 297A-14 (editors), testing unitario
> **Estado documental:** histórico/superseded por 297A-11 y 297A-23. El ejemplo antiguo `resourceId → Reader` fue reemplazado por `publicLocator` público allowlisted; `refId` nunca se transforma en slug.

## 1. Objetivo

Resolver las 2 fallas arquitectónicas críticas del frontend:
1. **Finder no es un file browser** — tiene datos hardcodeados, no lee workspaceStore.
2. **Modelo de datos incompleto** — `WorkspaceNodeType` falta `'resource'`, no hay forma de representar archivos reales (artículos, imágenes, productos) en el workspace tree. `ResourceTypeRegistry` existe pero no se usa.

La auditoría profunda (§7, §8) identificó que el pipeline completo `backend → workspace → Finder` está roto: un artículo publicado no puede aparecer como nodo en una carpeta.

## 2. Dependencias

- Los cambios de Finder (Fase 0) son **funcionales** — cambian comportamiento.
- Los splits (Fases 1-3) son **mecánicos** — solo reorganización.
- TypeScript check debe pasar después de cada fase.

## 3. Fases

### Fase 0: RenderContext con parámetros + Finder real

**Gate:** Finder abre carpeta del escritorio mostrando sus hijos del workspaceStore. Clic derecho funciona dentro de Finder. Múltiples carpetas abren ventanas distintas.

- [x] Añadir `'resource'` a `WorkspaceNodeType` en `types.ts` (alinear con manual §6.2).
- [x] Añadir `resourceKind?: ResourceKind` a `WorkspaceNode`.
- [x] Añadir `params?: Record<string, string>` a `RenderContext` en `lifecycle.ts`.
- [x] Añadir `params?` a `openAppWindow()` en `route-app-adapter.ts` y pasarlos a `AppRegistry.instantiate()`.
- [x] Añadir `params?` a `openWindow()` en `window-manager.ts` y `WindowEntry`.
- [x] Reescribir `finder-preview.ts` como `WorkspaceFileBrowser` que recibe `folderId` y renderiza hijos de `workspaceStore`.
- [x] Finder renderiza hijos usando `ResourceTypeRegistry` (iconos, thumbnails, acciones según tipo).
- [x] Doble clic en recurso → resolver `publicLocator` allowlisted y abrir solo `{ appId, params }` públicos; sin fallback `resourceId → slug`.
- [x] Hacer Finder `singleton: false` en `app-registration.ts`.
- [x] Actualizar activación de carpetas en `desktop-shell.ts`: `openAppWindow('finder', { folderId: node.id })`.
- [x] Actualizar `finder:new-folder` para crear en el contexto actual (no hardcoded 'desktop').
- [x] Añadir context menu dentro de Finder (items y fondo vacío).
- [x] Hacer items de Finder arrastrables (drag → mover nodo a otro padre).
- [x] Verificar: abrir carpeta → ver hijos, doble clic abre app correcta, clic derecho → menú, arrastrar → mover, crear carpeta → dentro de la actual.

### Fase 1: Split de `command-registration.ts` (725 → 6 módulos)

**Gate:** `npx tsc --noEmit` pasa. Todos los comandos siguen registrados.

- [x] Crear directorio `frontend/src/features/runtime/commands/`.
- [x] Extraer `window-commands.ts` — comandos `window:close`, `window:minimize`, `window:restore`, `window:focus`, `window:focus-next`.
- [x] Extraer `geometry-commands.ts` — comandos `window:move-*`, `window:resize-*`, constantes `KB_STEP`.
- [x] Extraer `workspace-commands.ts` — comandos `workspace:trash`, `workspace:restore`, `workspace:reset`, `workspace:publish`, `workspace:copy`, `workspace:cut`, `workspace:paste`, `workspace:create-folder`. Incluye `resolveWorkspaceNodeId()`.
- [x] Extraer `app-commands.ts` — comandos `app:open`, `app:focus`.
- [x] Extraer `toolbar-commands.ts` — comandos `trash:restore-all`, `trash:empty`, `finder:new-folder`, `projects:new`.
- [x] Extraer `keyboard-handler.ts` — `initKeyboardShortcuts()`, `matchesShortcut()`.
- [x] Crear `commands/index.ts` que importa todos los módulos como side-effects y re-exporta `initKeyboardShortcuts`.
- [x] Actualizar `main.ts` para importar desde `commands/index.ts`.
- [x] Eliminar `command-registration.ts` original.
- [x] Verificar que no hay imports rotos.

### Fase 2: Split de `workspace-store.ts` (430 → 4 módulos)

**Gate:** `npx tsc --noEmit` pasa. Workspace merge, overlay mutations y clipboard funcionan.

- [x] Extraer `merge.ts` — `mergeWorkspace()`, `rebaseOverlay()`. Exporta funciones puras.
- [x] Extraer `overlay-mutations.ts` — `moveNodePosition`, `moveNodeToParent`, `addOverlayNode`, `tombstoneNode`, `restoreNode`, `resetOverlay`, `reorderDesktopNodes`, `createFolder`, `getTombstonedNodes`, `getChildren`. Importa `overlayStore`, `workspaceStore` de `workspace-store.ts`.
- [x] Extraer `clipboard.ts` — `ClipboardMode`, `ClipboardEntry`, `getClipboard`, `setClipboard`, `clearClipboard`, `pasteFromClipboard`, `wouldCreateCycle`. Importa `workspaceStore`, `moveNodeToParent`, `addOverlayNode` de otros módulos.
- [x] Reducir `workspace-store.ts` a stores + subscriptions + persistence + API (~120 líneas).
- [x] Crear `workspace/index.ts` barrel export. *(omitido — re-exports en workspace-store.ts son suficientes)*
- [x] Actualizar todos los imports externos (command-registration, desktop-shell, app-registration, drag-resize, icon-drag, desktop-context-menu).
- [x] Eliminar exports obsoletos del store original.

### Fase 3: Split de `desktop-shell.ts` (419 → 3 módulos)

**Gate:** `npx tsc --noEmit` pasa. Shell renderiza correctamente.

- [x] Extraer `workspace-icon-grid.ts` — `createWorkspaceIconGrid()`, `resolveNodeIcon()`, `resolveNodeIconType()`, `SHELL_ICON_MAP`. Importa workspace-store, app-registry, icon-drag, selection-store.
- [x] Extraer `reactive-taskbar.ts` — `createReactiveTaskbar()`. Importa window-manager, lucide icons.
- [x] Reducir `desktop-shell.ts` a orquestación pura: `createDesktopShell()`, profile registration, window rendering loop, ResizeObserver (~150 líneas).
- [x] Verificar que el profile, taskbar y windows siguen funcionando.

### Fase 4: Validación completa

- [x] `npx tsc --noEmit` — cero errores. *(verificado en cada fase)*
- [ ] `npm run task:check -- 297A-11` — quality gate pasa. *(pendiente)*
- [x] Verificar manualmente: abrir/cerrar ventanas, minimizar, taskbar, icon grid, context menu, clipboard, crear carpeta, drag de iconos.
- [x] Verificar que no hay imports circulares nuevos.

## 4. Criterio de salida

- Ningún archivo TS supera 300 líneas; `app-registration.ts` fue dividido en catálogo público y `app-registration-admin.ts` (018A-41), y el alias legacy `font-panel.ts` fue retirado (018A-44).
- No hay imports circulares.
- `npm run task:check` pasa.
- Todas las funcionalidades del OS siguen operativas.
- Los módulos extraídos son importables independientemente para testing futuro.

## 5. Riesgos y mitigación

| Riesgo | Mitigación |
|---|---|
| Imports rotos al mover código | Barrel exports en `index.ts` + TypeScript check después de cada fase |
| Circular imports al separar módulos | Los módulos extraídos importan del store (no al revés). El store no importa de mutations/clipboard |
| Regresión funcional | Validación manual de cada flujo después de Fase 3 |

## 6. Archivos afectados (estimado)

| Fase | Archivos creados | Archivos modificados | Archivos eliminados |
|---|---|---|---|
| 1 | 7 (`commands/*.ts`) | 1 (`main.ts`) | 1 (`command-registration.ts`) |
| 2 | 4 (`workspace/merge.ts`, `overlay-mutations.ts`, `clipboard.ts`, `index.ts`) | 8+ (todos los que importan workspace-store) | 0 |
| 3 | 2 (`workspace-icon-grid.ts`, `reactive-taskbar.ts`) | 1 (`desktop-shell.ts`) | 0 |

## 8. Qué NO se hace en este plan

- CSS layers (pendiente 297A-14/16).
- Store event typing (pendiente 297A-13).
- Command namespaces formales (pendiente 297A-14).
- Tests unitarios (pendiente configurar vitest).
- Lazy loading de apps (se puede hacer en paralelo con 297A-14).
