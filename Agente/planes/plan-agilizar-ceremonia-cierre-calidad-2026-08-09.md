# Plan — Agilizar la ceremonia de cierre de calidad

> **Fecha:** 2026-08-09
> **Rama objetivo:** `wandorius`
> **Estado:** Aprobado por el usuario (OK del 09-08-2026) y registrado como bloque
> **098A-1** en `roadmap.md`. Tras la pasada del supervisor thinker (veredicto
> "VIABLE CON RESERVAS"; 3 P1, 3 P2, 4 P3) se aplicaron las correcciones P1 y el
> reordenamiento de fases. Implementación en curso por fases F0→F6 con gate por fase.

## Problema

El cierre de una tarea tarda demasiado incluso para cambios triviales. En la sesión del 08-08/09-08
(fix documental de 2 líneas en `AGENTS.md` + limpieza de residuos) el cierre tomó varios minutos y
decenas de pasos. Costos observados, en orden de impacto:

1. **Preflight y mantenimiento incondicionales:** aun cuando la única etapa real del bloque es
   `sentinel + docs`, cada gate ejecuta la verificación completa de analizadores
   (`verifyInstalledAnalyzers` en `lockfile.mjs`: `git status`, `git diff`, `git rev-parse`,
   `node --version` y `git archive --format=tar HEAD` por herramienta; 10-16 subprocesos y un
   hash de árbol completo por herramienta), `assertTaskExists` (walk recursivo de docs) y
   mantenimiento best-effort (target-maintenance antes y después con WMI, retención de reportes e
   índices). Esto domina el presupuesto de un bloque documental.
2. **Evidencia no visible desde el worktree:** el doctor de Sentinel valida
   `.sentinel/release-evidence/<name>.json` relativo al workspace; el gate corre con
   `--project-root <worktree>` y los worktrees se crean bajo `.sentinel/worktrees/<task>`.
   `setup.mjs` escribe la evidencia en la raíz del consumidor, por lo que un worktree nuevo no la
   ve: `tool-release-evidence-missing` (bloqueante hoy).
3. **Ceremonia pesada por tarea:** claim/worktree/start → gate → integrate → cleanup → release
   (Sentinel) + `task:take`/`task:release` + self-check + agente inspector + agente reviewer que
   re-leen el repositorio y esperan en cola.
4. **`quality:setup` recompila** Sentinel/VarSense cuando la evidencia no está fresca (minutos) y
   no hay política de "evidencia fresca → skip".
5. **Escalaciones del sandbox:** cada escritura a `.git`/submódulos pide aprobación y re-ejecuta,
   multiplicando la latencia por 5-10 en flujos Git.
6. **Búsquedas sobre árboles enormes:** escaneos recursivos sobre OneDrive + submódulos + backups
   (timeouts de 60 s) donde una búsqueda dirigida con `rg` tarda ~1 s (incluido `assertTaskExists`).

**Aclaraciones verificadas contra el código (corrige el primer borrador):**

- Un cambio docs-only YA corre únicamente `sentinel + docs` hoy: `detectScope` (`scope.mjs`) +
  `adapterStageNames` (`adapter-manifest.mjs`, perfil `docs:["docs"]` en `quality-adapter.json`)
  hacen la selección; no corren varsense/rust/frontend/custom. El plan no cambia esa selección
  (F2); ataca lo que sí corre de más: preflight + mantenimientos + ceremonia.
- La caché de etapas YA existe (`scripts/quality/cache.mjs`, fingerprint por
  archivos+config+herramienta+modo+runtime) pero cuelga de
  `.quality-reports/branches/<branchKey>/cache` (gitignored, local al worktree): entre tareas
  consecutivas arranca fría. El reuso entre tareas requiere una raíz común (F3).
- El doctor valida evidencia ligada al commit, pero **no la ve desde el worktree** (bloqueante;
  F1 lo resuelve antes que nada).

## Objetivo

Reducir el overhead de cierre por tipo de tarea, sin debilitar la evidencia ni el lock:

| Tipo de bloque | SLO de cierre (claim → release) | Qué corre |
| --- | --- | --- |
| Documental (solo `.md`/`Agente/`/docs) | **< 2 min** | preflight light (`verifyLight`) → sentinel → docs; sin mantenimiento bloqueante ni agentes de cierre |
| Código local-light | **< 10 min** | gate normal (verificación completa) + 1 sola pasada de revisión |
| Pesado/full/CI | < 30 min (cooldown aparte) | gate completo + 1 pasada de revisión; nunca emite `mode:'docs-fast'` |

## Resultado por fase (orden de implementación)

### F0 — Medición y trazabilidad base (sin cambiar el flujo del gate)

- [ ] Instrumentar `metrics.json` del reporte con `phaseDurationMs`: `preflightMs`,
      `maintenanceBeforeMs`, `maintenanceAfterMs`, `stageMs` y `reportWriteMs` (hoy no distingue
      esas fases; no son etapas).
- [ ] `task:check` real sobre un cambio documental (caché fría y tibia dentro de la misma tarea):
      registrar `preflightMs`, `maintenanceMs` y `durationMs` por etapa.
- [ ] `task:check` real sobre un cambio de código local-light con las mismas métricas.
- [ ] Verificar si `setup` re-ejecuta o reutiliza con evidencia fresca y si el worktree ve la
      evidencia: si aparece `tool-release-evidence-missing`, declararlo como parte de la línea
      base (no es regresión; F1 lo resuelve).
- [ ] Dos tareas consecutivas con el mismo cambio de archivo: documentar que la segunda arranca
      **fría** con la caché actual (no atribuir reuso).
- [ ] Guardar la línea base en `Agente/prevencion/bench-ceremonia-2026-08-09.md`.

### F1 — Evidencia y raíz común (PRIORIDAD: sin esto el gate no arranca en worktrees nuevos)

- [ ] `resolveReleaseEvidenceRoot(projectRoot)`: raíz git común (`git rev-parse --git-common-dir`)
      o clave configurable `releaseEvidenceRoot` (alistada en la allowlist de
      `validateQualityConfig` en `preflight.mjs`).
- [ ] Vía primaria: poblar `.sentinel/release-evidence/` del worktree al crearlo desde la raíz
      común (copia o symlink con validación de symlinks del adapter-manifest). Vía secundaria:
      `setup.mjs` escribe en la raíz común solo si el worktree no se puede hidratar; no se
      modifica `diagnose.ts` de Sentinel upstream.
- [ ] Criterio observable: `sentinel task gate --project-root <worktree>` de un worktree recién
      creado pasa el doctor **sin** `tool-release-evidence-missing`.
- [ ] Tests: raíz compartida, raíz por config, fallback a git-common, worktree nuevo.

### F2 — Fast path documental (runner; módulo puro y sin tocar perfiles)

- [ ] Nuevo módulo puro `fast-path.mjs`: `decideFastPath({scope, args, config}) → {fastPath,
      reason}`; `task-check.mjs` solo lo consume (SRP). No crea un segundo sistema de perfiles.
- [ ] Se habilita SOLO si: el conjunto de perfiles efectivos es subconjunto de `docs`
      (`[".md", "Agente/", "roadmap.md"]` — `AGENTS.md` ya lo cubre `.md`), no hay archivos que
      matcheen otro perfil (ej.: `.md` bajo `frontend/` NO es fast), `files.length > 0` (cero
      archivos → `automaticFull`, no fast) y no hay `--full`/`--ci`/`--scope-manifest` divergente.
- [ ] Secuencia del fast path: `preflight (verifyLight) → sentinel → docs`. **Nunca `custom`**;
      no cambia `quality-adapter.json` ni el perfil `docs` (contrato) ni la selección de etapas
      del adapter.
- [ ] `IToolVerifier { verifyLight, verifyFull }`: `verifyLight` = gitlink == commit del lock ==
      `quality-tools.json` + `--version` (2 subprocesos por herramienta; sin `git archive` ni
      `git diff`).
      Se mantienen `readLock` + `assertRuntimeLockHash`; `verifyFull` intacto para código/CI.
