# Plan 297A-24 — Cierre automático de ventanas al abrir otra (investigación + hipótesis)

> **Fecha:** 2026-07-31
> **Estado:** solución S1 implementada y validada por tests; prueba visual real desktop/móvil pendiente controlada.
> **Epic:** 297A-4 (OS persistente, cuentas, programas y comercio).
> **Síntoma reportado:** al abrir una ventana y luego ir a otra, la ventana anterior se cierra automáticamente. Las ventanas no deberían cerrarse por hacer clic en otra.
> **Tarea sospechosa:** 297A-19 (URLs canónicas, deep links y ventana enfocada) — todo el runtime actual (adapter + URL sync + reconciliación) vive en un único commit aplanado `df781967`, pero `window-url-sync` y la reconciliación nacieron en ese frente.

## Evidencia (verificada en código y en navegador)

### Reproducción real (navegador, localhost:5174)
1. Estado: ventana About abierta, URL `/about`, ventana `shell-profile` (Perfil) abierta.
2. Clic en icono **Galería** del escritorio.
3. Resultado: URL → `/`, ventana **About cerrada**, ventana **Galería no llega a quedar abierta**, solo queda Perfil (`shell-profile`).
4. Confirmado además: abrir About (canónico `/about`) con Perfil abierta NO cierra nada → el bug requiere una apertura **no canónica**.

### Cadena causal confirmada en disco
1. `frontend/src/features/runtime/window-url-sync.ts` — `resolveFocusedPath` (L32–38): si la app enfocada **no produce URL canónica**, devuelve `'/'`. `sync()` (L69–76): si `targetPath !== getCurrentPath()` → `replacePath('/')`. El suscriptor de `windowStore` (source ≠ `'sync'`) ejecuta `sync()` en cada apertura/foco.
2. `frontend/src/features/runtime/route-app-adapter.ts` — `reconcileRuntimeForRoute` (L48–51) registrado en `onNavigate`: si `!AppRegistry.findByRoute(pathname)` → `clearRuntimeApps()`.
3. `clearRuntimeApps` (L37–46): cierra **todas** las ventanas salvo `shell-profile` (Perfil).

**Resultado:** abrir una app sin URL canónica (o con params fuera del allowlist) → foco → sync escribe `/` → reconcile interpreta "el usuario salió de las apps" → cierra todo. Dos subsistemas que nunca debieron interactuar así: el que "solo proyecta la URL" termina navegando.

### Apps que disparan el bug (sin URL canónica)
| App | deepLink | ¿Canónica? |
|---|---|---|
| `settings` (Configuración) | sin deepLink | nunca → bug |
| `trash` (Papelera) | sin deepLink | nunca → bug |
| `admin` | sin deepLink (solo routePatterns legacy) | nunca → bug |
| `finder` con `{ folderId }` | `/gallery` sin params | no → bug |
| `reader` sin `slug` o con `{ resourceId }` | `/article/:slug` | instancia interna sin URL; `resourceId` no se interpreta como `slug` y la UI informa que falta referencia pública |
| `account` | `/login` | sí → ok |
| `about` / `projects` / `finder` sin params | sí | sí → ok |

### Comportamiento intencional vs defecto
- El test `route-app-adapter.test.ts` (L122–133) ya documenta que ante una ruta no-app solo queda `['shell-profile']`. Ese cierre masivo es **intencional** para "el usuario navegó fuera de las apps".
- El **defecto** es que `window-url-sync` genera rutas no-app (`/`) como **efecto secundario** de abrir/enfocar una ventana no canónica, activando el cierre masivo sin que el usuario haya salido.

## Hipótesis de causa raíz (confirmada)

**H0 (confirmada):** el cierre no es una acción de WindowManager al abrir otra ventana (el reducer no tiene `closeOthers`); es la interacción indirecta `window-url-sync.sync() → replacePath('/') → reconcileRuntimeForRoute → clearRuntimeApps()`.

## Hipótesis de solución (a validar en fases, sin implementar aún)

**S1 — No navegar sin destino canónico.** `sync()` de `window-url-sync.ts` omite el `replacePath` cuando hay ventana enfocada pero sin representación canónica (deja la URL intacta). Solo navega a `/` cuando realmente no hay ventana de app enfocada (escritorio vacío).
- Falsación: la URL queda "stale" (p. ej. `/about` con la ventana About cerrada y una no canónica enfocada), rompiendo refresh/back o el indicador de navegación del chrome.

