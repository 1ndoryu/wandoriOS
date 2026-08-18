> **CANCELADO (2026-08-12, decisión del usuario):** contenido de Sentinel/quality gate. Se archiva sin ejecutar; no es trabajo pendiente.

# Roadmap Sentinel / VarSense / Quality Gate — wandori.us

> **Fecha:** 2026-08-01  
> **Alcance:** exclusivamente Glory Sentinel, VarSense y la migración del orquestador `scripts/quality` hacia Sentinel.
> **Fuera de alcance:** funcionalidades del OS, frontend, backend, comercio, móvil y roadmap principal.  
> **Objetivo:** convertir los hallazgos y scripts nacidos en este proyecto en capacidades agnósticas, rápidas, portables y mantenibles para cualquier proyecto, con Sentinel como único plano de control y VarSense como analizador especializado.

> **Estado (018A-43):** mínimo operativo cerrado y verificado; el roadmap principal queda desbloqueado. El commit no es requisito universal: el reporte recuerda cuándo conviene hacer staging/commit/push y cuándo documentar trabajo intermedio o compartido. El gate sí exige prueba y reporte reproducibles.

> **Estado vigente (segunda auditoría, corte final):** Sentinel 0.7.4 (`0349485c`) y VarSense 2.2.1
> (`88f281f`) están publicados y adoptados por wandorius y glory-rs-rest con lock/doctor alineados.
> `gate:check`
> genera el manifest y delega la decisión en `sentinel check`;
> `task:check` queda como compatibilidad temporal. El stage `custom` fue retirado de ambos consumidores.
> La skill `quality-gate-setup` v1.2.0 ya prohíbe copiar `scripts/quality` y documenta la migración de
> carpetas legacy. El rollback 0.7.1 ↔ 0.7.0 se probó en el runtime local y quedó restaurado en 0.7.1.
> La capa A (shims/guards duplicados del repositorio) ya fue retirada con paridad, enforcement y rollback
> verificados. La capa B (`task:check` y adapters) permanece como compatibilidad hasta SNT-10; no se copia
> a proyectos nuevos. glory-rs-rest conserva un baseline de producto `broadcast-mutex-riesgo-rs` que debe
> resolverse por separado. Las secciones históricas inferiores conservan evidencia de la transición.

> **Toma de tareas (028A-17, 2026-08-05; enforcement 018A-97):** los agentes marcan la tarea que empiezan y la liberan al terminar. `npm run task:take -- --task <ID> --by <agente>` crea un marcado en `.quality-reports/task-takeover/<taskId>.json` (ignorado por git) cuyo identificador `T-<epochMs>-<hex8>` codifica el instante exacto de la toma; `npm run task:status` lista tomas y expiraciones; `npm run task:release -- --task <ID>` libera. Reglas: una tarea tomada por otro agente activo se rechaza (exit 1); un marcado que supera 6 h sin liberarse se considera olvidado y cualquier agente puede re-tomarlo (`--force`, con aviso) o liberarlo. **Enforcement:** `task:check -- <ID>` **bloquea (exit 78)** el cierre de una tarea tomada por otro agente activo salvo `--allow-foreign` explícito (validación legítima tipo CI); la toma propia se renueva en cada gate (heartbeat, trabajo largo no expira a mitad); y cualquier `task:check`/`run-with-db`/`glory-dev` muestra un banner `EN CURSO` por cada toma ajena activa, no solo la tarea objetivo. El reporte expone `taskTakeover`. Verificado: `quality:test` 210/210 y flujo real take/status/conflicto/check-bloqueado(78)/check-allow-foreign/heartbeat/release en vivo. Regla documentada en `AGENTS.md` §6.

> **Decisión de alcance:** las fases SNT-02 a SNT-10 que siguen con casillas abiertas son backlog diferido. No se ejecutan como requisito de una tarea del producto mientras el gate mínimo pase, no haya regresión de rendimiento y no aparezca un finding bloqueante real. Las extensiones de reglas, paridad de adapters, benchmarks y publicación upstream quedan para una iteración específica de tooling.

## Prioridad para desbloquear el roadmap principal

Este es el único conjunto que debe ejecutarse antes de continuar con una tarea normal del producto:

- [x] `npm run quality:test` pasa la suite del orquestador.
- [x] `npm run task:check -- <task-id> --fresh` pasa Sentinel, VarSense, stack afectado y documentación.
- [x] El gate diferencia error de herramienta, finding bloqueante, warning e información.
- [x] El reporte conserva detalle en `.quality-reports/` y muestra el recordatorio condicional de commit.
- [x] Sentinel y VarSense están fijados en `quality-tools.json` y no requieren instalación automática para trabajar localmente.

Con este checklist cerrado, las mejoras restantes de este documento son backlog y no deben bloquear el siguiente bloque de `roadmap.md`. Solo vuelven a ser prioridad si aparece un fallo real del gate, una regresión de rendimiento o una tarea del producto que dependa de ellas.

### Backlog diferido deliberadamente

- Paridad formal CLI/LSP/VS Code con fixtures idénticas.
- Concurrencia multi-proceso y matriz CI real del runtime global; la fixture local ya cubre cambio de rama dentro del mismo proceso, aislamiento de identidad CI, refs peligrosas, locks entre namespaces y retención best-effort (`scripts/quality/tests/branch-isolation.integration.test.mjs`, `scripts/quality/tests/report-retention-stage.test.mjs`).
- Invalidación avanzada de índices, benchmarks RSS/tiempo y paralelismo optimizado.
- Reglas de seguridad y arquitectura de baja frecuencia (MFA, permisos client-only, webhooks, rollback optimista).
- Perfiles de tema, referencias circulares y precisión avanzada de VarSense.
- Publicación upstream, reinstalación `.vsix`, changelog, ADR y guía de migración.
- Retirada de la capa A completada; la capa B (`task:check`/adapters) queda como compatibilidad hasta SNT-10.
  SNT-10 debe retirar solo la lógica que Sentinel Core ya cubra, con paridad y rollback; no implica borrar
  carpetas por nombre ni copiar adapters entre proyectos.

## Cómo usar este roadmap

- Los IDs `SNT-*` son identificadores internos de este roadmap; al ejecutar una tarea se les asignará el task ID diario exigido por `AGENTS.md`.
- Una casilla solo se marca con evidencia: fixture, prueba CLI/LSP/VS Code equivalente, reporte y quality gate.
- El core de Sentinel/VarSense no recibe reglas, rutas, nombres de clases, idiomas ni decisiones de wandori.us.
- **Estado actual:** el proyecto todavía conserva `sentinel.config.json`, `varsense.config.json`, `quality.config.json` y `quality-tools.json`; los dos últimos son contratos de transición y no deben copiarse a proyectos nuevos.
- **Destino:** `sentinel.config.json` v2 contiene política, gate, guard, runtime y analyzers; `sentinel.lock.json` fija versiones/hashes. VarSense no crea gate, cooldown ni reporte de cierre propio.
- Mientras exista una regla en scripts locales, el adaptador debe marcarla como puente temporal y registrar su paridad con el core; no se crean nuevas reglas ni carpetas personales de agentes.
- Cada fase termina con revisión SOLID, rendimiento, falsos positivos, seguridad de paths/secretos y compatibilidad Windows/Linux/macOS.

## Estado 028A-8 (tramos 1–5) y 028A-6 (SNT-10 — Fase 1 cerrada)

