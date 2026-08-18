# Plan 028A-8 — Optimización medible de Sentinel y VarSense

> **Fecha:** 2026-08-02
> **Estado:** ejecución incremental; tramos 1 (alcance efectivo + manifiesto), 2 (índice persistente de VarSense entre ejecuciones), 3 (fijación del upstream + activación de la capacidad en el gate), 4 (selección de dependencias con el índice inverso + métricas Fase 0) y 5 (checkout interno de VarSense como submódulo) cerrados. Avance 2026-08-05: orquestador con métricas por etapa (razón de invalidación + métricas de VarSense + `metrics.json` por tarea + `quality:profile` p50/p95 + presupuestos de tiempo por etapa que solo fallan ante regresión confirmada). Pendiente: índices globales de Sentinel (Fase 3) y TTL/cuota separadas + CI histórico (resto Fase 4).
> **Evidencia inicial:** los últimos reportes local-light tardan 16.6–35.1 s. VarSense consume 10.7–16.8 s y frontend 4.8–7.3 s. Sentinel va de 0.2 s incremental a 8–11 s cuando el alcance queda full. El full anterior llegó a 173.5 s, con Rust ocupando 114 s.
> **Dependencias:** 028A-3/028A-5 (guard y gate único), SNT-10/028A-6 (Sentinel como plano único), `scripts/quality/cache.mjs`, `scope.mjs` y los repositorios versionados de Sentinel/VarSense.

> **Límite arquitectónico:** la optimización no crea otro scheduler. El scope, cooldown, caché compartida y reporte pertenecen a Sentinel; VarSense solo implementa el contrato incremental de analyzer. Durante la transición los adapters `scripts/quality` pueden conservar compatibilidad, pero no deben introducir una segunda caché o política.

## Objetivo

Reducir el tiempo y el consumo de recursos del quality gate sin perder detección, seguridad ni reproducibilidad. La optimización debe hacer que una tarea normal analice solo lo afectado, reutilice índices seguros y reserve el análisis completo para cambios estructurales, cierre de fase o CI.

## Diagnóstico confirmado

- `scripts/quality/adapters/varsense.mjs` siempre invoca `varsense all`; VarSense recorre variables, clases y candidatos del workspace aunque cambien pocos archivos.
- La instalación fijada de VarSense no acepta actualmente `--files-from`; el upstream `main` ya tiene el contrato seguro en `858ec62`. La integración en el adapter y la caché incremental entre ejecuciones siguen pendientes.
- Sentinel ya acepta `--files-from`, pero su tiempo sube cuando el alcance automático se marca full.
- `detectScope` mezcla `args.full`, full automático por `fullPatterns` y el modo resultante. Cuando el full se difiere por cooldown, puede conservar `scope.full=true`, contradiciendo el mensaje `local-light`.
- La caché del gate sigue siendo por etapa/fingerprint global. VarSense `main` ya tiene caché por archivo durante la vida de `ClassIndexBuilder` (`a72b39a`), pero no es persistente entre ejecuciones ni detecta cambios por sí sola: el caller debe invocar `invalidateFile` antes de reanalizar un archivo cambiado/eliminado.
- La ejecución secuencial protege la máquina, pero no compensa el coste de volver a descubrir y parsear el mismo workspace.

## Objetivos cuantitativos

Medir en una máquina de referencia y publicar p50/p95; los objetivos iniciales son:

- **Local-light típico (≤25 archivos modificados):** p50 ≤ 8 s y p95 ≤ 12 s.
- **VarSense incremental sin cambio de tokens/configuración:** p95 ≤ 3 s; con `variables.css` o configuración modificada: p95 ≤ 6 s.
- **Sentinel incremental:** p95 ≤ 3 s para archivos sin índices globales afectados.
- **Full CI:** conservar cobertura actual, pero reutilizar índices y reportar progreso; no se ejecuta por tarea local.
- **Cache hit:** al menos 80% en una secuencia de cinco tareas que editen archivos distintos del mismo dominio.
- **Recursos:** un solo proceso por etapa, sin workers ilimitados, sin crecimiento de `C:\tmp` y sin archivos de caché parcialmente escritos.

