# Baseline — Ceremonia de cierre de calidad (phaseDurationMs)

> **Fecha:** 2026-08-10 (mediciones; el nombre conserva la fecha del plan 098A-1 F0).
> **Origen:** F0 de `098A-1` (plan agilizar ceremonia) absorbido por la Fase 0 de la
> auditoría `108A-1` (`plan-ejecucion-auditoria-sentinel-2026-08-10.md`).
> **Máquina:** Windows, Node `process.version`, checkout `glory-rust-template` rama `wandorius`.
> **Objetivo:** separar el coste del cierre por fase (preflight, mantenimientos, etapas,
> reporte) en `metrics.json` (`phaseDurationMs`) para poder atacar el overhead sin adivinar.

## Métricas instrumentadas (108A-1 Fase 0)

`task-check.mjs` mide y `reporter.mjs` escribe en `metrics.json`:

```json
"phaseDurationMs": {
  "preflightMs": 1260,
  "maintenanceBeforeMs": 545,
  "maintenanceAfterMs": 1012,
  "stageMs": 97454,
  "reportWriteMs": 50
}
```

Solo cronometra; no cambia la decisión del gate (PASS/FAIL/ERROR/exit code intactos).

## Ejecución 1 — Gate real `task:check -- 108A-1` (full automático, 8 archivos, FAIL)

Estado del árbol: cambio en `scripts/quality` → `automaticFull` (lease pesado concedido,
`OVERRIDE flag concedida`). Resultado: **FAIL exit 1** (no crash).

| Fase | ms | Nota |
| --- | ---: | --- |
| preflight | 1.260 | verificación de analizadores + lock |
| maintenanceBefore | 545 | target-maintenance preventivo |
| stages | 97.454 | sentinel 9.005 / varsense 13.304 / rust 67.896 / frontend 5.921 / docs 14 / custom 114 |
| maintenanceAfter | 1.012 | targets (2.ª pasada) + índices |
| reportWrite | 50 | latest.json/md + metrics.json |
| **Total** | **100.555** | |

Causas del FAIL (preexistentes, descubiertas al recuperar el gate; corregidas en la misma
Fase 0):

1. Sentinel/VarSense analizaban `.sentinel/worktrees-backup/**` (backup de worktree 028A-22 con
   fixtures del analyzer) → errores falsos de `axum-ruta-sintaxis-rs`/`unwrap-produccion-rs`.
2. VarSense crasheaba con `Invalid string length` al descubrir `tools/sentinel/.vscode-test`
   (1,1 GB, VS Code completo, no excluido por `varsense.config.json`).
3. El runner eliminaba `GLORY_QUALITY_GATE_TOKEN`/`GLORY_HEAVY_RUN_TOKEN` del entorno de las
   etapas → shims globales bloqueaban `cargo fmt` y `run-with-db clippy/test` chocaban con el
   lease pesado del propio gate (rust 67,9 s en bloqueos, no en compilación).
4. Docs: faltaban el archivo baseline referenciado, el checklist del plan activo y la entrada
   de `108A-1` en `roadmap.md`.

## Ejecución 2 — Probe del entry point (fixture `small`, 2 archivos, local-light)

Prueba de proceso `task-check-entrypoint.test.mjs` (gate real con `--scope-manifest small`):

| Intento | Total | preflightMs | stageMs | reportWriteMs |
| --- | ---: | ---: | ---: | ---: |
| Frío (sin caché de etapas) | ~21.1 s | 1.485 | 17.745 | 6 |
| Tibio (caché de etapas) | ~3.5 s | 1.656 | 14 | 6 |

Lectura: en frío dominan las etapas (VarSense ~13-17 s); en tibio **domina el preflight**
(~1,6 s de ~3,5 s). Coincide con el hallazgo P1 de la auditoría: el preflight completo
(verificación de analizadores con subprocesos git) es el cuello de botella del cierre
documental/incremental. La optimización del preflight (verifyLight, fast path) queda en las
fases posteriores del plan (F1+ de la auditoría; no se implementa en `scripts/quality`).

## Ejecución 3 — Gate real `task:check -- 108A-1` (PASS, local-light, tras correcciones)

Tras excluir `.sentinel/**`/`.vscode-test`/`tools/**`, heredar los tokens de sanción y completar
la documentación: **PASS exit 0** (mode local-light, heavy-deferred por cooldown del full previo).

| Fase | ms | Nota |
| --- | ---: | --- |
| preflight | 1.150 | |
| maintenanceBefore | 854 | |
| stages | 209 | sentinel 166 / docs 14 (solo etapas seleccionadas por alcance local-light) |
| maintenanceAfter | 788 | |
| reportWrite | 4 | |
| **Total** | **3.426** | |

Limitación registrada: con `heavy-deferred` solo corren las etapas del alcance efectivo
(sentinel + docs); el cierre definitivo de un cambio de `scripts/quality` exige el **gate full**
(automaticFull con lease), pendiente del cooldown de 180 min o de `--allow-heavy` autorizado
(regla 028A-16). El recorrido full completo (6 etapas) ya se ejercitó en la Ejecución 1.

## Línea base a superar (objetivos)

- Gate completo (automaticFull) con código: objetivo <10 min (aquí 100 s de los cuales ~68 s
  eran bloqueos del guard ya corregidos).
- Docs/ceremonia ligera: objetivo <2 min (098A-1) / <5 s warm incremental (auditoría §4.3).
- Warm incremental: stageMs objetivo <2 s (aquí 14 ms con caché; preflight sigue siendo ~1,6 s).

## Evidencia

- `metrics.json` por ejecución en `.quality-reports/branches/<branchKey>/108A-1/`.
- Tests: `scripts/quality/tests/task-check-entrypoint.test.mjs` (proceso + negativo),
  `scripts/quality/tests/runner.test.mjs` (propagación de tokens de sanción).
- `quality:test` completo: 231 tests, 230 PASS, 1 skip (2026-08-10).