- [ ] Mantenimiento en fast path: se salta retención de reportes e índices; target-maintenance
      conserva SOLO la comprobación barata de cuota de `C:\tmp\glory-target` o marca
      `quotaCheckAt` con vigencia máxima 24 h para que la siguiente tarea código/full (o una
      docs-fast con la marca vencida) la ejecute (política explícita en `Agente/prevencion/`).
      El primer pase de target-maintenance se mueve DESPUÉS de `detectScope` (hoy es preventivo
      pre-Cargo; con docs no hay Cargo).
- [ ] Reporte: `mode:'docs-fast'` + `fastPath:true` + `reason` en reporte y `metrics.json`;
      `--ci`/`--full` nunca emiten `docs-fast`.
- [ ] Tests: docs puro → fast con etapas `["sentinel","docs"]`; `.md` en `frontend/` → completo;
      `--full`/`--ci` → completo; `files=[]` → completo; clave nueva no alistada → SETUP ERROR;
      perfil desconocido → SETUP ERROR.

### F3 — Reuso de setup y caché entre tareas

- [ ] `cacheRoot` configurable (clave `cacheRoot` en la allowlist, junto con
      `releaseEvidenceRoot` y `releaseEvidenceTtlHours`) apuntando a la raíz git común
      (ej.: `.sentinel/cache/<branchKey>/`) con lock de escritura por rama/tarea; si no se
      configura, se mantiene `.quality-reports/branches` y F6 documenta que entre tareas es fría.
- [ ] En `setup.mjs`: si `.sentinel/release-evidence/<tool>.json` (raíz común) existe para el
      commit fijado en `quality-tools.json`, `pass: true`, staging limpio y edad < TTL
      configurable (`releaseEvidenceTtlHours`, default 24 h), saltar compile+suite y reportar
      `reuse:true` en evidencia/doctor. `--fresh` fuerza recompilación; cualquier cambio de
      pin/commit invalida.
- [ ] Doctor: mantiene `releaseEvidencePresent` y suma `releaseEvidenceReused`.
- [ ] Tests: hit, expirado, pin cambiado, `--fresh`, dos gates simultáneos sobre la misma rama sin
      corrupción (lock de caché).

### F4 — Cierre consolidado y una sola revisión

- [ ] `task:close <ID>`: usa `--root` explícito (raíz del repo) para `take`/`release`/`status` y
      llama a `sentinel task gate --project-root <worktree>`; si PASS → integrate/cleanup/release;
      si FAIL → NO libera claims (queda para recuperación). Emite resumen compacto (etapas, modo,
      cache hits, preflightMs, duración).
- [ ] Coordina los dos registros con una sola raíz: `.quality-reports/task-takeover` (agente) y
      `.sentinel/coordination` (sentinel).
- [ ] Política de agentes de cierre en `AGENTS.md`: docs-fast → sin `supervisor_reviewer` ni
      `sentinel_inspector` (reporte + checklist compacto bastan); código/pesado → una pasada de
      reviewer con paquete de evidencia (rutas de reportes + diffstat).
- [ ] Checklist compacto en `AGENTS.md` (§ gate) con máx. 5 verificaciones para docs-fast.

### F5 — Eficiencia operativa (agente/sandbox)

- [ ] Batchear operaciones Git: un único `git status` por turno, comandos combinados, evitar
      preflight/doctor repetidos en la misma tarea.
- [ ] Búsquedas con `rg` dirigido y exclusiones (`target/`, `node_modules/`, `.git/`, `.sentinel/`,
      backups); usar el índice existente (`index-maintenance.mjs`) cuando aplique.
- [ ] Pre-aprobar prefijos seguros (`git status/diff/log`, `npm run task:*`, `npm run quality:*`)
      para reducir escalaciones manuales en flujos Git.

### F6 — Verificación final y adopción

- [ ] `quality:test` PASS (228 passing en la última línea base) + suite de fixtures nuevas.
- [ ] `quality:lock -- --check` y `quality:doctor` PASS.
- [ ] Bench comparado contra F0: preflight light ≤ 8-10 s; `task:check` docs-fast total ≤ 20-30 s
      (margen < 2 min claim→release); código local-light < 10 min. Medir incluyendo escalaciones
      del sandbox o declarar el umbral excluyéndolas.
- [ ] Probar 3 tareas reales (1 docs, 1 código, 1 full con cooldown) midiendo claim→release.
- [ ] Declarar modelo de carga nominal para el bench (p. ej., tareas por sesión y agentes
      concurrentes esperados) para que los SLO no dependan de una carga no declarada.
