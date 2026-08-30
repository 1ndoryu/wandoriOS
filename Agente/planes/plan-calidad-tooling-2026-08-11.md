# Plan — Calidad y Tooling / segunda auditoría de Sentinel

> **Propósito:** plan canónico de calidad/tooling movido del roadmap.md para no estorbar el roadmap de
> producto. Este archivo es la fuente única del backlog de calidad movido. Los IDs se conservan como
> referencia en roadmap.md para que el gate docs-task-missing/assertTaskExists siga resolviéndolos.
> Regla de proceso: no cerrar tareas de calidad/tooling desde este backlog sin gate y evidencia.

## Estado verificado el 2026-08-12

Este documento reemplaza al alias histórico `Agente/calidad-tooling/roadmap-calidad-tooling.md`.
La auditoría detallada y su evidencia viven en
`Agente/documentacion/herramientas/auditoria-sentinel-segunda-2026-08-11.md`; aquí se conserva el
seguimiento por fases y no se duplican sus findings.

**Reauditoría 2026-08-12 (corte actualizado):** Sentinel `0.7.4 @ 0349485c` está publicado en
`main` y `v0.7.4`; compile/lint/suite locales pasan y las CI consecutivas #45 y #46 están verdes.
El audit de desarrollo conserva 1 high + 1 moderate en Mocha; producción queda sin vulnerabilidades.
`glory-rs-rest` fue repinado a `0.7.4` y publicado como `3cd9e655`; su doctor, lock, gate docs y suite
pasan. Los cinco findings `broadcast-mutex-riesgo-rs` siguen visibles como warning explícito de
política del producto.

**Criterio único de retirada:** se aplicó `Agente/documentacion/herramientas/runbook-retirada-wrappers-sentinel-2026-08-05.md` §3.
La capa A fue retirada después de verificar releases, matriz, PATH, enforcement y rollback; una carpeta
personalizada no se borra por nombre. La capa B permanece como adapter project-owned hasta SNT-10.

- **Consumidor vigente:** Sentinel `0.7.4 @ 0349485c` y VarSense `2.2.1 @ 88f281f9`; `doctor`, lock,
  runtime y suites pasan. `quality:setup` termina con evidencia de staging; el ruido de VS Code no deja
  divergencia. Wandorius tiene `gate:check` docs PASS y `quality:test` 232 PASS/1 omitido; glory-rs-rest ejecuta el
  gate canónico y conserva cinco findings de producto `broadcast-mutex-riesgo-rs`.
- **Correcciones locales adoptadas:** setup Windows sin `tar --force-local`, fixtures de mantenimiento
  en MB para evitar ENOSPC, `quality:doctor` delegado al CLI canónico e inventario de los 17 scripts.
- **Fixes upstream publicados/adoptados:** Sentinel `a3bdb92e` (`0.7.2`) conserva la corrección de `sentinel init --json`
  y añade regresión (8/8 bootstrap PASS); VarSense `88f281f` (`2.2.1`) consolida el descubrimiento del
  workspace (61 pruebas PASS). Ambos están fijados por gitlink, lock y release evidence en dos consumidores.
- **Rendimiento:** el histórico clean 24.831 s / VarSense 12.665 s queda conservado; con el pin publicado
  VarSense midió 5.913 s en el gate frontend y cold ~3.3 s/warm ~2.8 s instrumentado.
- **CI/retirada:** Sentinel `main` #45 y #46 pasan consecutivamente. La matriz focal de portabilidad
  pasa en Windows local y Ubuntu CI. La capa A ya fue retirada con evidencia PATH, enforcement y rollback;
  la capa B permanece hasta SNT-10 y no se copia a proyectos nuevos.
- **Seguridad upstream:** `npm audit --json` sobre Sentinel 0.7.1 reportó 10 vulnerabilidades high y 1
  moderate en dependencias de desarrollo; la actualización mayor queda separada de esta adopción.

### Seguimiento actual de la migración

### F10 — Reauditoría (cierre técnico, capa A retirada; capa B pendiente por diseño)

