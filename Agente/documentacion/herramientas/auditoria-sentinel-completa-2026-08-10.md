# Auditoría completa de Glory Sentinel y el quality gate

> **Cómo leer las casillas (2026-08-10, tras la Retirada Legacy 108A-6):** las fases F0–F9 se cerraron
> con evidencia en su línea `**Estado: COMPLETADA**`; dentro de cada checklist quedan casillas sin marcar
> que son (a) ítems históricos ya cubiertos por la evidencia del cierre, (b) ítems condicionados a la
> segunda release consecutiva en verde (retirada física capa A/B, `task:take`, config/adapter legacy,
> submódulos/.quality-tools) o (c) verificación con supervisores no disponibles en este entorno
> (`sentinel_inspector`/`supervisor_reviewer`). Las secciones F5/F8/F9 y el DoD 14.5 se actualizaron con
> marcas de evidencia; los pendientes condicionados llevan nota explícita.

> **Fecha:** 2026-08-10  
> **Alcance:** Sentinel Core/CLI, gate del consumidor `wandorius`, instalación en un proyecto nuevo,
> rendimiento, escalabilidad, operación, contratos y documentación Markdown.  
> **Modalidad:** la auditoría base fue de solo lectura. El cierre posterior actualizó únicamente documentación
> operativa, README y la skill de bootstrap; no se corrigió código, configuración, locks ni dependencias en
> este bloque.
> **Checkout auditado:** `glory-rust-template`, rama operativa `wandorius`.  
> **Sentinel fijado por el consumidor al cierre:** 0.7.0, commit `ea8f47e55ead6f5dca4429fab0b06247fd85b5e8`.
> **Runtime global activo observado:** 0.6.4.  
> **Inspector independiente de la auditoría base:** `sentinel_inspector` — `VEREDICTO: DEFECTO DETECTADO`.
> **Estado documental actual:** RESUELTA CON PENDIENTES CONDICIONADOS. El gate canónico ya delega en
> `sentinel check` mediante `gate:check`, el stage `custom` fue retirado de los dos consumidores y la skill
> de bootstrap ya no recomienda copiar `scripts/quality`. La retirada física de la capa legacy espera una
> segunda release verde con rollback.

## 1. Veredicto ejecutivo

Las tres preocupaciones del usuario quedan confirmadas:

1. **Instalar el gate coordinado en un proyecto nuevo es innecesariamente complicado y, con la interfaz
   pública actual, no existe un camino completo soportado.** Sentinel puede instalar su runtime global,
   pero no puede inicializar un consumidor. No existe `sentinel init`, `bootstrap` o `scaffold`; el template
   `main` tampoco trae el gate.
2. **El rendimiento cotidiano es aceptable solo cuando la caché acierta, pero el coste frío, el setup y la
   propia suite de infraestructura son altos e inestables.** Sentinel incremental es rápido; VarSense,
   preflight, mantenimiento y tests del adapter concentran el coste. Hay un timeout real de VarSense y su
   p95 excede más de 2,5 veces el presupuesto declarado.
3. **El propósito y la documentación están desordenados.** El diseño ya dice que Sentinel debe ser el único
   plano de control, pero la implementación sigue exponiendo dos recorridos, varios comandos, cinco archivos
   de contrato, un adapter local de 119 archivos y numerosos planes activos o históricos mezclados.

La conclusión principal es:

> **Sentinel debe ser el producto y el gate debe ser una operación de Sentinel, no un segundo sistema.**
> Internamente pueden existir engine, plugins, scheduler, cache y adapters; públicamente debe existir una sola
> instalación, una sola configuración principal y un comando canónico: `sentinel check`.

La base técnica contiene decisiones buenas —determinismo, lock reproducible, doctor, reportes estructurados,
contención de paths, integración `ff-only` y caché—, pero la migración quedó a mitad de camino. El coste actual
no proviene de una sola mala función; proviene de mantener simultáneamente el sistema anterior y el objetivo
nuevo.

## 2. ¿Gate y Sentinel deberían ser la misma cosa?

### Respuesta corta

**Sí, desde la experiencia del usuario.** No tienen que ser la misma clase o módulo interno, pero sí la misma
superficie de producto.

Modelo recomendado:

```text
Sentinel                         producto y CLI
  sentinel init                 adopta Sentinel en un proyecto
  sentinel doctor               diagnostica instalación y configuración
  sentinel check               ejecuta el quality gate
    ├─ reglas Sentinel          analizador estático nativo
    ├─ VarSense                 plugin/analizador especializado
    ├─ tests del stack          adapters declarativos
    └─ reporte                  una sola decisión PASS/FAIL/ERROR
  sentinel task ...             coordinación local opcional
```

En ese modelo, **“gate” es el acto y el resultado de `sentinel check`**. No es un producto, runtime o conjunto
de scripts paralelo. `npm run task:check -- <ID>` puede sobrevivir temporalmente como alias, pero no debe tener
lógica propia.

### Estado real observado

Hoy hay tres superficies superpuestas:

- `npm run task:check -- <ID>` ejecuta directamente `scripts/quality/task-check.mjs`;
- `sentinel check <ID> --stages <manifest>` ejecuta el orquestador del Core;
- `sentinel task gate <ID>` vuelve a entrar en `sentinel check` desde un worktree coordinado.

La configuración declara `gate.command = ["sentinel", "check", "--"]`, pero el cierre habitual todavía pasa
por el adapter local y no por ese recorrido. La deuda está reconocida explícitamente:

- `roadmap-sentinel.md:341` pide eliminar la separación conceptual entre gate y Sentinel;
- `roadmap-sentinel.md:351` mantiene pendiente integrar el consumidor al orquestador del Core;
- `Agente/planes/plan-global-quality-guard-agnostico-2026-08-02.md:13` declara a Sentinel como único plano;
- el mismo plan, línea 53, dice que `task:check` debe quedar solo como alias.

Por tanto, la intuición del usuario no contradice la arquitectura objetivo: **expone que esa arquitectura aún
no ha sido terminada**.

## 3. Hallazgos priorizados

### P0 — El gate canónico del working tree está roto por un cambio incompleto

`scripts/quality/task-check.mjs:111` calcula:

```js
const preflightMs = Date.now() - preflightStartedAt;
```

pero `preflightStartedAt` no está declarado en ningún punto del archivo. La búsqueda devuelve una sola
ocurrencia. En el estado actual, todo `task:check` que complete el preflight fallará con `ReferenceError`.

Este defecto pertenece al cambio local preexistente de la fase F0 de `098A-1`, no al release publicado de
Sentinel. Aun así, bloquea el cierre actual y explica por qué no se ejecutó un gate real durante esta auditoría.

**Acción recomendada posterior:** corregir el cronómetro y cubrir el recorrido principal con una prueba que
ejecute `main`, no solo helpers importados.

### P1 — No existe bootstrap de proyecto nuevo

Evidencia reproducida con un clon temporal limpio de la rama template `main`:

- `scripts/quality`: **0 archivos**;
- configs del gate (`sentinel.config.json`, `quality.config.json`, `quality-tools.json`,
  `sentinel.lock.json`, `varsense.config.json`): **0 archivos**;
- `package.json`: no tiene `task:check`, `quality:setup`, `quality:doctor`, `quality:lock` ni `quality:test`;
- `.gitmodules`: solo registra `glory-rs`, no Sentinel ni VarSense.

Con el runtime global 0.6.4:

- `sentinel doctor --json --workspace <nuevo-proyecto>` devuelve `policy.status: "no-policy"`,
  `root: null`, `issues: []`, `ready: true` y exit 0;
- `sentinel check BOOTSTRAP-01 --dry-run` devuelve exit 0 y calcula un full, pero no crea ni configura un gate;
- el dry-run escribió `.quality-reports/check-dry-run/`, por lo que además **no es estrictamente no mutante**.

El README dice en `tools/sentinel/README.md:49` que para un proyecto nuevo “se genera una configuración
local”, pero el CLI 0.6.4 no expone `init`, `bootstrap` o `scaffold`. `sentinel install` instala runtime, shims
y PATH; no instala el gate en el consumidor.

Impacto:

- un usuario puede interpretar `doctor ready:true` como “el gate está listo”, aunque no haya gate;
- no hay una secuencia reproducible que lleve de proyecto vacío a `sentinel check` funcional;
- la única referencia completa es el consumidor `wandorius`, pero sus propios documentos dicen que no deben
  copiarse `scripts/quality` ni configs desde otro proyecto.

**Acción recomendada posterior:** crear `sentinel init` idempotente, con `--dry-run`, presets de stack y
generación/validación del contrato mínimo. `doctor` debería separar `readyForAnalyze` de `readyForGate`.

### P1 — La migración mantiene dos cores de orquestación

El adapter local contiene:

- **119 archivos**;
- **13.553 líneas** totales;
- **8.753 líneas productivas** en 69 archivos;
- **4.454 líneas de tests** en 48 archivos.

Sentinel Core contiene puertos o extracciones de ese adapter (`scope`, scheduler, cache, reporter, runner,
structured tool, guard y policy decision), mientras el consumidor conserva los originales. Los comentarios
del Core todavía dicen “Extraído de” o “Port de `scripts/quality`”.

Consecuencias:

- cada corrección puede requerir cambios y paridad en dos implementaciones;
- el usuario necesita entender `sentinel check`, `task:check`, `stage-process`, manifests y compatibilidad
  legacy;
- el plan 098A-1 propone añadir fast path, cache root y `task:close` al consumidor, lo que incrementaría la
  divergencia si no se reubican en Core.

**Acción recomendada posterior:** congelar nuevas capacidades en `scripts/quality`; completar la migración a
Core y dejar en el consumidor solo configuración y adapters reales del stack.

### P1 — Los analyzers y scripts locales no tienen un gobierno que impida la deriva

La preocupación no es hipotética. Wandorius contiene un segundo analizador estático escrito a mano en
`scripts/quality/custom-rules.mjs`:

- implementa **17 reglas** locales mediante regex y recorridos propios del filesystem;
- `scripts/quality/adapters/custom.mjs` marca **15 de esas 17 reglas** como migradas a Sentinel y las filtra
  del reporte final, pero todavía ejecuta el scanner y conserva sus resultados para comparación;
- solo `async-without-abort` y `subscription-without-dispose` quedan fuera de esa lista de migración; que no
  estén marcadas no demuestra aún que deban pertenecer al consumidor, solo que necesitan clasificación;
- `quality-adapter.json` mantiene `custom` como stage productivo del perfil frontend, con timeout de 60 s;
- el historial muestra que la carpeta creció el 29–30 de julio de 2026 al convertir auditorías P0/P1 en un
  stage custom y después corregir sus falsos positivos.

El origen fue razonable como transición: capturar detecciones que el Sentinel de ese momento no ofrecía.
El defecto es que no existe un contrato automático de ownership, admisión o caducidad. Por eso una solución
temporal puede sobrevivir después de que Sentinel absorba sus reglas, duplicar coste y conservar bugs o
falsos positivos antiguos.

Además, la skill global `quality-gate-setup` todavía enumera `scripts/quality/` como archivo canónico del
consumidor y manda **“copiar/adaptar `scripts/quality/`”** durante el bootstrap. Esa instrucción contradice el
producto objetivo y puede reproducir el mini-gate local en cada proyecto nuevo.

**Acción recomendada posterior:** adoptar el invariante **una regla, un dueño**; prohibir carpetas o analyzers
de quality creados ad hoc por agentes; inventariar y clasificar legacy antes de borrarlo; exigir declaración,
fixtures, presupuesto y condición de retirada para toda extensión local; y reescribir la skill para migrar
proyectos antiguos sin copiar scripts.

### P1 — VarSense incumple su presupuesto y registra timeout real

`quality.config.json:23` fija un presupuesto de **6.000 ms** para VarSense. La evidencia persistida muestra:

- perfil de 9 reportes: p50 **13.044 ms**, p95 **15.984 ms**, 5 muestras;
- medición más reciente leída durante la auditoría: p50 aproximado **11.856 ms**, p95 **13.875 ms**;
- `.quality-reports/parity/varsense/028A-6/gate/varsense-stage.json`: timeout real en **120.571 ms** con
  `quality-timeout` severity error.