- **028A-8 tramo 5 + submódulo de Sentinel (2026-08-05):** el checkout consumido de Sentinel pasó a ser el submódulo interno `tools/sentinel` (commit pin en `.gitmodules` + gitlink); `quality-tools.json` usa `sourcePath: "tools/sentinel"` y `quality:setup` inicializa/compila en clon limpio. **El gate ya no depende de ninguna variable `GLORY_*`**: sentinel y varsense quedan fijados por gitlink; el lock no declara `sourcePathEnv`. Setup y `quality:test` 136/136 PASS sin env.
- **Bypass por runtime de node cerrado (2026-08-05):** `node node_modules/vitest/vitest.mjs run` eludía el guard invocando el runtime directamente (el guard intercepta por nombre de ejecutable: npm/cargo/vitest/tsc…). Ahora `node` también se intercepta SOLO cuando el primer argumento no-flag es el entrypoint de una herramienta de la allowlist (vitest.mjs/tsc/eslint.js/prettier.cjs y sus nombres) o cuando `node --run <script>` invoca un script de validación (test/test:full/type-check/build…) — el resto de invocaciones de node (scripts, eval, REPL, `--version`, shebang, `--run dev`) pasan intactas. Cobertura en los tres shells: `node.cmd` (cmd), función `node()` en `global-cargo-guard.ps1` (PowerShell) y en `global-quality-guard.sh` (bash); los shims npm/npx/cargo y el guard de bash resuelven el node real vía `GLORY_REAL_NODE` (fijado por el instalador y autocálculo) para no recursar, y el token del gate (`GLORY_QUALITY_GATE_TOKEN`) sigue autorizando las etapas internas. Verificado: sonda real en frontend con `node node_modules/vitest/vitest.mjs run` y `node --run test` → BLOQUEADO exit 78; `node --version` y `node --run dev` → 0; `quality:test` 190/190; gate 028A-16 PASS. **Nota de despliegue:** la shell del usuario debe recargar el guard (nueva pestaña o `source` del perfil) para tomar la función `node()`.
- **028A-6 Fase 1 (módulos 1–10 + cierre, cerrada 2026-08-05):** los módulos del orquestador fueron extraídos a Sentinel Core sin imports del proyecto ni de VarSense: `scope.ts`, `gateReport.ts` + `redaction.ts`, `stageCache.ts`, `scheduler.ts`, `policyDecision.ts`, `toolRunner.ts` (procesos con env allowlist/captura acotada/timeout/cancelación), `stageRunner.ts` (concurrencia con drenaje), `structuredTool.ts` (contrato JSON versionado con estados fail-closed) y `runtimeInstall.ts` (runtime global versionado: staging `.tmp/<v>`, hash del artefacto, `current.json` atómico, retiro no destructivo, shims, `install/update/rollback` con `--dry-run`). El CLI gana `sentinel check <task-id> --dry-run` (alcance + guard), `sentinel guard` (comando directo v2/legacy, exit 78), `sentinel doctor`/`status` (diagnóstico read-only con estado del runtime) y `sentinel check <task-id> --stages <json>` que ejecuta el gate real (alcance → caché → runner → reporte combinado con exit code). Orquestación en `core/gateRun.ts`; CLI delgado con SIGINT→cancelAll. **Cierre de Fase 1 (`a7ff43e`):** `interceptorShims.ts` genera los shims `npm/npx/cargo/node.cmd` + guards bash/PowerShell desde el runtime apuntando a `<target>/current.js guard`, con resolución del ejecutable real sin recursión (`GLORY_REAL_*` + `where`/`type -P` excluyendo el propio shim) y `assertSafeRuntimePath` contra shell injection en el código generado; `installProfiles`/`uninstallProfiles` con backup atómico solo la primera vez, reemplazo idempotente de marcadores nuevos+legacy y strip byte a byte; `rollbackRuntime` exige `artifactSha256` verificado antes de restaurar (SNT-10); CLI `install/update --with-shims|--with-profiles` con dry-run sin mutación. Upstream `a7ff43e` (origin/main): **399 tests PASS** (19 nuevos) + `check:core` OK; demo live install→shims→guard (vitest bloqueado exit 78 en repo real)→perfiles con backup→uninstall byte a byte. Gitlink + `quality-tools.json` + `sentinel.lock.json` fijados. La migración es incremental: `scripts/quality` sigue siendo el gate hasta la integración del orquestador de wandori.us a `--stages` (Fase 3/observe); la activación global de PATH/perfiles del operador sigue bloqueada hasta autorización. **Activación global autorizada (2026-08-05):** `install-global-runtime.mjs` (reemplaza al `.ps1` legacy) instala runtime versionado en `%LOCALAPPDATA%\GlorySentinel` con shims + perfiles (backup) y PATH de usuario con `shims;bin` al frente (bin expone el comando `sentinel`; `scripts/quality` legacy retirado). Verificado en shell nueva: shims bloquean `npm run test` (78), `sentinel doctor` reporta runtime activo v0.4.0, y el gate `task:check` **PASS con los shims + bin activos** (el loop de lease de Fase 2 funciona end-to-end).
- **Supervisión automática de targets (2026-08-05):** el gate `task:check` ahora ejecuta `runTargetMaintenanceBestEffort` tras las etapas — throttle de 6 h y presupuesto de 60 s, poda de `C:\tmp\glory-target` por cuota (`heavyRun.maxTargetGb`=15) y edad (`maxTargetAgeDays`=7) sin tocar targets con proceso vivo (marcador del guard, ejecutable cargado vía WMI o escritura en la última media hora). Resultado en el reporte (`targetMaintenance`) sin afectar la decisión. `quality:cleanup` fuerza el pase completo y rearma el throttle. La limpieza inicial recuperó `C:\tmp` de 2.1 GB libres (100%) a 31 GB libres (87%).
- **028A-6 Fase 3/observe — doble vía (2026-08-05):** `sentinel.config.json` migra a **v2 completo** (`schemaVersion: 2`, `runtime`/`gate`/`analyzers.sentinel.config` con las reglas del analizador): el guard local exige v2 puro y el core consume la subconfig vía `analyzerSubConfig` (upstream `f29687c`, token del gate por-ejecución con restauración). La doble vía observe: `observe-compare.mjs` corre `task:check` y `sentinel check <task> --stages` sobre la misma tarea y compara decisiones/hallazgos normalizados. **Paridad de alcance:** el gate agnóstico reutiliza el `scope-manifest.json` del gate actual (`--scope-manifest` + `manifestToScope` en `stages.mjs`/`stage-process.mjs`, que escribe su propio `changed-files.txt` para `--files-from`), incluyendo el diferimiento del guard pesado — sin esto el agnóstico corría full mientras el actual corría local-light (204 hallazgos espurios). Demo real 028A-6: **PASS vs PASS, hallazgos idénticos** (local-light, 9 archivos). Fallos de Windows resueltos: shims `.cmd`/`.bat` con shell + quoting propio (sin EINVAL ni DEP0190), `npmInvocation` con fallback al npm del PATH, wrapper emitiendo `entries[].findings[]` con el contrato exacto del core. Orquestador **144/144 tests** (3 nuevos observe), upstream **380 PASS**. **Paridad de VarSense demostrada (2026-08-05):** `varsense-parity.mjs` ejecuta la etapa varsense del gate y el CLI de VarSense directo sobre el mismo alcance compartido (mismo `--files-from`/`--index-dir`) y compara hallazgos normalizados — demo real 028A-6: **169 = 169, PARIDAD, exit 0**; VarSense no cierra la tarea por separado (la decisión la toma `sentinel check` con el reporte combinado). 3 tests nuevos, orquestador **147/147**. Falta: activar `enforce` tras validar más tareas reales (el runtime global ya está instalado y verificado con shims + bin en PATH).

## Estado 028A-8 (tramos 1–4 — alcance efectivo, manifiesto, índice persistente, dependencias y métricas)

