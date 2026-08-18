# Plan — Migración de scripts a Sentinel Core y adapters por proyecto

> **Fecha:** 2026-08-06
> **Estado histórico:** SNT-16c/SNT-16d/SNT-16f se cerraron inicialmente en 0.6.0 (`44dc8fa`). Este plan
> quedó absorbido por la auditoría 108A-1/108A-6 y no es la fuente operativa actual.
> **Cierre vigente (2026-08-11):** releases coordinadas **0.7.1** (`b22c848`) y **2.2.1** (`88f281f`)
> publicadas con tags y adoptadas por wandorius y glory-rs-rest; lock/doctor/setup/suites están verificados,
> y el stage `custom` fue retirado. El rollback 0.7.1 ↔ 0.7.0 está probado. Solo queda la retirada física
> de capas legacy después de dos CI consecutivos, matriz multi-shell y gates verdes; las secciones inferiores
> conservan evidencia histórica de la transición 0.6.0 y no deben usarse para bootstrap nuevo.
> **Ámbito:** calidad, coordinación de tareas y wrappers de desarrollo; migración reversible y por evidencia
> **Relación:** complementa `Agente/planes/plan-global-quality-guard-agnostico-2026-08-02.md`, `Agente/planes/plan-sentinel-orquestacion-tareas-worktrees-2026-08-06.md` y `Agente/planes/plan-preflight-recuperacion-sentinel-2026-08-07.md`
> **Fuente canónica de esta iniciativa:** este documento

## 1. Decisión ejecutiva

Sentinel Core/CLI es el único dueño del plano universal. Cada proyecto aporta un manifiesto declarativo y un adapter pequeño para su stack. Los scripts específicos permanecen únicamente cuando encapsulan una operación de dominio real que no puede generalizarse sin inventar una abstracción. Los aliases se mantienen durante una ventana de migración medible y luego se retiran por evidencia, no por limpieza estética.

No se copia `scripts/quality` a otros repositorios ni se elimina mientras no existan paridad, rollback y dos releases. La personalización objetivo es configuración declarativa + pocos adapters versionados, con uno o dos comandos públicos para agentes.

## 2. Situación verificable

### SNT-16f incorporado localmente

El doctor de Sentinel ahora expone capacidades ausentes antes del gate, valida checkout/package-lock dirty, symlink escapes, dependencias/scripts, gitlink, refs de release y coherencia config/lock/checkout. `task status` deriva expiración/PID/limpieza y recover conserva snapshots antes de cleanup. `quality:setup` construye un CLI faltante en staging temporal; no ejecuta `npm ci` dentro del submódulo versionado. Estas mejoras están publicadas en la release **0.6.0**.


- La release pública del consumidor primario es Sentinel **0.6.0** (`44dc8fa00c9ac498e64cad0d6a4edd16afa752d8` en `origin/main` + tag `v0.6.0`); `20c13a2`/`0.5.0` queda como rollback disponible.
- SNT-16c está disponible en la rama remota de trabajo `028A-6/stage-manifest-contract`; SNT-16d/16f están integrados en `origin/main` y etiquetados como release 0.6.0.
- La compilación TypeScript directa y la suite upstream pasan en el checkout local del submódulo: **502 passing, 1 pending**. El wrapper `npm run compile` está condicionado por el guard auxiliar externo ausente en ese checkout; no se declara PASS del wrapper.
- SNT-16d/16f añaden diagnóstico read-only completo conectado al gate real; `task recover --dry-run/real` valida expiración, PID, namespace, heads, snapshots y worktree limpio.
- El checkout integrado fija `quality-tools.json`, `sentinel.lock.json` y el gitlink a `44dc8fa`; lock-check PASS y doctor `ready: true` con cero issues.
- La skill global no se reemplaza antes de publicación y sesión nueva; no se eliminan scripts públicos.

## 3. Modelo objetivo

| Capa | Vive en | Dueño | Contiene | No contiene |
|---|---|---|---|---|
| Sentinel Core | upstream | tooling | lifecycle, scheduler, scope, cache, leases, report schema, redaction, runtime/shims, GC | rutas, dominio, reglas visuales |
| Project adapter | raíz del consumidor | proyecto | manifest de comandos/stages, checks de stack, VarSense y custom | scheduler, cooldown, claims, worktrees, reporte final |
| Scripts específicos | `scripts/` | producto/operaciones | DB/Cargo, codegen, rescates autorizados, fixtures | coordinación universal |

## 4. Fases ejecutables

### Fase 0 — Baseline, ownership y seguridad (`SNT-12`) — cerrada
Inventario versionado, baseline de Sentinel/VarSense y separación de cambios ajenos. No se movieron ni eliminaron scripts.

### Fase 1 — Contrato mínimo de adapter (`SNT-13`) — transición local cerrada
`quality-adapter.json` define contrato estricto, transporte argv, stages, profiles, timeouts, allowlist, output schema y exit-code mapping.

### Fase 2 — Core/adapter slice (`SNT-14`) — cerrada en transición local
El manifest local gobierna stages; `task-check` sigue como orquestador transitorio y el camino legacy está probado como compatibilidad.

### Fase 2b — Endurecimiento (`SNT-15`) — cerrada localmente
Schema estricto, selección/paridad desde disco, contención física y rechazo de allowlists sensibles. Evidencia: 19/19 focalizadas, `node --check` y `git diff --check` PASS.