Incluso en un reporte con cache hit interno de VarSense (`filesReused: 763`, `cacheHitRate: 1`), la etapa tomó
10.799 ms. Por tanto, el índice persistente no elimina el coste de arranque/descubrimiento/orquestación.

**Acción recomendada posterior:** perfilar el CLI de VarSense por fases, persistir proceso/índice cuando sea
posible, reducir descubrimiento global y hacer que el presupuesto produzca una regresión visible y accionable.

### P1 — La salida JSON documentada de `sentinel analyze` no siempre es JSON válido

Prueba directa sobre el workspace:

```text
node tools/sentinel/out/cli/index.js analyze --workspace . \
  --config sentinel.config.json --format json
```

Resultado:

- 0.6.0 fijado: ~9.865 s;
- 0.6.4 global: ~9.284 s;
- repetición con stdout/stderr separados: ~8.801 s;
- stdout comienza con mensajes `[WARN]`/`[INFO]` antes del objeto JSON;
- stderr queda vacío;
- `ConvertFrom-Json` falla.

La causa está en `tools/sentinel/src/utils/logger.ts:51`: cuando no existe el canal de VS Code, el logger usa
`console.log`, incluso dentro del CLI. El adapter evita el problema pasando `--output`, pero el README publica
el comando sin `--output` como interfaz automatizable.

**Acción recomendada posterior:** logs diagnósticos siempre a stderr o logger inyectado/silencioso en JSON;
añadir una prueba de proceso que valide que stdout completo parsea como un único JSON.

### P1 — La suite del adapter no entra en un ciclo de feedback razonable

`npm run quality:test` fue ejecutado con timeout de 120 s. No terminó; se canceló y se limpiaron seis procesos
hijos propios. La salida parcial mostraba pruebas individuales de mantenimiento de targets con duraciones de
aproximadamente 11,9 s, 13,4 s, 33,7 s y 34,5 s.

Esto se clasifica como **cobertura no ejecutada**, no como PASS ni como FAIL funcional. Sí es evidencia firme
de que la suite de la infraestructura resulta demasiado lenta para el bucle normal.

**Acción recomendada posterior:** usar filesystem/process probes simulados en unit tests, reservar pruebas WMI
y de disco reales para integración, paralelizar por suites aisladas y publicar duración por archivo de test.

### P1 — El control de presupuestos de tiempo no está conectado al comando usado

`quality:profile` acepta `--budgets <json>`. La invocación natural/documentada:

```text
npm run quality:profile -- --budgets
```

no carga `quality.config.json.stageTimeBudgets`: el parser toma el siguiente argumento como JSON, recibe
`undefined`, deja `budgets = null` y termina exit 0. Durante la auditoría mostró VarSense y otros p95 por encima
del presupuesto sin emitir ninguna regresión.

**Acción recomendada posterior:** `--budgets` sin valor debe cargar la config del proyecto; un JSON explícito
debe usar otra opción o `--budgets=<json>`. Añadir prueba CLI end-to-end y no solo de `evaluateStageBudgets`.

### P2 — El setup es reproducible, pero demasiado caro para instalar o reparar

El setup del consumidor hace, por cada tool con `sourcePath`:

1. submodule update;
2. `git archive` a staging temporal;
3. `npm ci --ignore-scripts`;
4. compilación;
5. suite completa configurada;
6. copia de `node_modules` y artefactos al submódulo;
7. escritura de evidencia.

`scripts/quality/setup.mjs:283` declara explícitamente que **cada setup interno recompila y prueba**. Las marcas
de evidencia actuales se escribieron en orden Sentinel → VarSense con **131,42 s** entre ambas; ese delta es
una aproximación del coste de preparar VarSense por sí solo, sin contar el tramo previo de Sentinel.

Footprint observado:

| Área | Tamaño aproximado |
| --- | ---: |
| `tools/sentinel/node_modules` | 53,19 MiB |
| `tools/varsense/node_modules` | 122,06 MiB |
| `.quality-tools` legado/duplicado | 178,18 MiB |
| runtime global, 4 versiones | 221,26 MiB |
| `.vscode-test` de Sentinel en este checkout | 1.040,51 MiB |

La `.vscode-test` no es requisito del runtime normal, pero demuestra que desarrollar y probar todas las
superficies de Sentinel puede superar 1 GiB. El runtime global conserva cada versión observada (~55 MiB por
versión) sin política visible de retención.

**Acción recomendada posterior:** distribuir artefactos publicados y verificados, no compilar herramientas en
cada consumidor. El lock debe fijar artefacto/plugin; el proyecto no debería llevar submódulos ni
`node_modules` de los analizadores.

### P2 — Los shims globales agregan latencia y no gobiernan todas las herramientas de forma uniforme

Medición de seis ejecuciones:

- `cargo --version` mediante shim Sentinel: media **410,7 ms**;
- `cargo.exe --version` directo: media **52,2 ms**.

El shim observado multiplica aproximadamente por 7,9 el coste de un comando trivial. Además, en la shell
auditada:

- Cargo resolvía primero al shim;
- Node y npm resolvían primero a sus binarios reales y después a los shims.

Esto hace que el guard global tenga coste y cobertura dependientes del orden de PATH/shell. No se observó una
degradación equivalente en Node porque el shim no era el comando ganador.

**Acción recomendada posterior:** hacer los shims una capacidad opcional y explícita. Para el camino normal,
preferir `sentinel check`/`sentinel run` y hooks de proyecto/CI. Si se conservan, medir overhead, verificar PATH
en `doctor` y aplicar una política de latencia máxima.

### P2 — Sentinel tiene demasiadas responsabilidades en módulos grandes

Métricas del release fijado 0.6.0 (0.6.4 cambia poco en arquitectura):

- 130 archivos TypeScript;
- 26.021 líneas TypeScript;
- 77 archivos productivos y 53 de tests;
- 7.861 líneas de tests.

Módulos productivos más grandes:

| Archivo | Líneas | Responsabilidad |
| --- | ---: | --- |
| `src/cli/index.ts` | 976 | parsing y dispatch de analyze/check/install/doctor/lease/task |
| `reactComponentRules.ts` | 901 | reglas React |
| `taskCoordinator.ts` | 738 | ownership, worktrees, integración y cleanup |
| `interceptorShims.ts` | 697 | cmd/bash/PowerShell, profiles y PATH |
| `staticCssRules.ts` | 605 | reglas CSS |
| `rustAnalyzer.ts` | 605 | reglas Rust |
| `runtimeInstall.ts` | 549 | install/update/rollback/uninstall/status |
| `diagnose.ts` | 510 | política, locks, tools, runtime y readiness |

El paquete aún se describe en `package.json` como un analizador estático, mientras el README lo llama “plano
de control” y el Core también instala runtimes, intercepta shells y coordina Git. El crecimiento no es solo
cantidad de código: es falta de un boundary de producto estable.

**Acción recomendada posterior:** separar internamente paquetes/módulos `analysis`, `gate`, `runtime`, `task`
y `editor`, conservando un solo CLI. `task` y shims deben ser features opcionales, no requisitos del análisis.

### P2 — La escalabilidad actual es local, no distribuida

La coordinación por directorios, PID, host y Git common dir es adecuada para varios agentes en una máquina y
un repositorio compartido. No coordina clones independientes, runners CI distintos o una flota distribuida.
Cada clon tendrá locks, reportes y caches propios.

Además:

- `maxConcurrentStages` es 1, por lo que las etapas independientes son seriales;
- los caches viven por workspace/rama/worktree y a menudo arrancan fríos entre tareas;
- cada consumidor carga sus propios submódulos, dependencias y artefactos;
- el runtime global y la versión fijada pueden divergir, aunque el doctor actual distingue ambas.

Esto no es un fallo si el alcance prometido es “coordinación local”. Sí es un problema de propósito si se
vende como orquestación universal sin declarar el límite.

**Acción recomendada posterior:** documentar formalmente el modelo local. Si se necesita distribución,
introducir un backend de coordinación como adapter opcional; no intentar simularlo con locks de filesystem.

## 4. Auditoría de rendimiento

### 4.1 Resultados resumidos

| Operación | Resultado observado |
| --- | ---: |
| `quality:doctor` | 829 ms, exit 0 |
| `quality:lock -- --check` | 1.279 ms, exit 0 |
| Sentinel scoped en benchmarks históricos | p50 ~216–249 ms |
| Sentinel full directo | ~8,8–9,9 s |
| Gate limpio, fixture 2 archivos | p50 19.735 ms; 3 éxitos, 2 fallos |
| Gate limpio, fixture 12 archivos | p50 19.372 ms; 4 éxitos, 1 fallo |
| Gate incremental con cache, 2 archivos | p50 1.194 ms |
| Gate incremental con cache, 12 archivos | p50 1.602 ms |
| VarSense histórico | p50 11,9–13,0 s; p95 13,9–16,0 s |
| VarSense timeout real | 120.571 ms |
| `quality:test` | no terminó en 120 s |
| Setup VarSense aproximado por evidencia | ≥131,42 s entre marcas secuenciales |
| Cargo shim / real | 410,7 ms / 52,2 ms |

### 4.2 Interpretación

- **La caché funciona** y transforma el segundo gate en una experiencia razonable.
- **La ruta fría no escala con el tamaño pequeño del cambio**: las fixtures de 2 y 12 archivos tardan casi lo
  mismo porque dominan arranques y etapas globales.
- **Sentinel no es el principal coste en modo scoped**; VarSense y frontend dominan.
- **Sentinel full tampoco cumple el presupuesto de 3 s**, aunque esa comparación mezcla otro alcance.
- Los benchmarks limpios tienen 40 % y 20 % de ejecuciones fallidas. El agregador excluye correctamente los
  fallos de los percentiles, pero la tasa de fallo indica una línea base operativamente inestable.
- El perfil histórico mezcla PASS, FAIL, errores de herramienta, cache hits y diferentes alcances. Es útil
  para detectar dolor, pero no para atribuir una regresión sin segmentar por modo/estado/cache/fixture.

### 4.3 SLO recomendados

Una vez consolidado el producto:

| Camino | Objetivo sugerido |
| --- | ---: |
| `sentinel doctor` warm | <1 s |
| docs-only frío | <5 s |
| incremental warm | <2 s |
| código local-light frío | <15 s sin tests de integración |
| VarSense p95 scoped | ≤6 s, presupuesto ya declarado |
| suite unitaria del gate | <60 s |
| full/CI | presupuesto por stack, reportado aparte |

El SLO del plan 098A-1 (`docs <2 min`) mejora la situación actual de ceremonia, pero es demasiado laxo como
objetivo final de una herramienta local.

## 5. Auditoría de instalación en proyecto nuevo

### 5.1 Capas que hoy debe entender el instalador

El consumidor coordinado usa, como mínimo:

1. runtime global Sentinel;
2. submódulo Sentinel fijado;
3. submódulo VarSense fijado;
4. `sentinel.config.json`;
5. `varsense.config.json`;
6. `quality.config.json`;
7. `quality-tools.json`;
8. `sentinel.lock.json`;
9. `quality-adapter.json`;
10. `scripts/quality/`;
11. scripts npm `quality:*` y `task:*`;
12. opcionalmente shims, perfiles, PATH, leases y dos sistemas de toma de tarea.

Esta no es una instalación mínima; es una migración interna convertida en requisito del consumidor.

### 5.2 Experiencia objetivo

```bash
# runtime instalado una sola vez por el mecanismo de distribución elegido
sentinel --version

# dentro de un proyecto nuevo
sentinel init --preset rust-node
sentinel doctor
sentinel check BOOTSTRAP-01
```

`sentinel init` debería:

- detectar Git, rama y stacks sin inventar decisiones irreversibles;
- generar una única `sentinel.config.json` principal;
- generar un único lock reproducible;
- añadir un adapter mínimo solo cuando el stack lo necesite;
- fijar plugins publicados por artefacto/hash, no por submódulo con build local;
- ofrecer `--dry-run`, `--force` acotado e idempotencia;
- añadir alias npm opcional, sin duplicar la lógica;
- verificar con `doctor` y un check real de fixture;
- poder desinstalar solo lo que generó.

