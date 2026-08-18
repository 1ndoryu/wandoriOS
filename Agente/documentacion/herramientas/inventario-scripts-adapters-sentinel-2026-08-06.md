# Inventario de scripts y adapters frente a Sentinel

> Fecha de corte: 2026-08-07
> Iniciativas canónicas: `Agente/planes/plan-migracion-scripts-adapters-sentinel-2026-08-06.md` y `Agente/planes/plan-preflight-recuperacion-sentinel-2026-08-07.md`

> **Actualización de seguimiento:** este inventario conserva abajo la fotografía histórica
> de la transición 0.6.0. El estado operativo actual es Sentinel 0.7.4 (`0349485c`) y VarSense 2.2.1
> (`88f281f`) en wandorius y
> glory-rs-rest, con lock/doctor alineados, `gate:check` delegando en `sentinel check` y stage `custom`
> retirado en ambos consumidores. La capa A (shims/wrappers duplicados) ya fue retirada tras dos CI
> consecutivos verdes, matriz multi-shell, gates, PATH, enforcement y rollback. La capa B (`scripts/quality`)
> permanece como adapter/orquestador project-owned hasta SNT-10; no se deben crear nuevas reglas ni copiar
> esta carpeta a otros proyectos.

> **Seguimiento de cierre:** Sentinel `0349485c`/0.7.4 añade la corrección POSIX de la
> matriz, resolución portable PowerShell y diagnósticos de CI sobre el hardening de 0.7.2/0.7.3; VarSense
> `88f281f`/2.2.1 elimina recorridos repetidos del workspace y queda bajo el presupuesto del gate frontend.
> La CI upstream #45/#46 pasa consecutivamente y el transporte de perfiles explícitos del adapter ya tiene
> regresión. La retirada A quedó cerrada con referencias productivas ausentes, paridad, PATH sin runtime y rollback;
> cualquier cambio restante se evalúa como parte de SNT-10.

## Decisión

El plano universal debe vivir en Sentinel Core. El consumidor conserva únicamente un adapter pequeño y scripts que encapsulan dominio, proveedor, base de datos, generación o rescate operacional. No se copia `scripts/quality` a otros proyectos y no se retiran wrappers por estética; la retirada física se decide por release, paridad y rollback.

## Estado por capa (snapshot histórico 0.6.0)

| Capa | Ubicación | Estado | Decisión |
|---|---|---|---|
| Core universal | upstream Sentinel | SNT-16c/SNT-16d/SNT-16f publicados en la release **0.6.0** (`44dc8fa` en `origin/main` + tag `v0.6.0`) | Adopción estable pendiente solo de la matriz multi-proyecto con clon limpio. |
| Preflight/doctor | upstream Sentinel `src/core/diagnose.ts` | SNT-16f local verificado | Diagnostica submódulo/gitlink, CLI y `--version`, package metadata/dependencias/scripts, capacidades ausentes, symlink escapes, checkout/package-lock dirty, commits/versiones y lock. El gate real falla cerrado antes de las etapas. |
| Recuperación | upstream Sentinel `src/core/taskRecovery.ts` y CLI | SNT-16f local verificado | `task status` deriva expiración/PID/limpieza; `task recover --dry-run/real` exige tarea expirada, PID muerto, namespace, snapshots de metadata/HEAD y worktree limpio; la recuperación real escribe auditoría. |
| Manifest de stages | upstream Sentinel `src/core/` | SNT-16c validado | Envelope schema 1, legacy compatible, paths físicos contenidos y exit no cero fail-closed. |
| Adapter del consumidor | `scripts/quality/adapter-manifest.mjs`, adapters | SNT-15 cerrado | Sigue como frontera local. |
| Gate transitorio | `scripts/quality/task-check.mjs` | Se conserva | No se reemplaza por `sentinel check` hasta release y paridad real. |
| Scripts de dominio | `scripts/run-with-db.mjs`, codegen, preparación DB | Se conservan | Encapsulan Rust/PostgreSQL y no entran al core universal. |
| Analyzers | Sentinel + VarSense | Se conservan separados | VarSense es analyzer, no gate ni reporter paralelo. |

### Estado operativo vigente (release 0.7.4 / VarSense 2.2.1)

| Superficie | Estado vigente | Próximo criterio |
| --- | --- | --- |
| Sentinel Core/CLI | release `0349485c` / 0.7.4; ambos consumidores adoptados | mantener lock, capabilities y release refs alineados |
| Gate | `gate:check` → `sentinel check --stages` | `task:check` solo compatibilidad hasta la retirada de capa B |
| Stage `custom` | retirado en wandorius y glory-rs-rest | no reintroducirlo sin contrato project-owned y justificación específica |
| `scripts/quality` | capa B: transición sin expansión; transporte de perfiles corregido; capa A retirada | mantener solo como adapter project-owned hasta SNT-10; no copiar ni añadir lógica universal |
| VarSense | analyzer/plugin 2.2.1, no decide el cierre | conservar como etapa del reporte combinado |