## Contrato de alcance

### Fase de orquestación

**Avance 2026-08-04 (028A-8 tramo 1):** separados `requestedFull`/`automaticFull`/`effectiveFull`/`fullReason`/`heavyDeferred` en `scope.mjs` (`resolveFullDecision` puro + tests); un full diferido ya no vuelve a ser full por `automaticFull` y el lease pesado se solicita también para automaticFull (cambio de migraciones/config/`scripts/quality`), no solo con `--full`. `scope-manifest.json` único con cambiados/eliminados/hashes/perfiles/dependencias; `changed-files.txt` se conserva como transporte plano de `--files-from`; `run-frontend-tests.mjs` acepta `--scope-manifest` para no repetir descubrimiento Git; `custom`/`rust` usan el alcance efectivo. Caché: fingerprint v5 con `effectiveFull`. Reporte: `fullReason` + `heavyDeferred` en JSON/Markdown/compacto. Gate real 028A-8: PASS local-light diferido (sentinel/varsense/custom/docs), frontend bloqueado por `frontend/src/api/generated` ausente (preexistente).

- [x] Separar en `scope` los campos `requestedFull`, `automaticFull`, `effectiveFull`, `fullReason` y `heavyDeferred`.
- [x] Cuando el full se difiera, recalcular un `effectiveFull=false` real para Sentinel/VarSense/frontend; conservar solo validaciones locales necesarias y registrar el motivo.
- [x] Definir excepciones que sí obligan a full en CI: cambios de configuración de reglas, manifest de herramientas, migraciones o contratos globales (patrones `fullPatterns` + modo CI ya obligan full).
- [x] Generar un único `scope-manifest.json` con archivos cambiados, eliminados, hashes de contenido, perfiles y dependencias locales.
- [x] Pasar ese manifiesto a Sentinel, VarSense, custom y selección de tests; eliminar descubrimientos Git/glob duplicados.

**Gate:** un full diferido no ejecuta análisis de workspace completo; el reporte distingue alcance solicitado, automático y efectivo. Verificado en el gate real 028A-8 con `Scope: full · ejecución incremental (heavy-deferred)`.

## Fases de implementación

### Fase 0 — Instrumentación y baseline

**Avance 2026-08-05 (Fase 0 cerrada):** VarSense publica `filesDiscovered/filesAnalyzed/filesReused/cacheHitRate/peakRssMb` (upstream `e836092`) y el orquestador las propaga al reporte (`runVarsense.metrics` + `formatStageDetail`); `quality:profile` ofrece p50/p95 por etapa/total; `quality.config.json.stageTimeBudgets` define presupuestos por etapa y `evaluateStageBudgets` declara regresión solo con ≥5 muestras y p95 sobre el presupuesto (diagnóstico con exit 1, no bloquea el gate). Fixtures cerrados: `bench-fixtures.mjs` (small/medium como scope-manifests inyectados con `--scope-manifest`; representative = alcance git real), baseline real 5+5 por fixture (small 19.7s→1.2s; medium 19.4s→1.6s; etapas ~1ms en incremental). Queda: medición separada por subfase de Sentinel (depende del core, Fase 3).