- [x] Publicar Sentinel `0.7.2` (`a3bdb92e`), `0.7.3` (`ea88d111`) y `0.7.4` (`0349485c`, `main` + `v0.7.4`).
- [x] Actualizar dependencias de desarrollo sin `audit fix --force`; `diff` queda fijado por override.
- [x] Corregir los tres `require()` que el lint nuevo convirtió en errores, conservando la carga dinámica de VS Code.
- [x] Verificar `npm run lint` (0 errores/12 warnings), `npm run test:unit` (558 passing/1 pending) y setup aislado.
- [x] Verificar `npm audit --omit=dev` (0); registrar 1 high + 1 moderate restantes solo en la cadena de pruebas Mocha.
- [x] Generar VSIX 0.7.4: `951778` bytes, SHA-256 `BF01826858219A6A97CB42DB6A55FC6CE08696E3C1B9BE295DB18B6CD7B76BE5`.
- [x] Repinar wandorius a `0349485c`, regenerar lock, actualizar runtime global a 0.7.4, doctor PASS y gate docs PASS.
- [x] Repinar y publicar `glory-rs-rest@3cd9e655`; mantener cinco findings broadcast visibles como warning de política.
- [x] Corregir transporte de perfiles explícitos en `scripts/quality/stages.mjs`; añadir regresión y repetir gate docs con cambio fuera del perfil.
- [x] Conseguir dos CI Ubuntu consecutivas verdes: Sentinel #45 y #46; la matriz focal de shells pasa en Ubuntu/Windows.
- [x] Ejecutar la pre-verificación final de §3 del runbook (PATH completo/sin runtime de desarrollo, smoke de enforcement y rollback documentado) y retirar solo la capa A; evidencia: exit 78 del shim global y rollback aislado.
- [ ] Mantener la capa B (`task:check`, adapters, reportería) hasta SNT-10: delegación completa y paridad comprobada; no eliminarla junto con los shims.

- [x] Los 17 scripts detectados por `sentinel migrate` tienen owner, propósito, consumidor, sustituto y
      condición de retiro en `Agente/documentacion/herramientas/inventario-scripts-adapters-sentinel-2026-08-06.md`.
- [x] El adapter vigente no declara `custom`; `gate:check` delega la decisión en `sentinel check`.
- [x] `AGENTS.md` y la skill `quality-gate-setup` prohíben carpetas personales/analyzers/reglas sin
      project-owner, fixture, presupuesto, owner único y sunset; el alias no canónico quedó solo como redirect.
- [x] Publicar/adoptar `tools/sentinel@b22c848` y `tools/varsense@88f281f`, probar rollback y verificar
      doctor/lock/gate en dos consumidores. La retirada de wrappers sigue condicionada a CI/matriz multi-shell
      y al baseline de producto documentado de glory-rs-rest.
- [x] Optimizar y medir VarSense cold con carga real; el resultado preparado está bajo 6 s.
- [x] Publicar/adoptar el fix y repetir la medición con el pin consumido (VarSense 5.913 s en gate frontend;
      cold/warm instrumentado bajo 6 s).

## Pendientes de calidad/tooling movidos

Los siguientes bloques y casillas fueron movidos aquí desde roadmap.md:

- 108A-1 — Auditoría completa de Glory Sentinel y quality gate (completada 10-08).
- 108A-6 — Retirada Legacy (capa A completada; capa B separada en SNT-10).
- Fases 0-9 de la auditoría 108A-1.
- 098A-1 — Agilizar la ceremonia de cierre de calidad (absorbido por 108A-1).
- 028A-18 — Orquestación universal de tareas con Sentinel.
- SNT-12 / SNT-13 / SNT-16b / SNT-16c / SNT-16d / SNT-16f — Migración de scripts a Core y adapters.
- 028A-3 — Guard global de ejecuciones pesadas y limpieza de targets.
- 028A-6 — Guard global agnóstico por proyecto y rama (migración incremental).
- 028A-8 — Optimización medible de Sentinel y VarSense.
- 038A-2 — Duración por etapa en el quality report.
- 038A-4 — Inventario de documentación desactualizada + README de Sentinel.
- SNT-11 — Cooldown de full y excepción manual auditada.
- 028A-16 — Auditoría del uso de excepciones del guard.

## Detalle histórico preservado

**108A-1 — Ejecutar la corrección de la auditoría completa de Glory Sentinel y el quality gate
(completada, 10-08-2026).** F0–F9 ejecutadas en orden; release publicado y consumidor adoptado;
push autorizado por el usuario. Plan de seguimiento: `Agente/planes/plan-ejecucion-auditoria-sentinel-2026-08-10.md`.

**108A-6 — Retirada Legacy (capa A completada).** Continúa la adopción posterior a la auditoría:
stage `custom` retirado (commit `2244eee7`), segundo consumidor adoptado, y la release **0.7.0** de
Sentinel publicada en `main` + tag `v0.7.0` (merge de la auditoría sobre 0.6.4; el pin anterior
`c1f8f1f` era una rama sin publicar y bloqueaba el preflight del Core). Doble vía real:
`observe-compare` en 108A-1 y 297A-78 con decisión y hallazgos idénticos; gate canónico `gate:check`
(`sentinel check --stages`) integrado en CI y en `export-ci-metrics`. **Pendiente condicionado:**
retirada física de la capa A (shims del repo + `quality-command-guard`) y de la capa B
(orquestador local) cuando dos releases consecutivas en verde permitan rollback (runbook
2026-08-05 §3); la release 0.7.0 es la primera.

