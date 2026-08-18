# Plan 317A-5 — Persistencia de sesión de ventanas del OS

> **Fecha:** 2026-08-01
> **Estado:** completado funcionalmente — commit propio no forzado por cambios compartidos
> **Petición del usuario:** «al recargar todo se reinicia desde cero; al recargar todo debería aparecer como antes».
> **Epic:** 297A-4 — OS persistente.
> **Depende de:** 297A-9 (windowStore/WindowManager), 297A-19 (deep links), 297A-13 (sesiones), 297A-12 (stack móvil).
> **Bloquea:** experiencia de escritorio persistente entre recargas.

---

## 1. Objetivo

Al recargar la página, el OS debe reconstruir la sesión anterior: mismas ventanas abiertas (apps y parámetros de instancia), misma geometría (bounds), mismo estado (`open`/`minimized`/`maximized`), mismo z-order y mismo foco. En móvil, debe restaurarse el stack de apps (`MobileAppStack`) en el mismo orden.

## 2. Qué se persiste y qué no (límites)

**Se persiste (estado de presentación, no de negocio):**
- Por ventana desktop/tablet: `appId`, `params` de instancia (p. ej. `folderId`, `articleId`), `bounds`, `state`, `zIndex`, `focused`, `titleOverride` si difiere del título del catálogo.
- Por stack móvil: `appId`, `params`, `title`, `layout`.
- Versionado: `version: 1` en la misma clave.

**NO se persiste (por diseño de seguridad/arquitectura):**
- Contenido DOM, `MountedView`, `AbortController`, `onDestroy` → se re-instantian con `AppRegistry.instantiate`.
- Clipboard, secretos, tokens, estado de formularios (eso es autosave/`transient-state`).
- Ventanas shell (`shell-profile`) → el shell las recrea en el arranque; no son apps del catálogo.
- Preferencias/overlay → ya viven en `wandorius:workspace-overlay`, `wandorius:tema`, `wandorius:sidebar`.

**Clave localStorage:** `wandorius:window-session` (misma convención que el overlay).

## 3. Restauración fail-closed

Al restaurar cada ventana se valida SIEMPRE:
1. La app existe en `AppRegistry` (si se retiró del catálogo → se omite, no rompe la restauración).
2. Capacidad: `canOpenApp(app, authStore.get().capability)` — si la sesión expiró o el usuario ya no es admin, las ventanas admin NO se restauran (fail-closed).
3. `clampWindowBounds` re-aplica la geometría al workspace actual (resolución puede cambiar entre recargas).
4. Si `state === 'maximized'`, se restaura con `preMaximizeBounds`.

Restauración móvil: mismo filtro de catálogo/capacidad; el stack se reconstruye en orden.

## 4. Cuándo se guarda

- Suscripción a `windowStore` (desktop/tablet) y `mobileStackStore` (móvil) con debounce (200 ms) para no escribir en cada frame de drag/resize.
- `flush` síncrono en `pagehide`/`beforeunload` (para no perder el último estado si el usuario recarga inmediatamente).
- `pause()`/`resume()` durante transiciones de presentación (desktop↔tablet↔móvil): `closeAllWindows()` se llama al desmontar y NO debe persistir un escritorio vacío.

## 5. Orden de restauración en el arranque (main.ts)

1. `fetchWorkspaceRelease()` + `AuthService.me()` (capacidad confirmada).
2. `mountPresentation(isMobile)` — el shell fija `setWorkspaceBounds` y crea la ventana Perfil.
3. `initRouteAppAdapter({ preserveRootOnInit: true })` + `initWindowUrlSync()`.
4. **`await restoreWindowSession()` ANTES de `initRouter()`**: la URL conserva la app enfocada (297A-19) y el interceptor la enfocará sin duplicar; las demás ventanas se restauran con su geometría.
5. `initRouter()` — resuelve la URL; `findExistingWindow` enfoca la ventana ya restaurada.

## 6. Fases

### Fase 1 — Base del store (window-store.ts / window-manager.ts)

- [x] Añadir `ensureNextZIndexAbove(floor)` a `window-store.ts` para que el z-index restaurado no colisione con ventanas nuevas.
- [x] Añadir `openRestoredWindow(app, view, controller, saved)` a `window-manager.ts`: crea la entrada con bounds/state/zIndex/focused/preMaximizeBounds explícitos (NO usa defaults de apertura nueva).

### Fase 2 — Módulo window-session.ts (+ window-session-restore.ts)