- [x] Añadir medición separada de: descubrimiento de archivos, lectura, parseo, construcción de índices, reglas, serialización y escritura de reporte. *(VarSense: filesDiscovered/analyzed/reused/cacheHitRate/peakRssMb propagados al reporte; Sentinel aún sin métricas por subfase)*
- [x] Publicar en JSON: `filesDiscovered`, `filesAnalyzed`, `filesReused`, `cacheHitRate`, `indexInvalidations`, `durationMs` y `peakRssMb` cuando esté disponible. *(en `latest.json` del gate y en `quality:profile`)*
- [x] Crear fixture pequeño, mediano y representativo del workspace real con cambios de CSS, TS, configuración, borrado y rename. *(`bench-fixtures.mjs`: `small` (2 archivos TS+CSS) y `medium` (12: 8 TS + 3 CSS + vite.config.ts con borrado `reset.css` y rename `app-registration-game-3d.ts`→`playable` simulados) como scope-manifests deterministas inyectados con `--scope-manifest` (`loadInjectedScope` en `scope.mjs`, sin mutar el árbol compartido; deletedFiles se trata igual que un git delete: excluido de `--files-from`, presente en el fingerprint); `representative` usa el alcance git real. Divergencia documentada: vite.config.ts marcaría automaticFull por git; el fixture lo inyecta local-light a propósito)*
- [x] Medir cinco ejecuciones limpias y cinco incrementales de cada fixture; guardar baseline fuera de `.quality-reports/cache` para no contaminar fingerprints. *(`npm run quality:bench -- --fixture small|medium` — `bench-baseline.mjs` — ejecuta el gate N limpias (`--fresh`, sin caché de etapas) + N incrementales, agrega p50/p95 por etapa y total, cuenta las ejecuciones fallidas aparte (nunca hereda métricas viejas) y guarda `.quality-bench/baseline.json` fuera del cache. Verificado 2+2 real: small limpias 18.8s → incrementales 1.3s (sentinel/varsense/frontend ~1ms, cache hits); medium 18.8s → 1.6s. El total incremental es real: `executeStage` ya no reproduce el durationMs original de un cache hit, mide el replay (fix de métrica). Nota: `--fresh` no borra el índice persistente de VarSense — “limpia” significa caché de etapas vacía con índice caliente)*
- [x] Añadir presupuesto de tiempo por etapa que falle solo ante regresión confirmada, no por variación aislada de la máquina. *(`stageTimeBudgets` en `quality.config.json` + `evaluateStageBudgets` en `quality-profile.mjs --budgets`: requiere ≥5 muestras y p95 sobre presupuesto; verificado con varsense a 4 muestras → no declara regresión)*

**Gate:** baseline reproducible y reportes capaces de demostrar dónde se consumen los segundos.

### Fase 1 — Alcance efectivo y caché compartida del gate

- [x] Corregir la transición full→local-light en `task-check.mjs`/`scope.mjs`: el lease se adquiere cuando `scope.effectiveFull && runsAllStages && !args.heavyDeferred` y la re-detección respeta `effectiveFull=false`.
- [x] Hacer que `fingerprint` incluya el manifiesto de alcance y no obligue a reescanear archivos no afectados: modo por `scope.effectiveFull` y borrados/renombres marcados en el manifiesto.
- [x] Persistir el manifiesto de archivos una sola vez por tarea y reutilizarlo en todas las etapas.
- [x] Invalidar de forma explícita ante borrados, renames, cambio de config, cambio de commit de herramienta o cambio de parser.
- [x] Mantener locks atómicos y escritura temporal; una caché corrupta se descarta sin ocultar el error (ya cubierto por `atomic-file.mjs`/`lock.mjs`, verificado de nuevo).

**Gate:** tareas repetidas con el mismo alcance usan cache hit; un rename o cambio de configuración nunca reutiliza un resultado incompatible.

### Fase 2 — VarSense incremental

**Avance 2026-08-04 (SNT-09):** completado el primer subtramo de core: `ClassIndexBuilder` reutiliza definiciones CSS y tokens de consumidores por `fsPath`, poda archivos ausentes, expone `invalidateFile`/`clearCache` y separa `DocumentCacheProvider` del provider base. `varsense all` inyecta explícitamente el snapshot cacheable. Validación upstream: 53/53 tests, compile, lint, check:core y smoke LSP PASS. El builder es de vida corta en `classScanner`/LSP; conectar watchers persistentes, hash/versionado, índice inverso y dependencias queda para los siguientes subtramos.

#### Contrato CLI de VarSense