**Fase 0 (cerrada, commit `b397a135`):** gate ejecutable y baseline confiable. Hotfix P0
(`preflightStartedAt` sin declarar → ReferenceError), `phaseDurationMs` en `metrics.json`,
contención de analizadores (`**/.sentinel/**`, `**/.vscode-test/**`, `**/tools/**` en VarSense;
`**/.sentinel/**` en Sentinel), herencia de tokens de sanción a etapas, inventario de
`scripts/quality` con congelación de features, skill `quality-gate-setup` v1.2.0 corregida,
suite `quality:test` 237/238 PASS y gate real estructurado. El gate canónico vigente es `gate:check`;
la capa A ya fue retirada con dos releases verdes, matriz focal, enforcement y rollback; la capa B queda
separada en SNT-10.
Pendiente histórico: gate **full**
definitivo (cooldown 180 min o `--allow-heavy` con autorización explícita, regla 028A-16).
Baseline: `Agente/prevencion/bench-ceremonia-2026-08-09.md`.

**Fase 1 (cerrada en worktree `f1/cli-contracts` `1942cf5`, adopción en F8):** contratos CLI de
Sentinel corregidos en worktree exclusivo (`area-trabajo/.sentinel-upstream-f1`), checkout
consumidor intacto. Logger → stderr (stdout JSON puro), doctor separa
`readyForAnalyze`/`readyForGate` (no-policy nunca gate-ready), `check --dry-run` estrictamente
no mutante, presupuestos conectados en `quality:profile` (`--budgets` → config efectiva,
`--budgets-json`/`--budgets=` override, exit 1 + reporte estructurado + evidencia insuficiente
visible), tests de proceso CLI (`cliProcess.test.ts`), lint 0 errores (9 preexistentes
absorbidos) y gate upstream PASS (compile + lint + test:unit 506/506). Los ítems canónicos
restantes (perfil segmentado y presupuestos en `sentinel check`) caen con la consolidación
F4/F5.

**Fase 2 (cerrada en worktree `f1/cli-contracts` `546f31e`, adopción en F8):** Sentinel
delimitado como producto único. ADR 0001 (`docs/adr/0001-producto-unico-sentinel.md`: gate =
`sentinel check`, módulos `analysis`/`gate`/`runtime`/`task`/`editor`, una regla un dueño,
budgets de tamaño); registro de extensiones (`extensionRegistry.ts` — colisiones de rule IDs
contra el núcleo y entre extensiones, ejecutables no declarados); fronteras en `check:core`
(cli sin `vscode`, DIP sin módulos del editor ni `scripts/quality`, `check` independiente de
shims/perfiles/worktrees, budgets por módulo); CLI dividido en `args.ts` + `commands.ts` +
barril; `task`/`recover`/shims como capabilities opcionales del doctor. Gate upstream PASS:
compile + lint (0 errores) + test:unit **513 passing, 1 pending** (7 tests nuevos) + check:core
OK. La consolidación física de archivos en los módulos queda en F5/F6.

**Fase 3 (cerrada, worktree VarSense `f3/varsense-perf` commit `998505c` + consumidor `6ba9f265`;
adopción en F8):** rendimiento de
VarSense, setup y suites. CLI de VarSense instrumentado con `phaseDurationMs` (config, índices
de variables/clases, discovery, análisis, token-rules, orphan, agrupado, save) + `metrics`
también en `scan`. Bench `scripts/quality/bench-varsense.mjs`: fixture determinista (2/12/120),
modos cold/warm × scoped/full, benchmark JSON versionado con p50/p95 por fase y métrica,
presupuesto efectivo (6.000 ms) sobre warm-scoped con exit 1 ante regresión confirmada.
Medición: **warm-scoped p95 ~305 ms** (120 archivos) — ~20× bajo el presupuesto; cuello =
`classIndexMs` (verificación SHA-256); el fast-path mtime se rechaza por tradeoff de
invalidación (índice incremental en F5). Contrato de artifact publicado de VarSense
(`docs/artifact-contract.md`: manifest version/commit/protocol/capabilities/SHA-256);
publicación de artifacts en F8. Gate worktree VarSense PASS: lint 0 errores, check:core OK,
smokes OK. Suite consumidor con 4 tests nuevos del bench.