### Estado operativo verificado el 2026-08-11

El adapter vigente ya no declara una etapa `custom`: los perfiles ejecutables son `css`, `frontend`,
`rust` y `docs`, y la decisión la toma `sentinel check`. Los 17 scripts npm que `sentinel migrate`
detecta no tienen todos el mismo destino; esta tabla evita conservarlos o borrarlos por el nombre de la
carpeta.

| Script | Owner actual | Destino | Estado |
|---|---|---|---|
| `quality:setup` | consumidor / bootstrap | setup oficial + evidencia del release | conservar como alias de bootstrap |
| `quality:test` | consumidor / tests del adapter | suite del consumidor | conservar; 240 PASS, 1 omitido |
| `quality:guard` | transición del guard | `sentinel guard` + estado del runtime | alias temporal; retirar con segunda release |
| `quality:doctor` | consumidor | `sentinel doctor`; `--migrate`/`--lock` compatibilidad | **delegación canónica completada** |
| `quality:lock` | consumidor / lock de sourcePath | contrato de setup/doctor | conservar hasta que el bootstrap oficial genere el lock |
| `quality:cleanup[:dry]` | consumidor / targets Cargo | mantenimiento específico de targets | conservar; no es gate |
| `quality:reports:cleanup[:dry]` | consumidor / retención | retención del reporte del adapter | conservar hasta paridad de retención en Core |
| `quality:reports:read` | consumidor / lectura | lector de artefactos del consumidor | conservar; no decide el gate |
| `quality:install-guard` / `quality:uninstall-guard` | consumidor / instalación | `sentinel install/update/uninstall` | alias temporal; retirar tras smoke test de shims |
| `task:check` | compatibilidad legacy | `gate:check` → `sentinel check` | no añadir lógica; retirar solo con el criterio único del runbook §3 |
| `check:back` | producto wandorius | adapter Rust/PostgreSQL | project-owned; no migrar al Core |
| `check:front` | producto wandorius | adapter frontend/Vite | project-owned; no migrar al Core |
| `quality:profile` | medición del consumidor | perfilador de reportes | conservar hasta baseline SLO suficiente |
| `quality:bench` | medición VarSense | fixture/benchmark del consumidor | conservar; no decide el cierre |

No se encontró una regla `custom` conectada al adapter actual. Los scripts auxiliares restantes se
mantienen únicamente si una referencia productiva, test o alias de esta tabla los consume; una finalidad
desconocida sigue siendo bloqueo y no se elimina automáticamente.

## Evidencia

- Sentinel SNT-16c/SNT-16d/SNT-16f: `tsc` sin errores y suite upstream **502 passing, 1 pending**; release **0.6.0** (`44dc8fa`) publicada en `origin/main` + tag `v0.6.0`.
- Doctor, recovery, capacidades, symlink escape, metadata estricta y contrato CLI focalizados: PASS; el caso de proceso vivo se bloquea y el dry-run de una toma expirada pasa en la evidencia local conservada.
- `node scripts/quality/lock-generator.mjs --write --json` y posteriormente `--check --json`: PASS en el checkout consumidor integrado; `quality-tools.json`, `sentinel.lock.json` y el gitlink coinciden con el commit publicado `44dc8fa00c9ac498e64cad0d6a4edd16afa752d8` (v0.6.0).
- El checkout consumidor fija gitlink/config/lock a `44dc8fa` (release 0.6.0 publicada en `origin/main` + tag `v0.6.0`); lock-check PASS y doctor `ready: true` con cero issues. La release anterior `20c13a2`/`0.5.0` queda como rollback disponible.
- El guard auxiliar esperado por `npm run compile` dentro del submódulo no forma parte de ese checkout; la compilación directa con `tsc` y las suites ejecutadas sí pasan. Esto queda como limitación de provisionamiento, no como PASS del script wrapper.

## Política de permanencia para scripts

Conservar scripts de dominio/proveedor, adapters externos estables, experiencia humana/IDE, bootstrap reproducible o un segundo consumidor real. Migrar solo capacidades universales con más de un caso o claramente agnósticas. No migrar ni copiar scripts históricos o de producción ajena.

## Siguiente bloque

1. ~~Publicar en upstream y crear release/tag compatible~~ → **Hecho:** release **0.6.0** (`44dc8fa`) publicada. Pendiente: matriz multi-proyecto con clon limpio.
2. Validar clon limpio, CLI real, dos proyectos consumidores y paridad envelope/legacy.
3. Actualizar el lock del consumidor primario solo con artefacto/release verificables.
4. Mantener scripts locales hasta dos releases consecutivas verdes; después medir y retirar solo archivos sin referencias.

---

## Inventario 108A-1 — Fase 0 (corte 2026-08-10)

> Generado sin modificar conducta, como línea base de la auditoría
> `Agente/documentacion/herramientas/auditoria-sentinel-completa-2026-08-10.md` (Fase 0).