- [x] Añadir `--files-from <manifest>` al CLI agnóstico; el modo `incremental` completo y la persistencia entre ejecuciones siguen pendientes (`858ec62`).
- [x] Mantener `scan`, `orphan-classes` y `all` como comandos compatibles; el alcance filtra reportes sin romper los índices globales necesarios para exactitud.
- [x] Validar rutas relativas dentro del workspace, duplicados, directorios, archivos eliminados y symlinks que escapan mediante `realpath`; 60/60 pruebas upstream PASS.
- [x] Preparar el adapter para pasar `--files-from` solo en local-light cuando `capabilities.filesFrom=true`; full/CI conserva `all`. La capacidad se valida y se persiste en el lock; el checkout `main` fijado ya expone la capacidad.
- [ ] Publicar/fijar `858ec62`, declarar `capabilities.filesFrom` en `quality-tools.json`, regenerar el lock y ejecutar pruebas reales local-light/full/CI.

#### Índices persistentes

**Avance 2026-08-04 (028A-8 tramo 4 + Fase 0):** selección de dependencias con el índice inverso y métricas por etapa. Upstream (worktree `028A-8/dependency-expansion`, commits `230e11b` + `e836092`): captura de usos `var(--x)` por archivo (`extraerUsoVariablesDeTexto` en `classIndexBuilder`), `buildVariableReverseIndex` variable → consumidores en el snapshot, y `token-unused` consulta el índice en lugar de escanear el texto de todos los documentos por variable (O(vars×texto) → O(vars+usos)); `--files-from` + `--index-dir` abren solo los archivos scoped para el análisis documental sin perder exactitud (los usos se resuelven del snapshot; `PARSER_VERSION` bump a '2' invalida snapshots previos). Fallback sin índice conserva la semántica previa (incluye `var( --x )` con espacios) y los hallazgos documentales se restringen al alcance scoped. Métricas Fase 0 publicadas en el JSON: `filesDiscovered/filesAnalyzed/filesReused/cacheHitRate/peakRssMb`. Validación upstream: tsc, lint, check:core, smoke LSP, `smoke:persistent-index` y `smoke:tramo4` (reutilización, exactitud del índice inverso, invalidación por cambio de uso) PASS. Merge al `main` consumido (`11f0932`→`230e11b`→`e836092`), push a GitHub, `quality-tools.json` fija `commit=e836092` y lock regenerado. Gate real: PASS con `filesAnalyzed=16/319`, `cacheHitRate=1.0`, `reused=364`, `reparsed=0`; el tiempo residual (~11s) es descubrimiento de archivos + hashing, no análisis. índice persistente entre ejecuciones en el CLI de VarSense. Tramo 2 (worktree `028A-8/persistent-index`): `FilePersistentIndexStore` persiste por archivo definiciones CSS, tokens de consumo y variables, validados por SHA-256 de contenido y ligados a identidad `toolVersion+configHash+parserVersion`; el snapshot se guarda atómicamente y se reconcilia contra disco al cargar (expulsa entradas de archivos eliminados entre ejecuciones). `ClassIndexBuilder`/`VariableIndexBuilder` son store-first: un archivo sin cambios nunca se vuelve a parsear. El CLI acepta `--index-dir` en `scan`/`orphan-classes`/`all` y publica stats `loaded/reused/reparsed/removed/entries` en el JSON. Índice inverso `token/class → consumidores` listo para selección de dependencias. Validación upstream: tsc, lint, check:core, smoke LSP y `smoke:persistent-index` PASS; commit `11f0932`. Tramo 3: merge fast-forward al `main` consumido (`858ec62`→`11f0932`), recompilación del `dist` (ignorado por git, no afecta el lock), `quality-tools.json` con `commit=11f0932` + `capabilities.persistentIndex=true`, `sentinel.lock.json` regenerado y gate real con `--index-dir` activo y reutilización verificada.