- **Tramo 1 (2026-08-04):** `scope.mjs` separa requested/automatic/effective/fullReason/heavyDeferred con `resolveFullDecision` puro; `task-check.mjs` adquiere el lease pesado para automaticFull; `cache.mjs` fingerprint v5 por `effectiveFull`; `reporter.mjs` expone el motivo; `custom`/`rust` consumen el alcance efectivo; `scope-manifest.json` único por tarea con hashes; `run-frontend-tests.mjs` reutiliza el manifiesto. Gate real: full diferido → `Scope: full · ejecución incremental (heavy-deferred)` con VarSense aplicando `--files-from`.
- **Tramo 2 (2026-08-04):** índice persistente de VarSense entre ejecuciones en la rama upstream `028A-8/persistent-index` (commit `11f0932`, worktree aparte; el checkout consumido `858ec62` queda intacto). `FilePersistentIndexStore` guarda por archivo definiciones CSS, tokens de consumo y variables con hash SHA-256 de contenido, identidad `toolVersion+configHash+parserVersion`, escritura atómica y reconciliación contra disco al cargar (expulsa entradas de archivos eliminados entre ejecuciones). `ClassIndexBuilder`/`VariableIndexBuilder` son store-first: un archivo sin cambios nunca se re-parsea. El CLI acepta `--index-dir` y publica stats `loaded/reused/reparsed/removed/entries` en el JSON; índice inverso `buildReverseIndex` listo para selección de dependencias. Validación upstream: tsc, lint, check:core, smoke LSP y `smoke:persistent-index` PASS. El adapter local acepta la capacidad `persistentIndex` (validada en `policy.mjs`/`lockfile.mjs`, testeada en `varsense-contract.test.mjs`).
- **Tramo 3 (2026-08-04, fijación):** merge fast-forward `858ec62`→`11f0932` en el `main` consumido de VarSense, recompilación del `dist` (ignorado por git, no altera el lock), `quality-tools.json` con `commit=11f0932` + `capabilities.persistentIndex=true`, `sentinel.lock.json` regenerado con backup `.bak`. Gate real `task:check -- 028A-8` PASS con `persistentIndex.enabled=true` → `<branchCache>/varsense`; segunda ejecución: loaded=363, reused=364, reparsed=0.
- **Tramo 4 (2026-08-04):** selección de dependencias con el índice inverso + métricas Fase 0. Upstream `e836092` (ramas `028A-8/persistent-index` y `028A-8/dependency-expansion` mergeadas al `main` consumido y pusheadas a GitHub): captura de usos `var(--x)` por archivo (`extraerUsoVariablesDeTexto`), `buildVariableReverseIndex` (variable → consumidores) y `token-unused` consulta el índice en lugar de escanear el texto de todos los documentos por variable. Con `--files-from` + `--index-dir`, el análisis documental abre solo los archivos scoped (`filesAnalyzed=16/319`) sin perder exactitud (usos resueltos del snapshot; `PARSER_VERSION` bump a '2'). Fallback sin índice conserva la semántica previa (`var( --x )` incluido) y los hallazgos documentales se restringen al alcance. Métricas JSON: `filesDiscovered/filesAnalyzed/filesReused/cacheHitRate/peakRssMb`. Gate real PASS: cacheHitRate=1.0, reused=364, reparsed=0; el tiempo residual (~11s) es descubrimiento + hashing, no análisis.
- **Tramo 5 (2026-08-05, checkout interno):** VarSense deja de depender de `GLORY_VARSENSE_SOURCE_PATH` externo y pasa a ser el submódulo `tools/varsense` (gitlink pin en main, `.gitmodules`); `quality-tools.json` usa `sourcePath: "tools/varsense"` (relativo, portable entre máquinas) y el contrato `resolveConfiguredSourcePath` acepta `baseDir`; `quality:setup` inicializa el submódulo y compila el CLI en un clon limpio (`ensureSourcePathReady`); el lock fija varsense por commit/gitlink sin `sourcePathEnv`. `sourcePathRealpath` se valida igual para interno y externo. Validación: `quality:test` 136/136 PASS, setup y clon limpio (borrar `dist` → recompila) PASS, gate 028A-8 full: sentinel/frontend/docs/custom PASS, varsense detecta `--fondo` sin definir en `desktop-game-playable.css` (hallazgo real del bloque GAME-01, no falso positivo), rust FAIL solo por cambios sin commitear del otro agente; reutilización del índice con el checkout interno: cacheHitRate=1.0, reused=419, reparsed=0, peakRss 89.5MB.
- Pendiente de 028A-8: watchers/LSP persistentes, índices globales de Sentinel, benchmark y presupuestos p50/p95 consolidados; Sentinel ya migró al patrón de submódulo (tramo 5/028A-6).
- **Fixtures Fase 0 (028A-8, 2026-08-05):** `bench-fixtures.mjs` define `small` (2 archivos TS+CSS) y `medium` (12: 8 TS + 3 CSS + vite.config.ts) como scope-manifests deterministas inyectados al gate con `--scope-manifest` → `loadInjectedScope` (reutiliza `manifestToScope`/`expandLocalDependencies` de observe; valida que el manifiesto y sus rutas vivan dentro del workspace). El borrado (reset.css) y el rename (app-registration-game-3d.ts → playable) se simulan con `deletedFiles`, que el pipeline trata igual que un git delete: excluido de `--files-from`, presente en el fingerprint. `bench-baseline.mjs` gana `--fixture small|medium|representative` y el baseline guarda el fixture y sus tipos de cambio. Dos bugs reales corregidos en el camino: (1) `bench-baseline` ejecutaba el benchmark completo por efecto lateral al importarlo en tests (falta de guarda de entry point; también aplicada a `quality-profile` y `export-ci-metrics`); (2) `normalizeGateResult`: `execFile` promisificado resuelve sin campo `code`, así que `result.code !== 0` marcaba fallida toda ejecución exitosa (regresión del review 1e2628bd); y (3) un cache hit reproducía el `durationMs` original de la corrida que creó la caché — `executeStage` ahora mide el tiempo real del replay, así el benchmark incremental distingue análisis de reutilización. Verificado con bench real 2+2: small limpias 18.8s → incrementales 1.3s (etapas ~1ms cache hit); medium 18.8s → 1.6s; `quality:test` 182/182.
- **Avance 028A-8 Fase 0/4 (orquestador, 2026-08-05):** el reporte del gate ahora distingue la razón de invalidación de caché por etapa (`probeCachedPass`: no-entry/fingerprint-mismatch/not-pass/fresh/ci), propaga las métricas del CLI de VarSense (filesAnalyzed/filesReused/cacheHitRate/peakRssMb) al Markdown/JSON y gana el diagnóstico `npm run quality:profile` (p50/p95 por etapa y total sobre los últimos `latest.json` de la rama, sin ejecutar validaciones; alias temporal de `sentinel profile`). Además `createReport` escribe `metrics.json` por tarea (duración/cache/invalidación/métricas del analizador, redactado), la materia prima de `quality:profile` y del histórico de CI; y `quality.config.json.stageTimeBudgets` define presupuestos de tiempo por etapa que solo declaran regresión con ≥5 muestras y p95 sobre presupuesto (`quality:profile --budgets`, exit 1 informativo, no bloquea el gate). Además `index-maintenance.mjs` + `quality.config.json.indexRetention` (maxAgeDays/maxMiB/throttleHours) aplican TTL y cuota separados a los índices `<branch>/cache/<index>` (hoy `varsense`), sin mezclarlos con los targets de cargo: poda por edad/cuota, branch actual y locks activos protegidos, escritura reciente de 30 min, pase con throttle de 6 h y presupuesto de 60 s, reportado como `indexMaintenance` en latest.json; un pase truncado no arma el throttle. Y `export-ci-metrics.mjs` + `.github/workflows/quality.yml` publican un snapshot por ejecución (`ci-metrics.json`, timing/cache/estado redactado en origen) como artifact `quality-metrics` con 30 días de retención, sin código fuente ni secretos (el histórico es la retención de GitHub entre ejecuciones, no un acumulador en el repo). Verificado: `quality:test` 172/172 y perfil real con hit 8/8 sentinel, 4/4 varsense.
- **028A-16 (2026-08-05, cerrada):** auditoría de excepciones del guard. `logHeavyOverride` escribe `.quality-reports/heavy-overrides.log` (timestamp/source/comando/cwd/PID/motivo, concedido o denegado) para cada activación de `--allow-heavy`, `GLORY_QUALITY_ALLOW_HEAVY` o `GLORY_HEAVY_RUN_TOKEN`; activar la excepción exige `--heavy-reason "<motivo>"` (o `GLORY_HEAVY_RUN_REASON`) y el reporte expone `heavyOverride`/`OVERRIDE`. Tests 156/156 y gate `task:check -- 028A-16` PASS.

## Estado inicial auditado

### Herramientas fijadas

| Herramienta | Versión/commit fijado | Estado observado |
| --- | --- | --- |
| Glory Sentinel | `0.4.0` / `9f4ed4d4d866a016022f2458e69c0226eeee345a` | CLI JSON versionado, config estricta y reglas portables de boundaries/arquitectura; `[317A-3]` incorporado en `main`. Consumido por `sourcePathEnv` externo. |
| VarSense | `2.2.0` / `e8360927ee92c4067f1f501dd77b951c8bc4f61d` | `main` contiene SNT-08/09/10 + `--index-dir`, índice persistente, índice inverso de variables y métricas Fase 0 (028A-8); consumido por `sourcePathEnv` externo con `capabilities.filesFrom=true` y `persistentIndex=true`. |
| Quality gate | `scripts/quality/*.mjs` | Tiene preflight, lock, cache, redacción, reportes y perfiles; necesita endurecer errores, portabilidad y paralelismo. |