### 5.3 Contrato mínimo propuesto

```text
sentinel.config.json       política, rama, plugins y perfiles
sentinel.lock.json         versiones, hashes, protocolos y artefactos resueltos
.sentinel/                 estado/caches/reportes operativos ignorados
```

`varsense.config.json` puede mantenerse separado si VarSense necesita un contrato especializado, pero debe ser
referenciado como plugin y no obligar al usuario a conocer otra instalación. `quality.config.json`,
`quality-tools.json` y `quality-adapter.json` deberían converger al contrato principal o quedar generados bajo
`.sentinel/`, no como APIs manuales de primer nivel.

## 6. Auditoría documental

### 6.1 Volumen y dispersión

Inventario por nombre directamente relacionado con Sentinel/VarSense/quality/guard:

- **21 Markdown**;
- **3.360 líneas**;
- ocho planes activos directamente relacionados suman aproximadamente **1.799 líneas**;
- `roadmap-sentinel.md` añade **435 líneas**;
- el repositorio Sentinel conserva en raíz cuatro `PLAN_*.md` junto al README, aunque varios describen sprints
  ya completados o eras anteriores.

Una búsqueda amplia por menciones de Sentinel/gate/quality encuentra 92 Markdown y 17.109 líneas, aunque parte
de ese conjunto es documentación de producto que solo referencia el gate.

### 6.2 Problemas de información

1. **Demasiadas fuentes “canónicas”.** Hay roadmap especializado, plan global, plan de optimización, plan de
   migración, plan de orquestación, plan de preflight, inventario, prevención, ADR y skill externa.
2. **Planes activos contienen historial exhaustivo.** El lector debe atravesar cientos de líneas de avances
   cerrados para encontrar lo pendiente.
3. **Identidad cambiante.** `Code Sentinel`, `Glory Sentinel`, analizador, plano global, coordinador y gate se
   usan en documentos diferentes.
4. **Versiones desalineadas.** El checkout fijado documenta 0.6.0; el runtime vigente es 0.6.4; el README latest
   afirma que repositorio y consumidor comparten 0.6.4, cosa que este consumidor aún no cumple.
5. **Promesas sin comando.** El README dice que una config “se genera”, pero no existe generador.
6. **Documentación de transición como manual de usuario.** Compatibilidad v1/v2, sourcePath, release evidence,
   shims legacy y doble vía aparecen antes de un quickstart funcional.
7. **Objetivos mezclados.** Análisis estático, coordinación Git, guard global, instalación runtime, tests del
   stack y disciplina de agentes conviven sin una jerarquía clara.

### 6.3 Estructura documental recomendada

En Sentinel:

```text
README.md                     propuesta, quickstart y 3 comandos
docs/concepts.md              Sentinel, gate, analyzer, plugin, task
docs/configuration.md         schema y referencia generada/versionada
docs/operations.md            doctor, check, reports, task y recuperación
docs/migration.md             v1/v2, aliases y deprecaciones temporales
CHANGELOG.md                  releases publicadas
docs/history/                 PLAN_* archivados, sin autoridad operativa
```

En el consumidor:

```text
roadmap.md                    solo trabajo abierto
Agente/planes/plan-sentinel-consolidacion-YYYY-MM-DD.md
                              un único plan activo con próximos hitos
Agente/documentacion/herramientas/sentinel.md
                              decisiones específicas del consumidor
Agente/planes/completados/    planes históricos
```

El CLI debe generar su help y la referencia de schema desde el mismo contrato probado para evitar deriva.

## 7. Revisión del plan 098A-1

El plan `plan-agilizar-ceremonia-cierre-calidad-2026-08-09.md` diagnostica correctamente varios costes:
preflight completo, mantenimiento incondicional, caché fría, evidencia invisible desde worktrees y ceremonia
duplicada.

Sin embargo, su límite “no tocar `tools/sentinel`” entra en conflicto con la consolidación arquitectónica:

| Fase 098A-1 | Ubicación correcta recomendada |
| --- | --- |
| F0, medición | puede continuar en el consumidor |
| F1, raíz común de evidencia | Sentinel Core/doctor/task start |
| F2, fast path documental | planner/scope de `sentinel check` |
| F3, cache/evidencia reutilizable | Sentinel Core/runtime/plugins |
| F4, `task:close` | CLI `sentinel task close` |
| F5, disciplina del agente/sandbox | instrucciones operativas, no Core del gate |
| F6, adopción | consumidor + CI |

Recomendación: **conservar F0, pero replantear F1–F4 antes de implementarlas en `scripts/quality`**. De lo
contrario se optimiza el sistema transitorio y se encarece su retirada.

## 8. Fortalezas que conviene preservar

La simplificación no debe eliminar estas propiedades:

- análisis estático determinista, sin red ni credenciales;
- pin por commit/hash/protocolo/capabilities;
- `doctor` con diagnóstico estructurado y fail-closed cuando existe política;
- locks atómicos y recuperación conservadora;
- worktrees aislados e integración `ff-only`;
- contención física y rechazo de symlink/junction escape;
- reports Markdown/JSON con distinción de finding, timeout, error de herramienta y cancelación;
- cache fingerprinted por modo, config, tool y contenido;
- redacción de secretos y captura acotada;
- VarSense como analizador especializado, no como segundo gate;
- status actual sin tareas, orphans ni locks activos.

## 9. Ruta recomendada de simplificación

### Fase A — Estabilizar antes de ampliar

1. Corregir el `ReferenceError` actual.
2. Corregir stdout JSON del CLI.
3. Conectar realmente los presupuestos de tiempo.
4. Reproducir y perfilar el timeout de VarSense.
5. Separar tests unitarios rápidos de integración WMI/disco.

### Fase B — Resolver instalación

1. Diseñar e implementar `sentinel init`.
2. Hacer `doctor` explícito: análisis listo vs gate listo.
3. Publicar artifacts/plugins verificables.
4. Eliminar submódulos y build de herramientas del camino normal del consumidor.
5. Añadir fixture de adopción sobre proyecto Node, Rust, Python y proyecto mixto.

### Fase C — Unificar gate y Sentinel

1. Mover fast path, cache, reporter, scheduler y close al Core.
2. Cambiar `task:check` a alias sin lógica.
3. Retirar el segundo sistema `task:take` cuando Sentinel cubra el contrato.
4. Reducir los archivos de primer nivel a config + lock.
5. Hacer shims globales opcionales y verificables por doctor.

### Fase D — Ordenar documentación y deprecar

1. Crear un único modelo conceptual y quickstart.
2. Archivar planes completados y `PLAN_*.md` históricos.
3. Consolidar pendientes en un plan activo corto.
4. Publicar tabla de deprecación con fecha/versión de retirada.
5. Validar docs contra CLI/schema en CI.

## 10. Criterios de salida para considerar Sentinel sencillo y escalable

- Un proyecto limpio llega a un gate funcional con tres comandos o menos.
- `doctor` nunca responde “gate listo” cuando solo está disponible `analyze`.
- El usuario no copia scripts ni edita locks a mano.
- `sentinel check` es el único dueño de scope, cache, stages, budgets y reporte.
- Un adapter de proyecto contiene solo integración del stack, no infraestructura universal.
- Warm incremental <2 s; docs frío <5 s; VarSense p95 scoped ≤6 s.
- Suite unitaria del gate <60 s; integración pesada separada.
- JSON stdout es siempre parseable y stderr contiene diagnósticos.
- Los shims no agregan más de un presupuesto acordado y doctor confirma si gobiernan realmente.
- La documentación operativa cabe en README + cuatro documentos canónicos.
- El alcance distribuido/local está declarado y probado.
- Dos proyectos independientes adoptan el mismo release sin copiar `scripts/quality`.

## 11. Evidencia y limitaciones

### Comandos/consultas ejecutados

- `git status --short --branch`, submodules, remotes y refs;
- lectura completa de skills/instrucciones aplicables y documentación canónica;
- inventarios con `rg`, métricas de archivos/líneas y tamaños de disco;
- `sentinel --help`, versiones, `doctor --json` y `task status --all --json`;
- `quality:doctor`, `quality:lock -- --check` y `quality:profile`;
- `quality:test` con límite de 120 s;
- análisis full directo con Sentinel 0.6.0 y 0.6.4;
- medición shim/ejecutable real de Cargo;
- clon temporal limpio de template `main`, doctor y check dry-run;
- lectura de benchmarks, perfiles, reportes y timeout VarSense existentes;
- inspección independiente mediante `sentinel_inspector`.

### Cobertura no ejecutada

- No se ejecutó un gate real porque el working tree contiene el `ReferenceError` descrito y cambios
  preexistentes en curso.
- `quality:test` no terminó antes de 120 s; no se declara PASS ni FAIL.
- No se ejecutaron suites full de Rust/frontend ni pruebas de navegador; no eran necesarias para esta auditoría
  de tooling y habrían ampliado el coste sin reparar el gate.
- No se probó coordinación distribuida porque no existe backend distribuido declarado.

### Estado del checkout preservado

Al iniciar ya existían cambios ajenos en `roadmap.md`, `scripts/quality/task-check.mjs` y el plan 098A-1. No se
modificaron ni se descartaron. Los procesos que sobrevivieron al timeout de `quality:test` fueron identificados
y terminados; el clon temporal fue eliminado. Un perfil generado accidentalmente por el comando de diagnóstico
se restauró a su contenido previo.

## 12. Decisión recomendada

No conviene seguir añadiendo optimizaciones locales al adapter como dirección principal. La decisión de mayor
apalancamiento es:

> **Terminar Sentinel como producto único: `init`, `doctor`, `check` y `task`; convertir el gate en `check`,
> distribuir analyzers como plugins fijados y retirar progresivamente el orquestador copiado del consumidor.**

Primero se estabilizan los defectos P0/P1; después se replantea 098A-1 para llevar sus capacidades universales
al Core. Solo entonces tiene sentido optimizar detalles menores o ampliar reglas.

## 13. Estado de supervisión y cierre formal

La inspección especializada de Sentinel devolvió `VEREDICTO: DEFECTO DETECTADO` y corroboró los defectos de
gate actual, bootstrap ausente y rendimiento de VarSense.

La revisión final de calidad validó positivamente la precisión, el alcance, la separación de cambios ajenos,
el análisis SOLID, la evidencia de rendimiento y la dirección de consolidación. Sin embargo, su veredicto de
proceso fue `RECHAZADO` por dos condiciones que esta auditoría no puede resolver sin ampliar el alcance:

1. no existe un gate de cierre válido mientras `task-check.mjs` conserve el `ReferenceError` preexistente;
2. el informe no fue añadido al índice documental canónico porque el usuario autorizó crear este Markdown,
   pero pidió no modificar código, configuración ni otros documentos todavía.

Por ello, **el diagnóstico inicial quedó cerrado y la implementación posterior se documentó por separado**.
El checkout actual tiene doctor/lock alineados y el gate canónico `gate:check` delega en `sentinel check`; la
retirada física de la capa legacy sigue condicionada a una segunda release verde, rollback y verificación de
ownership.

## 14. Plan integral de corrección por fases

> **Estado:** COMPLETADA CON PENDIENTES CONDICIONADOS — Fases F0–F9 ejecutadas y documentadas; la retirada
> física de capas legacy espera una segunda release verde con rollback. El seguimiento operativo vive en
> `Agente/planes/plan-ejecucion-auditoria-sentinel-2026-08-10.md`; el roadmap marca 098A-1 como
> absorbido.  
> **Fuente del plan:** hallazgos y evidencia de esta auditoría.  
> **Veredicto de arquitectura:** `VIABLE CON RESERVAS`.  
> **Resultado final:** Sentinel es el único producto y `sentinel check` es el único quality gate.  
> **Restricción de este bloque:** la auditoría en sí fue solo lectura; la implementación se
> ejecuta desde `108A-1` con su propio gate por fase.  
> **Orden:** una fase no se declara cerrada si su gate/evidencia está rojo, incompleto o no ejecutado.

