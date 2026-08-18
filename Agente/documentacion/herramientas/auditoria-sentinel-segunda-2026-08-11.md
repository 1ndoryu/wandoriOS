# Segunda auditoría de Sentinel y del quality gate

**Fecha:** 2026-08-11
**Proyecto auditado:** `glory-rust-template`
**Rama declarada:** `wandorius`
**Alcance:** estado real posterior a la auditoría del 2026-08-10: instalación en proyectos nuevos, separación Sentinel/gate, bootstrap, scripts personalizados, documentación, release/lock, rendimiento, tests, VSIX y operación coordinada.
**Tipo:** auditoría con remediación local y trazable. Se corrigieron los defectos evidenciados, se publicaron
las releases correctivas y se repinearon ambos consumidores sin copiar `scripts/quality`.

> **Reauditoría de seguimiento — corte final:** se repitió el preflight, el gate y la
> comprobación de runtime en worktrees limpios. Sentinel `0.7.4` (`0349485c`, tag `v0.7.4`) incorpora
> la corrección POSIX de la matriz de shells, resolución portable de ejecutables PowerShell y los
> diagnósticos de CI. `npm run lint` queda en 0 errores/12 warnings, `npm run test:unit` en 558
> passing/1 pending y `npm audit --omit=dev` en 0 vulnerabilidades. El audit completo conserva 1 high
> y 1 moderate únicamente en la cadena de pruebas de Mocha; no afecta al runtime publicado y queda
> registrado como deuda upstream separada. Las CI consecutivas de `main` #45 y #46 pasan; la matriz
> focal de portabilidad pasa en Ubuntu y Windows local.

> En `glory-rs-rest`, `gate:check -- 1e --profile docs` pasó tras repinar a `0.7.4` (Sentinel 5.0 s,
> docs 2.5 s) con 0 errores; los cinco hallazgos `broadcast-mutex-riesgo-rs` siguen presentes en
> Markdown/JSON como `warning` de política del fanout SSE. La suite del adapter pasó 232/232 pruebas
> ejecutables (1 omitida) en 115.8 s. La adopción se publicó como `3cd9e655`; el worktree real sucio
> del usuario no se modificó.

## Veredicto

**La instalación y operación local quedan corregidas para Sentinel `0.7.4` y VarSense `2.2.1` en los dos consumidores auditados.** Doctor, lock, gates y suites pasan; glory-rs-rest conserva cinco findings de producto `broadcast-mutex-riesgo-rs` como warnings explícitos y visibles. El rollback real `0.7.1 → 0.7.0 → 0.7.1` pasó y el runtime quedó restaurado en `0.7.4`. La capa A (shims/guards duplicados del repositorio) fue retirada después de verificar PATH, enforcement exit 78 y rollback reversible. La capa B sigue siendo el adapter/orquestador y no se retira por el mismo commit.

El fix de bootstrap se detectó durante la comprobación de instalación limpia: antes, `init --json` devolvía un plan pero no escribía los tres archivos. Se corrigió, se cubrió con prueba upstream y se publicó en `v0.7.1`; Sentinel `0.7.4` lo conserva y ambos consumidores ya apuntan a la release vigente.

## Reauditoría 2026-08-12 — corte actual

**Veredicto actual:** `OK / CAPA A RETIRADA; CAPA B CONDICIONADA`. El contrato local está listo y reproducible con Sentinel
`0.7.4`; la diferencia entre gate y Sentinel queda cerrada: el gate es
la ejecución/decisión; Sentinel es el motor y autoridad que la produce.