### Fase 3a — Contrato upstream de stages (`SNT-16`) — implementación preparada, adopción bloqueada
- [x] Diseño documentado: envelope versionado `schemaVersion: 1`, legacy temporal, argv estructurado, report schema y contención física.
- [x] Implementación upstream en commit recuperable `88e8ac7` y rama remota `028A-6/stage-manifest-contract`.
- [x] Compilación TypeScript y suite Sentinel disponible: `497 passing, 1 pending` en el worktree de tarea.
- [x] Fixtures upstream unitarias e integración real del CLI.
- [x] Integrar en `origin/main` y crear release/tag (**0.6.0** / `v0.6.0`).
- [x] Actualizar `quality-tools.json` y `sentinel.lock.json` tras release, hash y CLI provisionado.
- [ ] Matriz multi-proyecto con clon limpio (dos consumidores independientes).

**Rollback:** conservar Sentinel 0.5.0 (`20c13a2`), `task-check` y el adapter local; no retirar duplicaciones.

### Fase 3b — Fixtures multi-proyecto y paridad (`SNT-16b`) — slice local de pruebas preparado
- [x] Añadir dos reportes agnósticos independientes (Node y Rust) con el mismo hallazgo normalizado.
- [x] Comparar decisión, `ruleId`, severidad, archivo, línea y mensaje; distinguir cambios de severidad/mensaje.
- [ ] Ejecutar el mismo envelope y legacy mediante un Sentinel upstream publicado en dos proyectos independientes.
- [ ] Verificar CLI/core/LSP/editor y matriz multi-shell/CI.
- [x] Fijar commit, capabilities y hash en `quality-tools.json`/`sentinel.lock.json` tras la release 0.6.0.

**Evidencia SNT-16b:** fixture local dirigida **2/2 PASS**. El upstream añade ejecución real envelope/legacy en sus fixtures, pero aún faltan dos proyectos consumidores independientes y paridad CLI/LSP/editor/multi-shell en CI.

### Fase 3c — Preflight y recuperación (`SNT-16d`) — implementación upstream verificada
- [x] Diagnóstico read-only `sentinel doctor` expone `ready`, códigos accionables y comprobación de sourcePath/sourcePathEnv, gitlink, checkout dirty, CLI/`--version`, commits/versiones del lock.
- [x] Conectar `assertWorkspaceReady` al gate real sin romper dry-run/no-policy.
- [x] Añadir recuperación explícita de tareas expiradas: `status` diagnostica; `recover` valida PID muerto, estado stale, heads, worktree limpio y namespace antes de cleanup.
- [x] Añadir fixtures de instalación incompleta, lock divergente, CLI ausente, proceso vivo y reinicio del agente; focalizados PASS.
- [x] Ampliar `task status` con estado derivado; validar clon limpio y release upstream (0.6.0 publicada).

**Gate SNT-16d:** doctor bloquea con evidencia antes de ejecutar; ningún cleanup automático toca un proceso vivo, worktree sucio, rama divergente o path ajeno.

### Fase 4 — Reducción y retirada controlada (`SNT-17`)
- [x] Release 0.6.0 publicada (compile + suite en staging limpio).
- [ ] Dos releases consecutivos multi-shell/CI.
- [ ] GC/runbook y rollback reproducible.
- [ ] Retirar físicamente solo archivos sin referencias y con rollback documentado.
- [ ] Actualizar la skill global al final, después de release, locks, gate, matriz multi-proyecto y una sesión nueva.

## 5. Política de permanencia para scripts

Conservar scripts de dominio/proveedor, adapters externos estables, experiencia humana/IDE, bootstrap reproducible o un segundo consumidor real. Migrar solo capacidades universales con más de un caso o claramente agnósticas. No migrar ni copiar scripts históricos o de producción ajena.

## 6. Seguridad y no-sorpresas

No shell concatenado en manifests; paths contenidos y sin symlink/junction escapes; errores de herramienta fail-closed; no borrar `scripts/quality`; no desplegar ni ejecutar rescates/producción.

## 7. Definition of Done global

- [ ] owner real del inventario;
- [x] schema y fixtures publicados en Sentinel rama de trabajo; release estable pendiente;
- [ ] dos proyectos usan el mismo core sin copiar `scripts/quality`;
- [ ] VarSense solo analyzer;
- [ ] adapter wandorius delgado;
- [ ] cinco gates con paridad exacta y errores fail-closed;
- [ ] dos releases consecutivos multi-shell/CI;
- [ ] rollback y cleanup/GC probados;
- [x] documentación local refleja SNT-12–SNT-16d sin falsear adopción;
- [ ] skill global actualizada solo al final, después de release, locks, gate y sesión nueva;
- [ ] cero secretos/procesos/locks/worktrees/ramas propias pendientes.

## 8. Cierre de la skill global

La skill global ya fue actualizada tras la publicación y fijación de 0.7.1. `quality-gate-setup` v1.2.0
prohíbe copiar `scripts/quality`, exige inventario/clasificación de legacy, aplica una regla-un dueño,
impide borrar ownership desconocido y documenta rollback, fixtures, presupuesto y sunset para adapters
project-owned. Las casillas históricas de esta sección quedan superadas por la actualización verificable de
la skill; la retirada física del código legacy sigue el runbook de dos releases.