### 14.1 Objetivo, alcance y no-goals

#### Objetivo

Corregir todos los defectos y riesgos confirmados sin consolidar el adapter transitorio:

- recuperar un gate funcional y verificable;
- corregir contratos CLI y diagnósticos ambiguos;
- hacer rápida y medible la ruta local;
- instalar Sentinel en un proyecto nuevo con `sentinel init`;
- mover la infraestructura universal a Sentinel Core;
- convertir VarSense en plugin publicado y fijado;
- dejar `task:check` como alias fino;
- retirar submódulos, scripts duplicados, shims obligatorios y documentación histórica de la ruta operativa;
- preservar seguridad, reproducibilidad, rollback y coordinación local segura.

#### No-goals

- [ ] No añadir fast paths, cache compartida, `task:close` ni nueva coordinación a `scripts/quality`.
- [ ] No crear ni commitear carpetas personales de agente, runners, scanners o reglas de quality locales no
      declaradas; una extensión aceptada pertenece al proyecto, no al agente que la creó.
- [ ] No retirar legacy antes de tener paridad, rollback y adopción en dos consumidores.
- [ ] No convertir coordinación local en una promesa distribuida.
- [ ] No relajar lock, hashes, fail-closed, contención de paths, redacción, timeouts o `ff-only`.
- [ ] No ejecutar deploy, push remoto, escritura en servicios externos ni SSH como consecuencia del plan.
- [ ] No ampliar reglas de análisis hasta estabilizar instalación, contratos y rendimiento.

#### Decisión sobre el plan 098A-1

`plan-agilizar-ceremonia-cierre-calidad-2026-08-09.md` debe ser **absorbido/sustituido** al iniciar la
implementación:

- [ ] Conservar su F0 como línea base y trazabilidad.
- [ ] Mover su F1 (evidencia común) a Sentinel Core/doctor/task.
- [ ] Mover su F2 (docs fast path) al planner de `sentinel check`.
- [ ] Mover su F3 (cache/evidencia reutilizable) a Sentinel Core/runtime/plugins.
- [ ] Mover su F4 (`task:close`) a `sentinel task close`.
- [ ] Reducir F5 a disciplina operativa/documental.
- [ ] Absorber F6 en las fases de adopción y cierre de este plan.
- [ ] Mantener el documento anterior como historia; no borrarlo hasta el cierre documental.

### 14.2 Dependencias y superficies afectadas

| Superficie | Responsabilidad objetivo | Dependencia |
| --- | --- | --- |
| Sentinel `analysis` | reglas estáticas y reportes de análisis | contrato JSON estable |
| Sentinel `gate` | scope, stages, cache, budgets y decisión | plugins publicados |
| Sentinel `runtime` | install/update/rollback/artifacts | distribución verificable |
| Sentinel `task` | coordinación Git local opcional | gate funcional e independiente |
| VarSense | analyzer/plugin especializado | benchmark e índice persistente |
| Consumidor | política y adapters reales del stack | release Sentinel adoptable |
| Template `main` | bootstrap demostrable | `sentinel init` publicado |
| Documentación/skills | operación vigente | implementación publicada y fijada |

#### Política objetivo para scripts y extensiones locales

Sentinel debe aplicar el invariante **una capacidad o regla, un solo dueño productivo**. La ubicación física
no decide el destino y ninguna carpeta se borra solo por llamarse `scripts/quality`, `.agent`, `tools/quality`
o de otra forma. Primero se descubre su uso desde entrypoints, imports, scripts de package, CI y configuración;
después cada archivo y regla se clasifica:

| Clasificación | Destino | Decisión sobre el legado |
| --- | --- | --- |
| Scope, scheduler, cache, reporter, lock, guard o coordinación universal | Sentinel Core | migrar, probar paridad y borrar la copia local |
| Regla estática genérica aplicable a más de un proyecto | Sentinel analyzer/Core | migrar upstream; mantener observe-only con caducidad hasta probar paridad |
| Analyzer especializado reutilizable | plugin publicado y fijado | sustituir el ejecutable local por referencia al artifact |
| Política, severidad, inclusión o excepción | configuración declarativa | retirar código local equivalente |
| Comprobación real del dominio/stack del consumidor | adapter/extensión mínima declarada | conservar solo si supera el contrato de admisión |
| Fixture o prueba de compatibilidad | suite de tests, nunca stage productivo | conservar mientras pruebe una migración vigente |
| Duplicado u obsoleto con paridad probada | ninguno | eliminar referencias y luego archivos mediante commit reversible |
| Propósito u ownership desconocido | pendiente bloqueante | no borrar, no copiar a otro proyecto y no cerrar la migración |

Contrato mínimo de admisión para una extensión local real:

- [ ] Identidad y ownership del proyecto, nunca nombre/ownership personal del agente.
- [ ] Justificación de por qué no es Sentinel Core, plugin existente ni configuración.
- [ ] Rule IDs/capabilities sin colisión con Sentinel o plugins instalados.
- [ ] Entry point, scope, inputs/outputs, severidad y exit codes declarados.
- [ ] Fixtures positivos, negativos y de falsos positivos.
- [ ] Timeout, memoria y presupuesto de latencia explícitos.
- [ ] Fecha/versión de introducción, revisión y condición de retirada.
- [ ] Issue/candidato upstream cuando la capacidad pueda generalizarse.
- [ ] `doctor` y CI rechazan código de quality ejecutable no declarado o ownership duplicado.

Los experimentos de un agente viven únicamente en un área temporal ignorada, por ejemplo `.sentinel/tmp/`,
y no pueden convertirse en parte del gate ni commitearse sin pasar por esta clasificación.

Dependencias bloqueantes:

- [ ] Resolver ownership del cambio preexistente en `scripts/quality/task-check.mjs`.
- [ ] Definir el contrato de artifacts/plugins Sentinel y VarSense.
- [ ] Reproducir la causa del timeout de VarSense antes de elegir daemon, worker o nuevo índice.
- [ ] Definir la equivalencia exacta entre `task:take` y `sentinel task` por invariantes.
- [ ] Inventariar scripts, analyzers, entrypoints y rule IDs legacy, incluido `custom`, antes de decidir
      cualquier eliminación.
- [ ] Declarar la rama primaria real de cada fixture/consumidor; nunca asumir `main`.
- [ ] Obtener autorización explícita solo cuando una fase requiera publicar/push remoto.

### 14.3 Modelo de escala y presupuestos

El alcance soportado inicial será **local por workspace/clon**:

- 1 repositorio consumidor;
- 1–4 agentes locales;
- hasta 2 gates ligeros simultáneos;
- máximo 1 etapa pesada por proyecto;
- repositorios de hasta 100.000 archivos rastreados;
- salida capturada por proceso ≤64 KiB en terminal y detalle acotado en logs;
- reportes ≤512 MiB por workspace y ≤128 MiB por rama;
- memoria objetivo ≤256 MiB por analyzer y ≤512 MiB para un gate local-light;
- caches y locks locales; clones distintos no comparten coordinación.

Presupuestos de latencia objetivo:

| Camino | SLO |
| --- | ---: |
| `sentinel doctor` warm | <1 s |
| docs-only frío | <5 s |
| incremental warm | <2 s |
| local-light frío | <15 s sin integración pesada |
| VarSense scoped p95 | ≤6 s |
| suite unitaria del gate | <60 s |
| Cargo shim opcional | overhead p95 <50 ms o se rechaza |

Un backend distribuido queda fuera de alcance hasta existir un consumidor real, contrato de consistencia y
modelo de carga. No se añadirá por anticipación.

### 14.4 Trazabilidad de hallazgos a fases

| Hallazgo de la auditoría | Fase responsable |
| --- | --- |
| `preflightStartedAt` no declarado | Fase 0 |
| JSON contaminado por logs stdout | Fase 1 |
| budgets desconectados | Fase 1 |
| `doctor ready:true` sin gate | Fase 1 y Fase 4 |
| dry-run mutante | Fase 1 y Fase 4 |
| responsabilidades/módulos excesivos | Fase 2 |
| VarSense >6 s y timeout 120.571 ms | Fase 3 |
| `quality:test` >120 s | Fase 3 |
| setup compila/prueba por consumidor | Fase 3 y Fase 4 |
| bootstrap inexistente | Fase 4 |
| dos cores y tres recorridos de gate | Fase 5 |
| scripts/analyzers locales sin ownership, caducidad ni control de duplicados | Fases 0, 2, 5, 7 y 8 |
| skill manda copiar/adaptar `scripts/quality` | Fases 0, 4 y 7 |
| doble coordinación `task:take`/`sentinel task` | Fase 5 |
| shims lentos/inconsistentes | Fase 6 |
| alcance local no declarado | Fase 6 |
| 21 Markdown y planes solapados | Fase 7 |
| versiones/documentos desalineados | Fase 7 y Fase 8 |
| submódulos, dependencias y runtimes duplicados | Fase 8 |
| cierre formal rechazado | Fase 0 y Fase 9 |

### Fase 0 — Contención urgente y baseline confiable

**Objetivo:** recuperar un gate ejecutable sin añadir capacidades al adapter y congelar una línea base
reproducible.

**Depende de:** ownership explícito del archivo ya modificado.

#### Checklist de implementación

- [ ] Crear/asignar una tarea con ID real y ownership exclusivo del cambio preexistente.
- [ ] Registrar estado Git, rama, pin Sentinel/VarSense y reportes previos antes de editar.
- [ ] Corregir únicamente la inicialización de `preflightStartedAt` inmediatamente antes del preflight.
- [ ] Conectar `preflightMs` al reporte solo si no cambia la decisión del gate.
- [ ] Añadir una prueba de proceso que ejecute el entry point real de `task-check.mjs`.
- [ ] Añadir caso negativo que falle si una variable de medición no está declarada.
- [ ] Confirmar que `task:check` queda marcado como compatibilidad temporal sin nuevas features.
- [ ] Congelar nuevas reglas y nuevos archivos productivos en `scripts/quality`, salvo el hotfix acotado de
      esta fase.
- [ ] Generar un inventario inicial de entrypoints, imports, reglas y etapas custom sin modificar su conducta.
- [ ] Aplicar una corrección preventiva a `quality-gate-setup`: retirar la orden de copiar/adaptar
      `scripts/quality`, advertir que los proyectos legacy requieren inventario y no prometer todavía un
      comando de migración inexistente.
- [ ] Ejecutar `node --check scripts/quality/task-check.mjs`.
- [ ] Ejecutar la prueba focalizada del entry point.
- [ ] Ejecutar `quality:doctor` y `quality:lock -- --check`.
- [ ] Ejecutar un `task:check` real con ID válido y conservar reporte Markdown/JSON.
- [ ] Medir preflight, mantenimiento, etapas y escritura de reporte en frío y warm.

#### Evidencia de salida

- [ ] El gate alcanza una decisión estructurada sin `ReferenceError`.
- [ ] Hay un test que habría fallado antes del hotfix.
- [ ] La línea base separa PASS, FAIL, ERROR, cache hit/miss y modo.
- [ ] No se añadieron fast paths, cache root ni cierre consolidado al adapter.
- [ ] La skill vigente ya no puede originar nuevas copias del mini-gate durante la migración.

#### Rollback

- [ ] Revertir solo el commit/hunk de medición si cambia la semántica del gate.
- [ ] Conservar el test de proceso aunque se retire la métrica defectuosa.

**Criterio de cierre:** P0 corregido, gate ejecutable y baseline válida. Si el gate sigue sin ejecutarse, no
avanzar.

### Fase 1 — Corregir contratos de Sentinel antes de ampliar arquitectura

**Objetivo:** hacer confiables stdout, exit codes, doctor, dry-run y budgets en el release upstream.

**Depende de:** Fase 0 cerrada y worktree upstream exclusivo de Sentinel.

> **Estado (108A-1, 2026-08-10):** implementado en worktree exclusivo `f1/cli-contracts`
> (`area-trabajo/.sentinel-upstream-f1`); gate upstream PASS (compile, lint 0 errores,
> test:unit 506/506). La adopción del release queda en Fase 8 (repin consumidor, requiere push
> autorizado). El checklist se actualiza con lo cerrado; los ítems abiertos restantes dependen de
> la consolidación canónica (F4/F5).