**Fase 4 (cerrada en worktree `f1/cli-contracts`, adopción en F8):** bootstrap reproducible
`sentinel init`/`migrate`/`uninit`. `init --preset <node|rust|python|mixed>` genera solo el
contrato mínimo (`sentinel.config.json` v2 + `sentinel.lock.json` + `.sentinel/init-manifest.json`)
sin `scripts/quality` ni submódulos: presets agnósticos (patrones + `guard.directCommands`),
rama real detectada sin asumir `main`, idempotente (contenido idéntico → `skip`), `--dry-run`
no mutante, `--force` con backup/rollback por archivo, alias npm opcional
(`--with-alias` → `sentinel check`); `migrate` descubre gate/scripts legacy y emite inventario
+ riesgos sin borrar ni desactivar cobertura (aplicación real en F5); `uninit` retira solo lo
administrado (init-manifest, containment; sin manifest → exit 1). Doctor: `readyForGate=true`
tras init completo (issue `tools-manifest-missing` eliminado: el contrato se reduce a
config+lock). Handlers en `src/cli/bootstrapCommands.ts` (commands.ts dentro del budget del
ADR 0001). Gate upstream PASS: compile + lint (0 errores, 12 warnings de deuda) + check:core
OK + test:unit **520 passing, 1 pending** (9 tests nuevos: presets v2, idempotencia,
conflictos/backup, migrate no destructivo, uninit acotado, E2E CLI).

**Fase 5 (COMPLETADA en worktree `f5/consumer-migrate`, commits `e0bec3e1` + `bad010f4`):**
migración del consumidor y consolidación del gate. Pin local del release F4, lock
regenerado, clasificación del inventario con tabla de ownership, decisión de
`async-without-abort` y `subscription-without-dispose` (observe-only con fixture: 50% FP,
sin core equivalente), doble vía de releases 1:1 (10 archivos mixtos), y cinco tareas
reales completadas (docs PASS, frontend PASS, rust PASS, mixed PASS, error de herramienta
= rust-test FAIL). El cierre del alias `task:check` → `sentinel check` y la retirada de
`custom` quedan habilitados tras la adopción F8.

**Fase 6 (COMPLETADA en worktree `f1/cli-contracts` commit `c1f8f1f` + consumidor
`304a474d`):** escalabilidad local, seguridad y operación. Fixtures de seguridad
(contención de paths con symlink/junction real, redacción con 2 bugs corregidos:
`Authorization: Bearer <token>` expuesto y backtracking catastrófico de URL_CREDENTIALS
60s→50ms; escritura atómica; lock corrupto). Concurrencia: claims 1/2/4/8 en el mismo
workspace y 2/4 gates simultáneos (JSON íntegro, decisión idéntica). `doctor --shims`
(`src/core/shimDiagnostics.ts`): lista el ganador real de PATH (cargo → GlorySentinel
gana). Bench-shims: overhead p95 291–769ms > presupuesto 50ms → los shims legacy deben
salir de la ruta normal (reemplazo canónico `sentinel guard`/`check`). ADR 0001 (F6):
coordinación local por workspace/clon, límites de recursos. Gate upstream: 536 passing.

**Fase 7 (COMPLETADA commit `71e26bd8`):** documentación consolidada. Índice documental
actualizado con artefactos de la auditoría; lecciones aprendidas de F0–F6 registradas
(bugs de redacción, overhead de shims, logging a stderr, regex FP, idempotencia de init,
worktrees para cambios upstream).

**Fase 8 (COMPLETADA):** release y adopción. Sentinel 0.7.0 (`a804c0d`) y VarSense 2.2.0
publicados en origin; wandorius y glory-rs-rest adoptaron el mismo pin, lock y doctor PASS.
El consumidor actual incorpora el commit documental `ea8f47e`; `gate:check` delega en `sentinel check`;
push autorizado por el usuario (2026-08-10).

**Fase 9 (COMPLETADA CON PENDIENTES CONDICIONADOS):** verificación final y cierre documental.
La retirada física de capas A/B espera una segunda release verde con rollback.

**098A-1 — Agilizar la ceremonia de cierre de calidad (ABSORBIDO por 108A-1, 10-08; aprobado
09-08).** Conservado como historia. Plan original:
`Agente/planes/plan-agilizar-ceremonia-cierre-calidad-2026-08-09.md`.

**028A-18 — Orquestación universal de tareas con Sentinel (en curso).** El siguiente bloque de tooling permanece serializado hasta completar su integración, gate y cleanup. La iniciativa SNT-12 queda registrada como plan dependiente/aprobable, no como tarea paralela habilitada.

**SNT-12/SNT-13/SNT-16b/SNT-16c/SNT-16d/SNT-16f — Migración de scripts a Core y adapters por proyecto (snapshot histórico 0.6.0).** La evidencia inicial de 0.6.0 queda conservada para trazabilidad. El estado vigente es el release 0.7.0 (`a804c0d`) con el pin documental `ea8f47e` en el consumidor, `gate:check` → `sentinel check`, stage `custom` retirado y skill v1.2.0 actualizada. Solo queda la segunda release verde con rollback antes de retirar físicamente las capas legacy.

**Detalle de SNT-16d/SNT-16f — Preflight, capacidades y recuperación segura (snapshot histórico 0.6.0).** Los contratos se conservaron y fueron re-adoptados en 0.7.0; `doctor`, `task status`, `task recover` y `quality:setup` siguen sujetos al commit/lock fijado. No se debe usar este bloque histórico para bootstrap nuevo.

