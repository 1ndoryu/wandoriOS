> **CANCELADO (2026-08-12, decisión del usuario):** plan de Sentinel/quality gate. Se archiva sin ejecutar; no es trabajo pendiente.

# Plan — Preflight reproducible y recuperación segura de Sentinel

> **Fecha:** 2026-08-07
> **Estado:** SNT-16f publicado como release coordinado **0.6.0** (commit `44dc8fa` en `origin/main` y tag `v0.6.0`); el consumidor fija gitlink/config/lock a ese commit y el doctor pasa `ready: true` con cero issues. Pendiente solo la matriz multi-proyecto con clon limpio.

## Problema

Un gate puede fallar tarde si un submódulo no está inicializado, su CLI no está compilado, el checkout fue modificado por una instalación interrumpida o `quality-tools.json` y `sentinel.lock.json` apuntan a commits distintos. Una interrupción también puede dejar claims/worktrees activos aunque el proceso original ya no exista.

## Objetivo

Bloquear antes de ejecutar cuando el entorno no es reproducible y ofrecer recuperación explícita, segura y auditable de tareas expiradas. Sentinel debe diagnosticar; nunca reparar silenciosamente ni borrar un worktree vivo o sucio.

## Resultado por fase

### SNT-16d — Doctor/preflight fail-closed — implementado en upstream

- [x] `sentinel doctor` expone `ready`, problemas codificados y estado de cada herramienta.
- [x] Detecta sourcePath/sourcePathEnv ausente, CLI compilado ausente, respuesta `--version`, checkout Git inválido/sucio, gitlink divergente y commits/versiones inconsistentes con el lock.
- [x] `assertWorkspaceReady` está conectado al gate real; los dry-runs conservan el cálculo de alcance sin ejecutar etapas.
- [x] El diagnóstico mantiene compatibilidad con el campo legado `tools.<name>.commit` y ofrece salida legible/JSON desde el CLI existente.
- [x] Fixtures cubren política/lock, ausencia de instalación, CLI ausente y mismatch; compilación TypeScript PASS.

### SNT-16e — Recuperación de tareas interrumpidas — implementado en upstream

- [x] `task recover <id>` y `--dry-run` tienen contrato CLI explícito, sin reutilizar `--force`.
- [x] La recuperación exige toma expirada, PID muerto, task-id/agent seguros, namespace interno, heads de rama/worktree consistentes y worktree limpio.
- [x] `recover --dry-run` solo inspecciona; la recuperación real valida antes de delegar el cleanup existente.
- [x] Nunca borra recursos ajenos, worktrees vivos, ramas divergentes ni cambios no commiteados.
- [x] La recuperación real escribe auditoría JSON con agente, tarea, estado anterior, timestamp, staleForMs y resultado bajo `.sentinel/recovery/`.
- [x] Ampliar `task status` con estado derivado `expired/processAlive/worktreeClean` para observabilidad directa.
- [x] Revalidar snapshots de metadata (`updatedAtMs`, PID y HEAD) antes de cleanup para evitar una carrera entre diagnóstico y recuperación.

### SNT-16f — Preflight estricto, release y provisionamiento — implementado localmente

- [x] `doctor --json` inspecciona submódulo/gitlink, CLI y `--version`, `package.json`, `package-lock.json`, dependencias declaradas, scripts requeridos y capacidades CLI.
- [x] La capacidad ausente se reporta como `tool-capability-missing` antes del gate; no se copia `quality-command-guard.mjs` al submódulo.
- [x] Se rechazan checkout/package-lock dirty, symlink/junction que escapa del workspace y gitlink ausente para un `sourcePath` interno.
- [x] Se valida que el commit esté publicado/alcanzable por `origin/main` o un tag `v*`; el commit local `ff0649c` permanece bloqueado como release no publicada.
- [x] **Publicado:** `8583b41` → `44dc8fa` (bump 0.6.0) integrado en `origin/main` y tag `v0.6.0`; el doctor ya no emite `tool-release-unpublished` y reporta `ready: true`.
- [x] `task status` expone `expired`, `processAlive` y `worktreeClean`; recover conserva auditoría y valida snapshots antes de cleanup.
- [x] El setup interno ejecuta compile + suite en staging temporal, materializa únicamente artefactos generados/ignorados y verifica que el estado versionado del submódulo no cambió; la evidencia queda ligada al commit y al script de suite. La validación desde clon limpio y la publicación upstream siguen siendo bloqueadores de adopción estable.

## Evidencia

- Commits upstream publicados: `e1493c3` (gate/recovery), `ff0649c` (doctor reforzado), `8583b41` (hardening SNT-16f) y `44dc8fa` (release 0.6.0) en `origin/main`; tag `v0.6.0` creado y verificado por `git ls-remote`.
- `tsc` sin errores; suites focalizadas doctor/recovery/CLI: PASS (**502 passing, 1 pending** en el submódulo 0.6.0).
- Generador de lock: `--write` y después `--check --json`: PASS; configured/checkout/lock usan `44dc8fa00c9ac498e64cad0d6a4edd16afa752d8` y gitlink coherente.
- Limitación real: el wrapper `npm run compile` intenta cargar un `quality-command-guard.mjs` que no existe en el checkout upstream. La compilación directa y la suite sí fueron ejecutadas; no se declara PASS del wrapper ausente.
- `quality:setup` final (0.6.0): compile + suite en staging aislado PASS para **sentinel (502 passing, 1 pending)** y **varsense (60 passing)**; la evidencia `.sentinel/release-evidence/{sentinel,varsense}.json` queda ligada al commit `44dc8fa` y es validada por el doctor (`releaseEvidencePresent: true`, `cleanStaging: true`).
- Doctor final: **`ready: true`, issues `[]`** con `releaseReachable: true` para ambas herramientas, capacidades completas, checkouts limpios y evidencia válida. `quality:lock --check`: **PASS**. `quality:test` del consumidor: **228 passing, 0 fail, 1 skipped** (incluye la integración real `varsense-parity.mjs` sobre tarea).
- Gate `task:check -- 028A-18 --base 05c2476e`: **PASS** (sentinel + docs). El intento full quedó diferido por cooldown (SNT-11); sus errores fueron de entorno ajeno al cambio: wrapper `~/bin/npm` del frontend buscando un guard inexistente, varsense excediendo el timeout en full y una ejecución pesada ajena (PID 61424, ya inexistente).
- Commits del consumidor: `4782c37c`/`136cb31c` (pin + evidencia pre-release), `3c308932` (pin 0.6.0 publicado) y `685d0193` (lock alineado). Push del consumidor pendiente de confirmación.

## Bloqueadores de adopción estable

- ~~Publicar el commit upstream en una rama/tag de release permitido; una rama de trabajo no es release.~~ → **Completado:** `44dc8fa` publicado en `origin/main` + tag `v0.6.0`.
- ~~Validar desde clon limpio con dependencias provisionadas, `--version`, lock y suite.~~ → **Completado:** `quality:setup` end-to-end con staging desde `git archive HEAD` (árbol commiteado), compile + suite PASS y evidencia ligada al commit.
- Ejecutar dos proyectos consumidores independientes con envelope y legacy y comparar decisión, hallazgos, severidad y mensaje.

## Criterios de salida

- Doctor falla cerrado antes de iniciar un gate no reproducible.
- Fixtures positivas/negativas y suite upstream pasan.
- Consumidor conserva rollback a Sentinel 0.5.0 hasta release publicada y lock regenerado.
- No se eliminan `scripts/quality` ni scripts de dominio antes de dos releases con paridad.