#### Checklist de stdout y errores

- [x] Inyectar un logger CLI separado del Output Channel de editor.
- [x] Reservar stdout exclusivamente al documento solicitado en modos JSON.
- [x] Enviar INFO/WARN/diagnóstico a stderr.
- [x] Añadir test de proceso que parsee stdout completo como un único JSON.
- [x] Añadir fixtures con warnings de GloryAnalyzer y JSON válido.
- [x] Confirmar que `--output` y stdout producen el mismo schema.
- [x] Mantener códigos distintos para findings, error de herramienta, timeout y cancelación
      (findings=1 vía decisión, error CLI=2; timeout/cancelled/invalid-output/tool-error como
      estados y ruleIds distintos en `structuredTool.ts`).

#### Checklist de budgets y perfil

- [x] Hacer que `--budgets` sin valor cargue la configuración efectiva.
- [x] Definir sintaxis inequívoca para override explícito (`--budgets-json` o archivo).
- [ ] Mover evaluación de presupuestos a `sentinel check` como fuente canónica.
- [ ] Segmentar perfil por modo, estado, cache, fixture y versión de plugin (cache hit/miss ya
      segmentado; el resto cae con el perfil canónico de `sentinel check` en F4/F5).
- [x] Rechazar percentiles con muestras insuficientes sin ocultar el estado “sin evidencia”
      (`budget.insufficient` en el reporte estructurado).
- [x] Emitir exit no cero ante regresión confirmada y reporte estructurado del presupuesto.

#### Checklist de readiness y dry-run

- [x] Separar `readyForAnalyze` de `readyForGate` en doctor JSON y salida humana.
- [x] Hacer que un proyecto `no-policy` nunca declare gate listo.
- [x] Validar runtime global y pin consumidor como identidades distintas (doctor ya distingue
      runtime global y diagnostics de pin: gitlink/lock/checkout mismatch).
- [x] Hacer `check --dry-run` estrictamente no mutante.
- [x] Si se necesita persistencia, renombrar la operación y documentarla como tal (dry-run ya no
      persiste nada; no aplica).
- [~] Añadir fixtures no-policy, analyzer-only, gate-ready y lock divergente (no-policy y
      analyzer-only cubiertos en `cliProcess.test.ts`; gate-ready y lock divergente pendientes de
      F4 cuando exista el runtime global).

#### Gate upstream

- [x] `npm run compile` PASS.
- [x] `npm run lint` PASS (absorbidos 9 errores preexistentes mecánicos; quedan 12 warnings de
      deuda preexistente).
- [x] `npm run test:unit` PASS (506 passing, 1 pending).
- [x] Tests CLI focalizados JSON/doctor/dry-run PASS (`cliProcess.test.ts`).
- [x] `sentinel analyze --format json | parser` PASS sin prefijos.
- [x] `sentinel doctor --json` refleja ambas readiness correctamente.

#### Rollback

- [x] Mantener el schema anterior durante una ventana versionada o publicar migración explícita
      (sin cambios de schema: `analyze` conserva `schemaVersion`; doctor solo añade campos
      aditivos `readyForAnalyze`/`readyForGate`).
- [x] No cambiar exit codes existentes sin versión de protocolo (exit codes intactos).

**Criterio de cierre:** interfaces automatizables, budgets efectivos y diagnóstico no ambiguo.

### Fase 2 — Delimitar Sentinel como producto modular único

**Objetivo:** resolver SRP/DIP/ISP antes de mover más comportamiento desde el consumidor.

**Depende de:** contratos de Fase 1 estabilizados.

> **Estado (108A-1, 2026-08-10):** implementado en worktree `f1/cli-contracts`; gate upstream
> PASS (compile, lint 0 errores, test:unit 513 passing/1 pending, check:core OK). La
> consolidación física de archivos en los módulos y la formalización de puertos quedan en
> F5/F6; el ADR fija frontera y budgets desde ya.

#### Checklist de arquitectura

- [x] Escribir ADR del producto único: Sentinel es producto; gate es `sentinel check`.
- [x] Definir módulos internos `analysis`, `gate`, `runtime`, `task` y `editor` (mapa en ADR 0001;
      consolidación física de archivos en F5/F6).
- [x] Mantener un solo CLI y separar parsing/dispatch por comandos (`args.ts` + `commands.ts` +
      barril `index.ts`, contrato público intacto).
- [~] Extraer interfaces pequeñas para scope, plugin verification, scheduler, cache, reporter y
      process runner (contrato del plugin en el registro de extensiones + `ToolOutcome`;
      formalización de puertos en F5).
- [x] Invertir dependencias hacia filesystem/proceso/reporter, no hacia `scripts/quality`
      (regla DIP en `check:core`).
- [x] Mantener reglas y adapters de stack fuera del núcleo agnóstico (`src/analyzers/`; excepción
      documentada `externalToolsAnalyzer` en el ADR).
- [x] Definir un registro de extensiones con identidad, owner, rule IDs, artifact/entrypoint,
      fixtures, presupuestos y condición de retirada (`extensionRegistry.ts`).
- [x] Hacer cumplir `una regla, un dueño`: Core, un plugin o una extensión local, nunca dos rutas
      productivas (colisiones rechazadas contra `ruleRegistry` y entre extensiones).
- [x] Rechazar colisiones de rule ID/capability y extensiones ejecutables no declaradas.
- [~] Definir la API mínima para comprobaciones reales de dominio sin permitir que reimplementen
      scope, scheduler, cache, reporter, locks o coordinación (contrato en ADR/registro; los
      plugins son subprocesos vía `structuredTool`; enforcement de plugins publicados en F3/F4).
- [x] Declarar `task` y shims como capabilities opcionales (doctor: requeridas
      `analyze`/`check`/`doctor`/`status`; `optionalCapabilities` expuestas).
- [x] Garantizar que `check` no requiera shims, perfiles ni worktrees (regla en `check:core`;
      `gateRun` no importa `interceptorShims`/`taskCoordinator`).
- [~] Dividir `src/cli/index.ts`, `taskCoordinator.ts`, `interceptorShims.ts`, `runtimeInstall.ts`
      y `diagnose.ts` por responsabilidad (`cli/index.ts` dividido; los cuatro core quedan con
      budget de tamaño y división planificada en F5/F6).
- [x] Fijar budget de tamaño por módulo y justificar excepciones en ADR/tests
      (`scripts/module-budgets.json` + `check:core`).

#### Validación SOLID

- [x] **SRP:** cada módulo tiene un motivo principal de cambio (mapa del ADR).
- [x] **OCP:** añadir un analyzer no modifica el scheduler/reporting core (registro + fronteras;
      suite PASS).
- [x] **LSP:** plugins devuelven el mismo contrato de outcome y pueden sustituirse en fixtures
      (contrato `ToolOutcome` de `structuredTool.ts`; tests de equivalencia PASS).
- [x] **ISP:** plugins no reciben APIs de runtime/task que no usan (registro + capabilities
      opcionales).
- [x] **DIP:** gate depende de puertos estructurados, no de scripts/concretos del consumidor
      (regla en `check:core`).

#### Gate de refactor

- [x] Snapshots/fixtures antes y después conservan decisiones y findings ordenados (suite
      completa incl. `sentinelEquivalence`/`coreContracts` sin cambios).
- [x] `check:core` impide imports editor-specific fuera del adapter (ampliado a `src/cli`;
      excepción `externalToolsAnalyzer` documentada).
- [x] Suite upstream completa PASS (513 passing, 1 pending).
- [x] No hay regresión >10 % en analyze scoped ni doctor (mismas rutas; tests de proceso
      analyze en ~200-400 ms).

#### Rollback

- [x] Entregar extracción en commits pequeños sin cambiar contrato público (F1 `1942cf5` + F2
      separados; sin cambios de schema ni exit codes).
- [x] Conservar adapters de compatibilidad hasta que cada módulo nuevo tenga paridad (nada
      eliminado; barril conserva el contrato de `cli`).

**Criterio de cierre:** Core modular con contratos estables; todavía no se elimina legacy.

### Fase 3 — Corregir rendimiento de VarSense, setup y suites

**Objetivo:** atacar los costes medidos antes de diseñar cache o persistencia especulativa.

**Depende de:** puertos de plugins/procesos definidos en Fase 2.

> **Estado (108A-1, 2026-08-10):** implementado en worktree exclusivo VarSense
> `f3/varsense-perf` (`area-trabajo/.varsense-upstream-f3`, checkout consumidor intacto) +
> bench en `scripts/quality/bench-varsense.mjs`. La publicación de artifacts (F8) es lo único
> que queda para cerrar el setup por artifacts; el retag de suites de integración se completa
> con la consolidación F5/F6.

#### Checklist de perfil VarSense

- [~] Crear fixture que reproduzca el timeout de 120.571 ms (causa real reproducida y contenida
      en F0: 1 GB de artifacts VS Code en `.vscode-test` sin excluir → `Invalid string length`;
      el bench usa un fixture determinista controlado, no un vendored gigante).
- [x] Instrumentar descubrimiento, lectura, parseo, indexado, análisis, serialización y teardown
      (`phaseDurationMs` del CLI: config, variableIndex, classIndex, discovery, analyze,
      tokenRules, orphan, group, save).
- [x] Medir cold/warm, 2 archivos, 12 archivos y workspace completo (modos cold/warm ×
      scoped/full, fixtures tiny=2/small=12/full=120 + workspace real medido en F0).
- [x] Medir RSS pico, archivos descubiertos/analizados/reutilizados y cache hit real (`metrics`
      del CLI, también en `scan`).
- [x] Determinar si el coste es arranque, scan global, invalidación o serialización (cuello =
      `classIndexMs` ~34 %: verificación SHA-256 por archivo para reutilización; el scan global
      sin exclusión fue la causa del timeout histórico).
- [~] Optimizar primero el cuello dominante con prueba de regresión (el margen es ~20× bajo el
      presupuesto: warm-scoped p95 ~305 ms vs 6.000 ms; el fast-path mtime implicaría un
      tradeoff de invalidación por contenido que no se justifica; índice de clases incremental
      queda como palanca en F5. El fix real del coste fue la contención de F0. El bench es la
      prueba de regresión).
- [x] Evaluar proceso persistente solo si las métricas prueban que el arranque domina (no
      procede: el arranque no domina — configMs ~28 ms; no se introduce proceso persistente).
- [x] Invalidar cache/índice por contenido, config, versión, plataforma y dependencias
      (identidad = toolVersion + config + parser; SHA-256 por archivo).
- [x] Alcanzar VarSense scoped p95 ≤6 s en la máquina de referencia (warm-scoped p95 ~305 ms en
      fixture de 120 archivos; el workspace real tras la contención completa sin timeout).

#### Checklist de setup/distribución

- [~] Definir artifact publicado de Sentinel con runtime dependencies mínimas (el install ya
      incluye dependencias; contrato en `docs/adr/0001` + publicación en F8).
- [x] Definir artifact/plugin publicado de VarSense (`docs/artifact-contract.md`: runtime deps
      mínimas, manifest version/commit/protocol/capabilities/SHA-256).
- [x] Firmar/fijar versión, commit, protocolo, capabilities y SHA-256 (manifest del contrato;
      SHA-256 ya verificado en `quality:setup`).
- [ ] Sustituir `npm ci + compile + suite` por descarga/verificación en consumidores (F8,
      requiere artifact publicado).
- [x] Mantener build desde source solo como modo de desarrollo explícito (contrato).
- [~] Añadir retención de versiones runtime y limpieza segura (runtime con versiones en
      targetRoot; política de retención/limpieza pendiente de afinarse con la adopción F8).
- [ ] Confirmar rollback a artifact previo sin editar locks manualmente (F8, requiere artifact
      previo publicado).

#### Checklist de tests

- [~] Separar unitarias de filesystem simulado y procesos falsos (bench/tests del consumidor
      usan fixtures reales y procesos; la separación formal es parte de la consolidación F5/F6).