**Detalle de 028A-18 — Orquestación universal de tareas con Sentinel (en curso).** El plan canónico define una
unidad de paralelismo por tarea (`claim → worktree/rama → gate → integración ff-only → cleanup`),
ownership atómico, detección de carreras, takeover explícito y diagnóstico de basura. Sentinel 0.7.0
está publicado en `origin/main` y `v0.7.0`; la release anterior permanece como rollback, mientras ambos
consumidores fijan `tools/sentinel` en `ea8f47e`. Este bloque queda histórico; la retirada física de capas
legacy solo se ejecuta tras la segunda release verde y rollback.

**018A-66 — Separar overlay personal de la sesión admin.** El código está cerrado (`52bf6e0c`): `overlay-sync` corta la sincronización con capacidad admin (clearOverlaySync) y la UI de conflicto cierra el modal en `render` si la sesión pasa a admin (guardia anti-flash ante órdenes de notificación distintos). Se añadió cobertura de la guardia UI (`overlay-conflict-ui.test.ts`): admin + estado conflict → sin modal; cuenta normal + conflict → modal abierto y se cierra al pasar a admin vía clearOverlaySync; sin conflict → sin modal. 89/89 tests del workspace y type-check PASS. **Pendiente de validación en navegador** (requiere sesión admin real del usuario): login, logout y recarga con admin sin modal de conflicto ni aviso `workspace actualizado`; con cuenta no-admin el conflicto solo aparece ante revisiones local/remota incompatibles. Después se continúa con hardening/E2E.


### 028A-3 — Guard global de ejecuciones pesadas y limpieza de targets

**Prioridad:** P0 antes de seguir acumulando validaciones Rust. El quality gate ya tiene cooldown y el shim CMD; queda revisar/autorizar la carga del interceptor en perfiles PowerShell sin sobrescribir configuración ajena.

- [x] Limitar `--full`, `cargo test`, `cargo clippy` y `cargo bench` a una ejecución por proyecto cada 3 horas, con un único proceso pesado simultáneo.
- [x] Degradar un full bloqueado a `local-light` y dejar la razón, hora de reintento y comando de excepción en el reporte.
- [x] Interceptar `cargo` a través de `run-with-db` y del shim `cargo.cmd`; los comandos ligeros siguen pasando sin compilar tests.
- [x] Mantener `C:\tmp\glory-target` bajo cuota estricta de 7 GB y retención de 7 días: la cuota se revisa en cada gate con lock entre agentes, preserva procesos/targets activos y poda automáticamente candidatos seguros; si solo quedan targets activos, reporta `quotaExceeded` sin matar procesos.
- [x] Validar el guard con tests unitarios, `quality:test` y limpieza en dry-run; limpiar los targets antiguos detectados (se liberaron aproximadamente 29 GB).
- [x] Revisar el perfil PowerShell 7/Windows PowerShell y ejecutar `quality:install-guard -InstallProfile` con autorización explícita; backups y rollback quedaron registrados.
- [x] Bloquear validaciones directas (`npx vitest`, `npm run test:*`, type-check/lint/build y Cargo de validación) desde PowerShell/CMD; todas recomiendan `npm run task:check -- <TareaId>`.
- [x] Cubrir Bash/Git Bash y shells no interactivos: instalar `global-quality-guard.sh` en `.bashrc`/`.bash_profile` y `BASH_ENV`, con resolución por workspace/rama; bloquear también `rustfmt` directo.

**Gate/salida:** ningún agente puede iniciar accidentalmente un full o `cargo test` durante el cooldown desde los wrappers PowerShell/CMD/Bash disponibles; el uso de `--allow-heavy` queda visible en reportes y la cuota de targets se mantiene sin borrar procesos activos. Invocaciones con ruta absoluta y shells iniciados con `--noprofile --norc` quedan fuera del alcance del interceptor y deben bloquearse en la capa de ejecución del agente, no mediante un script de proyecto.

### 028A-6 — Guard global agnóstico por proyecto y rama (migración incremental)

**Depende de:** 028A-5 y de aprobar `Agente/planes/plan-global-quality-guard-agnostico-2026-08-02.md`.

