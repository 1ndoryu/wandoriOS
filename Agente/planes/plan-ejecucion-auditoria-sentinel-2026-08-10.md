# Plan — Ejecución de la corrección: Auditoría completa de Glory Sentinel y el quality gate

> **Fecha:** 2026-08-10
> **Rama objetivo:** `wandorius`
> **Estado:** COMPLETADA — F0–F9 cerradas y capa A de la segunda auditoría retirada; la capa B queda como evolución separada SNT-10.
> Sentinel 0.7.4 (`0349485c`) y VarSense 2.2.1 (`88f281f9`) están publicados y ambos consumidores
> tienen lock/doctor/setup verificados. El gate canónico es `gate:check` → `sentinel check`; el stage
> `custom` fue retirado. Las CI #45/#46 y la matriz focal pasan; la capa A fue retirada tras verificar
> PATH sin runtime de desarrollo, enforcement y rollback de salida. La capa B espera SNT-10.
> **ID operativo:** `108A-1` (tomada por `buffy`)
> **Fuente del plan:** `Agente/documentacion/herramientas/auditoria-sentinel-completa-2026-08-10.md` §14
> (Plan integral de corrección por fases F0–F9). Este documento es solo seguimiento operativo; el
> detalle, checklists, gate y DoD viven en la auditoría §14. No duplica decisiones.
> **Autorización:** el usuario pidió ejecutar todas las tareas de la auditoría en orden
> (2026-08-10). Push/publicación remota requieren autorización explícita adicional (Fase 8).

## Alcance y no-goals (heredados de la auditoría §14.1)

- Ejecutar las fases F0→F9 **en orden**, cerrando cada fase con su gate antes de avanzar.
- No añadir fast paths, cache compartida, `task:close` ni nueva coordinación a `scripts/quality`.
- No retirar legacy sin paridad, rollback y adopción en dos consumidores.
- No tocar `tools/sentinel` en sitio dentro del gate del consumidor (rechazo por lock); los cambios
  upstream van en worktree exclusivo y solo se adoptan tras release publicado.
- No ejecutar deploy, push remoto ni escrituras externas sin autorización explícita.

## Estado registrado antes de editar (Fase 0, checklist)

- **Rama:** `wandorius` (checkout `glory-rust-template`), `ahead 1` de `origin/wandorius`; no se
  hace push.
- **Pins históricos:** Sentinel `v0.6.0` / `44dc8fa00c9ac498e64cad0d6a4edd16afa752d8` (submódulo
  `tools/sentinel`); VarSense `e8360927ee92c4067f1f501dd77b951c8bc4f61d` (submódulo
  `tools/varsense`); glory-rs `ec33d5200ff587543ae1611971ca196b50f2b17a`.
- **Cambios preexistentes ajenos (preservados, ownership resuelto por esta tarea):**
  - `roadmap.md`: bloque 098A-1 añadido por el agente anterior (aprobado por el usuario 09-08).
  - `scripts/quality/task-check.mjs`: fragmento de medición F0 de 098A-1 **incompleto** — usa
    `preflightStartedAt` sin declararlo (`ReferenceError` en todo `task:check`).
  - Untracked: `Agente/documentacion/herramientas/auditoria-sentinel-completa-2026-08-10.md` y
    `Agente/planes/plan-agilizar-ceremonia-cierre-calidad-2026-08-09.md` (historia; no se borran).
- **Reportes previos:** ninguno válido para `108A-1`; todo gate posterior al fragmento F0 de 098A-1
  fallaba con `ReferenceError`. Línea base a reconstruir tras el hotfix.
- **Guard pesado:** sin full activo ni cooldown (`quality:guard` → `projects: {}`, `active: null`).
- **Toma de tarea:** `108A-1` tomada por `buffy` (`T-1786338220802-ba8d5987`).

## Estado de fases

