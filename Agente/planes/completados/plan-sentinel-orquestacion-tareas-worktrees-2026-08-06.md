> **CANCELADO (2026-08-12, decisión del usuario):** plan de Sentinel/quality gate. Se archiva sin ejecutar; no es trabajo pendiente.

# Plan — Orquestación universal de tareas con Sentinel, ramas y worktrees

> **Fecha:** 2026-08-06
> **Tarea:** 028A-18
> **Estado:** implementación parcial cerrada en Sentinel; integración del consumidor y GC pendientes
> **Ámbito:** Glory Sentinel universal; no depende de wandori.us ni de su stack

## 1. Objetivo y decisión

Sentinel debe coordinar trabajo paralelo por tarea sin compartir un checkout mutable: una tarea obtiene
ownership atómico, un `git worktree` y una rama exclusiva, pasa el gate dentro de ese árbol, se integra
solo con `--ff-only` a la rama principal declarada por el proyecto y se limpia de forma verificable.
Cada proyecto declara su rama principal; no se asume que se llame `main`. En este consumidor es
`wandorius`; `main` es únicamente la rama del template vacío.

La unidad recomendada es **una tarea por agente activo**. Se pueden tomar varias tareas independientes,
pero cada una conserva su claim, worktree, rama, gate, reporte y cleanup. No se reutiliza una rama o
worktree para varias tareas. Las tareas acopladas o que tocan tooling/submódulos/contratos compartidos
son seriales y deben declararse como tales por el consumidor.

## 2. Invariantes

- Dos claims simultáneos del mismo ID dejan un único ganador.
- Cada tarea tiene como máximo un worktree y una rama `task/<project-identity>/<task-id>`; nunca se reutilizan recursos. La identidad deriva del Git common dir y `project.primaryBranch`, por lo que dos proyectos/ramas del mismo repositorio pueden usar el mismo ID sin colisionar.
- Los worktrees temporales se crean obligatoriamente dentro de `<repo>/.sentinel/worktrees/` y la metadata
  dentro de `<repo>/.sentinel/coordination/`. Sentinel rechaza paths externos, symlinks/junctions que
  escapen de la raíz y cualquier ruta fuera del repositorio consumidor; `.sentinel/` está ignorado y se
  elimina con cleanup, nunca se commitea.
- Los IDs de tarea/agente son allowlisted, acotados y no permiten traversal ni shell injection.
- El estado efímero se guarda en `<repo>/.sentinel/coordination/` y los worktrees temporales en
  `<repo>/.sentinel/worktrees/`; ambos quedan dentro del repositorio, están ignorados por Git y no se
  commitean.
- `heartbeat` renueva ownership; una toma expirada requiere takeover explícito y no puede robar recursos
  aún registrados.
- `start` exige checkout de origen limpio, rama/base válidas y path sin ocupar; no hace reset ni force.
- `task gate` solo puede ejecutarse en el worktree registrado para esa tarea y delega a `sentinel check`.
- `integrate` exige agente propio, target limpio, worktree limpio, commit nuevo, base estable y
  `merge --ff-only`. Si hay divergencia o conflictos, el agente debe actualizar su rama desde el
  target, resolver y revisar los conflictos en su worktree, ejecutar el gate, commitear la resolución
  y reintentar; Sentinel no resuelve conflictos a ciegas.
- Toda tarea terminada debe integrarse en la rama principal declarada por el proyecto. No existe un
  target alternativo para cerrar una
  tarea; la rama se declara en `sentinel.config.json` como `project.primaryBranch`. Una excepción
  solo puede quedar como bloqueo documentado por una decisión explícita del
  usuario, nunca como tarea terminada. No hay commit implícito, push, deploy, rebase automático ni
  borrado ajeno. Una tarea no puede liberarse ni declararse cerrada con una rama pendiente: después
  de integrar se ejecuta cleanup y se verifica que no quedan worktree, rama ni metadata de la tarea.
- `cleanup` es idempotente después de integrar; la recuperación forzada solo aplica a tomas expiradas,
  proceso emisor muerto, worktree limpio y rama determinista.
- `status` nunca borra: diagnostica metadata inválida, worktrees/ramas huérfanos y locks expirados.

## 3. Ciclo operativo

```text
claim → start → heartbeat/gate → commit explícito → integrate --ff-only → cleanup → release
```

Ejemplo portable:

```bash
sentinel task claim GAME-01 --project-root . --agent agent-a
sentinel task start GAME-01 --project-root . --agent agent-a --primary-branch wandorius
sentinel task gate GAME-01 --project-root ./.sentinel/worktrees/repo-<project-identity>-GAME-01 --agent agent-a
sentinel task integrate GAME-01 --project-root . --agent agent-a --target wandorius
sentinel task cleanup GAME-01 --project-root . --agent agent-a
sentinel task release GAME-01 --project-root . --agent agent-a
```

Para varias tareas independientes, repetir el ciclo completo por ID; no abrir dos agentes sobre el
mismo ID. El registro de toma del proyecto y el coordinador de Sentinel son capas complementarias:
el primero evita carreras entre agentes antes de iniciar; Sentinel evita carreras de Git durante el
ciclo y en otros proyectos.

## 4. Contrato CLI

Sentinel implementa:

```text
sentinel task claim <id> --project-root <dir> --agent <id> [--force] [--json]
sentinel task start <id> --project-root <dir> --agent <id> [--primary-branch <branch>] [--path <dir>]
sentinel task heartbeat <id> --project-root <dir> --agent <id>
sentinel task status --project-root <dir> [--json]
sentinel task gate <id> --project-root <worktree> --agent <id> [--full|--ci]
sentinel task integrate <id> --project-root <dir> --agent <id> [--target <primary-branch>]
sentinel task cleanup <id> --project-root <dir> --agent <id> [--force]
sentinel task release <id> --project-root <dir> --agent <id>
```

La salida JSON es versionada por la metadata de tarea (`schemaVersion: 1`) y no contiene secretos,
tokens ni contenido de archivos. `task gate` conserva el exit code real del gate también en salida
humana. `status` devuelve `tasks`, `invalidMetadata`, `orphanWorktrees`, `orphanBranches` y
`expiredLocks`.

## 5. Implementación cerrada en Sentinel

- [x] Coordinador agnóstico en `tools/sentinel/src/core/taskCoordinator.ts`.
- [x] Claims serializados con directorios exclusivos; takeover de locks expirados mediante `rename`
  y liberación protegida con token de propietario.
- [x] TTL, heartbeat, takeover explícito, validación de agente e IDs y detección de colisiones Windows.
- [x] Worktree temporal determinista **interno al repositorio** en `.sentinel/worktrees/`, con identidad
  hash del Git common dir + rama primaria; rama exclusiva namespaced (`task/<project-identity>/<task-id>`);
  rechazo de paths externos/ocupados, ramas reutilizadas y checkout principal sucio.
- [x] Aislamiento multi-proyecto: mismo repositorio y mismo task-id en dos ramas primarias producen
  metadata, locks, ramas, worktrees y status independientes; integración serializada por identidad.
- [x] `task gate` propaga la rama primaria al verificar/renovar desde el worktree, sin depender de que
  el worktree cargue una configuración distinta.
- [x] Verificación de path real, rama y registro Git antes de ejecutar el gate.
- [x] Integración serializada por target con estado `INTEGRATING` reanudable tras crash; dirty checks,
  base/HEAD race detection y fast-forward únicamente.
- [x] Cleanup idempotente y recuperación forzada limitada por TTL, PID/host, árbol limpio y rama
  determinista.
- [x] CLI, ayuda, README y CHANGELOG de Sentinel actualizados.
- [x] Límite físico interno: `start` crea por defecto en `.sentinel/worktrees/`, rechaza paths externos
  y la coordinación queda en `.sentinel/coordination/`; `.sentinel/` queda ignorado por Git.
- [x] Cobertura dirigida: claims concurrentes, takeover, worktree, integración, target sucio,
  release cruzado, gate en path incorrecto, heartbeat y CLI; suite Sentinel: **484 PASS, 1 pending**.
- [x] Commit del submódulo coordinador implementado: `e53a8dc5b73c02894b852391e160bf1a4adf13b3` (incluye el coordinador y el límite físico interno). El release publicado del consumidor es `20c13a216e879303fcf5be7469a2821391b2ec0d` (`origin/main`, tag `v0.5.0`); `31fb52f` queda como antecedente.

## 6. Pendientes por fases

### Fase 1 — Integración del consumidor