- [x] Definir y validar localmente la política v2 en `scripts/quality/policy.mjs`, sin reutilizar silenciosamente el `sentinel.config.json` v1 del analizador.
- [x] Añadir `quality:doctor -- --migrate --dry-run`; produce migración en memoria, `writes: []` y no modifica perfiles/archivos.
- [x] Hacer que el guard de transición aplique `enforce`/`observe`/`pass-through` para una política v2 válida y conserve fallback seguro para v1/legacy.
- [x] Cubrir el contrato con 60 tests de quality y fixtures de claves desconocidas, paths inseguros, modos, wildcard, migración, lockfile, checkout modificado e identidad de caché/reporte.
- [x] Añadir `policyHash`/identidad de política al reporte y fingerprint de caché; cambiar la política invalida PASS anteriores.
- [x] Añadir `sentinel.lock.json` con runtime/analyzers fijados, versión/protocolo/commit/hash, patch local declarado, validación preflight, `git archive` reproducible y rechazo de checkouts modificados; runtime global queda explícitamente `project-adapter`.
- [x] Añadir generador local del lock (`quality:lock --check|--write`, `quality:doctor --lock`) con modo solo lectura, backup `.bak`, escritura atómica y protección contra symlinks; no instala runtime ni modifica analyzers.
- [x] Alinear el inventario documental local: README raíz, `roadmap-sentinel.md`, matriz de paridad e índice canónico describen el gate, `varsense all`, lockfile, branch-key, retención y límites del runtime global.
- [x] Completar `doctor --migrate --dry-run`: mapea Sentinel v1, quality, VarSense y tools a un preview aditivo, rechaza claves desconocidas y conserva `writes: []` sin modificar contratos.
- [x] Definir precedencia local de perfiles: `--profile` CLI > `GLORY_QUALITY_PROFILE` > autodetección; ambos solo aceptan perfiles declarados y un perfil explícito filtra etapas incluso con `--full`/`--ci`.
- [x] Cerrar fuente canónica local: únicamente `sentinel.config.json` ancestro determina política/hash; `AGENTS.md`, `quality.config.json` y scripts auxiliares no se interpretan como reglas. Política inválida falla doctor/CI sin bloquear comandos desconocidos.
- [ ] Extraer el runtime y los shims a una instalación estable fuera de cualquier repositorio o rama. *(bloqueado: runtime/repos upstream no presentes en este checkout)*
- [ ] Migrar wandori.us al runtime global sin duplicar reglas ni dejar rutas hardcodeadas en perfiles. *(depende de la anterior)*
- [ ] Probar matriz multi-proyecto/multi-rama en PowerShell 5/7, CMD, CI, pipes y códigos de salida, con rollback. *(depende de runtime global)*

**Gate/salida del tramo local:** contrato v2, dry-run, guard y tests pasan; el gate global multi-proyecto/multi-shell no se declara cerrado hasta instalar el runtime fijado y ejecutar la matriz externa.

### 028A-8 — Optimización medible de Sentinel y VarSense (en curso, tramos 1–4 cerrados)

**Depende de:** 028A-5 y 028A-6. Plan canónico: `Agente/planes/plan-optimizacion-sentinel-varsense-2026-08-02.md`.

- [x] Corregir la degradación full→local-light para que el alcance efectivo no siga ejecutando análisis completo tras el cooldown: `scope.mjs` separa requested/automatic/effective/fullReason/heavyDeferred y `task-check.mjs` adquiere el lease pesado también para automaticFull; un full diferido degrada a local-light real (verificado en gate 028A-8 con `full · ejecución incremental (heavy-deferred)`).
- [ ] Compartir un manifiesto de alcance/hashes entre etapas y añadir métricas de descubrimiento, parseo, caché, archivos reutilizados, RSS y CPU. *(el `scope-manifest.json` único con hashes ya está emitido y `run-frontend-tests` lo consume; las métricas por etapa del orquestador quedaron: `probeCachedPass` expone la razón de invalidación, `runVarsense` propaga filesAnalyzed/filesReused/cacheHitRate/peakRssMb al reporte y `npm run quality:profile` calcula p50/p95 por etapa y total desde los últimos reportes — Fase 0/4 parcial)*
- [ ] Añadir modo incremental de VarSense con `--files-from`, índices persistentes de variables/clases y invalidación por dependencias. *(el adapter `--files-from` y el índice persistente están fijados: upstream `11f0932` en el `main` consumido, `capabilities.persistentIndex=true`, lock regenerado y gate real con reutilización (loaded=363, reused=364, reparsed=0); queda la selección de dependencias con el índice inverso para ampliar `--files-from` con consumidores)*
- [ ] Optimizar Sentinel con caché por archivo/índice global, sin duplicar reglas con custom ni reducir cobertura.
- [ ] Validar p50/p95, paridad CLI/LSP/VS Code/Zed, rollback y una matriz con otro proyecto/estructura.

**Gate/salida:** local-light representativo ≤12 s p95, VarSense incremental ≤3 s p95 sin cambios globales, Sentinel incremental ≤3 s p95 y full CI conserva paridad.

## Bloques de calidad movidos de Pendientes ordenados

### 038A-2 — Duración por etapa en el quality report

**Depende de:** nada (solicitud directa del usuario). El orquestador ya medía `durationMs` por etapa en `latest.json`; faltaba renderizarlo en el Markdown y en la salida compacta.