| Área | Evidencia fresca | Estado |
| --- | --- | --- |
| Release upstream | `0349485c`, `main`, `v0.7.4` | Publicado |
| Setup/readiness wandorius | runtime activo `0.7.4` (SHA-256 `b8c2d477…a49e7971`), doctor `ready:true`, `readyForAnalyze:true`, `readyForGate:true`, `issues:[]`; lock match | PASS |
| Gate canónico wandorius | `npm run gate:check -- 108A-6 --profile docs`: PASS, Sentinel 1.5 s + docs 1.4 s, 0 errores | PASS |
| Suite adapter wandorius | `quality:test`: 233 tests, 232 PASS, 1 omitido, 0 fallos, 20.0 s; el test del wrapper retirado ya no existe | PASS |
| Upstream Sentinel | lint 0 errores/12 warnings; compile + `test:unit`: 558 passing, 1 pending | PASS local |
| Seguridad | `npm audit --omit=dev`: 0; audit completo: 1 high + 1 moderate solo en dependencias de Mocha | Observación upstream |
| VSIX | `glory-sentinel-0.7.4.vsix`, 951778 bytes, SHA-256 `BF01826858219A6A97CB42DB6A55FC6CE08696E3C1B9BE295DB18B6CD7B76BE5` | Generado |
| Segundo consumidor | `glory-rs-rest@3cd9e655`: doctor/lock PASS, gate docs PASS (5.0 s + 2.5 s), suite 233 tests: 232 PASS/1 omitida; 5 findings broadcast visibles como warnings | PASS con policy explícita |
| CI remoto | Sentinel Actions #45 (`dbf3ed3`) y #46 (`0349485c`) pasan consecutivamente | PASS |

La política `broadcast-mutex-riesgo-rs: warning` no elimina la regla ni oculta hallazgos: conserva los
cinco findings en los reportes y documenta que `tokio::sync::broadcast` es la abstracción intencional para
fanout SSE. Si la arquitectura cambia, debe volver a error y resolverse con un cambio de producto, no con
un script local.

## 1. Evidencia ejecutada

Se usó el CLI fijado en `tools/sentinel/out/cli/index.js` y se respetó la rama `wandorius`.

| Comprobación | Resultado | Lectura correcta |
|---|---|---|
| `sentinel --help` | PASS | El CLI expone `init`, `migrate`, `doctor`, `check`, `task`, `guard`, `rollback` y `uninit`. |
| `sentinel doctor --json` | PASS | `ready:true`, `readyForAnalyze:true`, `readyForGate:true`, `issues:[]`; Sentinel y VarSense tienen release evidence coherente con sus pins. |
| `sentinel task status --project-root . --json` | PASS | 0 tareas, locks expirados, huérfanos, worktrees o ramas huérfanas. |
| `sentinel check 108A-6 --dry-run --workspace . --profile docs` | PASS | El planner calcula alcance documental; el dry-run no demuestra que el gate ejecutable esté listo. |
| `npm run quality:doctor -- --json` | PASS | Wrapper delegado al CLI fijado; reporta readiness real, lock, capacidades y evidencia. |
| `npm run quality:lock -- --check` | PASS | Match de configuración, gitlink y lock en entorno soportado. |
| `npm run gate:check -- 108A-6 --profile docs` | PASS | Sentinel 9.9 s, docs 1.6 s, total 11.9 s; reporte estructurado con política `enforce` y decisión PASS. |
| `npm run task:check -- 108A-6 --profile docs --fresh` | PASS | Repetido con PATH completo y con `GlorySentinel` filtrado del PATH; ambos cierres PASS sin depender del runtime de desarrollo. |
| Regresión de transporte de stages | PASS | `observe-integration.test.mjs`: 5 pruebas ejecutables (perfil, `--full`, `--ci`, wrapper y rechazo) + 1 skip de observe-compare. |
| `npm run quality:test` | PASS | 232 PASS, 1 omitido, 0 fallos, 20.0 s; el test exclusivo de la capa A fue retirado y los fixtures de cuota ya no escriben cientos de MB/GB por test. |
| `node --test scripts/quality/tests/target-maintenance.test.mjs` | PASS | 5/5 en 272 ms. |
| `node --test scripts/quality/tests/sentinel-doctor.test.mjs scripts/quality/tests/gate-check-policy.test.mjs` | PASS | 8/8; cubre CLI fijado resuelto/ausente/error, propagación de exit code, política omitida/inválida y gate fail-closed. |
| `sentinel init --dry-run` en proyecto temporal | PASS | Solo planifica `sentinel.config.json`, `sentinel.lock.json` y `.sentinel/init-manifest.json`; no crea carpetas privadas ni scripts. |
| `sentinel init --json` + prueba upstream | PASS en release adoptada | 8 pruebas bootstrap PASS; corrección incluida en Sentinel `0.7.4 @ 0349485c`. |
| VarSense cold instrumentado sobre workspace real | PASS de rendimiento | Causa aislada: recorridos repetidos de workspace en `classIndex`; VarSense `2.2.1 @ 88f281f` queda bajo el presupuesto de 6 s. |
| VSIX smoke test | PASS | Instalación en perfil VS Code aislado; extensión `1ndoryu.glory-sentinel` instalada correctamente. |
| `sentinel migrate --project-root . --json` | PASS diagnóstico histórico | Detectó 17 scripts antes de la retirada; el inventario conserva la clasificación y la capa A redundante fue retirada con rollback. |