- [x] Fijar el gitlink `tools/sentinel` al release coordinado publicado `20c13a216e879303fcf5be7469a2821391b2ec0d` (`origin/main`, `v0.5.0`), que incluye el coordinador y el límite físico interno `.sentinel/worktrees`; regenerar `sentinel.lock.json`/`quality-tools.json` sin rutas absolutas. `quality:lock --write` y `quality:lock --check` PASS; el checkout limpio reproduce esta capacidad mediante el gitlink.
- [ ] Ejecutar el quality gate completo del consumidor con el ID y el mismo `GLORY_AGENT_ID` del claim.
- [x] Mantener cambios preexistentes de otros agentes sin absorberlos: el submódulo `glory-rs` sucio
  actual no pertenece a esta tarea y permanece sin stage.

**Gate F1:** lock-check PASS y gitlink reproducible; el gate completo del consumidor y su commit final
siguen pendientes por la política de ownership/gate de la raíz. La capacidad ya no depende de cambios sin
publicar dentro del submódulo: el gitlink apunta a `20c13a216e879303fcf5be7469a2821391b2ec0d`, integrado
en `origin/main` y etiquetado `v0.5.0`; el checkout local está limpio y `git fsck --full` encuentra el
objeto. Un clon nuevo puede obtenerlo desde el remoto público sin depender de una rama release privada.

### Fase 2 — Garbage collection y recuperación

- [ ] Añadir `sentinel task gc --dry-run` y modo aplicado con auditoría; nunca borrar árboles activos.
  El status ya filtra ramas/worktrees por identidad de proyecto y no reporta como huérfanos los recursos
  activos de otros proyectos.
- [ ] Poda por TTL/cuota y detección de PID/host; incluir metadata sin worktree, ramas sin tarea y
  locks expirados, conservando todo lo que no pueda probarse seguro.
- [ ] Añadir runbook para crash antes/después de merge, target avanzado, conflicto, disco lleno y
  agente ausente.

**Gate F2:** simulación de crash y cleanup repetido dejan cero artefactos propios sin tocar recursos
ajenos.

### Fase 3 — Portabilidad y adopción

- [ ] Fixtures multi-proyecto Node/Rust/Python/no-policy y matriz Windows/macOS/Linux/CI.
- [ ] Definir política opcional de cuota/simultaneidad; por defecto no iniciar procesos destructivos
  ni imponer una cuota que rompa proyectos pequeños.
- [ ] Documentar adaptación mínima para consumidores: ID, agente, base/target, gate y raíz de worktrees.
- [x] Versionar/publicar Sentinel 0.5.0 en `origin/main` y en `v0.5.0`; migrar este consumidor al commit publicado mediante gitlink y lock reproducible.

**Gate F3:** CLI/core producen el mismo estado, JSON estable, documentación alineada y ningún
worktree/branch de test queda vivo.

## 7. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Dos agentes reclaman el mismo ID | claim exclusivo y ownership del proyecto |
| Dos procesos recuperan el mismo lock | takeover por `rename`, token de liberación y TTL renovado |
| Target avanza mientras se integra | lock por target, HEAD/base revalidados y `ff-only` |
| Crash tras `merge` | estado `INTEGRATING` y reanudación basada en HEAD target/branch |
| Metadata manipulada | schema estricto, rama determinista, path real y worktree Git registrado |
| Agente desaparece | TTL, status y takeover explícito; nunca robo silencioso |
| Basura acumulada | `.sentinel/` ignorado, cleanup idempotente ahora; GC auditable pendiente |
| Submódulo o checkout sucio | start/integrate bloquean y preservan cambios ajenos |
| Proyectos con mismo nombre | hash del Git common dir en el path por defecto |

## Definition of Done

- [x] Plan universal en MD y fuente enlazada desde el roadmap.
- [x] Sentinel ofrece claim/start/status/heartbeat/gate/integrate/cleanup/release.
- [x] Claims, worktrees, ramas, integración y cleanup tienen pruebas dirigidas.
- [x] Sentinel compila y pasa su suite completa: 484 PASS, 1 pending.
- [ ] GC/runbook/matriz multi-OS completos.
- [x] Gitlink y lock del consumidor fijados al commit publicado `20c13a216e879303fcf5be7469a2821391b2ec0d`; la integración final en la rama principal declarada (`wandorius`) y la limpieza de la rama quedan como requisito operativo de cierre, no como cierre válido en un target alternativo.