- [x] Renderizar `stage.durationMs` en `latest.md` con `formatDuration` (ms < 1s, s con 1 decimal) y duración total legible en `scripts/quality/reporter.mjs`.
- [x] Añadir la duración por etapa a la salida compacta de terminal (`compactLines`) sin añadir líneas (mantiene el límite validado por `reporter.test.mjs`).
- [x] `npm run quality:test` 45/45 PASS; render verificado con `task:check` (sentinel 6.7s, varsense 10.1s, rust 26.1s, frontend 6.0s, docs 10ms, custom 81ms).

**Gate/salida:** el reporte Markdown muestra la duración de cada etapa y la salida compacta también; tests del orquestador verdes. Gate completo del repo pendiente de errores TS ajenos en `about.ts`/`admin.ts` (otro frente en curso).

### 038A-4 — Inventario de documentación desactualizada + README de Sentinel alineado con v0.4.0

**Depende de:** nada (solicitud directa del usuario). Origen: el plan 028A-6 no contemplaba qué documentación corrige la migración a plano global.

- [x] Añadir al plan `028A-6` la sección "Documentación afectada e inventario de correcciones" con todos los MDs desactualizados (README/help.txt/rules.md/CHANGELOG de sentinel, README/CHANGELOG de varsense, sincronización de repos dev con commits fijados, README raíz, roadmap-sentinel, matriz-paridad, índice de documentación).
- [x] Reescribir `code-sentinel/README.md` eliminando la era IA (análisis IA, toggle IA, config `aiAnalysis.*`, alias Gemini; todo eliminado en 0.4.0) y documentando el estado real: CLI `analyze` + `--files-from`, exit codes 0/1/2, JSON `schemaVersion: '1'`, validación estricta de `sentinel.config.json` (incl. `portableBoundaries`), catálogo completo de reglas del `ruleRegistry` y rol de plano global. Commit `95ac5b0` en `1ndoryu/glory-sentinel`.
- [x] Sincronizar el README actualizado al `main` externo de `glory-sentinel` (`9f4ed4d`), que es el checkout consumido por el gate mediante `sourcePathEnv`.

**Gate/salida:** README de sentinel sin restos de IA y coherente con el código fijado; el resto del inventario queda planificado en 028A-6 para implementarse con cada fase.

### SNT-11 — Cooldown de full: cooldown obligatorio + excepción manual auditada (cerrada, 05-ago)

**Motivo:** el 05-ago la excepción manual (`--allow-heavy` / `GLORY_QUALITY_ALLOW_HEAVY`) saltó
el cooldown de 180 min y ralentizó el equipo en desarrollo. `028A-16` lo hizo auditable; SNT-11
primero lo desactivó y, por decisión explícita del usuario el mismo día, **se re-activó la concesión
manual SIN eliminar el cooldown**: `HEAVY_MANUAL_OVERRIDE_ENABLED=true` — el cooldown sigue
bloqueando las ejecuciones pesadas normales (sin excepción) y toda activación manual con motivo
concede y queda auditada en `heavy-overrides.log` como `granted:true` (fuente, comando, PID,
motivo, tarea). Un intento sin motivo se rechaza (`heavy-reason-required`). CI (modo sancionado)
sigue autorizado a full sin cooldown.

- [x] Cooldown conservado como mecanismo: las ejecuciones normales (sin `--allow-heavy`) siguen
diferidas por el cooldown de 180 min.
- [x] Excepción manual re-activada con auditoría: `--allow-heavy --heavy-reason "<motivo>"` (o
`GLORY_QUALITY_ALLOW_HEAVY=1` / `GLORY_HEAVY_RUN_TOKEN`) concede sobre el cooldown y queda
registrado en `heavy-overrides.log` con `granted:true`. Tests del guard actualizados (215/215
quality) y gate PASS.

**Gate/salida:** `task:check --full --allow-heavy --heavy-reason "<motivo>"` concede (auditado);
`task:check --full` sin excepción se difiere por cooldown; `npm run quality:test` (guard) PASS.

### 028A-16 — Auditoría del uso de excepciones del guard (prevención cooldown)

**Depende de:** coordinar con `Agente/planes/plan-heavy-run-guard-2026-08-02.md` (el otro agente posee `scripts/quality/`). Fuente: `Agente/prevencion/completados/prevencion-cooldown-guard-2026-08-02.md` (archivada).