| Fase | Estado | Nota |
| --- | --- | --- |
| F0 — Contención urgente y baseline confiable | COMPLETADA | commit `b397a135`; el gate **full** definitivo queda pendiente de decisión 028A-16 (cooldown o `--allow-heavy` autorizado) |
| F1 — Corregir contratos de Sentinel | COMPLETADA | worktree `f1/cli-contracts` commit `1942cf5` (stdout/stderr, doctor, dry-run, budgets) + gate upstream PASS; adopción tras release publicado (F8) |
| F2 — Sentinel modular único | COMPLETADA | worktree `546f31e`: ADR 0001 + registro de extensiones + fronteras check:core + split CLI + capabilities opcionales; gate PASS (513); consolidación física en F5/F6 |
| F3 — Rendimiento VarSense/setup/suites | COMPLETADA | worktree VarSense `f3/varsense-perf` commit `998505c` + consumidor `6ba9f265`: fases instrumentadas, bench p95 ~305 ms (presupuesto 6 s), contrato de artifact; publicación en F8 |
| F4 — Bootstrap `sentinel init` | COMPLETADA | worktree `f1/cli-contracts`: `init/migrate/uninit` (presets node/rust/python/mixed, idempotente, dry-run no mutante, --force con backup/rollback, zero scripts/quality) + doctor readyForGate tras init; gate upstream PASS (520); migración real del consumidor en F5 |
| F5 — Migrar consumidor y consolidar gate | COMPLETADA | worktree `f5/consumer-migrate` (`e0bec3e1` + `bad010f4`): pin local, lock, clasificación, reglas observe-only, doble vía 1:1, 5 tareas reales |
| F6 — Escalabilidad local, seguridad, operación | COMPLETADA | worktree `c1f8f1f` + consumidor `304a474d`: seguridad, concurrencia, doctor --shims, bench-shims, ADR 0001 |
| F7 — Consolidar documentación | COMPLETADA | commit `71e26bd8`: índice actualizado, lecciones aprendidas |
| F8 — Release, adopción y retirada legacy | COMPLETADA | releases `0.7.4`/`2.2.1` publicadas y adoptadas; rollback histórico y de salida probado; capa A retirada, capa B separada en SNT-10 |
| F9 — Verificación final y cierre | COMPLETADA | gates PASS, suites OK, auditoría §14 RESUELTA |

## Seguimiento Retirada Legacy (108A-6, 2026-08-10)

- [x] Stage `custom` retirado en ambos consumidores: wandorius (commit `2244eee7`) y glory-rs-rest (commit `f13d0e16`). `custom-rules.mjs`, `adapters/custom.mjs` y su test eliminados; `profile-contract.mjs`, `stage-definitions.mjs` y `quality-adapter.json` sin referencias. Suites: 240 y 231 pass.
- [x] Segundo consumidor adoptado y **re-pinado a Sentinel 0.7.4** (`0349485c`) y VarSense 2.2.1 (`88f281f`) con lock y doctor PASS.
- [x] Releases **0.7.4/2.2.1** publicadas en refs verificables; Sentinel 558 pruebas y VarSense 61 pruebas PASS en staging limpio.
- [x] Doble vía real: `observe-compare` en 108A-1 y 297A-78 — decisión y hallazgos idénticos entre `task:check` y `sentinel check --stages`.
- [x] Gate canónico integrado: `gate:check` (wrapper) genera el manifest declarativo y delega en `sentinel check`; CI (quality.yml) ejecuta `gate:check --ci`; `export-ci-metrics.mjs` agrega `check/`.
- [x] Retirada física de la capa A (shims del repo + `quality-command-guard`) — PATH sin runtime de desarrollo,
      enforcement exit 78 y rollback de salida verificados; la capa B (orquestador local) espera SNT-10 y no se
      borra junto con A. El baseline visible de glory-rs-rest sigue siendo deuda de producto, no bloqueo del gate.

## Decisión sobre 098A-1 (absorbido)

- El plan `plan-agilizar-ceremonia-cierre-calidad-2026-08-09.md` queda como historia (no se borra).
- Su F0 (medición de fases) se completa dentro de esta Fase 0 (el hotfix es exactamente el fragmento
  incompleto que dejó).
- F1–F6 de 098A-1 NO se implementan en `scripts/quality`: se reubican según la tabla de la auditoría
  §14.1 (Core/planner/CLI) en fases posteriores de este plan.

## Checklist Fase 0 (seguimiento de ejecución)

- [x] Tarea `108A-1` creada y tomada por `buffy`; estado Git/rama/pins/reportes registrados arriba.
- [x] Corregir `preflightStartedAt` (ReferenceError P0) y conectar `phaseDurationMs`
      (preflight/maintenance/stage/report) a `metrics.json` sin cambiar decisiones.
- [x] Prueba de proceso del entry point real + caso negativo de variables de medición.
- [x] `node --check`, tests focalizados y suite `quality:test` completa (230/231 PASS, 1 skip).
- [x] `quality:doctor` y `quality:lock -- --check` PASS.
- [x] Contención de analizadores: excluir `**/.sentinel/**` (backups de worktrees), `**/.vscode-test/**`
      y `**/tools/**` de VarSense; `**/.sentinel/**` de Sentinel (causa: 1 GB de artifacts VS Code
      y backups con fixtures del analyzer rompían/crasheaban el análisis; `Invalid string length`).