- [x] Crear índice de variables por archivo y hash de contenido; reconstruir solo variables modificadas. *(tramo 2: hash por archivo + reuse store-first en `VariableIndexBuilder`; tramo 4: usos `var(--x)` por archivo + índice inverso de variables)*
- [x] Crear caché de resultados de clases CSS/consumidores por archivo durante la vida del builder; invalidación explícita de un archivo y limpieza total disponibles (`a72b39a`).
- [x] Persistir el índice entre ejecuciones e invalidar consumidores relacionados cuando cambia una definición o selector. *(persistencia y poda por borrado en `11f0932`; la invalidación de consumidores por índice inverso queda en el siguiente tramo)*
- [x] Mantener índice inverso `token/class → archivos consumidores` para seleccionar dependencias sin recorrer todo el workspace. *(`buildReverseIndex` + `buildVariableReverseIndex` consumidos en tramo 4: `token-unused` resuelve usos desde el índice y el análisis documental abre solo los scoped)*
- [x] Cachear documentos parseados persistentemente por `toolVersion + configHash + fileHash + parserVersion`; el snapshot en memoria de `varsense all` ya evita lecturas duplicadas dentro de una ejecución. *(identidad completa en `indexIdentity`; `PARSER_VERSION` debe subirse si cambia la semántica de extracción/parseo)*
- [x] Invalidar globalmente solo si cambian `variables.css`, reglas de tokens, patrones de inclusión/exclusión o versión del parser. *(la identidad incluye `configHash` y `parserVersion`; cambio de config invalida el snapshot completo, verificado en smoke)*
- [x] Hacer que token duplicate/unused y orphan classes declaren sus dependencias; no asumir que todo cambio CSS invalida todo. *(token-unused consulta el índice inverso en tramo 4; orphan classes conservan el recorrido global para exactitud)*

#### Eficiencia de I/O

- [ ] Compartir un inventario de archivos entre `VariableIndexBuilder`, `ClassIndexBuilder` y candidatos; actualmente solo se comparte el provider de documentos dentro de `all`.
- [ ] Evitar tres recorridos glob completos de `frontend/src` en una misma ejecución.
- [ ] Limitar concurrencia de parseo con un presupuesto configurable; no crear un worker por archivo.
- [ ] Escribir solo el delta de findings y luego materializar el reporte combinado determinista.

**Gate (estado 2026-08-04, tramo 4):** el upstream quedó en `e836092` (ramas `028A-8/persistent-index` + `028A-8/dependency-expansion` mergeadas al `main` consumido y pusheadas a GitHub), `quality-tools.json` fija `commit=e836092` con `capabilities.persistentIndex=true` y `sentinel.lock.json` se regeneró. El gate real `task:check -- 028A-8` pasa con `persistentIndex.enabled=true` → `<branchCache>/varsense`; con `--files-from` activo, `filesAnalyzed=16/319` (solo scoped abiertos), `cacheHitRate=1.0`, `reused=364`, `reparsed=0`. El tiempo residual (~11s) es descubrimiento de archivos + hashing de contenido, no análisis documental; los índices globales de Sentinel y las métricas RSS/p50-p95 del orquestador quedan como siguientes subtramos.

**Avance 2026-08-05 (028A-8 tramo 5, checkout interno):** VarSense deja de depender de la variable externa `GLORY_VARSENSE_SOURCE_PATH`. El checkout consumido pasa a ser el submódulo `tools/varsense` (gitlink pin en main + `.gitmodules`; el patrón es el mismo que `glory-rs`). Contrato: `quality-tools.json` usa `sourcePath: "tools/varsense"` (relativo al workspace, portable entre máquinas); `resolveConfiguredSourcePath(config, label, { baseDir })` resuelve relativos contra el root del workspace y conserva las env `GLORY_*` para sentinel; `validateSourcePath` sigue exigiendo absoluta para el `sourcePathRealpath` del lock. `setup.mjs` gana `ensureSourcePathReady`: en un clon limpio inicializa el submódulo (`git submodule update --init`) y compila el CLI (`npm ci` + `buildScript`) si falta `dist`; externo sin CLI sigue fallando con instrucción manual. `lockfile.mjs` valida el realpath por igual para interno/externo; el lock de varsense queda sin `sourcePathEnv` (el pin lo garantiza el gitlink). Validación: `quality:test` 136/136 PASS (tests nuevos de `sourcePath` relativo/sin baseDir); `quality:setup` y clon limpio (borrar `tools/varsense/dist` → recompila a `2.2.0`) PASS; reutilización del índice con el checkout interno: `cacheHitRate=1.0`, `reused=419`, `reparsed=0`, `peakRssMb=89.5` (antes 137.8). Gate 028A-8 en modo full automático (cambió `quality-tools.json`, dentro de `fullPatterns`): sentinel/frontend/docs/custom PASS; varsense FAIL solo por el hallazgo real `Variable '--fondo' no esta definida` en `desktop-game-playable.css` (archivo del bloque GAME-01 del otro agente, `91b5f13f`; el índice inverso lo detecta correctamente); rust FAIL por cambios sin commitear del otro agente (clippy/fmt/test en `glory-backend`). No hay hallazgos propios de este tramo.