Rastro reproducible de la tabla: `quality-tools.json`, `sentinel.lock.json`, `.sentinel/release-evidence/*.json`, `.quality-bench/baseline-small.json`, `.quality-reports/check/108A-6/latest.md` y las pruebas `scripts/quality/tests/sentinel-doctor.test.mjs`, `scripts/quality/tests/gate-check-policy.test.mjs` y upstream `tools/sentinel/src/test/suite/projectInit.test.ts`.

### Pins y release evidence

| Herramienta | Pin del consumidor | Evidencia encontrada |
|---|---|---|
| Sentinel | `0.7.4 @ 0349485c121784513c7ecef8a8de1535e841a5ae` | Publicado en `refs/heads/main` y `refs/tags/v0.7.4`; compile + 558 pruebas + staging limpio. |
| VarSense | `2.2.1 @ 88f281f94e6febd02a386b7ed03d30d285eb82e1` | Publicado en `refs/heads/release/2.2.1` y `refs/tags/v2.2.1`; compile + 61 pruebas + staging limpio. |
| Runtime global activo | `0.7.4` | Coincide con source/lock; `activeVerified:true`, SHA-256 `b8c2d477589d5a2c04bf9b3a86b631247a926829fc8155176954ea46a49e7971`. |

Los checkouts consumidos de Sentinel y VarSense están limpios y detached en los commits publicados; los
gitlinks, `quality-tools.json`, `sentinel.lock.json`, release refs y release evidence coinciden. El
worktree real de glory-rs-rest conserva cambios previos del usuario y no se modificó; la adopción se
verificó en un worktree limpio y se publicó en `origin/glory-rs-rest`.

## 2. Qué sí se completó desde la auditoría anterior

- La autoridad conceptual está mejor encaminada: `package.json` declara `gate:check`, y `scripts/quality/gate-check.mjs` delega la decisión en `sentinel check` con un manifest `--stages`.
- `sentinel.config.json` declara explícitamente `gate.command = ["sentinel", "check", "--"]`, `taskIdRequired` y la rama primaria `wandorius`.
- El lock alinea Sentinel y VarSense por commit, versión, capacidades y schema.
- Existen rutas de bootstrap/migración (`sentinel init`, `sentinel migrate`, `sentinel uninit`) y la migración ya enumera riesgos en vez de borrar scripts a ciegas.
- No hay tareas activas, locks ni worktrees huérfanos en el estado actual.
- Hay reportes local-light recientes con PASS y caché efectiva: `018A-73` tardó 7.325 s y `038A-2` 4.734 s; estos resultados solo cubren cambios documentales y no prueban el gate completo.
- Existe el VSIX histórico `tools/sentinel/glory-sentinel-0.7.0.vsix`, empaquetado desde `ea8f47e`, SHA-256 `337BD7983B1D33D4BA239D236F379709F1472BB5981DEE5F336589C7883B65A8`; se instaló en un perfil limpio de VS Code y el smoke test pasó. El VSIX 0.7.1 también fue generado y su hash queda en la evidencia de release; instalarlo es una distribución del editor separada del gate del consumidor.

## 3. Qué sigue incompleto

### 3.1 Release y readiness