### Hallazgos prioritarios del orquestador

> Este inventario histórico se conserva para trazabilidad. Los puntos sobre
> `runVarsense` y el patch de VarSense fueron resueltos por `varsense all` y el
> commit fijado 2.2.0; los hallazgos restantes se mantienen como backlog o
> están cubiertos por los módulos actuales de `scripts/quality`.

- `scripts/quality/adapters/custom.mjs` mantiene `hasErrors = false` y nunca lo actualiza; un script custom puede terminar con violaciones y el stage queda en PASS.
- Los scripts custom se ejecutan con `bash`, dependen de `grep`, `awk`, `sed`, `find` y parsean emojis/salida humana; el comportamiento no es portable ni tiene contrato estructurado.
- `runCustom` convierte en warnings los códigos de salida de reglas que deberían poder bloquear; además no conserva el severity declarado por cada regla.
- El adaptador actual de VarSense invoca `varsense all` una sola vez; `all` comparte el snapshot de documentos para scan, orphan-classes y tokenDetection. `scan` y `orphan-classes` se conservan como comandos de compatibilidad del CLI, no como etapas independientes del gate. El `main` fijado en 2.2.0 expone `--files-from`; `quality-tools.json` lo declara mediante `capabilities.filesFrom=true` y el adapter solo lo activa cuando recibe un manifiesto de alcance válido, sin fallback silencioso ni scheduler paralelo.
- La cache de stages necesita incorporar explícitamente versión/commit de la herramienta, versión del parser, configuración efectiva y plataforma; el hash de archivos por sí solo puede reutilizar un PASS obsoleto.
- `quality-tools.json` conserva únicamente el manifiesto de versiones, capacidades (`filesFrom`) y variables `sourcePathEnv` de los `main` externos; el patch downstream histórico de Sentinel `[317A-3]` ya fue incorporado en `glory-sentinel/main` (`9f4ed4d`) y el patch de clases dinámicas de VarSense fue retirado al fijarse el soporte upstream 2.2.0.
- La detección incremental y los reportes son reutilizables, pero `docs.mjs`, reminders en español, IDs de roadmap y rutas `frontend/src` son políticas del proyecto.

## Frontera de reutilización

### Debe migrarse al core agnóstico

| Procedencia actual | Regla/capacidad reusable | Destino propuesto |
| --- | --- | --- |
| `check-sentinel-extended.sh` | límite de líneas por archivo/módulo | Sentinel static analyzer, umbral configurable por lenguaje y exclusiones declarativas |
| `check-sentinel-extended.sh` | `any`, `@ts-ignore`, `@ts-expect-error` | Sentinel TypeScript/JavaScript AST rule |
| `check-sentinel-extended.sh` | default exports | Sentinel style rule opt-in, nunca política global obligatoria |
| `check-sentinel-extended.sh` | `console.*` en producción | Sentinel rule con allowlist de logger, tests y tooling configurables |
| `check-sentinel-extended.sh` | subscribe sin cleanup | Sentinel lifecycle rule basada en AST y contratos de framework, no regex |
| `check-sentinel-extended.sh` | API fuera de service layer | regla genérica de límites de capas con `layers`/`allowedImports` en configuración |
| `check-sentinel-extended.sh` | imports directos de stores | regla genérica de dependencias prohibidas por capa |
| `check-sentinel-extended.sh` | interfaces grandes | regla ISP configurable por campos y tipos excluidos |
| `check-sentinel-extended.sh` | catch silencioso | regla multi-lenguaje con clasificación de catch vacío, comentario, log-only y propagación |
| `check-sentinel-extended.sh` | módulo con re-export + lógica | regla de barrel/lógica separada |
| `check-sentinel-extended.sh` | export no usado | preferir índice semántico TypeScript; fallback explícito como finding de baja confianza |
| `check-dom-abstraction.sh` | DOM directo fuera del adaptador UI | Sentinel browser-architecture rule con paths de boundary configurables |
| `check-window-refs.sh` | `window.*` fuera de plataforma/navegación | Sentinel platform-boundary rule con APIs permitidas por proyecto |
| `check-singleton-state.sh` | singleton mutable | Sentinel state-architecture rule; detectar instancia, módulo mutable y store global con excepciones justificadas |
| `varsense-class-index.patch` | clases dinámicas en factories/template strings | VarSense `ClassIndexBuilder` del core; eliminar parche downstream |
| `varsense.config.json` | inline Vanilla TS/JS, tokens y clases dinámicas | capacidades generales de VarSense; nombres de clases y exclusiones quedan en config local |

### Debe permanecer específico del proyecto

- Rutas concretas (`frontend/src`, `Agente/`, `roadmap.md`), nombres de clases españolas y excepciones visuales de wandori.us.
- `docs.mjs`: validar task ID, roadmap y planes de `Agente/`; debe quedar como adapter de documentación configurable, no regla de Sentinel.
- `reminders.mjs`: recordatorios del OS, móvil, Coolify y documentación; el motor puede aceptar perfiles, pero el texto no va al core.
- Perfiles `desktop`, `mobile`, `workspace`, `commerce` y sus patrones de este repositorio; el esquema de perfiles sí puede ser agnóstico.
- `quality-tools.json`: manifiesto por proyecto; la estructura de lock/commit/hash es reusable, los repositorios y versiones son datos del consumidor.
- Excepciones como `frontend/src/utils/dom.ts`, clases `desktop-*`, `perfil-redes` o recetas del sistema visual; nunca convertirlas en defaults upstream.
- Checks que conocen `workspaceStore`, `CommandRegistry`, `WindowManager`, `/admin`, Rust/Axum o contratos concretos del OS; solo se generalizan si se modelan como límites configurables.

## Arquitectura objetivo

### Sentinel

Separar claramente cinco capas:

1. **Discovery:** normaliza paths, detecta lenguaje, respeta includes/excludes y protege contra symlinks/rutas fuera del workspace.
2. **Indexación:** parsea cada archivo una sola vez y comparte AST, símbolos, imports, exports, scopes y posiciones entre reglas.
3. **Rule engine:** ejecuta reglas declarativas/AST con contrato común, severidad, confianza, categoría, autofix y cancellation token.
4. **Policy:** aplica configuración del proyecto, severidad, baseline, suppressions justificadas y límites de findings.
5. **Adapters:** CLI JSON, LSP y VS Code consumen el mismo resultado normalizado; ningún analyzer core importa `vscode`.

Contrato mínimo de una regla:

```text
ruleId, language, category, severityDefault, confidence,
sourceRange, message, remediation, safeFix?, docsUrl, analyzerVersion
```

Una regla no ejecuta procesos, no escribe archivos, no imprime salida humana y no conoce nombres de este proyecto.

### VarSense

- Mantener `core` como fuente única para variable index, class index, parser, resolver y análisis documental.
- Construir un índice compartido por snapshot de workspace; `scan` y `orphan-classes` deben consumirlo en una ejecución combinada.
- Mantener CLI, LSP y extensión como adapters finos, equivalentes mediante fixtures.
- Separar parser CSS/valores, indexadores, política de tokens y presentación; ningún core importa VS Code.
- Migrar el parche de clases dinámicas upstream y versionar el contrato de extracción de clases para factories, `className`, objetos y template strings.

### Quality gate

- Mantener el flujo público `npm run task:check -- <task-id>` y un output JSON/Markdown estable.
- Reemplazar el adapter de scripts humanos por invocaciones CLI estructuradas con `outputSchemaVersion`.
- Ejecutar etapas independientes en paralelo con límite de concurrencia y cancelación; mantener orden determinista en el reporte.
- Separar `tool error`, `rule error`, `blocking finding`, `warning` e `information`; nunca degradar un error de infraestructura a warning.
- Cachear por contenido + config efectiva + commit/version de herramienta + parser + plataforma; invalidar por cambio de lock, patch o schema.
- Mantener lock, timeout, redacción, escritura atómica y cleanup como librería reusable del orquestador, no como lógica duplicada por adapter.

## Fases y checklist

### SNT-01 — Baseline, contratos y seguridad del gate

