# Plan — Carga de apps pesadas: política y presupuesto

> **Fecha:** 2026-07-31
> **Estado:** decisión arquitectónica aceptada; implementación de `preload`/`heavy` diferida hasta existir una app pesada real
> **Tarea:** 297A-25
> **Dependencias:** 297A-9 (runtime), 297A-11 (workspace), 297A-12 (móvil)
> **ADR:** `Agente/documentacion/arquitectura/adr-carga-apps-pesadas-2026-07-31.md`

## Objetivo

Garantizar por diseño que agregar apps complejas (3D, editores pesados o media avanzada) no degrade el inicio del OS ni la memoria/GPU de la sesión. La política debe ser una convención del registro y del ciclo de vida, no un parche específico de cada app.

## Hallazgos verificados

### H1 — El runtime no instancia apps al arranque — CERRADO

- `main.ts` importa `app-registration.ts`, que registra metadatos en `AppRegistry`; no monta apps.
- `windowStore` arranca sin apps del catálogo. La ventana inicial Perfil es chrome del shell, no una app del registry.
- Desktop grid y launcher móvil renderizan iconos; no instancian contenido.
- La instanciación ocurre al abrir: `openAppWindow`/`openMobileApp` → `AppRegistry.instantiate()` → `app.render(ctx)`.
- El cierre ejecuta `destroy()` y aborta el `AbortController` de la instancia.

**Conclusión:** ninguna app del catálogo se monta al inicio.

### H2 — El code-splitting por app ya existe — CERRADO

- `registerLazy` utiliza `import()` dinámico; Vite genera chunks separados.
- Actualmente son lazy: `settings`, `admin` y `projects`.
- Tiptap está separado mediante `manualChunks`; no se descarga como parte del chunk JS principal.

### H3 — Bundle inicial medido — CERRADO

Build de producción ejecutado el 2026-07-31:

| Asset | Tamaño minificado | Tamaño gzip reportado | Decisión |
|---|---:|---:|---|
| `index-*.js` | ~159.66 KB | ~46.05 KB | presupuesto de referencia del bundle principal |
| `tiptap-*.js` | ~294.64 KB | ~87.48 KB | chunk separado; no migrar adicionalmente por ahora |
| CSS principal | ~53.22 KB | ~8.99 KB | presupuesto CSS de referencia |

No se generó manifest porque `build.manifest` no está habilitado. Los archivos de `dist/uploads` y `legacy-assets` son contenido estático, no código de arranque.

Las cinco apps eager actuales son pequeñas y no existe evidencia suficiente para convertirlas todas a lazy. La decisión es migrar por medición, no por uniformidad.

### H4 — GPU/memoria para una app 3D — POLÍTICA PREPARADA, PRUEBA DIFERIDA

El contrato actual ya ofrece `MountedView.destroy()` y `AbortSignal`. Una futura app WebGL deberá detener el render loop y liberar buffers, texturas, workers, timers, object URLs, audio y contexto GPU durante el teardown. `WEBGL_lose_context`, iframe sandbox u OffscreenCanvas/Worker se decidirán con la primera app real y mediciones del navegador objetivo.

No se marca como prueba ejecutada porque todavía no existe una app WebGL que medir.

### H5 — Precarga — DIFERIDA CORRECTAMENTE

No se añade aún `preload` a `AppDefinition`. El comportamiento por defecto es descargar al abrir (`registerLazy` + `import()`); no se agregan listeners idle/hover específicos por app.

Cuando exista un caso medido, se añadirá un contrato centralizado —preferiblemente `preload: 'none' | 'idle'`— mediante ADR, con prueba de Network y presupuesto explícito.

### H6 — Concurrencia de apps pesadas — DIFERIDA CORRECTAMENTE

No se añade aún `heavy` al contrato. La exclusividad o pausa de una app GPU se decidirá junto con la primera app real que necesite esa política y se aplicará igual en desktop y móvil. `heavy` nunca sustituirá las capacidades server-side.

## Decisiones aceptadas

- Apps pequeñas y ligeras pueden usar `register` eager.
- Apps grandes, editoriales complejas, WASM, WebGL, media avanzada o dependencias pesadas deben usar `registerLazy`.
- Una app pesada no importa sus dependencias grandes estáticamente desde `app-registration.ts`.
- `preload` no existe todavía y no debe implementarse de forma ad hoc.
- `destroy()` y `AbortSignal` son obligatorios para liberar recursos externos.
- El shell, WindowManager, MobileAppStack y CommandRegistry no se modifican para agregar una app.
- La carga lazy no es una frontera de seguridad; las capacidades siguen resolviéndose por separado.

## Checklist de investigación y decisión

- [x] Confirmar que el arranque no monta apps del catálogo.
- [x] Confirmar `registerLazy` y code-splitting real.
- [x] Medir bundle inicial y chunks principales con `vite build`.
- [x] Revisar que Tiptap esté aislado del bundle principal.
- [x] Decidir que no se migran apps eager pequeñas sin beneficio medido.
- [x] Definir convención para nuevas apps pesadas: `registerLazy`.
- [x] Definir requisitos de teardown para recursos externos.
- [x] Registrar ADR, actualizar guía, manual, índice y roadmap.
- [ ] Validar teardown GPU y política de concurrencia cuando exista la primera app WebGL real.
- [ ] Evaluar `preload` solo cuando una app real aporte una necesidad y medición.

## Pruebas obligatorias para una futura app pesada

- [ ] `vite build` antes/después; registrar bundle principal y chunk de la app.
- [ ] Network del navegador: el chunk no se descarga antes de abrirlo, salvo precarga aprobada.
- [ ] Abrir/cerrar repetidamente; comprobar que no quedan workers, timers, object URLs, audio ni contextos WebGL vivos.
- [ ] TypeScript, Vitest, `npm run task:check -- 297A-25` y `npm run self-check -- -TareaId 297A-25`.
- [ ] Viewports 1440x900, 1024x768, 390x844 y 320px.
- [ ] Desktop/tablet y móvil reutilizan la misma app y lifecycle.

## Definition of Done de 297A-25

- [x] Política eager/lazy documentada y validada con medición real.
- [x] Una futura app pesada puede agregarse con `registerLazy` sin tocar arranque ni runtime.
- [x] `preload` y `heavy` quedan deliberadamente diferidos, con criterios verificables para activarlos.
- [x] ADR, manual de arquitectura, guía de apps, índice y roadmap actualizados.
- [x] TypeScript, Vitest, build frontend y quality gate de documentación ejecutados.

## Evidencia

- `npm --prefix frontend run build`: PASS; 1936 módulos transformados.
- Bundle principal: ~159.66 KB minificado / ~46.05 KB gzip.
- Chunk Tiptap: ~294.64 KB minificado / ~87.48 KB gzip.
- CSS principal: ~53.22 KB / ~8.99 KB gzip.
- TypeScript: PASS.
- Vitest: 278/278 tests en 34 suites PASS.
- `npm run task:check -- 297A-25 --fresh`: PASS; 0 errores, VarSense 0 errores/2 warnings y custom 0 errores/5 warnings informativos.
- `npm run self-check -- -TareaId 297A-25`: PASS; reportes cacheados coherentes.
- Validación GPU/E2E de una app pesada: pendiente hasta que exista esa app.