El bloqueo de readiness quedó resuelto para Sentinel `0.7.4` y VarSense `2.2.1`: `quality:setup` generó evidencia
compile + suite en staging limpio, `quality:lock --check` pasó y `doctor` devolvió `ready:true`,
`readyForAnalyze:true`, `readyForGate:true` e `issues:[]` en ambos consumidores.

En el corte anterior la evidencia local no equivalía a CI verde. Tras publicar el fix POSIX y ejecutar el
workflow diagnóstico, las dos ejecuciones consecutivas actuales de Sentinel son verdes: [#45](https://github.com/1ndoryu/glory-sentinel/actions/runs/31558207591) y [#46](https://github.com/1ndoryu/glory-sentinel/actions/runs/31558407186). Los fallos #36–#42 se conservan abajo como historia y ya no bloquean el corte actual.

La evidencia histórica registraba que, tras fast-forwardear los `main` anteriores,
VarSense terminó su run [#8 en success](https://github.com/1ndoryu/varsense/actions/runs/31551341521),
pero Sentinel terminó el [#39 en failure](https://github.com/1ndoryu/glory-sentinel/actions/runs/31551339627).
La consulta histórica de Actions también muestra `main` en fallo en los tres runs anteriores:
[#36](https://github.com/1ndoryu/glory-sentinel/actions/runs/31372934670),
[#37](https://github.com/1ndoryu/glory-sentinel/actions/runs/31379295222) y
[#38](https://github.com/1ndoryu/glory-sentinel/actions/runs/31380898957). Por eso el criterio de retirada
no se marcaba como cumplido; esa conclusión queda superada por #45/#46 y la release `v0.7.4`.

### 3.2 Gate frente a Sentinel

No deben ser dos productos. La distinción operativa correcta es:

- **Sentinel:** producto/CLI/runtime que contiene análisis, políticas, `check`, coordinación opcional de tareas, doctor, guard y gestión de releases.
- **Gate:** una ejecución de cierre y su decisión (`PASS`, `FAIL`, error de herramienta o cobertura no ejecutada). En este proyecto la entrada canónica es `gate:check`, que prepara el manifest y delega en `sentinel check`.
- **`sentinel task gate`:** variante coordinada para un worktree reclamado; no es un tercer gate.

La autoridad de decisión ya es única. La capa B de `scripts/quality` no es un segundo gate: transporta stages y adapters específicos que todavía no cubre Sentinel Core y tiene su propia fecha de retirada (SNT-10). La capa A duplicada ya no existe en la rama vigente.

### 3.3 Scripts personalizados y carpetas privadas

`sentinel migrate` detectó 17 scripts npm y advirtió que `scripts/quality` contenía lógica propia de gate. Esto confirma la preocupación del usuario: una carpeta creada por agentes puede convertirse en una copia permanente del mini-gate y preservar defectos. Ya se clasificaron en el inventario; la carpeta no se copia a proyectos nuevos. La capa A redundante se retiró; solo se conserva la capa B con ownership explícito y sunset SNT-10.

La política correcta no es borrar toda carpeta personalizada ni conservarla por costumbre:

1. inventariar cada script, entrada, regla y consumidor;
2. asignar ownership: Core Sentinel, adapter del proyecto, herramienta de producto, fixture/test, compatibilidad temporal o desconocido;
3. demostrar paridad con `sentinel check` cuando el script pretenda ser gate;
4. migrar lo que deba vivir en Sentinel/adapter;
5. retirar solo lo que tenga sustituto, evidencia y rollback;
6. bloquear la creación de nuevos mini-gates fuera de las rutas declaradas.

`check:back` y `check:front` parecen adapters específicos del producto; no deben borrarse sin comprobar sus responsabilidades. En cambio, `task:check`, `gate-check`, stages, locks, reportes y wrappers deben seguir una matriz de ownership y una fecha de retiro. La existencia de la carpeta no es evidencia de que sea necesaria ni de que sea obsoleta.

### 3.4 Rendimiento y escalabilidad

La línea base persistida del 2026-08-05 contiene 9 muestras: total p50 4.434 s y p95 26.395 s; VarSense p50 13.044 s y p95 15.984 s; frontend p95 6.881 s; rust p95 7.811 s. Esa medición motivó el fix upstream. La instrumentación sobre el workspace real aisló `classIndexMs` como cuello: el provider recorría el árbol repetidamente para cada patrón. Tras consolidar los patrones en un recorrido y cachear el snapshot por exclusiones, el release publicado `2.2.1 @ 88f281f` midió cold ~3.3 s y warm ~2.8 s (tres ejecuciones, sin cambio de hallazgos), por debajo del presupuesto de 6 s.

Existe una baseline en `.quality-bench/varsense/benchmark.json` (120 archivos, 4 modos, 2 muestras, ~61 MB RSS). Con el pin publicado, el gate frontend de wandorius midió VarSense en 5.913 s, bajo el presupuesto configurado de 6 s; la optimización upstream también midió cold ~3.3 s y warm ~2.8 s. La mejora conserva la cobertura y elimina los recorridos repetidos del workspace.

La suite del consumidor cerró en 20.0 s (233 tests: 232 PASS, 1 omitido). Sigue siendo más pesada que un
lint puntual, pero ya no está bloqueada por ENOSPC ni por el timeout ambiental anterior. La suite upstream
de VarSense pasó 61 pruebas tras la optimización; Sentinel pasó 558 pruebas (1 pending) más compile,
check-core y smoke.

### 3.5 Documentación y VSIX

El README y el VSIX ya son más accesibles que en la auditoría anterior. El README ahora explica `gate:check`, el adapter, el lock y la release evidence, y `quality:doctor` delega al CLI canónico. La documentación distingue runtime instalado, análisis listo y gate listo.

El VSIX 0.7.4 fue generado desde el commit publicado (`951778` bytes, SHA-256 registrado arriba). La
extensión de VS Code y el runtime del gate son artefactos distintos; ninguno sustituye silenciosamente el
pin del otro.

### 3.6 Dependencias del upstream

`npm audit --json` sobre Sentinel 0.7.1 reportó 11 vulnerabilidades en dependencias de desarrollo (10
high, 1 moderate, 0 critical); GitHub además mostró 12 alertas en el push a `main` (9 high, 3 moderate).
La mayoría afecta ESLint/TypeScript, minimatch, picomatch, js-yaml y Mocha. No se aplicó un upgrade mayor
automático porque puede cambiar el contrato de lint/test; queda como tarea upstream separada con staging,
suite y revisión de compatibilidad antes de publicar otra release.

## 4. Estado de la auditoría anterior

| Compromiso | Estado en esta segunda auditoría |
|---|---|
| Autoridad única `sentinel check` | **Completado en decisión:** `gate:check` delega el cierre; el adapter sigue como transporte y capa B temporal. |
| Bootstrap de proyecto nuevo sin copiar `scripts/quality` | **Completado:** `sentinel init` solo administra tres archivos; `init --json` escribe correctamente y tiene prueba en 0.7.1. |
| `doctor` diferenciando análisis y gate | **Completado:** CLI y `npm run quality:doctor` devuelven `readyForAnalyze` y `readyForGate`. |
| Release evidence del pin actual | **Completado:** evidencia compile + suite + staging limpio para Sentinel 0.7.4 y VarSense 2.2.1. |
| Segunda release verde + rollback | **Completado:** #45/#46 verdes, matriz focal y gates pasan; rollback histórico y rollback de salida reproducible. |
| Retirada física de capas A/B | **Capa A completada:** shims/guards duplicados retirados; capa B permanece como adapter project-owned hasta SNT-10. |
| Inventario/ownership de scripts personalizados | **Completado para el estado actual:** los 17 scripts tienen owner, destino y condición de retiro en el inventario; no hay etapa `custom` conectada al adapter vigente. |
| Presupuesto de rendimiento | **Completado para el pin publicado en wandorius:** VarSense 5.913 s en gate frontend y cold/warm instrumentado bajo 6 s; se conserva el histórico fuera de presupuesto como comparación. |
| Suite completa de calidad | **Completada:** 233 tests, 232 PASS, 1 omitido, 0 fallos, 20.0 s; el test exclusivo de la capa A fue retirado y los fixtures de cuota ya no consumen GB reales. |
| VSIX instalable y probado | **Completado:** instalación aislada y extensión visible. |

## 5. Plan de corrección por fases

Checklist actualizado con la remediación ejecutada el 2026-08-11. Las casillas abiertas son pendientes
reales; no se marcan como cerradas por documentación o por un PASS histórico.

### F0 — Entorno reproducible y ownership

- [x] Ejecutar las comprobaciones desde el runner soportado con ownership válido; los fallos iniciales de sandbox quedaron separados de los resultados finales.
- [x] Verificar lock, doctor y gate sin cambiar globalmente `safe.directory`.
- [x] Repetir doctor, lock, suite y gate y conservar rutas/códigos en este informe.
- [x] Registrar sistema, rama, commits, comandos, rutas de salida y códigos de retorno.

### F1 — Readiness y evidencia de release

- [x] Ejecutar el setup oficial para Sentinel `b22c848` y corregir el uso incompatible de `tar --force-local` en Windows.
- [x] Generar evidencia `compile + suite + clean staging` para los commits publicados.
- [x] Verificar que la evidencia corresponde al hash fijado.
- [x] Ejecutar `sentinel doctor --json` con las tres banderas de readiness en `true`.
- [x] Comprobar lock con el comando oficial.

### F2 — Gate canónico reproducible

- [x] Resolver la ejecución final de Git en el entorno soportado sin modificar globalmente `safe.directory`.
- [x] Ejecutar `npm run quality:lock -- --check`.
- [x] Ejecutar `npm run gate:check -- 108A-6 --profile docs` y conservar reporte estructurado.
- [x] Probar el camino PASS y mantener diferenciados FAIL, error de herramienta, cancelación y cobertura no ejecutada en el contrato/reportes.
- [x] Hacer que `quality:doctor` delegue al doctor canónico; conservar `--migrate` y `--lock` como modos explícitos de compatibilidad.

### F3 — Segunda release y rollback

- [x] Publicar Sentinel `v0.7.1` (`b22c848`) y VarSense `v2.2.1` (`88f281f`) con refs verificables.
- [x] Adoptar ambos releases en wandorius y glory-rs-rest sin copiar `scripts/quality`.
- [x] Ejecutar setup, doctor, lock y gate canónico en ambos; el gate de glory-rs-rest conserva cinco findings de producto `broadcast-mutex-riesgo-rs`.
- [x] Probar rollback real del runtime `0.7.1 → 0.7.0 → 0.7.1`; `activeVerified:true` y doctor listo al restaurar.
- [x] Conservar hashes, reportes, commits y comandos en este informe y en `evidencia-release-sentinel-071-varsense-221-2026-08-11.md`.
- [x] Completar dos ejecuciones CI consecutivas verdes y la matriz multi-shell focal exigidas por el runbook: Sentinel #45/#46 y suite local Windows.
- [x] Completar PATH sin runtime de desarrollo, smoke de enforcement y rollback de salida; retirar únicamente la capa A con paridad demostrada.

### F4 — Inventario y retirada segura de scripts

- [x] Crear la tabla por script con propósito, owner, entradas/salidas, consumidor, sustituto y condición de retiro.
- [x] Corregir el transporte de perfiles explícitos: el manifest ahora pasa `--profile/--full/--ci` al proceso hijo y tiene regresión automatizada.
- [x] Clasificar los 17 scripts detectados por `sentinel migrate`.
- [x] Retirar la etapa `custom` del adapter; separar Core Sentinel de adapters específicos `check:back`/`check:front`.
- [x] Mantener compatibilidad temporal con warnings y telemetría de uso; la policy `broadcast-mutex-riesgo-rs` sigue visible.
- [x] Eliminar solo wrappers duplicados con paridad demostrada, PATH sin runtime de desarrollo y rollback preparado.
- [x] Mantener la regla en `AGENTS.md` y `quality-gate-setup`: no crear carpetas personales, analyzers ni
      reglas sin project-owner, fixture, presupuesto, owner único y sunset; una finalidad desconocida bloquea.

### F5 — Rendimiento y escalabilidad

- [x] Regenerar `.quality-bench` con fixtures pequeños y alcance representativo; conservar la medición fallida como cobertura no válida.
- [x] Corregir el falso ENOSPC de `target-maintenance.test.mjs` (fixtures de MB, no GB) y cerrar `quality:test`.
- [x] Medir al menos clean/incremental y registrar p50/p95 por etapa en `.quality-bench/baseline-small.json`.
- [x] Declarar explícitamente que el cold path histórico de VarSense (12.665 s) estaba fuera del presupuesto de 6 s.
- [x] Repetir con muestras suficientes y carga real para validar la corrección: 3 ejecuciones instrumentadas, cold ~3.3 s y warm ~2.8 s.
- [x] Publicar/adoptar `88f281f`, repetir gate y conservar el presupuesto del pin consumido.
- [x] Repetir gate y suite después de Sentinel 0.7.4; root 33.0 s (249: 248/1 skip), segundo consumidor 115.8 s (232/1 skip).
- [ ] Evaluar paralelismo seguro de etapas sin romper locks, disco ni determinismo; queda como mejora separada, no como requisito de retirada.

### F6 — Documentación y VS Code

- [x] Reescribir el quickstart para explicar primero qué resuelve Sentinel.
- [x] Documentar runtime instalado / análisis listo / gate listo.
- [x] Documentar migración de proyectos viejos y la decisión conservar/migrar/retirar scripts personalizados.
- [x] Verificar el VSIX empaquetado para el commit adoptado.
- [x] Instalarlo en un VS Code limpio y ejecutar smoke test.
- [x] Actualizar README, skill, inventario y roadmap sin crear otra carpeta personal de gate.

### F7 — Fix de bootstrap detectado en esta revisión

- [x] Reproducir que `sentinel init --json` no escribía archivos aunque reportara `create`.
- [x] Corregir `tools/sentinel/src/cli/bootstrapCommands.ts` para que JSON cambie solo la representación,
      no la aplicación; conflictos conservan exit 1.
- [x] Añadir prueba `init --json` que verifica config, lock y manifest.
- [x] Ejecutar compile y prueba bootstrap: 8/8 PASS con `--ui tdd --timeout 10000`.
- [x] Publicar/adoptar `tools/sentinel@0349485c` (`0.7.4`), regenerar evidence/lock y repetir doctor/gate. El VSIX 0.7.4 queda generado como distribución separada del gate.

## 6. Criterio de retirada y próxima revisión

La adopción, la corrección de instalación y la retirada de la capa A están cerradas. La capa B no es un
pendiente accidental: es el adapter project-owned que permanece hasta SNT-10. El criterio ya verificado
para la capa A fue el runbook §3:

- `sentinel doctor` devuelve las tres banderas de readiness en `true` para los pins actuales;
- lock, gitlink, checkout, release refs y release evidence apuntan al mismo commit;
- el gate canónico se ejecuta en un checkout limpio y produce decisión estructurada;
- existe evidencia de segunda release y rollback (F3 completada), además de CI/matriz/gates verdes;
- cada script personalizado tiene owner y destino; los duplicados retirados tienen paridad y rollback;
- la suite completa y los benchmarks tienen límites medidos, incluyendo la excepción cold de VarSense;
- README, skill, manuales, VSIX y roadmap describen el mismo flujo;
- no quedan carpetas privadas creadas por agentes fuera del ownership declarado.

**Conclusión:** la instalación, bootstrap, readiness, lock, rendimiento y adopción multi-consumidor quedan corregidos en Sentinel `0.7.4`/VarSense `2.2.1`; el rollback real y el rollback de salida también están verificados. Sentinel y gate son una sola autoridad de decisión (`gate:check` prepara; `sentinel check` decide), mientras `task:check` queda como alias de compatibilidad de la capa B. No se deben borrar ni copiar carpetas personalizadas por nombre: la capa A redundante ya fue retirada con evidencia, y la capa B permanece hasta SNT-10 con ownership/sunset explícitos. El baseline `broadcast-mutex-riesgo-rs` de glory-rs-rest queda como deuda de producto separada y visible, no como falso PASS.