**Objetivo:** congelar el comportamiento actual y eliminar PASS falsos antes de añadir reglas.

- [x] Reproducir `runCustom` con una fixture que falle y corregir la propagación de `hasErrors`/exit code mediante `custom-rules.mjs`.
- [x] Definir contrato estructurado para el bridge custom y retirar Bash/grep del camino normal; los scripts legacy quedan como referencia histórica.
- [x] Diferenciar severity declarada, código de herramienta, timeout, crash y finding bloqueante en `common.mjs`/reporter.
- [x] Exponer y probar la decisión local de política (`no-policy`, `legacy-v1`, `observe`, `enforce`, `pass-through`, `invalid-policy`) en guard/doctor/reporte mediante `scripts/quality/policy-decision.mjs`; la matriz global de shells/runtime continúa pendiente.
- [x] Añadir pruebas de regresión para custom con error, warning, información y salida estructurada.
- [x] Verificar que logs/reportes redaccionan secretos y credenciales sin truncar el diagnóstico esencial; `redaction.test.mjs` cubre token, bearer y password.
- [x] Ejecutar `npm run quality:test` y `task:check` full; baseline actual: 23 tests de quality, gate PASS en 52s, 38 archivos y reportes JSON/Markdown.
- [x] Validar `lockWaitMs` como entero seguro; el comando público usa `0` y falla de forma determinista si el task ya está ocupado.

**Gate:** ninguna regla que falle puede producir PASS; todos los resultados tienen schema, severity y causa distinguibles.

### SNT-02 — Sustituir shell scripts por analyzers portables

**Objetivo:** retirar dependencia de Bash/grep/awk/sed y mover la semántica al core de Sentinel.

- [x] Diseñar fixtures negativos/positivos para las reglas portables nuevas (`portableRules.test.ts`, `portableConfig.test.ts`); las equivalencias legacy completas quedan como siguiente fixture de migración.
- [x] Implementar en el core reglas portables para console, catches, interfaces, barrels, proceso shell, boundaries DOM/window, servicios y estado singleton; las heurísticas usan severidad configurable.
- [x] Implementar límites de capas/boundaries mediante configuración portable; el core no conoce rutas de wandori.us.
- [x] Añadir severidad, paths de boundary y exclusiones declarativas en `sentinel.config.json`.
- [ ] Ejecutar la misma fixture en CLI, LSP y VS Code; comparar JSON normalizado, líneas, columnas, severity y regla.
- [ ] Mantener los scripts como bridge de comparación durante una sola fase; borrarlos solo cuando la paridad esté demostrada.

**Gate:** Sentinel cubre todas las reglas portables, funciona sin Bash en Windows/Linux/macOS y la salida coincide con fixtures de equivalencia.

### SNT-03 — VarSense upstream y análisis de una sola pasada

**Objetivo:** eliminar el parche local y reducir el trabajo duplicado del escaneo CSS/TS.

- [x] Llevar la extracción de clases dinámicas al commit upstream fijado mediante fixtures reproducibles; retirar el patch downstream del manifest.
- [x] Implementar `varsense all`, que comparte provider/snapshot de documentos para `VariableIndex` y `ClassIndex` en una ejecución.
- [x] Añadir cancelación cooperativa editor-agnostic en `main` de VarSense para builders de variables/clases, con propagación estable y regresiones de cancelación/errores normales (commit local `337c4cce`; 50 tests upstream PASS).
- [x] Cachear resultados de clases por archivo durante la vida del builder, exponer `invalidateFile`/`clearCache`, separar `DocumentCacheProvider` y conectar el snapshot explícito en `varsense all` (commit local `a72b39a`; 53 tests upstream PASS).
- [ ] Invalidar índices por archivo/dependencias entre ejecuciones y conectar watchers/LSP persistentes. *(tramo 2: persistencia cerrada en `028A-8/persistent-index` con hash+identidad+poda; tramo 4: token-unused resuelve usos desde el índice inverso y el análisis documental abre solo los scoped; quedan watchers/LSP persistentes)*
- [ ] Añadir fixtures para clases estáticas, template strings, objetos `className`, factories, multilinea y falsos positivos.
- [x] Garantizar paridad CLI/LSP/VS Code con suite upstream (45 pruebas, smoke LSP y check-core).
- [x] Eliminar los parches downstream de `quality-tools.json`; Sentinel y VarSense quedan fijados en sus `main` externos (`9f4ed4d` y `858ec62`) mediante `sourcePathEnv`, con `capabilities.filesFrom=true` declarada y validada por el lock.

**Gate:** una ejecución comparte índices, conserva los hallazgos actuales y mejora tiempo/memoria frente al baseline.

### SNT-04 — Motor SOLID de reglas y adaptadores

**Objetivo:** hacer que añadir una regla no obligue a modificar analyzers, CLI, LSP y extensión por separado.

- [x] Mantener registry tipado de reglas y ampliar findings con confidence, remediation y analyzerVersion.
- [ ] Separar `RuleContext`, `Finding`, `Fix`, `Policy` y `Report`; aplicar DIP entre engine y parser/indexer.
- [ ] Eliminar condicionales globales por proyecto/framework; usar profiles/capabilities declarativos.
- [ ] Definir límites de tamaño para archivos, analizadores, adapters y servicios; dividir módulos antes de superar el límite.
- [x] Añadir cancellation y concurrencia acotada de stages (configurable 1–4, default 1), con duración y conteos en reportes; el runner drena etapas activas y no agenda trabajo nuevo tras error/cancelación.
- [ ] Prohibir imports editor-specific en `core`, con check automático en CI para Sentinel y VarSense.

**Gate:** una regla de prueba se registra una sola vez y aparece de forma equivalente en CLI/LSP/VS Code sin tocar adapters existentes.

### SNT-05 — Cache, incrementalidad y rendimiento

**Objetivo:** reducir tiempo de feedback sin sacrificar determinismo ni seguridad.

- [x] Separar en `scope` los campos `requestedFull`/`automaticFull`/`effectiveFull`/`fullReason`/`heavyDeferred`; un full diferido por el guard degrada a local-light real y nunca vuelve a ser full por `automaticFull` (028A-8).
- [x] Compartir un único `scope-manifest.json` por tarea (cambiados, eliminados, hashes, perfiles, dependencias); `run-frontend-tests` acepta `--scope-manifest` y el adapter de custom/rust usa el alcance efectivo (028A-8).
- [x] Definir fingerprint completo: contenido, config efectiva, tool commit, parser/runtime, OS, Node y dependencias locales importadas.
- [x] Compartir snapshot de documentos de VarSense entre análisis relacionados e invalidar dependencias locales en el fingerprint.
- [x] Ejecutar stages con runner acotado y backpressure; el default serial protege equipos de agentes compartidos.
- [x] Cancelar procesos hijos y workers en timeout/interrupción; el runner y el adapter conservan el estado `cancelled` separado de `tool-error`; pruebas de timeout/cancelación pasan.
- [x] Añadir presupuesto de timeout y reportar cache hit/miss; el presupuesto RSS comparativo queda pendiente del benchmark upstream.
- [x] Escribir cache/reportes de forma atómica y resistente a escrituras concurrentes; `atomic-file.test.mjs` confirma que nunca queda JSON parcial.

#### SNT-05A — Rendimiento local completado en 018A-4

- [x] Mantener Vitest serial por defecto (`maxWorkers=1`, sin paralelismo de archivos); la suite completa queda explícita en `test:full`.
- [x] Añadir `test:changed` como selección segura: un grafo local de imports ejecuta solo los tests que dependen del código cambiado; configuración, borrados y renombres fuerzan suite completa; untracked fuente entra en el grafo y un cambio sin test dependiente no consume workers innecesarios.
- [x] Corregir la carrera Windows de `writeAtomic`: dos escritores que compiten por el mismo reporte reintentan `EPERM/EBUSY/EEXIST` sin propagar un falso fallo ni borrar rutas ajenas.
- [x] Añadir captura máxima de 64 KiB por stdout/stderr del runner para evitar crecimiento de memoria; el reporte conserva un marcador visible para solicitar el log original cuando el adapter lo soporte.
- [x] Versionar fingerprint de caché con Node, plataforma, arquitectura, configuración, manifiesto de herramientas y archivos del alcance; añadir prueba de hit/miss por cambio de contenido.
- [x] Incluir borrados/renombres en detección de alcance y forzar invalidación full ante cambios ambiguos.
- [x] Añadir pruebas de lock fail-fast, scope/globs, caché y captura ruidosa; confirmar `npm run quality:test` (17/17) y `task:check -- 297A-19 --fresh` PASS.

