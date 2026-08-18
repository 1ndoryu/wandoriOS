> **CANCELADO (2026-08-12, decisión del usuario):** plan de Sentinel/quality gate. Se archiva sin ejecutar; no es trabajo pendiente.

# Plan 028A-6 — Sentinel como plano global de calidad agnóstico

> **Fecha:** 2026-08-02
> **Estado:** migración incremental en ejecución; el contrato local v2 y `doctor --migrate --dry-run` están implementados. La instalación global quedó autorizada y ejecutada (2026-08-05), la matriz multi-proyecto/multi-shell está cerrada (Fase 4, 2026-08-05), los artifacts CI con branch-key+task+commit quedaron publicados (Fase 4 residual, 2026-08-05) y el guard actual quedó marcado como legacy con **rollback probado en vivo** (14/14, 2026-08-05). De la Fase 5 quedan cerrados: PATH legacy retirado, `sentinel uninstall` (desinstalación solo de entradas administradas), marcación legacy de los wrappers del repo y el criterio de rollback del gate; queda solo la retirada física de los wrappers duplicados del repo, que exige dos releases consecutivos con la matriz en verde.
>
> **ADR:** `Agente/documentacion/arquitectura/adr-sentinel-plano-global-028a6-2026-08-03.md`.
>
> **Regla de ejecución:** este plan es una iniciativa multi-release. No se ejecuta como un único cambio: cada fase debe cerrar su gate y no se marca una fase upstream/global con evidencia simulada.
> **Motivación:** el guard actual depende de `scripts/quality` dentro de este repositorio. Al cambiar de rama o de proyecto no debe desaparecer, bloquear comandos legítimos ni ejecutar reglas de wandori.us fuera de su alcance.

## Decisión arquitectónica corregida

No habrá un tercer producto llamado `GloryQuality`. **Sentinel será el único plano de control y orquestación de calidad**; VarSense seguirá siendo un analizador especializado que Sentinel ejecuta mediante un contrato de plugin.

1. **Sentinel Core/CLI global:** runtime agnóstico instalado fuera de los repositorios. Resuelve la política, intercepta comandos, aplica cooldown/locks, calcula alcance incremental, orquesta etapas, administra cachés y genera el reporte.
2. **Analizadores:** reglas nativas de Sentinel, VarSense para tokens/clases CSS y futuros analizadores. Cada analizador conserva su especialidad, pero no decide por separado el gate, el cooldown ni el reporte final.
3. **Política local:** configuración declarativa versionada por proyecto y rama. Define qué comandos, analizadores y perfiles aplican; nunca contiene código ejecutable.

El nombre público será `sentinel` (`sentinel check`, `sentinel guard`, `sentinel doctor`, `sentinel status`). `task:check`, `quality-command-guard`, `global-cargo-guard` y los scripts actuales serán adaptadores de migración y después se retirarán. VarSense podrá seguir teniendo CLI/LSP propios para uso de editor, pero en el flujo de agentes su única autoridad de cierre será Sentinel.

### Contrato de responsabilidades

| Capacidad                                              | Responsable único                        |
| ------------------------------------------------------ | ---------------------------------------- |
| Política por repositorio/rama                          | Sentinel Core                            |
| Intercepción de `cargo`, `npm`, `npx`, `rustfmt`, etc. | Sentinel Guard                           |
| Cooldown de 3 horas, locks y cuota de targets          | Sentinel Scheduler                       |
| Scope incremental y caché de etapas                    | Sentinel Orchestrator                    |
| Reglas de variables/clases CSS                         | VarSense Analyzer, invocado por Sentinel |
| Reglas generales de código                             | Sentinel Analyzers                       |
| Reporte Markdown/JSON y exit code                      | Sentinel Reporter                        |
| Configuración específica del proyecto                  | `sentinel.config.json`                   |

Así se mantienen dos herramientas reales —Sentinel y VarSense—, no tres controles superpuestos.

## Estado real que condiciona el diseño

- Sentinel `0.4.x` ya tiene CLI `analyze`, `--files-from`, configuración estricta y adapters de CLI/LSP/VS Code, pero todavía no es un scheduler ni un interceptor global.
- VarSense `2.2.x` ya tiene core/CLI/LSP y el comando `all`; su ejecución no debe ganar una segunda política de cooldown ni un reporte de cierre independiente.
- El scheduler actual (`scripts/quality`) es específico de wandori.us: decide alcance, caché, cooldown, Rust/frontend, documentación y reporte. Se migrará por etapas; no se copiará entero dentro de Sentinel de una sola vez.
- La primera implementación debe conservar `sentinel analyze` para no romper editores. `sentinel check` será el orquestador; `sentinel guard` solo decide si un comando directo está permitido; `sentinel doctor/status` diagnostican instalación y política.

### Taxonomía pública de comandos

| Comando                            | Responsabilidad                                               | ¿Ejecuta analizadores?      |
| ---------------------------------- | ------------------------------------------------------------- | --------------------------- |
| `sentinel analyze`                 | Análisis de archivos/workspace y salida normalizada           | Sí, uno o varios analyzers  |
| `sentinel check <task-id>`         | Gate completo/incremental, etapas, caché, reporte y exit code | Sí, mediante el orquestador |
| `sentinel guard <command>`         | Interceptar una validación directa y recomendar el gate       | No                          |
| `sentinel doctor/status`           | Diagnosticar política, versión, shims, locks y cachés         | No                          |
| `sentinel install/update/rollback` | Gestionar el runtime global versionado                        | Sí                          |

El alias `npm run task:check -- <task-id>` solo delegará a `sentinel check` durante la migración. No se deben mezclar `analyze` y `check` en un único comando ambiguo.

### Contrato mínimo de plugin de analizador

Sentinel define un contrato versionado y VarSense lo implementa mediante adapter, sin importar código de VS Code ni reglas del proyecto:

- **Entrada:** `workspaceRoot`, `scopeManifest`, `config`, `toolchain`, `abortSignal` y límites de tiempo/memoria.
- **Salida:** `schemaVersion`, `analyzerId`, `analyzerVersion`, findings normalizados (`ruleId`, `severity`, `confidence`, ruta relativa, posición, mensaje estable, remediation), métricas y razones de invalidación.
- **Estados:** `pass`, `findings`, `tool-error`, `timeout`, `cancelled`, `invalid-output`; un error de herramienta nunca se convierte en PASS.
- **Transporte:** CLI JSON/JSONL con argumentos separados como contrato portable; integración in-process solo si existe API versionada y aislamiento equivalente.
- **Compatibilidad:** Sentinel valida `protocolVersion` y la versión mínima de VarSense antes de ejecutar; la CLI/LSP de VarSense sigue siendo un adapter de presentación.

### Ubicación estable global