- [x] Propagar los tokens de sanción del gate (`GLORY_QUALITY_GATE_TOKEN`/`GLORY_HEAVY_RUN_TOKEN`)
      al entorno de las etapas (allowlist del runner): shims globales bloqueaban cargo fmt y
      run-with-db clippy/test chocaban con el lease pesado del propio gate.
- [x] Inventario inicial de entrypoints/imports/reglas/etapas custom + marca de compatibilidad
      temporal de `task:check` (congelar features) — actualizado en
      `Agente/documentacion/herramientas/inventario-scripts-adapters-sentinel-2026-08-06.md`.
- [x] Corrección preventiva de la skill global `quality-gate-setup` v1.1.0 (retirada la orden de
      copiar `scripts/quality`, inventario legacy, sin prometer migración inexistente; backup
      `.bak-2026-08-10`).
- [x] Gate real `task:check -- 108A-1`: full automático estructurado (FAIL, 100,5 s, todas las
      etapas) y **PASS local-light** (3,4 s; sentinel+docs) tras las correcciones. Baseline en
      `Agente/prevencion/bench-ceremonia-2026-08-09.md`.
- [ ] Gate **full** definitivo tras cooldown (~11:23Z) o con `--allow-heavy --heavy-reason`
      (requiere autorización explícita del usuario en el mismo turno, regla 028A-16).
- [x] Actualizar `roadmap.md` (098A-1 absorbido por 108A-1) y estado §14 de la auditoría.
- [x] Commit coherente del bloque Fase 0 (`b397a135`, 13 archivos, árbol limpio) y `task:release`.

## Checklist Fase 1 (seguimiento de ejecución — worktree exclusivo `f1/cli-contracts`)

- [x] Worktree upstream exclusivo creado (rama `f1/cli-contracts` en
      `area-trabajo/.sentinel-upstream-f1`, fuera del checkout del consumidor); consumidor y
      submódulo `tools/sentinel` intactos (gitlink `44dc8fa`).
- [x] Logger CLI separado del Output Channel: sin canal, INFO/WARN/ERROR van SIEMPRE a stderr
      (`src/utils/logger.ts`); stdout queda reservado al documento JSON solicitado.
- [x] Test de proceso que parsee stdout completo como un único JSON con warnings reales de
      GloryAnalyzer (`src/test/suite/cliProcess.test.ts`): `analyze --format json` → stdout JSON
      puro + diagnósticos en stderr; `--output` == stdout (mismo schema).
- [x] Doctor separa `readyForAnalyze` de `readyForGate` en JSON y salida humana; no-policy nunca
      gate-ready (fixture no-policy: analyze listo, gate no listo, exit 0).
- [x] `check --dry-run` estrictamente no mutante: sin `.quality-reports/`, sin
      `changed-files.txt`/`scope-manifest.json`, sin lease en el runtime (fixture repo Git).
- [x] Budgets conectados al comando (P1 de la auditoría) en `quality:profile`:
      `--budgets` sin valor carga `quality.config.json → stageTimeBudgets`; override explícito
      `--budgets-json <json>`/`--budgets=<json>`; `--project-root <dir>` para perfilar otro
      checkout; exit 1 + reporte estructurado (`budget.violations`) ante regresión confirmada;
      `budget.insufficient` expone evidencia insuficiente sin ocultarla. E2E de proceso hermético
      (10→11 tests PASS).
- [x] Lint upstream PASS: absorbidos 9 errores preexistentes mecánicos (escapes de regex,
      `Boolean()` redundantes, `while(true)` intencionales con disable razonado, `throw` en finally
      documentado); quedan 12 warnings preexistentes (deuda registrada, no bloqueante).
- [x] Gate upstream `f1/cli-contracts`: `npm run compile` PASS · `npm run lint` 0 errores ·
      `npm run test:unit` PASS (506 passing, 1 pending, exit 0).
- [ ] Adopción del release upstream (repin consumidor) — Fase 8, requiere release publicado y
      autorización explícita de push.
- [ ] Fixtures gate-ready y lock-divergente del checklist de readiness — se cubren en F4 cuando
      exista el runtime global (el fixture no-policy ya existe en `cliProcess.test.ts`).
- [ ] Segmentar perfil por modo/estado/fixture/versión de plugin y mover la evaluación canónica de
      presupuestos a `sentinel check` — milestone canónico del perfil en F4/F5 (cache hit/miss ya
      está segmentado hoy).

## Checklist Fase 2 (seguimiento de ejecución — worktree `f1/cli-contracts`)