**Gate SNT-05A:** cerrado. La ejecución local ya no dispara automáticamente workers múltiples ni una suite completa por cada archivo fuente; el grafo de imports selecciona dependencias y `test:full` conserva la revisión total explícita. El benchmark comparativo de Sentinel/VarSense y el índice compartido quedan pendientes de SNT-03/SNT-05.

#### SNT-05B — Quality gate local ligero (028A-2)

El reporte `297A-49` tardó 533833 ms: Rust consumió 483037 ms (90,5 %) y expiró durante `cargo test` sobre un target frío. Sentinel (9881 ms), VarSense (13201 ms) y frontend (15874 ms) no fueron el cuello de botella. La política cambia el alcance por defecto sin eliminar la suite completa:

- [x] Evitar que cambios de `package.json` o `package-lock.json` fuercen un full Rust; solo los archivos de infraestructura que cambian el contrato del gate mantienen esa invalidación.
- [x] En Rust local ejecutar únicamente `cargo fmt --check` y `cargo check`; reservar `cargo clippy` y `cargo test` para `npm run task:check -- <ID> --full` o `--ci`.
- [x] Mantener `npm --prefix frontend run test` como selector seguro (`test:changed`) y conservar `test:full` como orden explícita.
- [x] Separar fingerprints de caché para `local-light`, `full` y `ci`, y mostrar en el reporte qué cobertura se ejecutó.
- [x] Emitir un recordatorio contextual con el comando `--full` cuando una tarea tocó Rust en modo ligero; no presentar ese resultado como cobertura completa.
- [x] Aplicar cooldown configurable de 180 minutos a `--full`, `cargo test`, `cargo clippy` y `cargo bench`, con lock de una sola ejecución y override explícito auditado.
- [x] Interceptar Cargo desde `run-with-db` y el shim global `cargo.cmd`; un full bloqueado degrada a `local-light` y conserva el motivo en JSON/Markdown.
- [x] Limpiar `C:\tmp\glory-target` con cuota de 15 GB/retención de 7 días, validación de raíz y preservación de targets con proceso activo; la limpieza inicial liberó aproximadamente 29 GB.
- [x] Particionar `.quality-reports` por `projectRoot/branch-key/task-id`, incluyendo reportes Markdown/JSON, logs, caché y locks; implementar `branch-key-v1` con `canonicalRef` UTF-8, NFC, SHA-256 hexadecimal y encoding allowlisted para ramas normales, detached HEAD y refs CI sin permitir traversal (`scripts/quality/branch-identity.mjs`).
- [x] Añadir retención específica de reportes (defaults: 7 días, 512 MiB por workspace y 128 MiB por rama), contando reportes/logs/tool reports/caché/locks; marcar `overQuota` sin borrar la rama activa, podar históricos/tareas/caché elegibles, respetar locks/temporales/escrituras recientes, eliminar locks huérfanos solo tras TTL + PID inactivo, y mantener poda/errores fuera del exit code (`report-retention.mjs`).
- [x] Exponer `quality:reports:cleanup:dry` y `quality:reports:cleanup`; el modo destructivo requiere `--cleanup --yes`.
- [x] Implementar lectura solo lectura del layout histórico `.quality-reports/<task-id>/`: el namespace canónico gana; el legacy solo se acepta con metadata exacta de rama, sin metadata queda ambiguo; se rechazan traversal, symlinks y JSON canónico corrupto sin fallback (`scripts/quality/report-reader.mjs` + tests). El writer nunca actualiza un alias global; retirar la compatibilidad tras dos versiones sigue pendiente.
- [x] Activar el interceptor dentro de los perfiles PowerShell solo después de backup y autorización explícita; el instalador por defecto no reescribe perfiles persistentes. *(`a7ff43e`: `installProfiles`/`uninstallProfiles` en el core generan el dot-source con backup atómico solo la primera vez y nunca tocan perfiles sin `--with-profiles` explícito; la ejecución real sobre los perfiles del operador queda pendiente de autorización)*
- [ ] Medir en CI/nocturno los tiempos cold/warm de Rust y fijar un presupuesto operativo sin bloquear el feedback local; revisar el target estable compartido antes de cambiar `CARGO_TARGET_DIR`.

**Gate SNT-05B:** el modo local no recompila clippy/tests por cada tarea, ningún full se repite durante el cooldown y el informe deja una ruta reproducible para la suite completa. La suite completa sigue siendo obligatoria al cerrar una fase, cambiar infraestructura Rust, preparar publicación o ejecutar CI; no se ejecuta automáticamente en cada archivo.

#### SNT-05C — Reportes por rama y retención acotada

**Estado local:** implementado y cubierto por fixtures. La lista siguiente conserva
solo los límites que dependen del runtime global o de pruebas multi-proceso reales;
no describe como pendientes los contratos ya activos en `scripts/quality`.

**Objetivo:** evitar que `.quality-reports` crezca indefinidamente y que resultados/cache/locks de una rama contaminen otra.

- [x] Resolver `branch-key` desde la rama Git, una ref CI allowlisted o `detached-<full-sha>`; guardar ref/SHA original en metadata y codificar la clave con límites estrictos.
- [x] Escribir en `.quality-reports/branches/<branch-key>/<task-id>/` los `latest.md/json`, logs y reportes de adapters.
- [x] Mover caché y locks a `.quality-reports/branches/<branch-key>/cache/` y `locks/`; incluir `branch-key`/commit/ref en identidad y fingerprints.
- [x] Leer el layout antiguo solo durante la transición, en modo lectura y con metadata exacta de rama; no se escriben aliases ni symlinks inseguros. La retirada tras dos versiones queda pendiente.
- [x] Configurar TTL y cuota máxima; implementar poda determinista con `--dry-run`, protección de la rama activa, locks activos, procesos/escrituras recientes y límites de workspace.
- [x] Añadir fixtures locales para dos ramas concurrentes en namespaces, cambio de rama dentro del proceso, detached HEAD, identidades CI, nombres peligrosos/largos, symlinks y fallo de poda; la concurrencia multi-proceso/CI real queda ligada al runtime global.

**Gate SNT-05C:** dos ramas producen namespaces y `latest` independientes; un PASS/cache/lock no cruza ramas; la poda libera únicamente candidatos elegibles, respeta TTL/cuota y no borra una ejecución activa ni rutas fuera del workspace. El reporte conserva bytes/candidatos y resultado de poda sin secretos.

**Gate:** benchmark reproducible demuestra mejora; dos ejecuciones iguales producen el mismo JSON ordenado y no reutilizan PASS obsoleto.

### SNT-06 — Reglas de seguridad, contratos y arquitectura

**Objetivo:** cubrir riesgos recurrentes de proyectos web sin convertir políticas de wandori.us en defaults.

- [ ] Añadir reglas configurables para secretos, credenciales en URL/logs, open redirects, input no validado y permisos client-only.
- [ ] Detectar errores enmascarados, `ok: true` tras catch, updates optimistas sin rollback y operaciones críticas sin resultado.
- [ ] Detectar SQL/interpolación peligrosa, procesos con shell, I/O sin manejo, `unwrap`/panic de producción y webhooks no idempotentes donde el lenguaje lo permita.
- [ ] Generalizar arquitectura de capas: UI → contrato → servicio → repository/adaptador, con imports y llamadas prohibidas configurables.
- [ ] Añadir reglas de lifecycle: listeners/subscriptions sin teardown, async stale, AbortSignal ausente y cleanup incompleto.
- [ ] Clasificar findings por confianza para que heurísticas complejas no bloqueen sin evidencia suficiente.

**Gate:** cada regla nueva tiene fixture positivo/negativo, documentación, severity rationale, falso positivo conocido y paridad en los tres adapters.

### SNT-07 — VarSense visual y diseño portable

**Objetivo:** convertir las necesidades visuales de este proyecto en capacidades de tokens reutilizables.