### Fase 3 — Sentinel incremental y global indexes

- [ ] Auditar reglas Sentinel que requieren contexto global: OpenAPI, tipos, barrel exports, capacidades y límites de archivos.
- [ ] Separar análisis por archivo de índices globales; cada índice debe tener hash de entradas, versión de regla y dependencias.
- [ ] Reutilizar AST/documento y resultados por archivo cuando el hash no cambie.
- [ ] Mantener `--files-from` para reglas locales y ampliar automáticamente el conjunto cuando una regla global lo necesite.
- [ ] Invalidar solo el índice afectado: OpenAPI ante schema/contrato, tipos ante imports/types, UI ante componentes/recetas.
- [ ] Evitar que `scripts/quality/` fuerce full local cuando solo cambia un adapter; reservar esa condición para cambios de reglas/configuración del propio analizador.
- [ ] Medir y eliminar doble análisis entre Sentinel y custom; una regla migrada debe tener un único dueño y un único parseo.

**Gate:** Sentinel incremental queda por debajo del presupuesto sin reducir reglas; full CI produce el mismo conjunto de findings que el modo previo.

### Fase 4 — Reporte, caché y ejecución sostenible en Sentinel

**Avance 2026-08-05 (028A-16 + Fase 0/4 del orquestador):** `probeCachedPass`
expone la razón de invalidación por etapa (no-entry/fingerprint-mismatch/not-pass,
más fresh/ci) en `cache.mjs`/`task-check.mjs`; `runVarsense` propaga
filesAnalyzed/filesReused/cacheHitRate/peakRssMb del CLI al reporte
(Markdown/JSON/compacto, `formatStageDetail`); y `npm run quality:profile`
(`quality-profile.mjs`, alias temporal de `sentinel profile`) lee los últimos
`latest.json` de la rama y calcula p50/p95 por etapa y total sin ejecutar
validaciones. El reporte del gate también expone `heavyOverride`/`OVERRIDE`
(028A-16). `createReport` escribe además `metrics.json` por tarea (duración/cache/
invalidación/métricas del analizador, redactado) consumido por `quality:profile`
y candidato al histórico de CI. Quedan: TTL/cuota separadas para índices y CI
histórico.

- [x] Mostrar en el reporte si cada etapa fue `cache-hit`, incremental o full, cuántos archivos reutilizó y qué invalidó la caché. *(razón de invalidación por etapa + métricas de VarSense + p50/p95 vía `quality:profile`)*
- [x] Mantener el stdout compacto; el detalle de timing vive en `.quality-reports/<task>/metrics.json`. *(nuevo `metrics.json` por tarea con duración/cache/invalidación/métricas del analizador, redactado; `quality:profile` lo consume junto a `latest.json`)*
- [x] Añadir diagnóstico `sentinel profile <TareaId>` (alias temporal `npm run quality:profile`) que no ejecuta full: lee los últimos reportes y calcula p50/p95.
- [x] Aplicar TTL y cuota separadas para índices Sentinel/VarSense, sin mezclarlas con `C:\tmp\glory-target`. *(`index-maintenance.mjs` + `quality.config.json.indexRetention`: maxAgeDays/maxMiB/throttleHours; poda por edad y cuota de `<branch>/cache/<index>`; el branch actual y los locks activos se protegen; `RECENT_INDEX_WRITE_MS` de 30 min; pase con throttle de 6 h y presupuesto de 60 s, reportado en `latest.json` como `indexMaintenance`)*
- [x] Endurecer la cuota de `C:\tmp\glory-target`: el target-maintenance de cargo revisa la cuota en cada gate (sin throttle para cuota), serializa la poda con lock entre agentes, mide la última escritura real de archivos, conserva procesos/markers/escrituras recientes y reporta `quotaExceeded` si solo quedan targets activos; no mata procesos automáticamente.
- [x] Limpiar entradas huérfanas por `toolVersion/configHash` de forma acotada; nunca borrar una caché con lock activo. *(los índices son caché regenerable: la identidad y la expulsión por borrado la gestiona el store de VarSense al cargar; la poda del orquestador nunca toca ramas con lock de tarea activo, verificado por test)*
- [x] Hacer que CI publique métricas históricas sin subir código fuente ni secretos. *(`export-ci-metrics.mjs` agrega todos los `metrics.json` en `ci-metrics.json` — timing/cache/estado, redactado en origen; el workflow `.github/workflows/quality.yml` lo ejecuta tras el gate y publica el artifact `quality-metrics` con 30 días de retención, aparte de `quality-reports`)*