### Volumen

- `scripts/quality/`: **103 archivos `.mjs`** — 56 productivos y 47 de tests (13.553 líneas
  totales según la auditoría; el inventario de archivos/líneas detallado vive en el informe §3).

### Entrypoints públicos (package.json)

- `task:check` → `node scripts/quality/task-check.mjs` (gate; marcado **compatibilidad
  temporal**, sin nuevas features — ver congelación abajo).
- `quality:setup` → `setup.mjs` · `quality:test` → suite `node --test` · `quality:doctor` →
  `sentinel-doctor.mjs` · `quality:lock` → `lock-generator.mjs` · `quality:guard` →
  `heavy-run-guard.mjs --status` · `quality:cleanup[:dry]` → `target-maintenance.mjs` ·
  `quality:reports:cleanup[:dry]` → `report-cleanup.mjs` · `quality:profile` →
  `quality-profile.mjs` · `quality:bench` → `bench-baseline.mjs` · `quality:install-guard` /
  `quality:uninstall-guard` → `install-global-runtime.mjs`.
- Toma de tarea: `task:take` / `task:release` / `task:status` → `task-takeover.mjs`.

### Módulos raíz (46) — agrupación funcional

- **Orquestación:** `task-check.mjs` (entry), `stage-definitions.mjs`, `stage-runner.mjs`,
  `stages.mjs`, `stage-process.mjs`, `scope.mjs`, `args.mjs`.
- **Preflight/lock/tools:** `preflight.mjs`, `lockfile.mjs`, `lock.mjs`, `lock-generator.mjs`,
  `source-path.mjs`, `policy.mjs`, `policy-defaults.mjs`, `policy-decision.mjs`,
  `adapter-manifest.mjs`.
- **Reporte/métricas:** `reporter.mjs`, `redaction.mjs`, `quality-profile.mjs`,
  `export-ci-metrics.mjs`, `performance-budget.mjs`, `report-reader.mjs`, `report-cleanup.mjs`,
  `report-retention.mjs`, `report-retention-stage.mjs`.
- **Runner/seguridad:** `runner.mjs`, `atomic-file.mjs`, `branch-identity.mjs`, `cache.mjs`,
  `quality-command-guard.mjs`, `heavy-run-guard.mjs`, `target-maintenance.mjs`,
  `target-maintenance-stage.mjs`, `index-maintenance.mjs`, `task-takeover.mjs`,
  `install-global-runtime.mjs`.
- **Analizadores/adapters:** `custom-rules.mjs`, `run-frontend-tests.mjs`,
  `frontend-test-selection.mjs`, `reminders.mjs`, `varsense-parity.mjs`, `observe-compare.mjs`,
  `bench-baseline.mjs`, `bench-fixtures.mjs`, `sentinel-doctor.mjs`, `setup.mjs`.

### Reglas del analyzer local `custom-rules.mjs` (17)

14 checks regex + `file-size-budget` + `singleton-mutable-state` + `large-interface-isp`.
`adapters/custom.mjs` marca **15 como `MIGRATED_TO_SENTINEL`** (se filtran del reporte, pero el
scanner sigue ejecutándose y conserva resultados para comparación):
`dom-access-outside-platform`, `window-reference-outside-platform`, `unsafe-any`,
`default-export`, `console-production`, `api-call-outside-service`, `catch-vacio`,
`unsafe-process-shell`, `hardcoded-secret-context`, `open-redirect`, `innerhtml-variable`,
`singleton-mutable-state`, `large-interface-isp`, `mixed-barrel-logic`, `file-size-budget`.

**Sin clasificar (no marcadas):** `async-without-abort` y `subscription-without-dispose` — no se
borran ni se declaran migradas; requieren clasificación con fixtures (Fase 5 de la auditoría).

### Etapas del adapter (`quality-adapter.json`)

`sentinel` (180 s) · `varsense` (300 s) · `rust` (1800 s) · `frontend` (600 s) · `docs` (60 s) ·
`custom` (60 s). Perfiles: `css→[varsense]`, `frontend→[varsense,frontend,custom]`,
`rust→[rust]`, `docs→[docs]`.

### Congelación de `scripts/quality` (Fase 0 de la auditoría)

- `task:check` queda como **compatibilidad temporal** del gate: sin nuevas features, fast paths,
  cache compartida ni cierre consolidado (no-goals de la auditoría §14.1). Solo se permiten
  correcciones acotadas que recuperen un gate ejecutable y su evidencia.
- **Congeladas las nuevas reglas y nuevos archivos productivos** en `scripts/quality` salvo el
  hotfix acotado de esta fase.
- Las capacidades universales (fast path, cache root, `task:close`, evidencia común) se
  reubican en Sentinel Core/CLI en fases posteriores, no aquí.
5. Actualizar la skill global únicamente cuando la release, lock, gate y una sesión nueva aporten evidencia.