- [ ] Mantener detección de variables no definidas, fallbacks hardcoded, inline styles y propiedades prohibidas como reglas configurables.
- [x] Añadir detección de tokens duplicados y no usados con severidad independiente en `varsense all`; las referencias circulares quedan pendientes por requerir resolver ciclos.
- [ ] Añadir perfiles de tema claro/oscuro y cobertura de roles semánticos sin imponer paleta, idioma o nombres de variables.
- [ ] Detectar clases huérfanas cross-file con índice compartido y excluir únicamente patrones declarados por el consumidor.
- [ ] Separar `autofix` seguro de sugerencia; nunca reescribir CSS masivamente sin preview, diff y rollback.
- [ ] Medir precisión sobre CSS, SCSS, LESS, Vanilla TS/JS y plantillas soportadas; mantener límites de parsing claros.

**Gate:** un proyecto sin diseño 1-bit puede usar VarSense con otra convención de tokens sin cambiar el core.

### SNT-08 — Orquestador portable y CI

**Objetivo:** convertir `scripts/quality` en una librería/adaptador reutilizable, no en una colección de scripts de wandori.us.

- [x] Extraer y probar `runner`, `redaction`, `atomic-file`, `lock`, `cache`, `preflight`, `reporter`, `scope` y stage runner como módulos agnósticos.
- [x] Hacer adapters declarativos por herramienta: `structured-tool.mjs` centraliza executable, args, schema, timeout, cancelación y error policy.
- [x] Ejecutar stages independientes en paralelo con límite configurable y conservar el orden canónico por índice; ante error o cancelación, detener nuevas asignaciones y drenar los workers activos antes de propagar el resultado (`stage-runner.mjs` + tests).
- [x] Mantener `docs` y reminders como adapters del proyecto; el runner no añade reglas de producto al core.
- [x] Definir modo local incremental, modo `--full` y modo CI reproducible; el check no instala ni muta dependencias.
- [x] Publicar reportes Markdown/JSON locales con exit codes diferenciados y artifacts sin secretos; `createReport` conserva el detalle completo, ordena findings de forma estable y `compactLines` limita solo la salida de terminal. La publicación CI multi-shell queda pendiente del runtime global.
- [ ] Validar ejecución en Windows PowerShell, Git Bash, Linux CI y macOS sin asumir comandos POSIX.
- [x] Proveer selector frontend explícito (`npm --prefix frontend run test:changed`) y conservar `test`/`test:full` como suite completa; no usar `passWithNoTests` para ocultar fallos.

**Gate:** un segundo repositorio puede adoptar el orquestador cambiando solo manifest, profiles, paths y policies.

### SNT-09 — Migración, release y mantenimiento

**Objetivo:** retirar deuda local sin romper consumidores existentes.

- [x] Crear matriz de paridad con ruleId, severidad, fixture, adapters, commits y pendientes.
- [x] Fijar commits, schemas y patch local compatible en `quality-tools.json`; [317A-3] queda hashado y la publicación/remoción upstream se mantiene separada de este workspace.
- [ ] Reinstalar `.vsix` solo después de compilar, probar y autorizar; nunca reiniciar VS Code automáticamente.
- [ ] Eliminar scripts shell y el parche VarSense cuando las equivalencias pasen en CI y el reporte no cambie sin justificación.
- [ ] Versionar migraciones de config, aliases de ruleId y suppressions; no invalidar silenciosamente pipelines existentes.
- [ ] Registrar changelog, ADR, guía de migración y benchmark de cada release.

**Gate:** rollback a la versión anterior funciona, ningún consumidor pierde diagnósticos críticos y el bridge local queda eliminado o con fecha explícita de retiro.

### SNT-10 — Sentinel como plano único de control y migración del gate

**Objetivo:** eliminar la separación conceptual entre un "quality gate" independiente y Sentinel. Sentinel debe ser el único dueño de política, guard, cooldown, scope, caché, ejecución de etapas y reporte; VarSense conserva su core/CLI/LSP, pero entra como analyzer versionado.

**Plan canónico:** `Agente/planes/plan-global-quality-guard-agnostico-2026-08-02.md`.