**Gate:** el equipo puede saber si una tarea fue lenta por análisis, caché fría, invalidación o espera, sin leer logs enormes.

### Fase 5 — Paridad, rollout y rollback

- [ ] Ejecutar la matriz CLI, LSP, VS Code y Zed con los mismos fixtures y resultados equivalentes.
- [ ] Activar incremental en `observe` durante una ventana de comparación contra `all` en CI.
- [ ] Comparar findings ordenados por `ruleId/file/line/message`; cualquier diferencia se bloquea o se documenta como cambio de regla.
- [ ] Activar enforcement incremental por proyecto después de cumplir los presupuestos durante cinco tareas consecutivas.
- [ ] Mantener flag de rollback a `all` por herramienta, no un bypass silencioso del quality gate.
- [ ] Actualizar manuales, lecciones, configuración y changelog de Sentinel/VarSense con la versión mínima compatible.

**Gate:** cinco tareas reales consecutivas cumplen tiempo/cobertura; rollback probado y paridad documentada.

## SOLID, seguridad y escalabilidad obligatorios

Cada fase debe evidenciar:

- **SRP:** alcance, inventario, índice, parser, reglas, caché y reporte son módulos separados.
- **OCP/DIP:** una nueva regla declara dependencias e invalidador; no añade condicionales al orquestador central.
- **ISP:** interfaces de filesystem, reloj, hashing, parser e índice son pequeñas y falsificables.
- **Seguridad:** rutas del manifiesto se validan dentro del workspace; JSON/configuración se parsea sin ejecutar código; reportes redactan secretos.
- **Consistencia:** locks, hashes, versiones de parser y escritura atómica impiden findings obsoletos o cachés parciales.
- **Rendimiento:** no aumentar workers por defecto; medir RSS, CPU, I/O, archivos y cache hit.
- **Escalabilidad:** probar un segundo proyecto con otra estructura y un segundo lenguaje/regla antes de generalizar el índice.
- **Observabilidad:** cada decisión de invalidación debe ser auditable y breve.

## Definition of Done

- [ ] Los últimos reportes local-light cumplen p95 ≤ 12 s en el fixture representativo.
- [ ] VarSense incremental no ejecuta `all` para cambios ordinarios y documenta sus archivos/dependencias.
- [ ] Sentinel no realiza full local cuando el full fue diferido; CI conserva full y paridad.
- [ ] Cache hit y razones de invalidación aparecen en JSON y en un resumen compacto.
- [ ] `quality:test`, type-check, tests de Sentinel/VarSense, fixtures de paridad y `task:check` pasan.
- [ ] No se desactivan reglas ni se convierten errores en warnings para cumplir el presupuesto.
- [ ] Existe rollback por herramienta y documentación de mantenimiento.

## Fuera de alcance

- No ejecutar `cargo test` adicional para medir este plan; el guard de 3 horas sigue vigente.
- No paralelizar indiscriminadamente Sentinel y VarSense mientras no exista evidencia de memoria/CPU segura.
- No cambiar severidades ni eliminar warnings como sustituto de optimización.
- No mover reglas específicas de wandori.us al core agnóstico de Sentinel/VarSense.