- [ ] Auto-gate de los cambios del propio plan: a cambios en `scripts/quality/` o
      `quality.config.json` se les corre gate full (o `--allow-heavy` con razón), NUNCA
      `docs-fast` (`fullPatterns` lo exige).
- [ ] Actualizar `roadmap.md` y `Agente/prevencion/` con la política fast path y la cuota de
      targets.

## Evidencia de contexto (ya verificado, no se re-hace)

- Gate fijado en Sentinel 0.6.0 (`44dc8fa`), doctor `ready: true`, `quality:test` 228 PASS.
- Caché de etapas existente pero local: `cache.mjs` con fingerprint y `cache:'hit'`; `cacheRoot`
  bajo `.quality-reports/branches/<branchKey>/cache` (gitignored) → fría entre worktrees.
- Evidencia de setup existente en la raíz del consumidor: `.sentinel/release-evidence/
  {sentinel,varsense}.json` (sentinel 44dc8fa…, varsense e836092…), válida según `diagnose.ts`
  pero NO visible desde worktrees (bloqueante).
- `quality.config.json` ya define perfiles (`docs`, `rust`, `frontend`…), timeouts por etapa
  (docs 1000 ms) y cooldown de pesadas 180 min; `validateQualityConfig` en `preflight.mjs` tiene
  allowlist estricta (toda clave nueva debe alistarse o el gate muere con SETUP ERROR).

## Límites y riesgos

- No modificar releases upstream de Sentinel/VarSense ni la skill global; todo vive en el
  consumidor (`scripts/quality/`, `quality.config.json`, `AGENTS.md`).
- El fast path nunca afirma cobertura de código: `mode` + `fastPath:true` + `reason` quedan
  auditables en el reporte.
- `verifyLight` conserva la identidad del lock (gitlink == lock == quality-tools + `--version`);
  `verifyFull` y la validación del lock siguen para código/CI. No se salta evidencia de lock.
- `--full`, `--ci`, cooldown y guard directo se mantienen intactos; el fast path no los evita ni
  emite `docs-fast` en CI.
- Cambios a `scripts/quality/` y `quality.config.json` se cierran con gate full (self-gate por
  `fullPatterns`), nunca con fast path.
- Cuota de targets de Cargo (`C:\tmp\glory-target`, 7 GB/7 días) se sigue comprobando: docs-fast
  solo salta retención/índices o deja `quotaCheckAt` para la siguiente tarea código/full.
- Caché compartida entre worktrees exige lock de escritura por rama (no probado aún): si no se
  puede garantizar, se mantiene caché local y F6 documenta "cold" sin atribuir reuso.
- No se toca `quality-adapter.json`: añadir `custom` a docs degradaría cobertura y, si se
  sincroniza solo en el runner, rompería la paridad de etapas (SETUP ERROR).
- Cada cambio a `scripts/quality/` se entrega con su propio gate (`task:check`) y rollback por
  commit; no se eliminan scripts existentes.

## Gate y Definition of Done

- Cierre normal: `npm run task:check -- <ID>` (el fast path es una modalidad del mismo comando).
- DoD observable:
  1. `task:check` docs-only con caché fría produce `mode:"docs-fast"` con etapas
     `["sentinel","docs"]`, nunca `custom`.
  2. `metrics.json` contiene `preflightMs`, `maintenanceMs` y `stageMs`.
  3. `sentinel task gate --project-root <worktree>` de un worktree recién creado pasa el doctor sin
     `tool-release-evidence-missing`.
  4. Dos tareas consecutivas con el mismo pin: la segunda reporta evidencia/compilación
     reutilizada (si raíz común) o queda registrada como fría.
  5. Un cambio en `quality.config.json`/`scripts/quality/` NO corre `docs-fast` y queda auditado
     con `mode` y `reason`.
  6. `quality:test` PASS con fixtures positivos y negativos; `quality:lock -- --check` y
     `quality:doctor` PASS.
  7. SLO docs < 2 min y código < 10 min medidos (declarando si se excluyen las escalaciones del
     sandbox).