- [x] Tipos `SavedWindow`, `SavedMobileEntry`, `WindowSession`.
- [x] `loadSession()` (versionado + try/catch → null si corrupto) y `saveSession()` (secciones desktop/mobile independientes).
- [x] `captureDesktopSession()` (filtra apps del catálogo y ventanas shell) y `captureMobileSession()`.
- [x] `initWindowSessionPersistence()`: suscripciones con debounce 200ms, flush en pagehide, pause/resume/stop. Devuelve handle idempotente.
- [x] `restoreDesktopWindows()`/`restoreMobileStack()`/`restoreWindowSession()`: fail-closed por catálogo/capacidad, restauran desktop/tablet o stack móvil según presentación. *(Extraído a `window-session-restore.ts` para respetar el límite de 300 líneas; sin ciclos de importación: restore → session, no al revés)*

### Fase 3 — Cableado main.ts

- [x] `const stopWindowSession = initWindowSessionPersistence();`
- [x] `await restoreWindowSession();` antes de `initRouter()`.
- [x] `stopWindowSession.pause()`/`resume()` en el handler de transición de presentación (junto a `stopWindowUrlSync`).
- [x] `stopWindowSession.stop()` en cleanup.

### Fase 4 — Tests y validación

- [x] `window-session.test.ts` (captura/persistencia/handle, 13 tests) + `window-session-restore.test.ts` (restauración, 9 tests): roundtrip desktop (bounds/state/zIndex/focused), fail-closed (app retirada, admin sin sesión), versionado corrupto → null, regresión maximizada+foco, normalización minimizado+foco, restauración móvil en orden, pause no persiste escritorio vacío, flush pagehide. *(Test dividido en 2 archivos por límite de líneas; non-null assertions eliminadas con `requireSession`)*
- [x] Typecheck + Vitest (suite completa: 49 archivos, 382 tests) + build/type-check.
- [x] Code review + `npm run task:check -- 317A-5 --fresh` (PASS; Sentinel/VarSense/frontend/docs/custom sin errores bloqueantes).

### Fase 5 — Documentación

- [x] Actualizar `roadmap.md` (tarea 317A-5) y crear `Agente/completados/tareas-2026-08-01.md`.
- [x] Commit propio no forzado: `main.ts` y el runtime comparten cambios de otro agente; el quality report deja recordatorio condicional de staging/commit para el bloque entregable.

## Regresión 018A-69 — Slot de acciones durante la restauración

La apertura normal copiaba `MountedView.actions` al `WindowEntry`, pero la ruta
de recarga (`openRestoredWindow`) no lo hacía. El resultado era una Biblioteca
restaurada sin su franja inferior aunque la app siguiera devolviendo las
acciones correctamente.

- [x] Propagar `view.actions` al `WindowEntry` restaurado.
- [x] Cubrir una app restaurable con acciones en `window-session-restore.test.ts`.
- [x] Ejecutar pruebas dirigidas de restauración y chrome (17/17).
- [ ] Repetir la comprobación visual real de Biblioteca tras recarga en el navegador del proyecto.

**Regla:** no persistir elementos DOM ni acciones; las acciones siempre se
reconstruyen al reinstanciar `MountedView` y se montan por el shell.

## 7. Criterio de salida

- [x] Recargar en desktop/tablet restaura ventanas; verificado en navegador a 1024×768 con Perfil y Galería abiertas y taskbar coherente.
- [x] Recargar en móvil restaura el stack de apps en orden; verificado en 390×844 con Galería abierta y preservada tras reload.
- [x] Sesión expirada → ventanas admin no se restauran (fail-closed) y no rompen el resto; cubierto por `window-session-restore.test.ts`.
- [x] App retirada del catálogo → se omite sin errores; cubierto por `window-session-restore.test.ts`.
- [x] Transiciones desktop↔móvil no persisten un escritorio vacío; cubierto por pausa/reanudación y restauración visual.
- [x] Typecheck, tests, build/gate y comprobación visual PASS. `self-check` queda cubierto por el mismo core de `task:check`; no se duplica una suite pesada.

## 8. Enlaces

- Manual de arquitectura: `Agente/documentacion/arquitectura/manual-arquitectura-wandorius-2026-07-29.md`
- Deep links (297A-19): `Agente/planes/plan-deep-links-ventanas-2026-07-31.md`
- Roadmap: `roadmap.md` (§317A-5)