**S2 — Marcar origen de navegación.** `reconcileRuntimeForRoute` (o `onNavigate`) distingue la navegación originada por el propio sincronizador de la del usuario, y no cierra apps ante reescrituras internas de URL.
- Falsación: introducir el origen rompe otros consumidores de `onNavigate` (interceptor, analytics, RouteAppAdapter) o crea ciclos de sincronización.

**S3 — (parche, descartar salvo que S1/S2 fallen)** dar deepLink canónico a settings/trash/admin o permitir params de carpeta/recurso en finder/reader. No ataca la raíz: cualquier app futura sin URL pública re-dispararía el bug.

## Fases

### Fase 1 — Cierre de investigación (ya hecha, registrar evidencia)
- [x] Reproducir el bug en navegador y capturar la secuencia (URL `/about` + About abierta → clic Galería → URL `/`, todo cerrado salvo shell-profile).
- [x] Confirmar cadena causal en `window-url-sync.ts` y `route-app-adapter.ts` (líneas citadas arriba).
- [x] Mapear apps canónicas vs no canónicas y los puntos de apertura que disparan el bug (`desktop-menu-bar.ts` L226 settings; `workspace-icon-grid.ts` folderId/resourceId; `app-commands.ts`; `toolbar-commands.ts` navigate('/admin')).

**Gate F1:** hipótesis H0 respaldada por código + reproducción; inventario de disparadores completo.

### Fase 2 — Decidir solución (S1 vs S2)
- [x] Escribir casos de prueba que fijen el comportamiento correcto: app no canónica y Perfil no cierran apps; el cierre de la última app puede proyectar `/`; navegación manual a ruta no-app conserva su semántica.
- [x] Evaluar S1 contra los casos y descartar S2 por introducir origen de navegación paralelo en el router.
- [x] Mantener apps internas sin URL pública: Perfil es chrome shell y las apps no canónicas conservan la URL anterior sin provocar reconciliación destructiva.

**Gate F2:** S1 pasa los casos de regresión y no rompe el adapter.

### Fase 3 — Implementar la solución elegida
- [x] Implementar S1 con `hasOpenRuntimeApp()` por presentación; una app runtime abierta bloquea la proyección accidental de `/`, mientras Perfil queda fuera del catálogo.
- [x] Eliminar el fallback `resourceId → slug` de Reader; una instancia interna sin `slug` no consulta una ruta pública y desktop/móvil muestran feedback seguro. La resolución futura requiere un envelope público autorizado.
- [x] `npx tsc --noEmit` + suite frontend + regresiones de Perfil, app no canónica, cierre de última app y aislamiento desktop/móvil.

**Gate F3:** type-check y tests PASS; la regresión está cubierta automáticamente.

### Fase 4 — Cierre
- [ ] Prueba visual manual desktop ≥768px y móvil <768px; abrir/cerrar apps canónicas y no canónicas, Perfil, refresh y Back/Home. *(pendiente controlado)*
- [x] Actualizar `window-url-sync.test.ts` / `route-app-adapter.test.ts` con los contratos de shell/runtime y presentación activa.
- [x] Registrar la lección: un proyector de URL no debe navegar por una entrada shell sin URL.
- [x] Ejecutar `npm run task:check -- 297A-24`, `self-check` y archivar la implementación.

**Gate F4 / DoD:** quality gate PASS, regresión automatizada PASS y documentación sincronizada; solo queda validación visual manual.

## Pruebas obligatorias y Definition of Done

- [x] Casos de regresión de Fase 2 cubiertos: app no canónica, Perfil, cierre de última app, ruta manual y superficie activa móvil/desktop.
- [ ] Reproducción manual del bug original en navegador; pendiente controlado.
- [x] Sin regresión automatizada en deep links, singleton/focus, cierre de última app y presentación activa.
- [x] `npm run task:check -- 297A-24` y `self-check` PASS.
- [x] Lección registrada y guía de navegación/URL actualizada mediante el contrato S1.

## Enlaces

- Código raíz: `frontend/src/features/runtime/window-url-sync.ts`, `frontend/src/features/runtime/route-app-adapter.ts`
- Test que documenta el comportamiento actual: `frontend/src/features/runtime/route-app-adapter.test.ts`
- Manual de arquitectura: `Agente/documentacion/arquitectura/manual-arquitectura-wandorius-2026-07-29.md`
- Deep links: `frontend/src/features/runtime/deep-links.ts`
- Roadmap: `roadmap.md` (297A-24)