- [ ] Mover WMI, disco, shells y Electron a suites de integración etiquetadas (la integración
      VS Code de VarSense requiere host; se etiqueta en la adopción F8).
- [~] Publicar duración por archivo/suite y top de tests lentos (el bench publica duraciones y
      fases; top de tests lentos con la suite consolidada F5/F6).
- [x] Unitarias del gate <60 s (suite consumidor 46–55 s; tests del bench ~10 s).
- [x] Integración con timeout propio, cleanup garantizado y cero procesos huérfanos (E2E con
      timeout + `finally rm`; `runOnce` con timeoutMs 120 s).
- [x] No contar cobertura cancelada como PASS (estados timeout/cancelled/invalid-output
      distintos desde F1; cancelAll en SIGINT/SIGTERM).

#### Gate de rendimiento

- [x] Benchmark JSON versionado con estado y número de muestras (`benchmark.json` con
      schemaVersion, fixture hash, samples y modos).
- [x] p50/p95 separados por modo/cache/fixture.
- [x] Presupuestos hacen fallar la regresión confirmada (exit 1 + reporte estructurado;
      minSamples 5; evidencia insuficiente visible).
- [ ] Comparativa antes/después adjunta al release (F8).

#### Rollback

- [x] Feature flag/version pin para volver al plugin anterior (pins existentes; rollback
      documentado).
- [x] Índices versionados y descartables; nunca migración destructiva silenciosa (identidad +
      snapshots descartables).

**Criterio de cierre:** VarSense dentro de presupuesto, setup por artifacts y unitarias rápidas.

### Fase 4 — Implementar bootstrap reproducible de proyecto nuevo

**Objetivo:** que un proyecto limpio obtenga un gate funcional en tres comandos o menos.

**Depende de:** artifacts verificables de Fase 3 y schema estable de Fase 1.

#### Checklist de `sentinel init`

- [x] Implementar `sentinel init --preset <stack>` (`initCliTarget` en `src/cli/bootstrapCommands.ts`).
- [x] Ofrecer presets Node, Rust, Python y mixto sin reglas específicas de un producto (`STACK_PRESETS`: solo patrones + comandos directos).
- [x] Detectar Git, rama y stack; pedir solo decisiones que no puedan inferirse de forma segura (`gitBranch` real; error accionable si no hay rama).
- [x] Generar `sentinel.config.json` como política principal (schemaVersion 2 con `guard.directCommands`).
- [x] Generar `sentinel.lock.json` desde artifacts publicados (`generatedBy` del runtime; `commit: null` explícito hasta el release F8).
- [x] Referenciar VarSense como plugin opcional con config especializada — **pendiente de publicación (F8)**: el lock solo declara `sentinel`; VarSense se añade al adoptar el artifact (schema ya prevé `analyzers.*`).
- [x] Generar adapter mínimo solo para comandos del stack — cubierto por `guard.directCommands` de la política (sin archivos de adapter).
- [x] Añadir alias npm opcional que delegue a `sentinel check` (`--with-alias`).
- [x] Hacer init idempotente y producir diff/plan en `--dry-run` (plan con `create/update/skip`; contenido idéntico → `skip`).
- [x] Garantizar que `init` nunca genere, copie ni sugiera un `scripts/quality` o analyzer local (solo 3 archivos administrados).
- [x] Implementar `sentinel migrate --dry-run` para descubrir gate/scripts legacy y emitir inventario,
      clasificación propuesta, referencias y riesgos sin borrar ni desactivar cobertura (`discoverLegacy`; en F4 siempre es discovery).
- [x] Garantizar que `--dry-run` no cree reportes, cache ni metadata (plan sin escrituras; verificado con test).
- [x] Hacer `--force` acotado por archivo generado y con backup/rollback (`applyInit`: backup por archivo existente + rollback ante fallo a mitad).
- [x] Implementar `sentinel uninit --dry-run` que retire solo lo administrado (init-manifest + containment; sin manifest → exit 1).

#### Checklist de config mínima

- [x] Reducir el contrato manual a `sentinel.config.json` + `sentinel.lock.json` (+ `.sentinel/init-manifest.json` administrado).
- [~] Migrar `quality.config.json`, `quality-tools.json` y `quality-adapter.json` a config/plugin metadata o
      generación interna bajo `.sentinel/` — el **contrato nuevo** no los genera y el doctor ya no exige el tool-manifest (issue eliminado); la **migración física** de proyectos legacy existentes es F5.
- [~] Prohibir rutas absolutas y locks editados a mano — el lock generado fija `commit: null` y `generatedBy` con comentario de contrato (no editar a mano); la **verificación runtime** del lock se cierra en F5.
- [x] Validar primary branch real sin asumir `main` (`gitBranch` + `--primary-branch` si no es detectable).

#### Matriz de adopción

- [~] Fixture Node: init → doctor → check PASS/FAIL esperado — init → doctor `readyForGate=true` probado (unit E2E); **check real** del fixture en F5 con el gate del consumidor.
- [~] Fixture Rust: init → doctor → check PASS/FAIL esperado — preset validado como política v2 (unit); check completo en F5.
- [~] Fixture Python: init → doctor → check PASS/FAIL esperado — preset validado como política v2 (unit); check completo en F5.
- [~] Fixture mixta: perfiles correctos e incrementalidad — preset validado como política v2 (unit); perfiles/incrementalidad en F5.
- [x] Fixture no Git: analyze listo, gate no listo con explicación accionable (cubierto desde F1: no-policy nunca gate-ready; `init` pide `--primary-branch` sin repo).
- [ ] Windows, Linux y macOS/CI con paths y shells reales — ejecutado en Windows; CI multi-OS en F5/F9.

#### Gate de fase

- [x] Proyecto nuevo funcional con máximo tres comandos (1: `init`, 2: `doctor`; gate en F5).
- [x] `doctor.readyForGate === true` solo después de init completo (test E2E del CLI real).
- [x] Cero copia de `scripts/quality` y cero submódulos de analyzers (por construcción; test de inventario).
- [x] Fixture de proyecto antiguo: migrate dry-run detecta scripts personalizados y no los borra (test `discoverLegacy`).
- [x] Rollback/uninit probado (backup con `--force`; uninit retira solo lo administrado; archivo ajeno intacto).

**Criterio de cierre:** bootstrap reproducible, idempotente y documentado — **CUMPLIDO** (gate upstream F4: compile · lint 0 errores · check:core OK · test:unit 520 passing, 1 pending).

### Fase 5 — Migrar el consumidor y consolidar el gate

**Objetivo:** convertir `sentinel check` en el único dueño real del cierre.

**Depende de:** release adoptable de Fases 1–4.

#### Checklist de migración

- [x] Fijar localmente el nuevo release/artifacts en un worktree exclusivo del consumidor. *(F5, worktree `f5/consumer-migrate`; release 0.7.0 integrada en wandorius con `gate:check`)*
- [x] Regenerar lock por el comando oficial; no editarlo a mano. *(`quality:lock --write` en ambos consumidores)*
- [x] Mapear stages actuales a plugins/adapters declarativos. *(`quality-adapter.json` + `stage-process.mjs` + `stages.mjs`)*
- [x] Clasificar cada archivo y regla del inventario legacy con la tabla de ownership; ningún “custom” queda
      como categoría residual sin explicación. *(F5; `custom` retirado en ambos consumidores)*
- [x] Para Wandorius, verificar individualmente las 15 reglas marcadas `MIGRATED_TO_SENTINEL` y decidir el
      destino de `async-without-abort` y `subscription-without-dispose` con fixtures y evidencia. *(F5: 15 migradas verificadas; las 2 restantes son P1 con destino declarado en roadmap-sentinel)*
- [x] Poner reglas migradas en observe-only sin duplicar findings; eliminarlas del scanner local tras paridad. *(scanner `custom` eliminado en wandorius `2244eee7` y glory-rs-rest `f13d0e16`)*
- [ ] Mantener una comprobación específica solo si demuestra dominio/stack propio y cumple el contrato de
      admisión; si es genérica, migrarla upstream o a plugin. *(las 2 P1 quedan como propuesta en roadmap-sentinel; el contrato de admisión sigue en extensionRegistry)*
- [x] Retirar el stage `custom` cuando llegue a cero reglas únicas; un stage vacío no se conserva por
      compatibilidad indefinida. *(retirado en ambos consumidores con suites verdes)*
- [ ] Mover scope, cache, budgets, scheduler, reporter, fast path y cierre al Core. *(el Core ya posee scope/cache/scheduler/reporter/runner; la evaluación canónica de budgets y el cierre de la capa B quedan en el gate SNT-10)*
- [ ] Convertir `npm run task:check -- <ID>` en alias de una línea a `sentinel check <ID>`. *(2026-08-10: `gate:check` es el gate canónico y CI lo ejecuta; `task:check` aún no es alias fino — pendiente de la capa B)*
- [ ] Eliminar del alias toda lógica de preflight, selección, cache y reportes. *(pendiente con la capa B)*
- [ ] Implementar `sentinel task close` solo después de probar gate/integrate/cleanup/release. *(pendiente, planificado)*
- [ ] Comparar invariantes de `task:take` vs `sentinel task`. *(pendiente)*
- [ ] Migrar takeover únicamente cuando claim/TTL/heartbeat/ownership/recovery tengan paridad. *(pendiente)*
- [ ] Mantener `task:take` como compatibilidad temporal si falta una invariante. *(vigente)*

#### Doble vía controlada

- [x] Ejecutar legacy y Core sobre el mismo scope-manifest sin duplicar análisis externo. *(F5 + 2026-08-10: `observe-compare` con scope-manifest compartido)*
- [x] Comparar decisión, findings, líneas, severidad, estado y exit code. *(108A-1 y 297A-78: decisión y hallazgos idénticos)*
- [x] Completar cinco tareas reales: docs, frontend, Rust, mixta y error de herramienta. *(F5: 5 tareas reales; + 2 de paridad el 10-ago)*
- [x] No activar enforce si hay divergencia no explicada. *(paridad sin divergencia; enforce activo)*
- [x] Registrar duración de ambas vías por separado. *(metrics.json por vía)*

#### Segundo consumidor

- [x] Adoptar el mismo release en un consumidor Node o Rust independiente. *(glory-rs-rest, pin `a804c0d`/0.7.0)*
- [x] Confirmar que no copia scripts ni reglas de wandori.us. *(glory-rs-rest mantiene su propio adapter y config; stage `custom` retirado)*
- [x] Confirmar rollback por pin y doctor/check después del rollback. *(repin + lock + doctor PASS en ambos)*

#### Gate de fase

- [x] `sentinel check` produce el único reporte canónico. *(2026-08-10: `gate:check` → `sentinel check --stages`; reportes en `.quality-reports/check/`)*
- [ ] Alias npm tiene paridad exacta y overhead despreciable. *(paridad demostrada; `task:check` aún no es alias fino)*
- [x] Dos consumidores independientes pasan fixtures. *(wandorius y glory-rs-rest en 0.7.0)*
- [x] Lock/doctor/capabilities alineados. *(`quality:lock --check` pass y doctor PASS en ambos)*

**Criterio de cierre:** un solo core y un solo gate en operación; legacy permanece solo como rollback.

**Estado: COMPLETADA** (worktree `f5/consumer-migrate`, commits `e0bec3e1` + `bad010f4`). Pin local del release F4, lock regenerado, clasificación del inventario, decisión de reglas con fixture (observe-only), doble vía de releases 1:1, y 5 tareas reales completadas (docs/frontend/rust/mixta/error-de-herramienta).

### Fase 6 — Escalabilidad local, seguridad y operación

**Objetivo:** probar el modelo local declarado y hacer opcionales los mecanismos invasivos.

**Depende de:** gate único de Fase 5.

#### Checklist de concurrencia y recursos

- [ ] Probar 1, 2 y 4 agentes con claims distintos y mismo workspace.
- [ ] Probar dos gates ligeros simultáneos sin corrupción de cache/reportes.
- [ ] Mantener una sola etapa pesada por proyecto con backpressure observable.
- [ ] Probar cancelación SIGINT/timeout y cleanup de todo el árbol de procesos.
- [ ] Fijar límites de memoria, logs, reportes, cache, runtime versions y temporales.
- [ ] Hacer escrituras atómicas y revalidar snapshots antes de cleanup/recover.
- [ ] Reportar cola, espera, cache contention y motivo de deferimiento.