- [x] ADR 0001 `docs/adr/0001-producto-unico-sentinel.md`: producto único, gate = `sentinel
      check`, módulos `analysis`/`gate`/`runtime`/`task`/`editor` (+ `cli` y transversales),
      una regla un dueño, presupuestos de tamaño, rollback en commits pequeños.
- [x] Registro de extensiones `src/core/extensionRegistry.ts` (identidad/owner/rule IDs/
      entrypoint/fixtures/budgets/retirada) + rechazo de colisiones con el núcleo
      (`ruleRegistry`) y entre extensiones + rechazo de ejecutables no declarados; 7 tests.
- [x] Fronteras en `check:core`: `src/cli` protegido de imports `vscode`; DIP (core/cli/analyzers
      no importan módulos del editor ni `scripts/quality`); `gateRun` no importa
      `interceptorShims`/`taskCoordinator` (`check` independiente de shims/perfiles/worktrees);
      budgets de tamaño por módulo (`scripts/module-budgets.json`, top-10 de visibilidad).
- [x] CLI dividido: `src/cli/args.ts` (parsing) + `src/cli/commands.ts` (handlers/dispatch) +
      `src/cli/index.ts` (barril + entry). Contrato público intacto (tests cli PASS, bin ok).
- [x] `task`/`recover`/shims como capabilities OPCIONALES del doctor (requeridas:
      `analyze`/`check`/`doctor`/`status`); `optionalCapabilities` en el diagnóstico + test.
- [x] Gate upstream F2 PASS: compile · lint (0 errores) · test:unit **513 passing, 1 pending** ·
      check:core OK · paridad de decisiones (tests analyze/equivalence/cliProcess sin cambios).
- [ ] Consolidación física de archivos en módulos `analysis`/`gate`/`runtime`/`task`/`editor`
      — planificada en F5/F6 (el ADR fija la frontera y los budgets desde ya).

## Checklist Fase 3 (seguimiento de ejecución — worktree VarSense `f3/varsense-perf`)

- [x] Instrumentar fases del CLI de VarSense (`phaseDurationMs` en JSON): config, índice de
      variables, índice de clases, discovery, análisis, token-rules, orphan, agrupado y save;
      `metrics` (RSS, archivos descubiertos/analizados/reutilizados, hit rate) también en `scan`.
- [x] Fixture determinista del bench (2/12/120 archivos) + modos cold/warm × scoped/full con
      `--index-dir`/`--files-from`; benchmark JSON versionado (schemaVersion, estado, muestras,
      p50/p95 por modo, fase y métrica) en `.quality-bench/varsense/benchmark.json`.
- [x] Presupuesto efectivo (stageTimeBudgets.varsense, 6.000 ms) sobre el modo del gate
      (warm-scoped): exit 1 + reporte estructurado ante regresión confirmada (minSamples 5),
      evidencia insuficiente visible; 4 tests (unit + E2E de proceso).
- [x] Medición: warm-scoped p95 **~305 ms** (fixture 120 archivos) — ~20× bajo el presupuesto;
      cuello dominante = `classIndexMs` (~34 %, verificación SHA-256 por archivo para
      reutilización). El fast-path mtime implicaría un tradeoff de invalidación por contenido
      que el margen no justifica: queda como palanca documentada (índice de clases incremental,
      F5). La contención de F0 (exclusión de `.vscode-test`/`tools`) fue el fix del coste real.
- [x] Contrato de artifact publicado de VarSense (`docs/artifact-contract.md`): runtime deps
      mínimas, manifest con version/commit/protocol/capabilities/SHA-256, build desde source
      solo como dev, retención y rollback sin editar locks; publicación en F8.
- [x] Gate worktree VarSense PASS: lint (0 errores) · check:core OK · smoke:lsp OK ·
      smoke:persistent-index OK (la integración VS Code `npm test` requiere host VS Code:
      se ejecuta en la adopción F8).
- [ ] Artifacts publicados (Sentinel + VarSense) con manifest firmado — Fase 8 (requiere push).
- [ ] Retag de suites de integración (WMI/disco/shells/Electron) y duración por archivo/suite:
      se completa con la suite del consumidor en F5/F6 (el bench ya publica duraciones).

## Siguiente paso verificable

1. **Fase 0:** gate **full** definitivo del consumidor (cooldown o `--allow-heavy` autorizado,
   regla 028A-16) — decisión del usuario pendiente.
2. **Fase 3:** commit del worktree VarSense + docs del consumidor.
3. **Fase 4 — Bootstrap reproducible (`sentinel init`):** depende de F1–F3 (artifacts); el
   worktree Sentinel sigue siendo el vehículo.