- Runtime versionado: `%LOCALAPPDATA%\GlorySentinel\versions\<version>\`.
- Alias activo: `%LOCALAPPDATA%\GlorySentinel\current\`.
- Shims `npm.cmd`, `npx.cmd`, `cargo.cmd`, `rustfmt` y CLI: `%LOCALAPPDATA%\GlorySentinel\bin\`.
- Estado/cooldown compartido: `C:\tmp\glory-sentinel\`, separado por raíz canónica del proyecto y `policyHash`.
- Los perfiles PowerShell y Bash solo cargarán `%LOCALAPPDATA%\GlorySentinel\current\profile.ps1`/`profile.sh`; nunca una ruta dentro de este repositorio.

El cambio de rama no altera el runtime global. Actualizar el runtime será una operación explícita (`sentinel install` o `sentinel update`) y tendrá backup/rollback.

## Política declarativa por proyecto

Cada proyecto que quiera enforcement añade `sentinel.config.json` en su raíz. No se ejecuta nada desde este archivo: se parsea como JSON estricto, con claves allowlisted y límites acotados. `.quality/guard-policy.json` queda como alias de migración temporal, no como segundo contrato.

Ejemplo para wandori.us:

```json
{
    "schemaVersion": 1,
    "mode": "enforce",
    "gate": {
        "command": ["sentinel", "check", "--"],
        "taskIdRequired": true
    },
    "guard": {
        "directCommands": {
            "npmScripts": ["test", "test:*", "type-check", "lint", "build"],
            "npxTools": ["vitest", "tsc", "eslint", "prettier"],
            "cargoSubcommands": ["check", "fmt", "test", "clippy", "bench"],
            "tools": ["rustfmt"]
        }
    },
    "analyzers": {
        "sentinel": {"profile": "project-default"},
        "varsense": {"enabled": true, "config": "varsense.config.json"}
    },
    "allow": ["dev", "preview", "codegen", "quality:*"]
}
```

### Identidad de rama, partición de reportes y retención

El gate no debe escribir todos los resultados en un único namespace creciente. La persistencia local se organizará por workspace y rama, con una identidad estable y segura:

- **Reportes canónicos:** `.quality-reports/branches/<branch-key>/<task-id>/latest.{md,json}` y sus logs/tool reports debajo del mismo namespace.
- **Caché y locks:** `.quality-reports/branches/<branch-key>/cache/` y `.quality-reports/branches/<branch-key>/locks/`; ningún PASS, lock o log de una rama se reutiliza silenciosamente en otra.
- **Identidad normal:** `git symbolic-ref --short HEAD` para ramas locales.
- **Detached HEAD/CI:** prioridad determinista: ref explícita entregada por el adapter, `GITHUB_HEAD_REF`/`GITHUB_REF_NAME`/`CI_COMMIT_REF_NAME` allowlisted, rama Git local y, finalmente, `detached-<full-sha>`. La ref y el SHA completo quedan en metadata; el nombre de directorio nunca contiene el SHA sin límite.
- **`branch-key-v1`:** seleccionar una `canonicalRef` UTF-8 (la ref allowlisted elegida o `detached:<full-sha>`), normalizarla a Unicode NFC, preservar mayúsculas, rechazar NUL/control y refs que no cumplan el contrato allowlisted. El hash es SHA-256 de los bytes UTF-8 de esa `canonicalRef`, expresado en hexadecimal minúsculo; codificar cada byte UTF-8 fuera de `[A-Za-z0-9._-]` como `_HH`, limitar el prefijo a 64 caracteres y añadir `--<hash[0:16]>`. El resultado total no supera 96 caracteres y siempre queda dentro de `[A-Za-z0-9._-]`; versión, `canonicalRef`, algoritmo, encoding y hash forman parte de metadata/fingerprint.
- **Compatibilidad de transición:** el `latest` histórico en `.quality-reports/<task-id>/` no será un puntero global escribible. Durante dos versiones solo se leerá si el JSON contiene metadata de rama (`branchKeyVersion`, `branchKey`, `canonicalRef` y `commit`) y coincide exactamente con la rama actual; un reporte antiguo sin metadata se considera ambiguo y no se reutiliza ni migra automáticamente. El writer canónico escribirá únicamente en `branches/<branch-key>/`. Después se retirará esa lectura.
- **Retención:** `quality.config.json` declarará TTL y cuotas allowlisted. Defaults iniciales de bajo consumo: 7 días, 512 MiB por workspace y 128 MiB por `branch-key`; la cuota incluye todos los archivos regulares de reportes, logs, tool reports, caché y locks, pero no `C:\tmp\glory-target`. La rama activa nunca se borra para cumplir cuota: si excede 128 MiB, el reporte marca `overQuota`, informa bytes y candidatos bloqueados, y la poda puede actuar sobre históricos elegibles; al cambiar de rama, su namespace deja de estar protegido y se poda en la siguiente ejecución.
- **Poda segura:** será explícita o ejecutable como etapa best-effort después del gate, tendrá `--dry-run`, informará bytes/candidatos eliminados y nunca cambiará el exit code ni el resultado del análisis. Un fallo de poda o una cuota excedida se registra como estado auditable y no bloquea el gate; se preservan `.tmp-*`/temporales de `writeAtomic`, locks activos, locks huérfanos hasta superar su TTL y comprobar que su PID no está activo, y archivos con escritura reciente. Los locks huérfanos elegibles cuentan para la cuota y pueden eliminarse solo después de ese criterio.
- **CI/artifacts:** los artifacts se publicarán con `branch-key`, task ID y commit corto; no se mezclará `latest` de una rama con otra en runners reutilizados.

### Versionado y migración de configuración

El proyecto ya usa `sentinel.config.json` v1 para reglas, includes, excludes y boundaries del analizador. No se puede reutilizar ese nombre introduciendo `gate` y `guard` sin contrato de migración.

- [x] Definir y validar localmente `sentinel.config.json` v2 como envelope con `mode`, `gate`, `guard`, `runtime`, `analyzers.sentinel` y `analyzers.varsense` (`policy.mjs`); publicar el JSON Schema final sigue ligado a Sentinel Core upstream.
- [x] Mapear automáticamente la configuración v1 actual a `analyzers.sentinel` sin cambiar severidades ni patrones; las claves desconocidas fallan en `sentinel doctor` antes de producir el preview.
- [x] Migrar en preview `quality.config.json` (timeouts, perfiles, cooldown, presupuestos), `varsense.config.json` y `quality-tools.json` mediante `sentinel doctor --migrate --dry-run`; devuelve `mapped`, conserva `legacyPreserved` y mantiene `writes: []` sin escribir.
- [x] Crear `sentinel.lock.json` para fijar runtime, protocolo, versión/commit/hash de Sentinel y VarSense; el runtime local queda explícitamente como `project-adapter`, sin simular instalación global.
- [x] Usar un formato mínimo estable para el lock: `schemaVersion`, runtime `{status, version, commit, identitySha256, artifactSha256}`, analyzers `{version, protocolVersion, commit, sha256, capabilities, sourcePathEnv}` y fecha de generación; nunca guardar secretos ni rutas absolutas de una máquina. `identitySha256` no sustituye el hash de artefacto: en `project-adapter`, `artifactSha256` debe existir explícitamente como `null`; un runtime global instalado exigirá hash real. El preflight resuelve las variables `GLORY_*_SOURCE_PATH` y compara el realpath actual sin persistirlo. Locks históricos sin el campo fallan cerrado y se regeneran con `quality:lock --write`.
- [x] Integrar preflight con validación de lock, versión/protocolo/commit, hash reproducible `git archive`, patch declarado y rechazo de checkouts modificados; solo se tolera `.quality-install.json` como metadata administrativa exacta.
- [x] Incluir la identidad del lockfile en el fingerprint de caché para invalidar PASS ante cambios de hashes fijados.
- [x] Definir precedencia local: la configuración del proyecto aporta la allowlist/patrones y los defaults locales; el perfil explícito de CLI/CI (`--profile` > `GLORY_QUALITY_PROFILE`) solo selecciona perfiles ejecutables (`rust`, `frontend`, `css`, `docs`) y prevalece sobre la autodetección. Nunca cambia severidades, política, lock ni enforcement (`args.mjs`, `scope.mjs`, `profile-contract.mjs`, `stage-definitions.mjs`). `full` de fingerprint queda separado de `executionFull`, Sentinel conserva `--files-from` en el perfil explícito y el reporte distingue ambos alcances; la integración del perfil en el runtime global y un perfil nominal configurable siguen pendientes.
- [x] Mantener lectura local de los formatos anteriores durante dos versiones de runtime como compatibilidad estrictamente read-only: el lector devuelve metadata `legacy-read-only`, `compatibilityVersion: 1`, `maxRuntimeVersions: 2`, `retireAfterCompatibilityVersion: 3`, warning visible y retiro `after-two-runtime-versions`; no escribe alias, no migra automáticamente y los reportes ambiguos no se reutilizan. La retirada efectiva del runtime global sigue pendiente.
- [x] Añadir generador local `quality:lock --check|--write` y `quality:doctor --lock`; `--check` es solo lectura, `--write` crea `.bak` y reemplaza atómicamente, sin instalar runtime ni mutar analyzers.
- [x] Rechazar lock/checkouts y backups por symlink/junction fuera del workspace; preservar el fallo cerrado ante cambios reales en `.quality-tools`.

**Gate:** una migración dry-run no modifica archivos; el lock local es estricto, reproducible y fail-closed ante divergencias. La generación aplicada local queda verificada con backup y escritura atómica; la instalación/rollback del runtime global sigue pendiente.

### Resolución de política

- [x] Buscar desde el directorio actual hacia arriba hasta la raíz del workspace (`discoverPolicy`); la resolución física del directorio inicial evita seguir una ruta lógica con junction/symlink.
- [x] Usar únicamente `sentinel.config.json` como fuente canónica; no inferir reglas leyendo `AGENTS.md` ni scripts arbitrarios. `discoverPolicy`/`loadPolicy` solo recorren ancestros buscando ese archivo, y la identidad/hash no cambia cuando se modifican documentos, `quality.config.json` o scripts auxiliares (`policy.mjs` + regresión canónica).
- [x] Canonicalizar la ruta antes de leerla y rechazar `sentinel.config.json` symlink/junction en el loader y en el guard; la configuración externa no se carga ni se sigue desde los shims (`policy.mjs`, `quality-command-guard.mjs` y tests).
- [x] Calcular `policyHash` desde la configuración descubierta y asociarlo al estado/reporte; el fingerprint de caché lo incluye para invalidar PASS cuando cambia la política. (`scripts/quality/policy.mjs`, `cache.mjs`, `reporter.mjs`)
- [ ] Asociar también la identidad a un runtime global instalado y a leases firmados. *(pendiente del runtime global)*
- [x] Si no existe política, la decisión local es `pass-through` y el guard permite trabajar sin bloquear (`policy-decision.mjs`, `quality-command-guard.mjs` + tests); el comportamiento del runtime global sigue pendiente.
- [x] Si existe una política inválida: no bloquear comandos desconocidos; mostrar una advertencia/error conciso y hacer fallar `sentinel doctor`/CI para que el proyecto corrija su configuración. El guard solo bloquea el comando protegido que detecta; no bloquea comandos desconocidos (`policy-decision`, `quality-command-guard`, `sentinel-doctor` + tests).
- [x] Si `mode` es `observe`, el guard registra `observed` y no bloquea la ejecución; la comparación dual contra Sentinel Core upstream sigue pendiente.
- [x] Si `mode` es `enforce`, el guard bloquea solo comandos declarados y devuelve código 78; el enforcement del launcher global sigue pendiente.
- [x] VarSense no crea cooldown, lock ni reporte paralelo: el adapter ejecuta una sola invocación `all`, usa el `reportRoot`/logs del gate y devuelve hallazgos mediante `structured-tool`; la metadata `varsenseScope` conserva el manifiesto solicitado. La integración versionada añade `--files-from` únicamente cuando `quality-tools.json.tools.varsense.capabilities.filesFrom=true`; esa capacidad queda ligada a `sentinel.lock.json` y al `main` publicado `858ec62`. Sin manifiesto válido se conserva el diagnóstico auditable, sin fallback silencioso ni reporte paralelo.

## Arquitectura por fases

### Fase 0 — ADR, contratos y compatibilidad

- [x] Crear ADR con Sentinel Core, el contrato de analizadores (incluido VarSense), la política local y la matriz `enforce/observe/pass-through`. (`adr-sentinel-plano-global-028a6-2026-08-03.md`)
- [x] Implementar validación estricta local de la política v2 y descubrimiento por ancestros en `scripts/quality/policy.mjs`.
- [x] Implementar `quality:doctor --migrate --dry-run`; no escribe archivos ni cambia perfiles.
- [x] Añadir fixtures de política válida, claves desconocidas, rutas fuera del workspace, modos, migración v1→v2 e identidad/hash (`scripts/quality/tests/policy.test.mjs`, `policy-identity.test.mjs` + guard/cache).
- [x] Centralizar los defaults de comandos bloqueables para que el guard de transición y la migración no mantengan catálogos divergentes.

- [ ] Crear JSON Schema publicado con Sentinel Core (la fuente de runtime global no está presente en este checkout).
- [x] Definir y validar localmente el contrato v2, errores allowlisted y límites de tamaño de strings/listas/rutas; publicar el JSON Schema queda ligado al runtime upstream.
- [x] Añadir al reporte local la identidad estable de política: `projectRoot`, `policyPath`, `policyHash`, `runtimeVersion`, `reason` y comando recomendado; se mantiene `schemaVersion: 1` por compatibilidad aditiva.
- [ ] Definir contrato final de salida de Sentinel Core con decisión/exitCode y transporte CLI/LSP. *(pendiente del runtime global)*
- [ ] Definir contrato final de plugin, taxonomía `analyze/check/guard/doctor` y matriz de compatibilidad Sentinel↔VarSense. El contrato local parcial de salida/error valida `entries` y estados fail-closed, incluido `cancelled`; el contrato final Core/upstream sigue pendiente.
- [x] Definir compatibilidad Windows PowerShell 5/7, PowerShell Core, CMD, Bash/Git Bash (interactivo y `BASH_ENV`) y CI sin depender de variables específicas de VS Code: contrato documental en `Agente/documentacion/herramientas/matriz-shells-sentinel-2026-08-04.md` (shims con `shell: false`, exit codes/redirecciones, frontera de enforcement con bypass no interceptable, launcher del agente/CI, refs CI allowlisted). La ejecución de la matriz real queda en Fase 4.
- [x] Definir política de actualización, rollback y migración desde el guard actual: contrato documental en `Agente/documentacion/herramientas/politica-actualizacion-rollback-sentinel-2026-08-04.md` (versionado `%LOCALAPPDATA%\GlorySentinel`, flujo update/rollback con backup+hash+rename atómico, migración del guard actual, retirada tras dos releases y desinstalación solo de entradas administradas). La instalación/rollback efectivos quedan en Fase 1/5.

**Gate:** ADR aprobado; fixtures y doctor local pasan; los contratos documentales de shells y de actualización/rollback quedan definidos. La fase 0 queda parcialmente cerrada: el schema/runtime global, la salida final y la ejecución de la matriz multi-shell permanecen pendientes upstream.

### Fase 1 — Sentinel Core global instalable y estable *(bloqueada: runtime upstream ausente; orquestador completo extraído al core)*

**Avance 2026-08-05 (módulos 1–8):** los módulos del orquestador fueron extraídos a Sentinel Core sin imports de wandori.us ni de VarSense (verificado por `check:core`): `scope.ts`, `gateReport.ts` + `redaction.ts`, `stageCache.ts`, `scheduler.ts` y `policyDecision.ts` (módulos 1–5) más, en esta tanda, `toolRunner.ts` (port de `runner.mjs`: procesos con env allowlist, captura de 64 KiB, timeout y cancelación con `taskkill` en Windows), `stageRunner.ts` (concurrencia limitada con drenaje) y `structuredTool.ts` (contrato de herramienta JSON versionado con estados `tool-error/timeout/cancelled/invalid-output`). El CLI gana: `sentinel check <task-id> --dry-run [--full|--ci|--allow-heavy]` (alcance + guard con `heavyGuard`), `sentinel guard --executable <exe> [--project-root] [--json] -- <args>` (decisión de comando directo v2/legacy, exit 78), `sentinel doctor`/`sentinel status` (diagnóstico de solo lectura: política, lock, versiones, scheduler y submódulos) y `sentinel check <task-id> --stages <json>` que ejecuta el gate real: alcance → caché de etapas (fingerprint) → runner → contrato estructurado → reporte combinado con exit code PASS/FAIL/SETUP-ERROR/CANCELLED. La orquestación vive en `src/core/gateRun.ts` (CLI delgado; `SIGINT/SIGTERM` → `cancelAll`). `writeAtomic` es utilidad compartida y el checkout es el submódulo `tools/sentinel` sin variables `GLORY_*`. Evidencia: 371 tests de la suite upstream PASS (29 nuevos: runner de procesos, stages con repo real, contrato fail-closed, guard con política v2/legacy/invalid/token, doctor y gate run end-to-end con PASS/FAIL), compile + `check:core` PASS, y fijación en `quality-tools.json`/`sentinel.lock.json` (commits `5a968c8` → `a57cfc1`). Pendiente de esta fase: `install/update/rollback` del runtime global y shims.

**Avance 2026-08-05 (módulos 9–10, cierre de Fase 1):** el runtime global versionado ya vive en el core: `runtimeInstall.ts` implementa el contrato `politica-actualizacion-rollback-sentinel-2026-08-04.md` — staging limpio por operación en `.tmp/<v>`, hash sha256 del artefacto (`out/**` + package.json ± lock) calculado antes del manifest, `current.json` atómico (`writeAtomic`), retiro no destructivo de la versión previa a `.retired/` (sin ventana de pérdida: un crash entre renames deja `current.json` apuntando a una versión existente), shims `current.js` + `bin/sentinel.cmd`/`bin/sentinel`, `install/update/rollback` explícitos con `--dry-run`/`--json`, rollback a la anterior conservada o versión explícita, y `doctor`/`status` con versiones, alias activo y hash verificado del artefacto. En el orquestador de wandori.us se añadió la **supervisión automática de targets** (`runTargetMaintenanceBestEffort` en `task:check`): la cuota estricta se comprueba en cada gate, con lock entre agentes y presupuesto de 60 s; poda `C:\tmp\glory-target` por cuota (`heavyRun.maxTargetGb`) y edad (`maxTargetAgeDays`) sin tocar targets activos — marcador del guard, ejecutable cargado (`runningProcessPaths` vía WMI) o escritura reciente — y reporta en `latest.json`/`.md` (`targetMaintenance`, incluido `quotaExceeded`) sin afectar la decisión; `quality:cleanup` sigue forzando el pase completo. Evidencia: upstream `3071171` con 380 tests PASS (11 nuevos de runtimeInstall + parse CLI), demo end-to-end install→update→rollback→shim sobre target aislado, 5 tests nuevos de `target-maintenance` en la suite del orquestador (141 total), y limpieza real del disco: `C:\tmp` de 2.1 GB libres (100%) a 31 GB libres (87%) podando `debug`/`glory-target-codegen` con verificación previa de procesos vivos.

**Avance 2026-08-05 (cierre de Fase 1, `a7ff43e`):** `interceptorShims.ts` genera los shims interceptores desde el runtime (npm/npx/cargo/node.cmd + guards bash/PowerShell) apuntando a `<target>/current.js guard`, con resolución del ejecutable real sin recursión (env var `GLORY_REAL_*` primero, `where`/`type -P` excluyendo el propio shim), `assertSafeRuntimePath` contra shell injection en código generado, `installProfiles`/`uninstallProfiles` con backup atómico solo la primera vez, reemplazo idempotente de marcadores nuevos y legacy (`glory-quality-*`), strip que conserva byte a byte el contenido previo al marcador y backups con hash del padre (no colisionan PS7/WindowsPowerShell). `rollbackRuntime` exige `artifactSha256` verificado antes de restaurar (SNT-10). CLI: `install/update --with-shims|--with-profiles` con dry-run sin mutación. Evidencia: upstream `a7ff43e` con 399 tests PASS (19 nuevos: interceptorShims, rollback con hash, parse CLI), `check:core` OK, demo live install→shims→guard (vitest bloqueado exit 78 en repo real)→perfiles con backup→uninstall byte a byte; gitlink + `quality-tools.json` + `sentinel.lock.json` fijados. La activación real de PATH/perfiles del operador quedó **autorizada y ejecutada el 2026-08-05** (AGENTS.md: no instalar sin pruebas y autorización): `scripts/quality/install-global-runtime.mjs` + `npm run quality:install-guard` instalaron runtime v0.4.0 en `%LOCALAPPDATA%\GlorySentinel` con shims + perfiles (backup) y PATH de usuario `shims;bin` al frente; verificado en shell nueva (shims bloquean 78, doctor runtime activo, gate PASS con el PATH completo).

- [ ] Extraer el clasificador, scheduler, scope, caché y reporter a Sentinel Core, sin imports de wandori.us ni de VarSense. *(extraídos en `5a968c8` → `a57cfc1`, incluido el runner de etapas; la integración del orquestador de wandori.us a `sentinel check --stages` queda para la Fase 3/observe)*
- [x] Crear CLI global `sentinel check|guard|doctor|status|install|update|rollback`. *(check con scope/guard/etapas reales, guard, doctor y status ya existen; install/update/rollback implementados en `runtimeInstall.ts` y wireados en el CLI en `3071171`)*
- [x] Instalar versiones en `%LOCALAPPDATA%\GlorySentinel\versions` y cambiar `current` de forma atómica. *(`installRuntime`/`rollbackRuntime`/`runtimeStatus` en `src/core/runtimeInstall.ts`; staging `.tmp/<v>`, retiro a `.retired/`, hash verificado y shims en `bin/`)*
- [x] Ejecutar analyzers mediante adapters locales aislados con timeout, límite de salida y estados distinguibles `tool-error/timeout/cancelled/invalid-output`; el contrato valida raíz, `entries`, `findings`, `ruleId`, `message` y severidad allowlisted. La cancelación local se propaga desde el gate al runner, solo se marca ante una transición durante la ejecución (o cancelación previa explícita), conserva `quality-cancelled`, drena etapas activas y no agenda nuevas; el reporte final usa `CANCELLED`/130. El estado/salida del runtime global Core queda pendiente (`runner.mjs`, `stage-runner.mjs`, `structured-tool.mjs`, `common.mjs`, `reporter.mjs` + tests).
- [x] Generar shims con resolución del ejecutable real sin recursión; preservar argumentos, códigos de salida y redirecciones. *(`interceptorShims.ts` en `a7ff43e`: shims `npm/npx/cargo/node.cmd` generados por el runtime apuntando a `<target>/current.js guard`, resolución real vía `GLORY_REAL_*` + `where`/`type -P` excluyendo el propio shim, `%*`/exit codes/redirecciones preservados; guards de bash y PowerShell dot-sourceables con la misma lógica. `assertSafeRuntimePath` rechaza targetRoot con caracteres que romperían el shim (shell injection en código generado). La activación global de PATH/perfiles quedó autorizada y ejecutada el 2026-08-05 (ver Avance Fase 3: `install-global-runtime.mjs` + PATH `shims;bin`, retirado el PATH legacy de `scripts/quality`)*
- [x] Dot-sourcear únicamente la ruta global estable en ambos perfiles; crear backup antes de cualquier modificación. *(`installProfiles`/`uninstallProfiles` en `a7ff43e`: backup atómico del original solo la primera vez, reemplazo idempotente de marcadores nuevos+legacy, strip que conserva byte a byte el contenido previo, backups con hash del padre para perfiles PS7/WindowsPowerShell del mismo basename, `--with-profiles` explícito con dry-run sin mutación; la ejecución real sobre los perfiles del operador quedó autorizada y ejecutada el 2026-08-05 — 4 perfiles (2 PS creados, 2 bash migrados desde el marcador legacy) con backup en `shims\profile-backups`)*
- [x] Mantener los wrappers del repositorio solo como adaptadores para desarrollo, no como dependencia del perfil global. *(la capa A fue retirada; la capa B permanece únicamente como adapter project-owned)*

**Gate:** una rama que elimina `scripts/quality` no rompe el perfil ni el CLI global; `doctor` identifica la versión activa y el ejecutable real.

### Fase 2 — Resolución por workspace y rama *(contrato local parcial; enforcement global bloqueado)*

- [x] Implementar descubrimiento de raíz y política en cada comando, sin estado de proceso que sobreviva al cambio de rama: `discoverPolicy`/`loadPolicy` (`policy.mjs`) y `readV2GuardPolicy` (`quality-command-guard.mjs`) releen de disco en cada invocación, sin caché a nivel de módulo; regresión nueva en `policy.test.mjs` simula el cambio de política dentro del mismo proceso (enforce → observe → sin archivo) y verifica status/hash frescos (`policy.test.mjs`). El enforcement del runtime global sigue pendiente.
- [x] Diferenciar `no-policy`, `legacy-v1`, `observe`, `enforce`, `pass-through` e `invalid-policy` en el guard, doctor e identidad/reporte local (`scripts/quality/policy-decision.mjs` + fixtures); el enforcement global sigue pendiente.
- [x] Invalidar la caché local por `policyHash` además de modo, herramientas, configuración y archivos.
- [ ] Invalidar decisiones/cooldowns del runtime global por `projectRoot + policyHash + runtimeVersion`. *(pendiente del runtime global)*
- [x] Mantener cooldown/locks solo para comandos declarados como pesados por la política; no compartirlos entre proyectos: el guard local (`heavy-run-guard.mjs`) particiona el estado de cooldown por `projectKey(projectRoot)` y solo `test/clippy/bench` de Cargo y el modo `full` adquieren lease; un comando ligero no escribe cooldown. Regresiones nuevas en `tests/heavy-run-guard.test.mjs` (dos proyectos con el mismo `targetBase` no comparten cooldown; un comando ligero no arranca el cooldown). El cooldown/lock del orquestador ya está extraído al core en `src/core/scheduler.ts` (raíz por marcador v2/v1, fusión de `heavyRun` en migración, y `sentinel check --full` consulta el guard y difiere a local-light con `heavyGuard`); el scheduler del runtime global (leases firmados e invalidación por `runtimeVersion`) sigue pendiente.
- [x] Emitir leases efímeros firmados para que los procesos hijos iniciados por `sentinel check` puedan usar herramientas pesadas sin que el propio shim los bloquee; el lease debe estar ligado a PID, proyecto, comando, expiración y task ID. *(cerrado: `src/core/lease.ts` en `8d924dc` — HMAC-SHA256 con clave del guard root, binding de PID descendiente/proyecto/expiración, auditoría append-only, `GLORY_QUALITY_GATE_LEASE` por ejecución en `gateRun.ts` y verificación en `guardCommand.ts`; el token plano queda como fallback de migración. Suite 418/418 y demo live: hijo independiente bloqueado (78), descendiente eximido (0), revoke elimina)*
- [x] Definir la frontera de enforcement: shims cubren shells normales; el launcher del agente/CI debe invocar `sentinel guard` antes de ejecutar procesos. Rutas absolutas y shells `--noprofile --norc` se registran como bypass no interceptable por un script de proyecto, no se presentan como cobertura completa. Contrato documental en `Agente/documentacion/herramientas/matriz-shells-sentinel-2026-08-04.md` §4; la ejecución de la matriz real queda en Fase 4.
- [x] Añadir al diagnóstico local la decisión estable (`action`, `mode`, `blocked`, `reason`) junto con raíz, hash y comando recomendado; diagnóstico de shims/PATH global queda pendiente del runtime externo.
- [x] Resolver la identidad de rama de forma segura para rama normal, detached HEAD, CI y nombres con `/`, espacios, unicode o longitud excesiva; añadir fixture determinista de `branch-key` (`scripts/quality/branch-identity.mjs`).
- [x] Particionar reportes, logs, caché y locks por `projectRoot + branch-key`; conservar el SHA/ref original en metadata y evitar colisiones entre ramas (`preflight.mjs`, `cache.mjs`, `lock.mjs`, `reporter.mjs`).
- [x] Implementar lectura compatible, solo lectura, del layout histórico `.quality-reports/<task-id>/`: el namespace canónico gana; el legacy solo se acepta con metadata exacta de rama, sin metadata queda ambiguo, y se rechazan traversal/symlinks/JSON canónico corrupto sin fallback (`scripts/quality/report-reader.mjs`, `scripts/quality/tests/report-reader.test.mjs`). El resultado legacy expone warning y contrato de retirada tras dos versiones; aplicar la retirada efectiva sigue pendiente del runtime global.
- [x] Añadir retención configurable por TTL/cuota (defaults: 7 días, 512 MiB por workspace, 128 MiB por rama), contando reportes/logs/tool reports/caché/locks; marcar `overQuota` sin borrar la rama activa, podar históricos/tareas/caché elegibles con `--dry-run`, respetar locks/temporales/escrituras recientes y eliminar locks huérfanos solo tras TTL + PID inactivo; registrar bytes/candidatos antes y después sin alterar el exit code (`report-retention.mjs`).
- [x] Exponer `quality:reports:cleanup:dry` y `quality:reports:cleanup`; el modo destructivo requiere `--cleanup --yes`.
- [x] Cubrir con fixture de integración el aislamiento de dos ramas para reportes, caché y locks, además de identidades CI/detached con commit compartido (`scripts/quality/tests/branch-isolation.integration.test.mjs`). Traversal/symlink, retención y poda tienen cobertura focal; la poda best-effort integrada en `task-check` conserva el resultado del gate y está cubierta por `report-retention-stage.test.mjs`. El cambio de rama dentro del mismo proceso, los locks entre namespaces y refs largas/peligrosas quedan cubiertos por la fixture; la concurrencia multi-proceso y la matriz CI real siguen pendientes del runtime global.

**Gate:** matriz con dos proyectos y dos ramas: el proyecto configurado bloquea lo declarado; el proyecto sin política pasa; cambiar de rama actualiza la decisión sin reiniciar el editor (regresión de rediscovery de política en el mismo proceso). Los reportes, locks y cachés quedan aislados por rama; la poda dry-run y aplicada respetan TTL/cuota, no toca una ejecución activa y no puede borrar fuera del workspace. La frontera de enforcement queda definida documentalmente; la matriz de shells real y el enforcement del launcher siguen en Fase 4.

### Fase 3 — Adaptador de wandori.us y VarSense *(pendiente después de Fase 1)*

- [x] Añadir `sentinel.config.json` al proyecto con `sentinel check -- <TareaId>` como gate; conservar un alias temporal para `npm run task:check`. El archivo migra a v2 completo (`schemaVersion: 2` con `runtime`, `gate` y `analyzers.sentinel.config` con las reglas del analizador): el guard local exige v2 puro y el core consume la subconfig vía `analyzerSubConfig`; `mode: enforce` conserva la protección actual sin relajar nada antes de que la doble vía esté validada.
- [x] Migrar `quality-command-guard.mjs`, `global-cargo-guard.ps1`, `npm.cmd`, `npx.cmd` y `cargo.cmd` al runtime global de Sentinel sin duplicar reglas; la copia del consumidor fue retirada tras paridad y rollback.
- [ ] Mantener `quality.config.json` solo para la transición de tiempos, alcance y cachés; la política de comandos y analizadores vive en Sentinel.
- [x] Integrar el contrato de capacidad de VarSense como adaptador de analizador (`files-from`, hallazgos tipados, caché e invalidación), sin un gate ni scheduler propio: el adapter, el lock y sus pruebas coordinan la activación solo cuando la capacidad está fijada. El upstream `main` expone el contrato seguro en `858ec62`; el core local expone caché por archivo e invalidación explícita en `a72b39a`.
- [x] Publicar/fijar `858ec62`, declarar `capabilities.filesFrom` en `quality-tools.json`, regenerar `sentinel.lock.json` y validar lock-check/preflight + 127/127 quality tests. La ejecución local-light/full/CI completa permanece pendiente como parte del gate global, no de esta fijación.
- [x] Publicar y fijar el protocolo de orquestación de tareas de Sentinel: `tools/sentinel` apunta al commit coordinador publicado `20c13a216e879303fcf5be7469a2821391b2ec0d` (`origin/main`, tag `v0.5.0`) y el lock del consumidor coincide. `quality:lock --check`, compilación, `git fsck --full` y suite dirigida del submódulo pasan; no queda una copia modificada local como dependencia del consumidor.
- [ ] Actualizar `quality:install-guard` para instalar/copiar Sentinel y retirar rutas hardcodeadas del repositorio.
- [x] Ejecutar VarSense desde Sentinel y demostrar paridad de hallazgos con su CLI/LSP, sin permitir que VarSense cierre la tarea por separado: la etapa varsense corre dentro del gate agnóstico (stage-process → adapter → CLI, misma invocación que task:check vía `buildVarsenseInvocation`) y **`varsense-parity.mjs` demuestra la paridad**: ejecuta la etapa del gate y el CLI de VarSense directo sobre el mismo alcance (scope-manifest compartido vía `--scope-manifest`, con el mismo `--files-from`/`--index-dir`), normaliza ambos (`normalizeGateFindings` vs `normalizeDirectFindings` con la misma base 1-based y resolución desde `entry.ruta`) y compara por `ruleId:file:line`. Demo real 028A-6: **169 = 169 hallazgos, PARIDAD, exit 0**; el reporte registra que VarSense no cierra la tarea por separado (la decisión la toma `sentinel check` con el reporte combinado). 3 tests nuevos (normalizadores idénticos/diferentes + integración real).
- [x] Ejecutar primero en modo `observe` contra el gate actual y comparar reportes normalizados: `observe-compare.mjs` corre `task:check` y `sentinel check <task> --stages` sobre la misma tarea y compara decisiones y hallazgos normalizados. La comparación es válida solo con el mismo alcance: el gate agnóstico reutiliza el `scope-manifest.json` del gate actual (`--scope-manifest`), incluyendo el diferimiento del guard de ejecuciones pesadas, vía `manifestToScope` en `stages.mjs`/`stage-process.mjs` (el wrapper escribe su propio `changed-files.txt` para `--files-from`). Demo real sobre 028A-6: **PASS vs PASS con hallazgos idénticos** (local-light, 9 archivos). Fallos resueltos en el camino: shims `.cmd` en Windows requieren shell con quoting propio (`runner.mjs`, sin EINVAL ni DEP0190), `npmInvocation` con fallback al npm del PATH (`adapters/common.mjs`), y el wrapper emite `entries[].findings[]` con el contrato exacto del core.
- [x] Activar `enforce` en el core solo después de resolver diferencias, errores de herramienta y falsos positivos en más tareas reales. *(cerrado: 5 comparaciones de doble vía en tareas reales — 028A-6 (bases 64dd385e^ y 62ce8d9c^), 297A-78 (bases 94620b7f^ y 8d41b3c7^) y 028A-17 (base f15ad2e2^, scope heavy con 651 findings) — decisiones coinciden y hallazgos idénticos tras corregir la única divergencia real: `normalizeEntries` del core solo leía `range.start.line` (0-based) y perdía la `line` 1-based que emite `stage-process.mjs`, contando el mismo hallazgo dos veces en `observe-compare` (651 vs 207); corregido en `92afb7f` (acepta `line` directo y `range`, siempre 1-based, con test de regresión) y paridad final 651=651. `observe-compare.mjs` ahora acepta `--base` para comparar diffs históricos con el árbol limpio.*
- [x] Límites del enforcement documentados y verificados en vivo (SNT-10): con los shims del runtime en PATH temporal, `npm run test` vía shim `.cmd` bloquea con 78 y el guard de bash dot-sourceado bloquea con 78; la **ruta absoluta al binario real** (p. ej. `"C:\Program Files\nodejs\npm.cmd" run test`) y **`bash --noprofile --norc`** (funciones del guard no cargadas) salen con 0: son límites inherentes de la intercepción por PATH/perfiles, no interceptables por scripts del repositorio. Para cerrarlos haría falta enforcement a nivel de launcher/OS, fuera del alcance de los shims.
- [x] Mantener compatibilidad temporal con el guard actual y emitir advertencia de migración, sin bloquear una rama antigua: el guard local conserva el fallback `legacy-v1` (rama antigua sin política v2 no queda bloqueada) y `sentinel doctor --migrate --dry-run` emite el preview/advertencia de migración sin escribir; la retirada efectiva tras dos versiones y la advertencia del runtime global siguen pendientes.

**Gate:** parcialmente verificado en transición: guard local, identidad de política, invalidación de caché y reportes pasan; instalación global, shells externos y runtime Sentinel quedan pendientes.

**Avance 2026-08-05 (instalación global autorizada y ejecutada):** `scripts/quality/install-global-runtime.mjs` (reemplaza al `.ps1` legacy) + `npm run quality:install-guard` instalaron el runtime v0.4.0 en `%LOCALAPPDATA%\GlorySentinel` (hash verificado, `current.json` atómico), 6 shims (npm/npx/cargo/node/sentinel + guards), 4 perfiles (2 PS creados, 2 bash migrados desde el marcador legacy) con backup en `shims\profile-backups`, y el PATH de usuario pasa a `shims;bin` al frente (la entrada `bin` expone el comando global `sentinel`; `scripts\quality` legacy retirado). La entrada de PATH es idempotente y se gestiona desde el runtime (`installPathEntry`/`uninstallPathEntry` en `interceptorShims.ts`, dry-run sin mutación, tests in-memory). Verificación en shell nueva: `which sentinel` → `%LOCALAPPDATA%\GlorySentinel\bin\sentinel` (v0.4.0), `sentinel doctor` → runtime activa v0.4.0 hash verificado · leases clave ok, shims bloquean `npm run test` (78), y `task:check` **PASS con los shims + bin activos** (el loop de lease de Fase 2 funciona end-to-end con el PATH completo).

### Fase 4 — Integración multi-proyecto y CI *(pendiente de runtime global)*

- [x] Crear fixtures de un proyecto Node, Rust, Python, uno sin política y uno legacy v1: `tools/sentinel/src/test/fixtures/guard-matrix/` (node/rust/python con `sentinel.config.json` v2 enforce con sus listas, no-policy sin marcadores, legacy-v1 con `schemaVersion: 1`). *(cerrado 2026-08-05)*
- [x] Probar `npm`, `npx`, `cargo`, `rustfmt`, comandos directos, `2>&1`, pipes y códigos de salida en PowerShell 5/7, CMD y Bash/Git Bash. *(cerrado: `guardMatrix.test.ts` (matriz de decisiones unit por fixture × comando, 33 casos) + `shellMatrix.test.ts` con los shims REALES del runtime en un sandbox (`writeSandboxRuntime`) en los 4 shells — cmd bloquea `npm run test`/`npx vitest`/`cargo test` con 78 y deja pasar `npm --version`; PowerShell 5.1 y 7 bloquean por shim de PATH y por dot-source del guard generado; bash bloquea SOLO con el guard dot-sourceado (el shim .cmd no aplica en bash — bypass documentado que requiere enforcement del launcher); el pipe `2>&1 | findstr` enmascara el exit 78 (el último comando decide) — documentado como límite inherente. Los shells ausentes se saltan, no fallan)*
- [x] Probar rutas anidadas, junctions/symlinks permitidos, repositorio movido y checkout de ramas con/sin política. *(cerrado: `guardEdgeCases.test.ts` — raíz desde subdirectorio anidado, repo movido a otra ubicación (re-descubrimiento), toggle del marcador en el mismo árbol (simula rama con/sin política) y junction `mklink /J` (realpath resuelve la física; la junction se retira con rmdir por el EPERM de rmSync en Windows; skip si la plataforma no la soporta))*
- [x] CI usará la política del proyecto y el runtime fijado; nunca dependerá del perfil del desarrollador. *(verificado 2026-08-05: `task:check` PASS con un PATH sin `GlorySentinel` ni `scripts/quality` — el gate usa las herramientas fijadas de `quality:setup` (sourcePath de los submódulos), igual que el runner limpio de `.github/workflows/quality.yml`)*
- [x] Probar agentes con PowerShell/Bash/CMD, procesos hijos, pipes, `2>&1`, shell sin perfil y rutas absolutas; cada caso debe indicar si se bloquea, se observa o requiere enforcement del launcher. *(cerrado: la matriz de shells + los límites de la Fase 3 — ruta absoluta al binario real (0) y `bash --noprofile --norc` (0) requieren enforcement del launcher; el shim .cmd no intercepta bash (0); el pipe enmascara el exit (0); todos documentados)*
- [x] Publicar reportes compactos sin secretos y con máximo tres hallazgos/máximo cuatro recordatorios: `compactLines` limita findings a `maxFindings` y reminders a `maxReminders` (3/4 por defecto) con límite defensivo en ambos; `createReport` redacta secretos en JSON/Markdown vía `sanitize`; el artifact completo conserva todos los hallazgos y los ordena por severidad, regla, archivo, línea y mensaje sin depender del locale; regresiones en `tests/reporter.test.mjs` cubren límites, redacción, orden estable, detalle completo y exit code `CANCELLED`. **Publicación de artifacts CI cerrada (2026-08-05):** `quality.yml` resuelve `resolveBranchIdentity` (refs CI allowlisted: `GITHUB_HEAD_REF`/`GITHUB_REF_NAME`) y nombra los artifacts `quality-reports-<branchKey>-297A-6-<shortCommit>` y `quality-metrics-<branchKey>-<shortCommit>`; runners reutilizados no mezclan ramas.

**Gate:** 100% de fixtures con decisión esperada, sin bloqueo cruzado entre proyectos y sin proceso huérfano. El contrato local de reportes compactos y artifacts (detalle completo, orden estable, 3 hallazgos / 4 recordatorios en terminal, sin secretos y exit codes diferenciados) queda cerrado; la matriz multi-shell real y la publicación de artifacts CI siguen pendientes del runtime global.

**Avance 2026-08-05 (matriz multi-proyecto y de shells cerrada):** la matriz expuso un **bug real del gate actual**: un cambio de submódulo (gitlink) entra en `git diff --name-status` como la ruta del DIRECTORIO del submódulo, y VarSense rechazaba la entrada con "Ruta directorio no permitida en --files-from" (exit 2) cada vez que el gitlink `tools/sentinel` estaba en el diff — el gate fallaba con SETUP ERROR. Corregido en `scripts/quality/scope.mjs`: `filterDirectoryEntries` excluye los directorios del scope de archivos (los eliminados se conservan en `deletedFiles`); con el fix, `task:check` **PASS con el gitlink en el diff y con PATH sin GlorySentinel** (evidencia CI). Upstream `8992cc1`: **469 tests PASS** (44 nuevos: matriz 33, shells 7, límites 4) + `check:core` OK; orquestador **207/207** (+1 test de regresión del filtro).

### Fase 5 — Retirada segura del acoplamiento actual *(capa A completada; capa B separada en SNT-10)*

- [x] Documentar rollback al runtime anterior y restaurar backups de perfiles. *(2026-08-05: rollback del runtime = `sentinel rollback [--version <v>]` — exige `artifactSha256` verificado contra el contenido instalado y restaura la versión anterior conservada; los perfiles se respaldan en `<target>/shims/profile-backups` con nombre `<parentHash>-<basename>.backup` (PS7/WindowsPowerShell no colisionan) y el instalador del repo crea `migration-<stamp>-<basename>` antes de migrar: restaurar = copiar el backup sobre el perfil, que conserva byte a byte el contenido previo al marcador. `uninstallProfiles`/`uninstallRuntime` nunca borran backups)*
- [x] Retirar el PATH que apunta a `scripts/quality` solo después de verificar el PATH global. *(2026-08-05: el PATH de usuario ahora empieza por `%LOCALAPPDATA%\GlorySentinel\shims;%LOCALAPPDATA%\GlorySentinel\bin` y `scripts\quality` quedó retirado; el comando global `sentinel` (bin) resuelve y `sentinel doctor` reporta runtime activo)*
- [x] Eliminar shims duplicados del repositorio después de dos versiones consecutivas con la matriz en verde. *(runbook ejecutado: `git rm` exacto de la capa A, verificación post-retirada con bloqueo 78 del runtime y rollback aislado; la capa B — `task:check`/`heavy-run-guard` — se retira aparte en SNT-10)*
- [x] Mantener un comando de desinstalación que quite solo entradas administradas por Sentinel. *(2026-08-05, `785301b` en el submódulo: `sentinel uninstall [--target-root <dir>] [--dry-run] [--keep-runtime] [--json]` — `uninstallRuntime` en `runtimeInstall.ts` retira SOLO lo administrado: entrada de PATH (shims+bin), marcadores de perfiles nuevos/legacy (`uninstallProfiles`) y el directorio `shims`; sin `--keep-runtime` retira también `bin`/`current.js`/`current.json`/`versions`/`.tmp`/`.retired`; nunca borra la raíz del runtime ni entradas ajenas (fixture con `mis-datos.txt` conservado). Dry-run sin mutación, error de PATH/perfiles propaga exit 1 al CLI. `quality:uninstall-guard` delega en él con `--keep-runtime` (retira la integración y conserva el runtime). 6 tests nuevos; suite 475/475 + check:core)*
- [x] Marcar el guard actual como legacy y conservar un periodo de compatibilidad para ramas antiguas. *(2026-08-05: banners LEGACY `[028A-6 Fase 5]` añadidos a `quality-command-guard.mjs`, `global-cargo-guard.ps1`, `global-quality-guard.sh`, `npm.cmd`/`npx.cmd`/`cargo.cmd`/`node.cmd` e `install-global-guard.ps1` — comentarios que no cambian comportamiento (verificado: `npm --version` reenvía, `bash -n` y `node --check` OK), apuntan al runtime como fuente canónica y fechan la retirada "tras dos releases con rollback probado". La compatibilidad se conserva: las ramas antiguas sin runtime instalado siguen usando estos wrappers)*

**Avance 2026-08-05 (rollback probado en vivo):** demo sobre target aislado en temp con el código compilado real — (1) `installRuntime` de una versión 9.9.9 falsa y de la 0.4.0 del checkout; (2) `rollbackRuntime` restaura 9.9.9 **solo tras verificar el `artifactSha256`** contra el contenido instalado (negado si el manifest falta o el contenido fue manipulado); (3) `current.json` vuelve a apuntar a la versión restaurada con `activeVerified: true`; (4) perfil con contenido del operador: `installProfiles` crea el backup (`<parentHash>-<basename>.backup` en `<shimDir>/profile-backups`) y añade el bloque del guard al final sin tocar el contenido previo; (5) `uninstallProfiles` retira el bloque y el perfil vuelve **byte a byte al original** (`===`), con el backup idéntico al original para restauración manual; (6) rollback explícito a 0.4.0 verificado. **14/14 PASS.** Esto cierra el criterio "rollback probado en una copia de perfil" del gate de Fase 5.

**Gate:** rollback probado en una copia de perfil; ninguna rama activa pierde la capacidad de ejecutar su gate.

## Reglas de seguridad y resiliencia

- Nunca ejecutar comandos definidos por JSON; el JSON solo selecciona clases y un gate allowlisted.
- No ejecutar plugins, scripts ni binarios aportados por el repositorio sin versión/hash fijados en `sentinel.lock.json`; VarSense se invoca desde el runtime aprobado.
- Nunca mostrar tokens, variables de entorno, argumentos completos ni rutas sensibles en el mensaje de bloqueo.
- Si el runtime global está ausente o corrupto, `doctor` falla y los comandos de proyectos sin política pasan; no bloquear todo el sistema.
- Si el proyecto tiene `sentinel.config.json` en `enforce` y el runtime/analyzer fijado no está disponible o no coincide con el lock, el gate falla cerrado con una instrucción de reparación; solo `no-policy`/`pass-through` puede continuar.
- El guard no mata procesos ajenos ni borra targets fuera del directorio de caché/targets validado por plataforma (`C:\tmp\glory-sentinel`/`glory-target` en Windows, XDG cache en Linux/macOS).
- Shims usan `shell: false`/argumentos separados cuando invocan Node; PowerShell y CMD deben preservar códigos de salida.
- Cada analyzer tiene timeout, límite de bytes, cancelación y cleanup; un proceso huérfano queda marcado y no se reutiliza su salida.
- La configuración se trata como input no confiable: JSON sin ejecución, rutas canonicalizadas, symlink/junction dentro del workspace y globs con límites.
- Los nombres de rama nunca se usan como rutas sin codificación allowlisted; detached HEAD, refs CI y hashes tienen límites de longitud y colisión verificable.
- La poda de `.quality-reports` solo opera dentro de la raíz canónica, no sigue enlaces, respeta locks/procesos activos y registra un resultado auditable sin incluir secretos.
- Actualizaciones usan directorio temporal, hash/verificación y rename atómico; rollback conserva la versión anterior.

## Auditoría SOLID, rendimiento y escalabilidad por fase

Cada fase debe adjuntar evidencia de:

- **SRP:** resolver política, clasificar comando, ejecutar shim, persistir estado y reportar son módulos separados.
- **OCP/DIP:** nuevas herramientas se agregan en la política/configuración, no con `if/else` por proyecto en el core.
- **ISP:** el runtime expone interfaces pequeñas para filesystem, reloj, proceso y entorno; fixtures usan adaptadores fake.
- **Rendimiento:** una invocación normal añade solo una lectura JSON/cacheada y una resolución de raíz; no inicia Node adicional si no hay política.
- **Escalabilidad:** estado indexado por `projectRoot/policyHash`, locks por proyecto y pruebas con múltiples workspaces concurrentes.
- **Seguridad:** rutas, JSON, permisos, secretos, códigos de salida y rollback revisados por Sentinel/VarSense cuando aplique.
- **Observabilidad:** logs estructurados y reportes con `runtimeVersion`, `policyHash`, decisión, duración y motivo, sin datos sensibles.
- **Dependencias:** el grafo permitido es `Sentinel Core → contratos/política/scheduler/reporter`; `adapters → contratos`; `VarSense adapter → contratos`. Core no importa VS Code, LSP, VarSense ni código del proyecto.

## Documentación afectada e inventario de correcciones

La migración a Sentinel como plano único deja documentación desincronizada con el estado real (era IA eliminada, CLI `analyze`, reglas portables, `varsense all`, gate). Inventario completo; cada ítem se resuelve dentro de la fase indicada y queda verificado contra el código fijado en `quality-tools.json`.

### Repositorio glory-sentinel (`main` externo consumido por el gate)

- [x] **`README.md`** — reescrito (commit `95ac5b0` `038A-4`): era IA eliminada, CLI `analyze`/`--files-from`/`--format`/`--output`/`--config`, JSON `schemaVersion: '1'`, validación estricta de `sentinel.config.json`, `portableBoundaries`, catálogo completo de reglas y rol de plano global (VS Code + CLI + LSP).
- [x] **`help.txt`** — reemplazado por el `--help` real de `sentinel analyze` (commit `7ad3b76` `038A-5`); ya no es el dump de la CLI Gemini.
- [x] **`rules.md`** — regenerado desde `obtenerTodasLasReglas()` del `ruleRegistry` compilado: 105 IDs reales con severidad/categoría (commit `7ad3b76` `038A-5`).
- [x] **`CHANGELOG.md`** — entrada 0.4.0 ampliada con portable rules/`portableBoundaries`/`unsafe-process-shell`/`default-export` y deprecación del motor IA marcada (commit `7ad3b76` `038A-5`).
- [x] **Sincronizar `main`** — los commits reales `SNT-04` (`0f164e0`) y `SNT-02` (`e06a140`) quedaron en `main=7ad3b76`; el patch local `[317A-3]` fue incorporado y publicado como `9f4ed4d`. El gate consume ahora ese checkout externo mediante `sourcePathEnv`; la copia `.quality-tools/sentinel` ya no es una dependencia activa y fue retirada.
- [x] **Parche local `[317A-3]`** incorporado al `main` y publicado como `9f4ed4d`; `quality-tools.json` ya no declara patch downstream para Sentinel.

### Repositorio varsense (`main` externo consumido por el gate)

- [x] **`README.md`** — reescrito (commit `4167868` `038A-5`): nombre VarSense, CLI `scan`/`orphan-classes`/`all`, binarios `varsense`/`varsense-lsp`, LSP stdio, integración Zed y `tokenDetection` (`token-duplicate`/`token-unused`).
- [x] **`CHANGELOG.md`** — añadidos `all` y `tokenDetection` a la entrada 2.2.0 (commit `4167868` `038A-5`).
- [x] **Sincronizar `main`** — `main` recibió `SNT-08` (`337c4cc`), `SNT-09` (`a72b39a`) y `SNT-10` (`858ec62`), publicados en `origin/main`. El gate consume ahora ese checkout externo mediante `sourcePathEnv`; la copia `.quality-tools/varsense` ya no es una dependencia activa y fue retirada.
- [x] **Cancelación cooperativa SNT-08 en core** — `main` publicado contiene `337c4cce` con `CancellationToken`/`CancellationError` para builders de variables y clases, propagación durante descubrimiento/lectura/extracción/cierre, preservación de errores normales de lectura y 50 tests upstream PASS.
- [x] **Caché incremental SNT-09 en core** — `main` publicado contiene `a72b39a` con caché por archivo para clases, invalidación explícita y provider de cache separado; `varsense all` comparte el snapshot solo cuando se inyecta explícitamente.
- [x] **Publicar y fijar SNT-08/SNT-09/SNT-10** — VarSense `main` publicado en `858ec62`; `quality-tools.json` declara `capabilities.filesFrom=true`, y el lock queda regenerado contra el checkout externo, sin copia instalada ni patch downstream.

### Proyecto wandori.us (glory-rust-template)

- [x] **`README.md` (raíz)** — documentar `npm run task:check`, el quality gate unificado, Sentinel y VarSense; aclarar que el runtime global aún no está instalado y que los wrappers directos no sustituyen el gate.
- [x] **`roadmap-sentinel.md`** — corregir la contradicción de `runVarsense`: el adaptador real invoca `varsense all`; `scan` y `orphan-classes` quedan como compatibilidad CLI.
- [x] **`Agente/documentacion/herramientas/matriz-paridad-sentinel-varsense-2026-08-01.md`** — añadir nota sobre `all`/`tokenDetection`/portable rules, copia instalada frente a repos `main`, lockfile, branch-key y límites del runtime global.
- [x] **`Agente/documentacion/indice-documentacion-2026-07-29.md`** — enlazar el estado de versiones, hashes, ramas y retención mediante el plan global y los manifiestos canónicos.

**Gate del inventario:** cada ítem cierra con evidencia (commit en el repo de la herramienta o en el proyecto) y el catálogo de reglas del README de Sentinel debe coincidir con `ruleRegistry.ts` del `main` externo consumido por `sourcePathEnv`. **Cerrado el 2026-08-04:** Sentinel `main=9f4ed4d` y VarSense `main=858ec62` están publicados; `quality-tools.json` y `sentinel.lock.json` fijan commit, capacidades y hash de archive mediante la variable de entorno; el preflight valida el realpath en memoria, y las copias `.quality-tools/sentinel`/`.quality-tools/varsense` fueron retiradas.

## Definition of Done

- [x] El contrato local de política v2 no depende de una rama ni de archivos externos; el runtime global equivalente sigue bloqueado por ausencia del runtime upstream.
- [x] `doctor --migrate --dry-run` es reversible y no escribe archivos.
- [x] El guard de transición mantiene compatibilidad con v1 y aplica `enforce`/`observe` para v2 válida.
- [ ] El runtime global de Sentinel no depende de una rama ni de archivos del repositorio actual. *(bloqueado por runtime upstream ausente)*
- [ ] Un proyecto sin `sentinel.config.json` puede ejecutar libremente sus comandos.
- [ ] Un proyecto con `sentinel.config.json` puede exigir su propio gate, comandos y conjunto de analizadores.
- [ ] `sentinel analyze` conserva compatibilidad con el CLI/LSP/VS Code actual y `sentinel check` produce el reporte único del gate.
- [ ] VarSense se ejecuta como analyzer versionado con findings normalizados, sin cooldown, scheduler o reporte de cierre paralelo.
- [ ] La migración v1→v2 de configuración y `quality.config.json`/`quality-tools.json` tiene dry-run, backup, rollback y compatibilidad temporal.
- [ ] Sentinel permite completar su propio gate mediante lease controlado sin que sus hijos sean bloqueados por los shims.
- [ ] Cambiar de rama actualiza la política sin reiniciar VS Code ni reinstalar perfiles.
- [ ] `sentinel doctor`, CI y los shims muestran decisiones coherentes en PowerShell 5/7, CMD y Bash/Git Bash.
- [ ] Tests de contrato, matriz multi-proyecto, type-check, Sentinel/VarSense y documentación pasan.
- [ ] Existe rollback probado y no quedan rutas hardcodeadas a `C:\Users\...\glory-rust-template` en perfiles globales.

## Fuera de alcance de este plan

- Definir qué comandos y analizadores necesita cada proyecto; eso pertenece a su `sentinel.config.json`.
- Ejecutar automáticamente el gate por el agente; el guard solo impide bypass y recomienda el comando canónico.
- Cambiar reglas de Coolify, deploy o SSH; esas políticas siguen siendo globales y separadas.
- Convertir Sentinel en un editor o reemplazar la extensión/LSP de VarSense; ambos siguen siendo presentaciones/adapters del mismo contrato.