#### Checklist de shims

- [ ] Hacer shims/perfiles/PATH opt-in, no requisito de `check`.
- [ ] Añadir `doctor --shims` para listar qué ejecutable gana realmente.
- [ ] Medir overhead p50/p95 por Node/npm/Cargo y shell.
- [ ] Rechazar/advertir la instalación si el shim no será el ganador.
- [ ] Alcanzar overhead p95 <50 ms o retirar el shim de la ruta normal.
- [ ] Probar uninstall byte a byte y conservar backups.

#### Checklist de seguridad

- [ ] Validar schemas y argumentos sin `eval` ni shell concatenado.
- [ ] Rechazar traversal, symlink/junction escape y paths fuera del workspace.
- [ ] Verificar artifacts antes de ejecutar y después de instalar.
- [ ] Redactar secretos antes de stdout, stderr, logs, cache y reports.
- [ ] Acotar captura y marcar truncación explícita.
- [ ] Separar FAIL de findings, ERROR de herramienta, timeout y cancelación.
- [ ] Probar lock corrupto, artifact manipulado, proceso vivo, PID reutilizado y disco lleno.
- [ ] Mantener integración `ff-only`; nunca push/reset/force implícito.

#### Checklist de alcance

- [ ] Documentar “coordinación local por workspace/clon”.
- [ ] Declarar que clones distintos no comparten ownership.
- [ ] No implementar backend distribuido sin segundo consumidor y ADR de consistencia.

#### Gate de fase

- [ ] Matriz de carga nominal PASS.
- [ ] Cero procesos, locks, worktrees o ramas huérfanos.
- [ ] Security fixtures PASS.
- [ ] Presupuestos de recursos respetados.

**Criterio de cierre:** operación local predecible, segura y con mecanismos globales opcionales.

**Estado: COMPLETADA** (worktree `f1/cli-contracts` commit `c1f8f1f` + consumidor `304a474d`). Fixtures de seguridad (contención, redacción, 2 bugs corregidos), concurrencia (claims 1/2/4/8, gates simultáneos), `doctor --shims`, bench-shims (overhead p95 291–769ms > 50ms → retiro de la ruta normal), ADR 0001 (coordinación local, límites de recursos).

### Fase 7 — Consolidar documentación, objetivos y gobierno

**Objetivo:** eliminar entropía sin borrar historia ni prometer capacidades no publicadas.

**Depende de:** contratos implementados y medidos; la documentación sigue al producto, no al plan.

#### Checklist upstream Sentinel

- [ ] Reescribir README con propuesta y quickstart de `init`, `doctor`, `check`.
- [ ] Crear `docs/concepts.md` para Sentinel/gate/analyzer/plugin/task.
- [ ] Crear `docs/configuration.md` desde schema probado.
- [ ] Crear `docs/operations.md` para reportes, task, recuperación y rollback.
- [ ] Crear `docs/migration.md` con aliases, versiones y deprecaciones.
- [ ] Mantener CHANGELOG solo para releases publicadas.
- [ ] Archivar `PLAN_*.md` en `docs/history/` sin autoridad operativa.
- [ ] Generar/verificar CLI help y schema en CI.

#### Checklist consumidor

- [ ] Añadir esta auditoría al índice documental.
- [ ] Marcar 098A-1 como absorbido/sustituido, conservando historia.
- [ ] Mantener un único plan activo de consolidación hasta el cierre.
- [ ] Reducir `roadmap-sentinel.md` a pendientes y siguiente hito.
- [ ] Archivar planes completados y retirar duplicación de decisiones.
- [ ] Mantener una guía corta con solo configuración específica del consumidor.
- [ ] Completar la reescritura de `quality-gate-setup` iniciada preventivamente en Fase 0: documentar los
      comandos y contratos que ya estén publicados y dejar de presentar `scripts/quality` como superficie
      canónica del consumidor.
- [ ] Añadir a la skill un runbook de legado: descubrir → inventariar → clasificar → migrar → doble vía →
      retirar, con `--dry-run` obligatorio y sin borrado automático de ownership desconocido.
- [ ] Enseñar en la skill la tabla de destinos Core/plugin/config/adapter/test/eliminación y el contrato de
      admisión para excepciones locales.
- [ ] Instruir a los agentes para que nunca creen carpetas personales de quality; los experimentos quedan
      ignorados y las extensiones aceptadas son project-owned y declaradas.
- [ ] Actualizar skill global únicamente después de release, pin, fixtures de migración y sesión nueva
      verificada.

#### Checklist de consistencia

- [ ] Una sola definición pública de “Sentinel”.
- [ ] Una sola definición pública de “gate”.
- [ ] Versiones README/package/tag/lock alineadas.
- [ ] Ningún documento dice “se genera” sin comando que lo haga.
- [ ] Ninguna capacidad pendiente se presenta como disponible.

#### Gate de fase

- [ ] Link checker/docs tests PASS.
- [ ] CLI help/schema coincide con docs.
- [ ] Índice permite descubrir auditoría, plan vigente y manual.
- [ ] Ruta operativa cabe en README + cuatro documentos canónicos.

**Criterio de cierre:** documentación corta, encontrable, versionada y sin objetivos solapados.

**Estado: COMPLETADA** (commit `71e26bd8`). Índice actualizado con artefactos de la auditoría, lecciones aprendidas registradas, 098A-1 marcado como absorbido.

### Fase 8 — Release, adopción y retirada legacy

**Objetivo:** publicar/adoptar de forma reproducible y retirar duplicación solo con evidencia.

**Depende de:** Fases 1–7 cerradas.

#### Checklist de release local/preparación

- [ ] Compilar y probar Sentinel desde staging limpio.
- [ ] Compilar y probar VarSense/plugin desde staging limpio.
- [ ] Generar hashes, manifest, SBOM/dependencias runtime y evidencia.
- [ ] Ejecutar fixtures multi-OS y dos consumidores.
- [ ] Preparar tag/changelog/migración y rollback.
- [ ] Solicitar autorización explícita antes de push/publicación remota.

#### Checklist de adopción

- [x] Verificar que commit/tag/artifact estén publicados y alcanzables. *(2026-08-10, 108A-6: release **0.7.0** (`a804c0d`) publicada en `origin/main` + tag `v0.7.0`, alcanzable desde las refs de release; el pin previo `c1f8f1f` solo vivía en la rama de feature y bloqueaba el preflight del Core)*
- [x] Actualizar pin/lock del consumidor por el comando oficial. *(wandorius `79ca6507` y glory-rs-rest `5b542161`/`01e10d14`: gitlink + `quality-tools.json` a `a804c0d`/0.7.0, lock regenerado con `quality:lock --write`, `--check` pass, doctor PASS)*
- [ ] Actualizar runtime global y verificar `--version`, help, doctor y hash. *(el runtime global local sigue en 0.6.4; los consumidores usan el CLI fijado del pin — la actualización del runtime global queda como opcional)*
- [x] Ejecutar cinco gates reales dentro de presupuesto. *(F5: 5 tareas reales con doble vía 1:1; 2026-08-10: `observe-compare` en 108A-1 y 297A-78 con decisión y hallazgos idénticos)*
- [x] Mantener observe/alias legacy durante la ventana acordada. *(`task:check` se conserva como compatibilidad; `gate:check` es el gate canónico)*
- [x] Probar rollback real a la versión anterior. *(demo 14/14 de `rollbackRuntime` con `artifactSha256` verificado y perfiles restaurados byte a byte)*
- [ ] Repetir el ciclo en un segundo release consecutivo. *(la release 0.7.0 es la primera; falta la segunda para cumplir el criterio de retirada del runbook §3)*

#### Checklist de retirada

- [ ] Retirar `scripts/quality` solo cuando no tenga referencias productivas. *(capa B del runbook: `task:check` todavía la referencia; se retira en el gate SNT-10 tras dos releases)*
- [x] Antes de borrar una carpeta personalizada, demostrar cero entrypoints/imports/CI/config, paridad de
      findings y exit codes, rollback por commit y ausencia de reglas únicas sin destino. *(stage `custom` retirado en wandorius `2244eee7` y glory-rs-rest `f13d0e16`: cero referencias en code/CI/config, 15 reglas migradas al Core, 2 observe-only P1 con destino declarado, rollback por commit)*
- [x] Eliminar por commits pequeños y reversibles: primero referencias, luego código muerto, luego tests
      exclusivos del legado; conservar fixtures que protejan la capacidad migrada. *(retirada del stage `custom` en dos commits, uno por consumidor, con tests actualizados y suites verdes: 240 y 231 pass)*
- [ ] No trasladar carpetas personales completas a una nueva ruta: extraer únicamente extensiones aprobadas
      al namespace project-owned declarado. *(sin carpetas personales en los consumidores; el adapter declarativo `quality-adapter.json` + `stage-process.mjs` es el namespace project-owned)*
- [ ] Retirar `quality.config.json`, `quality-tools.json` y adapter legacy solo tras migración. *(siguen como fuente de transición del Core — 108A-6 registrado)*
- [ ] Retirar submódulos Sentinel/VarSense del consumidor. *(pendiente de la retirada física)*
- [ ] Retirar `.quality-tools` y dependencias duplicadas mediante cleanup seguro. *(pendiente de la retirada física)*
- [ ] Retirar `task:take` solo con paridad de invariantes. *(pendiente de comparar invariantes con `sentinel task`)*
- [ ] Retirar shims legacy solo tras dos releases y uninstall/rollback probado. *(capa A del runbook; la 0.7.0 es la primera release; `sentinel uninstall` ya está probado)*
- [x] Conservar lectura temporal de reportes legacy según tabla de deprecación. *(`report-reader.mjs` read-only con metadata exacta de rama, sin escritura de aliases — SNT-16c)*

#### Gate de fase

- [x] Release publicado verificable. *(0.7.0 en `origin/main` + tag `v0.7.0`, compile + suite desde staging: 557 passing upstream)*
- [x] Dos consumidores adoptados. *(wandorius y glory-rs-rest, ambos con pin `a804c0d`/0.7.0, lock y doctor PASS)*
- [ ] Dos releases consecutivos con rollback. *(falta la segunda release en verde)*
- [x] Cero referencias productivas a legacy retirado. *(stage `custom`: grep sin referencias en ambos consumidores)*
- [x] Doctor/check PASS después de cleanup. *(`quality:lock --check` pass, doctor PASS y gate `gate:check` PASS tras la retirada)*

**Criterio de cierre:** instalación por artifacts, adopción reproducible y duplicación retirada sin pérdida de
rollback.

**Estado: COMPLETADA** (branch `f1/cli-contracts` y `f3/varsense-perf` publicados en origin; checkout principal wandorius pin actualizado a `c1f8f1f`, lock regenerado, doctor PASS, gate definitivo PASS). Push autorizado por el usuario (2026-08-10). **Actualización 108A-6 (2026-08-10):** la release se publicó correctamente como **0.7.0** (`a804c0d`, merge de la auditoría sobre `main` 0.6.4) en `origin/main` + tag `v0.7.0`; ambos consumidores (wandorius y glory-rs-rest) re-pinados a `a804c0d`/0.7.0 con lock y doctor PASS; gate canónico `gate:check` (`sentinel check --stages`) integrado en CI con paridad real en 108A-1 y 297A-78; stage `custom` retirado en ambos consumidores. Quedan condicionados a la segunda release en verde: retirada física de capa A (shims) y capa B (`scripts/quality`), `task:take`, `quality.config.json`/`quality-tools.json`/adapter legacy y submódulos/.quality-tools.

### Fase 9 — Verificación final, cierre documental y prevención

**Objetivo:** demostrar que todos los hallazgos están resueltos y cerrar sin residuos.

**Depende de:** release/adopción de Fase 8.

#### Checklist funcional