- [x] Registrar en un log auditable (`.quality-reports/heavy-overrides.log`) cada activación de la excepción (`--allow-heavy`, `GLORY_QUALITY_ALLOW_HEAVY`, `GLORY_HEAVY_RUN_TOKEN`): timestamp, source, comando completo, cwd, PID. `logHeavyOverride` escribe una línea JSONL por evento (concedido o denegado) y nunca bloquea la decisión; `acquireHeavyRun` y el `--execute-cargo` del shim lo invocan. Tests en `heavy-run-guard.test.mjs`.
- [x] Exigir motivo (`--heavy-reason "<motivo>"`) para activar la excepción y mostrarlo en el reporte del gate. Sin motivo, `inspectHeavyRun`/`acquireHeavyRun` rechazan con `heavy-reason-required` (el intento queda en el log); el motivo se acepta por flag o por `GLORY_HEAVY_RUN_REASON`; el reporte expone `heavyOverride` con source/motivo y la línea `OVERRIDE` en Markdown/compacto.
- [x] El agente solo usa las excepciones del guard con autorización explícita del usuario en el mismo turno; nunca para "no esperar". *(regla de proceso, ya registrada en prevención y lecciones)*

**Gate/salida:** cualquier uso de la excepción queda trazado y visible; el agente no intenta saltarse el cooldown sin autorización explícita. `npm run quality:test` 156/156 PASS y `task:check -- 028A-16` PASS (local-light, full diferido por cooldown). La prevención `prevencion-cooldown-guard-2026-08-02.md` queda archivada.

### 098A-1 — Agilizar la ceremonia de cierre de calidad (ABSORBIDO por 108A-1, 10-08)

> **10-08-2026:** este bloque queda absorbido por `108A-1` (auditoría §14). Su F0 se completó
> dentro de la Fase 0 de 108A-1 (`phaseDurationMs` instrumentado y baseline guardado); F1–F6 no
> se implementan en `scripts/quality` (no-goal de la auditoría) sino en fases posteriores
> (Core/CLI/planner). El checklist siguiente se conserva como historia.

**Aprobado por el usuario (OK 09-08-2026).** Plan canónico:
`Agente/planes/plan-agilizar-ceremonia-cierre-calidad-2026-08-09.md` (veredicto thinker
"VIABLE CON RESERVAS", P1 aplicadas). Ataca el overhead de cierre: preflight/mantenimiento
incondicionales, evidencia no visible desde worktrees, ceremonia pesada por tarea y caché fría.
**No toca el submódulo `tools/sentinel`** ni releases upstream (solo `scripts/quality/`,
`quality.config.json`, `AGENTS.md` del consumidor), por lo que no rompe la serialización de
028A-18. Cambios a `scripts/quality/` se cierran con gate completo (automaticFull), nunca docs-fast.

- [ ] **F0** — Medición y trazabilidad base (sin cambiar el flujo): `phaseDurationMs`
      (`preflightMs`, `maintenanceBeforeMs`, `maintenanceAfterMs`, `stageMs`, `reportWriteMs`)
      en `metrics.json`; `task:check` real sobre cambio documental (caché fría/tibia) y código
      local-light; verificar reuso de setup/evidencia en worktree; línea base en
      `Agente/prevencion/bench-ceremonia-2026-08-09.md`.
- [ ] **F1 (PRIORIDAD)** — Evidencia y raíz común: worktrees nuevos ven
      `.sentinel/release-evidence/` (git common dir o `releaseEvidenceRoot` alistado); el doctor
      pasa sin `tool-release-evidence-missing` en un worktree recién creado.
- [ ] **F2** — Fast path documental: módulo puro `fast-path.mjs` (SRP), `verifyLight`
      (sin `git archive`/`git diff`), secuencia `preflight(verifyLight) → sentinel → docs`,
      nunca `custom`; reporte con `mode:'docs-fast'` + `fastPath:true` + `reason`; target-
      maintenance con `quotaCheckAt` (vigencia 24 h) en vez de retención bloqueante.
- [ ] **F3** — Reuso de setup y caché entre tareas: `cacheRoot`/`releaseEvidenceTtlHours`
      alistados; `setup.mjs` salta compile+suite si evidencia fresca para el commit fijado
      (`reuse:true`); doctor añade `releaseEvidenceReused`; lock de caché por rama.
- [ ] **F4** — Cierre consolidado: `task:close <ID>` con `--root` explícito; gate PASS →
      integrate/cleanup/release; FAIL → no libera claims; política de agentes de cierre y
      checklist compacto en `AGENTS.md` (docs-fast sin reviewer/inspector).
- [ ] **F5** — Eficiencia operativa: batch de comandos Git, `rg` dirigido con exclusiones,
      pre-aprobación de prefijos seguros.
- [ ] **F6** — Verificación final y adopción: `quality:test` PASS (228+), `quality:lock --
      --check` y doctor PASS, bench contra F0 (docs-fast ≤20-30 s; código <10 min), 3 tareas
      reales, modelo de carga nominal, self-gate full del plan, roadmap/prevención actualizados.

**Gate/salida:** cada fase del plan se cierra con su propio `task:check -- 098A-1` (o el ID de
fase que declare), con DoD observable según el plan (7 criterios).