- [x] Definir el contrato `analyze/check/guard/doctor/status` sin romper el CLI `sentinel analyze` actual. *(CLI implementado en `a57cfc1`; la matriz multi-shell y el runtime global siguen en Fase 4)*
- [ ] Definir el contrato de analyzer: manifest de alcance, configuración efectiva, cancelación, timeout, salida normalizada, métricas y estados de error.
- [x] Diseñar/validar localmente el envelope `sentinel.config.json` v2 y mapear la configuración Sentinel v1 actual mediante migración dry-run; `no-policy/observe/enforce` del guard local están cubiertos, mientras backup/rollback aplicado y runtime global siguen pendientes.
- [x] Crear `sentinel.lock.json` con versión/commit/hash/capacidades de Sentinel y VarSense y protocolo; preflight resuelve las variables `GLORY_*_SOURCE_PATH`, verifica `git archive`, checkout limpio, CLI, versión, commit y realpath actual sin persistir rutas absolutas de una máquina en el lock. El runtime local declara `identitySha256` + `artifactSha256: null` explícito hasta existir runtime global. Locks históricos sin el campo se rechazan y se regeneran con `quality:lock --write`.
- [x] Exigir `artifactSha256` real para runtime global instalado y completar instalación/rollback sin ejecutar plugins o binarios arbitrarios del repositorio. *(`a7ff43e`: install ya calculaba el hash antes del manifest; rollback ahora recalcula el hash de la copia instalada y se niega a restaurar versiones sin hash o con contenido manipulado; la activación global quedó autorizada y ejecutada el 2026-08-05: `%LOCALAPPDATA%\GlorySentinel` v0.4.0, hash verificado, `sentinel doctor` activa)*
- [x] Instalar el runtime global con shims, perfiles (backup) y PATH de usuario (entrada `shims;bin`, bin expone `sentinel`), retirando el PATH legacy de `scripts/quality` solo tras verificar el PATH global. *(2026-08-05, autorizado: `install-global-runtime.mjs` + `quality:install-guard`; entrada de PATH idempotente en `interceptorShims.ts` con tests in-memory y dry-run; verificado en shell nueva: shims bloquean 78, doctor runtime activo, gate PASS con el PATH completo)*
- [x] Extraer scheduler, cooldown, locks, scope, caché y reporter desde `scripts/quality` al runtime de Sentinel; conservar `task:check` como alias temporal. *(módulos puros + runner extraídos al core en `a57cfc1`; integración del orquestador de wandori.us a `sentinel check --stages` adoptada en Sentinel 0.7.1: `gate:check` genera el manifest declarativo (`stages.mjs` + `quality-adapter.json`) y delega en `sentinel check --stages`; paridad real demostrada con `observe-compare`, CI (`quality.yml`) y métricas `check/`)*
- [x] Activar la integración versionada de `--files-from` en el adapter CLI JSON/JSONL: solo se añade el flag cuando `quality-tools.json.tools.varsense.capabilities.filesFrom=true`; la capacidad queda ligada a `sentinel.lock.json` y al `main` publicado `858ec62`. Sin manifiesto de alcance válido no se inventa fallback ni se crea un reporte paralelo.
- [x] Emitir leases efímeros para que `sentinel check` ejecute herramientas pesadas sin quedar bloqueado por sus propios shims; auditar PID, proyecto, comando, expiración y task ID. *(cerrado: `src/core/lease.ts` en `8d924dc`, Fase 2/028A-6)*
- [x] Probar enforcement de shells normales y del launcher del agente; documentar explícitamente rutas absolutas y `--noprofile --norc` como límites no interceptables por scripts del repositorio. *(verificado en vivo con los shims del runtime en PATH temporal: shim `.cmd` bloquea `npm run test` (78); guard de bash dot-sourceado bloquea (78); ruta absoluta al binario real (0) y `bash --noprofile --norc` (0) son límites inherentes de la intercepción por PATH/perfil — documentados en el plan 028A-6 Fase 3, no interceptables por scripts del repositorio)*
- [x] Ejecutar doble vía en `observe`, comparar findings ordenados y activar `enforce` solo tras paridad y cinco tareas reales dentro del presupuesto. *(cerrado: 5 comparaciones reales 028A-6×2, 297A-78×2, 028A-17 — decisiones coinciden y hallazgos idénticos, incluido el caso heavy 028A-17 con 651 findings; el único desvío real (el core perdía la línea del finding) se corrigió en `normalizeEntries` en `92afb7f`, paridad 651=651; `observe-compare.mjs` acepta `--base` para comparar diffs históricos)*
- [x] Crear fixtures de un proyecto Node, Rust, Python y uno sin política, y probar la matriz real en PowerShell 5/7, CMD y Bash/Git Bash (npm/npx/cargo/rustfmt, comandos directos, `2>&1`, pipes y exit codes). *(cerrado 2026-08-05: `guard-matrix/` en `tools/sentinel/src/test/fixtures` + `guardMatrix.test.ts` (33 decisiones unit) + `shellMatrix.test.ts` con los shims reales en sandbox — bloqueo 78 en cmd/pwsh/powershell/bash (dot-source), pass-through de `npm --version`, bypass documentado del shim .cmd en bash y enmascarado del exit por pipes; `guardEdgeCases.test.ts` para rutas anidadas, repo movido, rama con/sin política y junction; CI sin perfil dev verificado: `task:check` PASS con PATH sin GlorySentinel)*
- [x] Publicar artifacts CI con branch-key + task + commit corto, sin mezclar ramas en runners reutilizados. *(cerrado 2026-08-05, Fase 4 residual/028A-6: `quality.yml` resuelve la identidad con `resolveBranchIdentity` (refs CI allowlisted) y nombra `quality-reports-<branchKey>-297A-6-<shortCommit>` / `quality-metrics-<branchKey>-<shortCommit>`)*
- [x] Mantener un comando de desinstalación que quite solo entradas administradas por Sentinel. *(2026-08-05, Fase 5/028A-6: `sentinel uninstall` retira PATH (shims+bin), marcadores de perfiles nuevos/legacy y el directorio de shims; con `--keep-runtime` conserva versions/current/bin (el comando `sentinel` sigue resolviendo) y sin él retira todo lo administrado excepto la raíz; dry-run sin mutación, `--json` y exit != 0 ante error; `quality:uninstall-guard` delega en él. Upstream `785301b`, 475 tests + check:core)*
- [x] Marcar el guard actual como legacy y conservar un periodo de compatibilidad para ramas antiguas. *(2026-08-05: banners LEGACY en los wrappers del repo — `quality-command-guard.mjs`, `global-cargo-guard.ps1`, `global-quality-guard.sh`, `npm/npx/cargo/node.cmd`, `install-global-guard.ps1` — sin cambiar comportamiento (verificado: shim reenvía, `bash -n`/`node --check` OK); las ramas antiguas sin runtime siguen usando estos wrappers. Rollback probado en vivo en target aislado: dos versiones → `rollbackRuntime` restaura con `artifactSha256` verificado → `current.json` apunta a la versión restaurada; perfil con backup → `uninstallProfiles` restaura **byte a byte** y el backup es idéntico al original. 14/14 PASS)*
- [x] Retirar gradualmente `quality-command-guard`, `global-cargo-guard`, wrappers y scripts duplicados cuando el runbook lo permita. *(Capa A retirada tras Sentinel #45/#46, matriz focal, gate, enforcement exit 78 y rollback reversible; la capa B queda separada en SNT-10.)*

**Gate SNT-10:** `sentinel check` es la única autoridad de cierre; VarSense aparece como etapa/analyzer dentro del reporte combinado; ningún proyecto sin política queda bloqueado; la migración de configuración es reversible y la matriz multi-shell/multi-proyecto pasa.

## Nuevas reglas propuestas por prioridad

### Bloqueantes (P0)

- `quality-tool-error-propagation`: timeout/crash/schema inválido nunca puede producir PASS.
- `hardcoded-secret-context`: ampliar detección a URLs, logs, JSON de configuración y archivos temporales sin exponer el secreto en el reporte.
- `unsafe-process-shell`: detectar `shell: true`, comandos concatenados y argumentos no separados.
- `private-route-client-only`: detectar rutas protegidas cuya autorización solo existe en UI/guard cliente; requiere configuración de boundary.
- `error-enmascarado`: detectar éxito sintético después de catch o fallback vacío en operaciones críticas.

### Alta prioridad (P1)

- `layer-boundary-import`: imports/calls fuera de capas permitidas.
- `async-stale-without-abort`: fetch/listener async sin AbortSignal o cleanup verificable.
- `subscription-without-dispose`: subscribe/observer/event listener sin retorno de cleanup.
- `optimistic-update-without-rollback`: estado mutado antes de confirmación sin reversión.
- `api-call-outside-service`: configurable para fetch/client SDK fuera de adapters/services.
- `dom-access-outside-platform`: `document`/`window` directo fuera del boundary declarado.
- `singleton-mutable-state`: instancias globales mutables sin contrato de ciclo de vida.
- `large-interface-isp`: interfaces/types por encima del umbral con propuesta de composición.
- `mixed-barrel-logic`: barrel que exporta y contiene lógica ejecutable.

### Calidad visual y mantenibilidad (P2)

- `unused-export-confidence`: export no usado con índice semántico y clasificación de barrel/public API.
- `token-duplicate`: tokens equivalentes con nombres distintos.
- `token-unused`: variables declaradas sin uso, excluyendo contratos públicos declarados.
- `theme-role-missing`: tema configurado sin roles semánticos equivalentes.
- `class-index-dynamic-confidence`: clase dinámica no indexable, separando warning de falso positivo.
- `file-size-budget`: presupuesto por lenguaje/módulo y no un único umbral rígido.

## Pruebas y evidencia obligatoria

- [ ] Fixtures de equivalencia para cada regla: fuente, expected JSON, severity, línea/columna, mensaje estable y falso positivo.
- [ ] Mismos fixtures ejecutados por CLI, LSP y VS Code; diferencias solo en transporte/presentación.
- [x] Tests de config estricta: claves desconocidas, rutas fuera del workspace, modos inválidos y políticas symlink/junction en loader y guard; globs peligrosos, severity/ruleId del analyzer y paridad upstream quedan pendientes del contrato Sentinel Core.
- [ ] Tests de seguridad: secretos redacted, symlink/path traversal, shell injection, timeout, cancelación y procesos huérfanos. La cancelación local del runner/adapter ya tiene regresión; siguen pendientes las pruebas del launcher/runtime global.
- [ ] Ejecutar `npm run __sentinel_guard_probe__`: el guard debe devolver `BLOQUEADO` sin invocar npm; si aparece "Missing script", la shell/launcher está sin interceptor y no se puede cerrar la cobertura global.
- [ ] Tests de cache: hit válido, cambio de contenido, config, commit, parser, schema y plataforma.
- [ ] Benchmarks small/medium/full con límite de memoria, tiempo, concurrencia y cantidad de findings.
- [x] Tests de reporte: máximo de hallazgos/reminders en salida compacta, detalle completo en artifact, orden determinista, redacción de secretos y exit codes PASS/FAIL/SETUP ERROR/CANCELLED.
- [ ] Pruebas de migración: versión anterior, versión nueva, rollback y supresión documentada.

## Definition of Done global

- [ ] Toda regla portátil dejó de depender de Bash, regex frágil o rutas de wandori.us.
- [ ] Sentinel y VarSense mantienen core editor-agnóstico y paridad CLI/LSP/VS Code.
- [ ] El quality gate propaga errores reales, no duplica análisis y tiene cache/versionado correcto.
- [ ] Las configuraciones del proyecto contienen solo política, paths y excepciones locales.
- [ ] Cada regla tiene fixture, documentación, severity, confianza, remediation y criterio de retiro.
- [ ] Windows/Linux/macOS y CI producen reportes equivalentes.
- [ ] Sentinel/VarSense pasan sus propios checks SOLID, rendimiento, seguridad y calidad.
- [ ] `roadmap-sentinel.md` se actualiza como fuente única de esta iniciativa; el roadmap principal no se modifica desde este bloque.

## Comandos de cierre por bloque

```text
npm run quality:test
npm run task:check -- <task-id-real>
# Durante SNT-10, el equivalente canónico será:
sentinel check <task-id-real>
```

Para cambios en los repositorios upstream, además:

```text
npm test
npm run compile
npm run check:core
```

El empaquetado `.vsix`, instalación y cualquier cambio de extensión requieren validación completa y autorización aplicable. No se reinicia VS Code automáticamente.