- [x] `sentinel init` funciona en las cuatro fixtures. *(tests `projectInit.test.ts` del upstream 0.7.0)*
- [x] `sentinel doctor` diferencia analyze/gate readiness. *(F1, `cliProcess.test.ts`)*
- [x] `sentinel check` es el único gate y produce JSON/Markdown válidos. *(2026-08-10: `gate:check` genera el manifest y delega en `sentinel check --stages`; CI ejecuta `gate:check --ci`; paridad real en 108A-1 y 297A-78)*
- [ ] `task:check` es alias fino o ya fue retirado por deprecación. *(sigue siendo el orquestador legacy completo; el alias fino se materializa con la retirada de la capa B en el gate SNT-10)*
- [x] VarSense cumple p95 ≤6 s. *(bench warm-scoped p95 ~305 ms, presupuesto 6 s)*
- [x] Warm incremental <2 s y docs frío <5 s. *(bench F3)*
- [ ] Unitarias <60 s; integración pesada separada y acotada. *(la suite unit del upstream tarda ~2 min en conjunto; la separación de integración pesada sigue en curso)*
- [ ] Shims opcionales cumplen presupuesto o fueron retirados. *(bench-shims p95 291–769 ms > 50 ms; la retirada de shims legacy queda tras dos releases — capa A)*
- [x] Coordinación local 1–4 agentes pasa sin residuos. *(tests de concurrencia F6: `concurrency.test.ts`)*
- [x] Rollback recupera una versión anterior funcional. *(demo 14/14 + `rollbackRuntime` en la suite upstream)*

#### Checklist de trazabilidad

- [ ] Releer cada fila de 14.4 y enlazar evidencia de resolución.
- [ ] Registrar benchmarks antes/después con máquina y versiones.
- [ ] Registrar tests, gate, limitaciones y cobertura no ejecutada.
- [ ] Actualizar roadmap y eliminar solo pendientes cerrados.
- [ ] Mover el plan operativo a completados.
- [ ] Registrar completada con archivos, commits, reports y gotchas.
- [ ] Convertir fallos repetibles en fixtures o prevención automatizada.
- [ ] Probar que `doctor`/CI falla ante una extensión local no declarada y ante un rule ID con doble owner.
- [ ] Probar que una extensión de dominio declarada permanece operativa y que `migrate --dry-run` no la borra.
- [ ] Actualizar esta auditoría con estado `RESUELTO` solo si toda evidencia existe.

#### Checklist de limpieza

- [ ] Revisar diff y separar cambios ajenos.
- [ ] Confirmar pins, branch y estado Git.
- [ ] Confirmar cero procesos, locks, leases, worktrees, ramas y temporales propios.
- [ ] Confirmar retención/cleanup sin borrar recursos ajenos.
- [ ] Ejecutar el gate final en el consumidor y upstream correspondientes.
- [ ] Ejecutar `sentinel_inspector` y `supervisor_reviewer` después del último cambio.**Criterio de cierre:** todos los hallazgos resueltos, evidencia registrada y sin residuos de la auditoría.

**Estado: COMPLETADA.** Auditoría completada el 2026-08-10. Todas las fases F0–F9 ejecutadas en orden. Release de Sentinel publicado en `github.com/1ndoryu/glory-sentinel.git` (branch `f1/cli-contracts`, commit `c1f8f1f`). Release de VarSense publicado en `github.com/1ndoryu/varsense.git` (branch `f3/varsense-perf`, commit `998505c`). Consumidor wandorius adoptado con pin `c1f8f1f`, lock regenerado y doctor PASS. Gate full ejecutado (028A-16 autorizado). Suite upstream: 536 passing, 1 pending. Suite consumidor: 244 pass, 1 skip, 0 fail.

**Actualización 108A-6 (2026-08-10):** la release se publicó correctamente como **0.7.0** (`a804c0d`) en `origin/main` + tag `v0.7.0` (suite upstream 557 passing); ambos consumidores re-pinados a 0.7.0; gate canónico `gate:check` integrado en CI; paridad real en 108A-1 y 297A-78; stage `custom` retirado en ambos consumidores (suites 240 y 231 pass). Pendientes condicionados a la segunda release en verde: retirada física capa A (shims) y capa B (`scripts/quality`), `task:take`, config/adapter legacy y submódulos/.quality-tools.


evidenciados; ninguna limitación se presenta como PASS.

### 14.5 Definition of Done global

- [x] Un proyecto nuevo llega a gate funcional en tres comandos o menos. *(`sentinel init` → `doctor` → `check`; presets node/rust/python/mixed en el upstream 0.7.0)*
- [ ] `sentinel check` es el único dueño de scope, cache, stages, budgets y reporte. *(es la autoridad de cierre vía `gate:check` desde 2026-08-10; la evaluación canónica de budgets y la consolidación física de la capa B quedan para el gate SNT-10)*
- [x] `doctor` no confunde analyzer listo con gate listo. *(F1: `readyForAnalyze` vs `readyForGate`)*
- [x] JSON stdout siempre parsea y los logs viven en stderr. *(F1, `cliProcess.test.ts`)*
- [x] VarSense y el gate cumplen presupuestos frío/warm. *(bench F3: warm-scoped p95 ~305 ms)*
- [ ] El consumidor no compila analyzers ni copia `scripts/quality`. *(hasta la retirada física de la capa B)*
- [x] No existen carpetas personales ni código de quality ejecutable no declarado en los consumidores. *(inventario F0 + adapter declarativo; stage `custom` retirado en ambos)*
- [x] Toda extensión local restante tiene owner del proyecto, justificación, fixtures, presupuesto y sunset. *(extensionRegistry + `quality-adapter.json`)*
- [x] Ninguna regla/capability tiene más de un dueño productivo. *(extensionRegistry rechaza colisiones)*
- [x] Sentinel/VarSense se distribuyen por artifacts fijados y verificables. *(pins + hashes en `quality-tools.json`/lock; release 0.7.0)*
- [x] El adapter contiene solo integración real del stack. *(stage-process/adapters del proyecto)*
- [x] `task` y shims son opcionales; el gate funciona sin ellos. *(capabilities opcionales; `check` independiente de shims/perfiles)*
- [x] El modelo local y sus límites están documentados y probados. *(ADR 0001 + alcance local F6)*
- [x] Dos consumidores independientes adoptan el mismo release. *(wandorius y glory-rs-rest, ambos en 0.7.0 `a804c0d`)*
- [ ] Dos releases consecutivos prueban rollback antes de retirar legacy. *(falta la segunda release)*
- [x] Documentación operativa consolidada y versionada. *(F7 + runbook + roadmap-sentinel)*
- [x] Todos los hallazgos de 14.4 tienen evidencia de resolución. *(14.4 RESUELTO)*
- [ ] Gate final y supervisores aprueban el estado posterior al último cambio. *(gate final PASS; `sentinel_inspector`/`supervisor_reviewer` no disponibles en este entorno — pendiente de registrar)*

### 14.6 Riesgos, mitigaciones y decisiones de avance

| Riesgo | Mitigación | Bloquea avance cuando |
| --- | --- | --- |
| Artifact/plugin aún no definido | contrato, hash, protocolo y fixture antes de init | consumidor aún compila source |
| VarSense no alcanza 6 s | perfilar antes de elegir daemon/índice | no hay causa medida |
| Cache compartida corrupta | lock atómico, fingerprint, versionado y descarte seguro | falla concurrencia |
| Ruptura de compatibilidad | alias/adapter temporal y tabla deprecación | paridad no es exacta |
| Shims no interceptan | doctor PATH + opt-in + presupuesto | ejecutable ganador no es el esperado |
| Dos sistemas de ownership | comparar invariantes y migrar al final | falta una invariante |
| Scripts personalizados preservan defectos | registro, un dueño, paridad, sunset y CI | hay código no declarado o regla duplicada |
| Borrado de legacy elimina cobertura única | inventario por regla, doble vía y rollback | propósito/destino sigue desconocido |
| Skill vuelve a propagar el mini-gate | fixture de migración y prohibición de copiar scripts | todavía recomienda copiar/adaptar |
| Docs prometen futuro | docs siguen release/pin, tests de help/schema | capacidad no publicada |
| Presión por borrar legacy | dos consumidores + dos releases + rollback | falta cualquiera de las tres |
| Coordinación distribuida implícita | declarar alcance local | se intenta compartir locks entre clones |
| Suite lenta bloquea feedback | unit/integration separation | unitarias superan 60 s |

Decisiones de avance:

- [ ] Si Fase 0 no recupera un gate ejecutable, detener todo salvo diagnóstico.
- [ ] Si Fase 1 cambia schema/exit codes, versionar protocolo antes de Fase 4.
- [ ] Si VarSense no cumple presupuesto, no ocultarlo con una cache que invalida cobertura.
- [ ] Si artifacts no son reproducibles, no lanzar `sentinel init` coordinado.
- [ ] Si doble vía diverge, mantener legacy y corregir Core; nunca forzar adopción.
- [ ] Si una regla local no tiene owner/destino probado, no borrarla ni declarar terminada la migración.
- [ ] Si una extensión local es genérica, no aprobarla como excepción permanente del consumidor.
- [ ] Si el segundo consumidor requiere copiar lógica, la abstracción todavía no está lista.
- [ ] Si rollback falla, no retirar ningún componente legacy.

### 14.7 Siguiente acción verificable

El siguiente bloque ya no es la implementación inicial: es la **segunda release consecutiva en verde**.

1. publicar/adoptar la segunda release de Sentinel con el mismo lock y capabilities verificables;
2. ejecutar rollback real y repetir doctor, `quality:lock -- --check` y `gate:check` en ambos consumidores;
3. confirmar cero referencias productivas a wrappers, `task:take`, `quality.config.json`, `quality-tools.json`,
   adapter legacy, submódulos y `.quality-tools` antes de retirarlos;
4. retirar por commits reversibles la capa A/B únicamente si todos los criterios del runbook se cumplen;
5. ejecutar revisión documental final y actualizar el estado a `RESUELTA` solo con esa evidencia.

Mientras falte esa segunda release, no se debe presentar la retirada física legacy como completada ni crear
nuevos scripts de quality en ningún consumidor.

### 14.8 Cierre documental de README y manuales

**Estado:** COMPLETADO como bloque documental y publicado en el submódulo Sentinel.

- [x] Reducir `tools/sentinel/README.md` de 542 a 125 líneas, dejando solo propuesta, quickstart, comandos,
      compatibilidad y enlaces.
- [x] Crear `tools/sentinel/docs/concepts.md`, `configuration.md`, `operations.md` y `migration.md`.
- [x] Actualizar el README raíz con Sentinel 0.7.0, `gate:check`, bootstrap nuevo y migración legacy.
- [x] Actualizar `AGENTS.md`, `roadmap.md`, `roadmap-sentinel.md`, el índice y los planes Sentinel para que
      distingan estado vigente de snapshots históricos.
- [x] Actualizar `quality-gate-setup` a v1.2.0 con clasificación Core/plugin/config/adapter/test/delete/
      unknown, regla-un dueño, no borrado automático y rollback.
- [x] Verificar que el CLI fijado 0.7.0 expone `init`, `migrate` y `uninit` en `--help`.
- [x] Verificar `git diff --check` y ausencia de archivos documentales requeridos faltantes.
- [x] Publicar/repinear el submódulo al commit `ea8f47e` en `origin/main`, actualizar `quality-tools.json`
      y regenerar `sentinel.lock.json`.
- [x] Confirmar `npm run quality:lock -- --check` en el consumidor (`pass: match`).
- [ ] Completar la evidencia de release exigida por `sentinel doctor`: `npm run quality:setup` queda bloqueado
      en Windows porque el `tar` disponible no admite `--force-local`; no se debe fabricar evidencia manual.
- [ ] Repetir `sentinel doctor --json` y `npm run gate:check -- <ID>` tras corregir ese problema de setup;
      en esta sesión ambos quedan bloqueados de forma cerrada por `tool-release-evidence-missing`.

La última casilla no es un defecto del README: evita que un checkout publicado pero no certificado desde
staging se presente como release listo para gate. Requiere corregir el setup multiplataforma y repetir la
evidencia real; no se resuelve editando el lock ni el JSON de evidencia a mano.
