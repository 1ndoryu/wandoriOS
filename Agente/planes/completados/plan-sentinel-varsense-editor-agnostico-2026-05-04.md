# Plan histórico completado: Sentinel + VarSense editor-agnóstico

> **Estado:** trabajo principal completado y documentado en tareas 085A/105A.  
> **Uso:** registro histórico; nuevas reglas de wandori.us se ejecutan desde `prevencion-wandorius-sentinel-varsense-2026-07-29.md`.

## Objetivo

Convertir Glory Sentinel y VarSense en herramientas con un motor real independiente del editor, manteniendo la extension de VS Code como adaptador y habilitando primero reportes por CLI y despues diagnosticos nativos en Zed mediante LSP.

La meta no es emular VS Code en Zed. La meta es que VS Code, CLI, LSP y Zed consuman el mismo core, con las mismas reglas, rangos, severidades, configuracion y pruebas de equivalencia.

## Principios de arquitectura

- El core no importa `vscode`, no registra watchers, no muestra UI y no escribe reportes por si mismo.
- Los adaptadores convierten tipos externos a tipos core y de vuelta: VS Code Diagnostic, salida CLI, LSP Diagnostic.
- Cada regla se prueba contra el core. VS Code, CLI y LSP solo prueban conversion y transporte.
- La CLI no es un modo degradado: usa el mismo motor y genera el mismo conjunto de hallazgos.
- El LSP no duplica reglas: invoca el mismo core y traduce hallazgos a `textDocument/publishDiagnostics`.
- La extension de Zed debe ser pequena: registrar o lanzar el language server, no reimplementar analisis.

## Estado actual observado

### Glory Sentinel

- Los analizadores ya retornan un formato intermedio propio (`Violacion`) y eso reduce el riesgo.
- El acoplamiento principal vive en providers, cache, rule loader, report generator y algunos analizadores Glory que usan workspace.
- Hay suite mocha con mock de `vscode`, util para asegurar compatibilidad mientras se extrae core.
- Existe una modificacion previa no mia en `package.json` (version 0.2.3 -> 0.2.4); no se debe revertir.

### VarSense

- Los parsers de valores y CSS contienen logica reutilizable, pero sus tipos usan `vscode.Range`.
- `VariableScanner` y `classScanner` son el bloqueo mayor: dependen de `vscode.workspace.findFiles`, watchers y singletons.
- La suite actual tiene mas pruebas de integracion que de core; necesita pruebas unitarias editor-agnosticas antes del refactor fuerte.

## Arquitectura objetivo

Cada repositorio mantiene su extension actual, pero se organiza por capas:

```text
src/
  core/
    types.ts              # Documento, rango, severidad, hallazgo, config
    analyzer.ts           # API publica del motor
    report.ts             # Markdown/JSON puro, sin editor
    fixtures/             # Casos de equivalencia
  platform/
    node/                 # fs, glob, stdout, config file
    vscode/               # TextDocument, Diagnostic, settings
    lsp/                  # LSP document store y diagnostics
  cli/
    index.ts              # comando real de reportes
  extension.ts            # activacion VS Code, UI, comandos
```

En el estado inicial se acepta `src/core/vscodeAdapter.ts` para no mover demasiados archivos a la vez. Cuando la capa crezca, se migra a `src/platform/vscode/`.

## Contratos core obligatorios

Tipos base compartidos por todas las superficies:

- `CoreSeverity`: `error | warning | information | hint`.
- `CorePosition`: linea y columna 0-indexed.
- `CoreRange`: inicio y fin 0-indexed.
- `CoreTextDocument`: `uri`, `fileName`, `languageId`, `getText()`, `lineAt()`, `lineCount`.
- `CoreFinding`: `ruleId`, `message`, `severity`, `range`, `source`, `suggestion`, `quickFixId`, `metadata`.
- `CoreAnalysisConfig`: patrones de inclusion/exclusion, overrides de reglas y opciones de motor.
- `CoreWorkspaceContext`: raiz, archivos y configuracion.

## Fases

### Fase 0 - Contratos y pruebas base

Objetivo: crear tipos core y adaptadores VS Code sin tocar el flujo actual.

Tareas:

- Sentinel: crear `src/core/types.ts` y `src/core/vscodeAdapter.ts`.
- Sentinel: agregar pruebas de documento, rango, serializacion y conversion a Diagnostic.
- VarSense: crear `src/core/types.ts` y `src/core/vscodeAdapter.ts`.
- VarSense: agregar pruebas de documento, rango, serializacion y conversion a Diagnostic.
- Validar `npm run compile` y pruebas disponibles en ambos repos.

Criterio de cierre:

- Los nuevos tipos no importan `vscode`.
- Solo los adaptadores importan `vscode`.
- Los hallazgos core serializan a JSON sin perdida de rangos ni severidad.

### Fase 1 - Sentinel core real

Objetivo: que Sentinel pueda analizar un archivo desde core sin abrir VS Code.

Tareas:

- Cambiar analizadores para aceptar `CoreTextDocument` en vez de `vscode.TextDocument` cuando solo usan `getText`, `lineAt`, `fileName` y `languageId`.
- Mover `severidadADiagnostic` fuera de `types/index.ts` a adaptador VS Code.
- Crear `core/analyzeDocument.ts` que coordine `static`, `php`, `react`, `rust`, `glory` y `apiEndpoint` cuando aplique.
- Crear `core/report.ts` que reciba hallazgos y genere Markdown/JSON sin escribir archivos.
- Mantener `providers/diagnosticProvider.ts` como capa VS Code que solo busca documentos, llama core y publica diagnostics.

Criterio de cierre:

- `src/analyzers/**` no importa `vscode`, salvo modulos que aun dependan explicitamente del workspace y esten listados como pendiente.
- El comando VS Code `analyzeWorkspace` produce el mismo reporte que antes.
- La suite de reglas existente sigue pasando.

### Fase 2 - VarSense core real

Objetivo: separar parser, indices de variables y escaneo de archivos del runtime VS Code.

Tareas:

- Reemplazar `vscode.Range` en tipos core por `CoreRange`.
- Hacer que `cssParser` opere sobre `CoreTextDocument`.
- Extraer `VariableIndexBuilder` sin watchers ni singleton.
- Definir interfaces `DocumentProvider`, `WorkspaceFileProvider` y `FileWatcher`.
- Implementar adaptador VS Code para providers y watchers.
- Refactorizar `VariableScanner` para recibir dependencias en constructor; mantener singleton solo en extension VS Code.
- Refactorizar `classScanner` para usar provider de archivos, no `vscode.workspace.findFiles` directo.

Criterio de cierre:

- Parsers y scanners centrales no importan `vscode`.
- VS Code conserva hover, completion, diagnostics, auto-fix y reportes.
- Tests unitarios cubren variables no definidas, hardcoded, fallback, propiedades prohibidas, CSS inline y clases huerfanas.

### Fase 3 - CLI de reportes

Objetivo: tener comandos reales para Zed tasks, CI y terminal.

Tareas:

- Sentinel: `sentinel analyze --workspace . --format markdown --output .sentinel-report.md`.
- Sentinel: `sentinel analyze --file path --format json`.
- VarSense: `varsense scan --workspace . --format markdown --output .varsense-report.md`.
- VarSense: `varsense orphan-classes --workspace . --format json`.
- Soportar config por archivo: `sentinel.config.json`, `varsense.config.json`.
- Agregar codigos de salida: 0 limpio, 1 hallazgos error, 2 fallo de ejecucion/config.

Criterio de cierre:

- Los comandos pueden correr desde Zed tasks sin VS Code instalado.
- Los reportes Markdown conservan conteos por severidad y tabla por archivo.
- La salida JSON permite comparacion automatica en tests.

### Fase 4 - Matriz de equivalencia

Objetivo: demostrar que VS Code y CLI ven lo mismo.

Tareas:

- Crear fixtures compartidos por extension: `fixtures/equivalence/`.
- Para cada fixture, guardar hallazgos esperados en JSON.
- Ejecutar el core directamente y comparar contra esperado.
- Ejecutar CLI y comparar contra esperado.
- En VS Code, probar adaptador de conversion a Diagnostic sin depender de UI.

Criterio de cierre:

- Cualquier regla nueva debe agregar fixture o test unitario.
- Los snapshots de CLI y core coinciden por `ruleId`, severidad, mensaje base y rango.

### Fase 5 - LSP comun para Zed y otros editores

Objetivo: diagnosticos nativos en editores que soporten LSP.

Tareas:

- Crear servidor LSP Node para cada herramienta o uno combinado con namespaces.
- Implementar `initialize`, `textDocument/didOpen`, `didChange`, `didSave`, `workspace/didChangeConfiguration` y `publishDiagnostics`.
- Mantener indice incremental de documentos abiertos.
- Para analisis workspace, usar provider Node del core.
- Traducir `CoreFinding` a `Diagnostic` LSP con `source`, `code`, `severity`, `range`.

Criterio de cierre:

- El LSP publica diagnosticos en un cliente de prueba sin VS Code.
- Los diagnosticos LSP coinciden con CLI para los mismos fixtures.

### Fase 6 - Zed

Objetivo: integracion genuina en Zed.

Tareas:

- Crear extension Zed minima en Rust/WASM que localice o descargue el binario LSP.
- Registrar language server para CSS, SCSS, TSX, JSX, TS, JS, PHP y Rust segun corresponda.
- Agregar `.zed/tasks.json` de ejemplo para ejecutar CLI de reportes.
- Documentar instalacion dev y publicacion.

Criterio de cierre:

- Zed muestra diagnosticos provenientes del LSP.
- Zed puede ejecutar reportes CLI como tarea.
- No existe logica de reglas duplicada en la extension Zed.

### Fase 7 - CI y publicacion

Objetivo: que la arquitectura siga sana al crecer.

Tareas:

- Agregar checks de no importacion de `vscode` dentro de `src/core/**`.
- Agregar tests de fixtures en CI.
- Agregar build CLI.
- Agregar smoke test LSP.
- Documentar versionado de core, CLI, extension VS Code y extension Zed.

Criterio de cierre:

- CI falla si una regla core vuelve a depender de VS Code.
- CI falla si CLI y core divergen.

## Orden recomendado de trabajo

1. Completar Fase 0 en ambos repos.
2. Extraer Sentinel primero porque su `Violacion` ya es casi core.
3. Despues atacar VarSense, empezando por rangos y parser antes que watchers.
4. Crear CLI de Sentinel como primer comando real.
5. Crear CLI de VarSense cuando `VariableScanner` deje de depender de VS Code.
6. Montar tests de equivalencia antes de iniciar LSP.
7. Implementar LSP.
8. Crear extension Zed fina.

## Avance 2026-05-04

- Fase 0 iniciada en Sentinel y VarSense.
- Creados contratos `core` para documento, rango, severidad, hallazgo, configuracion y contexto workspace.
- Creados adaptadores VS Code para convertir documentos y hallazgos core a diagnosticos.
- Agregadas pruebas de serializacion y conversion en ambos repos.
- Sentinel validado con `npm run compile` y `npm run test:unit`: 282 passing, 1 pending.
- VarSense validado con `npm test`: 26 passing.
- Se corrigieron bloqueos preexistentes de VarSense que impedian ejecutar la suite completa: reglas ESLint `curly`, resolucion runtime de alias `@/` en tests compilados y ID de extension incorrecto en smoke tests.

## Avance 2026-05-08

- `085A-1`: Sentinel avanzo a Fase 1 parcial/operativa: `core/analyzeDocument.ts` coordina reglas static/PHP/React/Rust sobre `CoreTextDocument`, `core/violacionAdapter.ts` convierte `Violacion` a `CoreFinding`, y `diagnosticProvider` publica diagnostics desde el adaptador VS Code.
- `085A-1`: Sentinel elimino `vscode` de `types/index.ts`, `config/ruleRegistry.ts`, `staticAnalyzer`, reglas estaticas, fachadas PHP/React/Rust y helpers compartidos. Las reglas Glory/API que aun requieren watchers/workspace quedan inyectadas como `extraAnalyzers` desde VS Code.
- `085A-1`: VarSense avanzo en Fase 2: `types/index.ts` usa `CoreRange`, los parsers CSS/value operan sobre `CoreTextDocument`, `cssParser` ya no importa `configService`, y providers/scanner convierten documentos/rangos en el borde VS Code.
- `085A-1`: Agregadas pruebas core nuevas: Sentinel analiza un documento sin abrir VS Code; VarSense parsea CSS con rangos serializables.
- Validacion: Sentinel `npm run compile` y `npm run test:unit` pasaron (`283 passing`, `1 pending`). VarSense `npm test` paso (`27 passing`) e incluye compile, compile:tests y lint.
- Gap detectado: `npm run lint` en Sentinel falla porque el repo no declara/configura ESLint (`eslint` no se reconoce). No se corrigio en este bloque para evitar mezclar tooling nuevo con el refactor core; queda como pendiente de Fase 7/CI.
- Pendiente tecnico: Fase 1 aun no tiene `core/report.ts`; Fase 2 aun no extrae `VariableIndexBuilder`, `DocumentProvider`, `WorkspaceFileProvider` ni `FileWatcher`; Fase 3+ dependen de esos pasos.

## Avance 2026-05-08 - continuacion

- `085A-2`: Sentinel completo el hueco principal de Fase 1: `core/report.ts` genera Markdown desde `CoreFinding` sin filesystem ni VS Code. `providers/reportGenerator.ts` quedo como adaptador que convierte `vscode.Diagnostic` a core y escribe/abre el archivo en VS Code.
- `085A-2`: Sentinel agrego conversion inversa `diagnosticToFinding` en el adaptador VS Code y prueba core de reporte Markdown serializable.
- `085A-2`: VarSense avanzo Fase 2 con `core/workspaceProviders.ts`, `core/variableIndexBuilder.ts` y `core/classIndexBuilder.ts`. Los builders reciben `DocumentProvider`/`WorkspaceFileProvider`; los tests usan providers en memoria sin objetos VS Code.
- `085A-2`: `VariableScanner` conserva singleton/watchers de VS Code, pero delega construccion e invalidacion de indice al builder core. `classScanner` quedo como adaptador fino sobre `ClassIndexBuilder`.
- Validacion: Sentinel `npm run compile` y `npm run test:unit` pasaron (`284 passing`, `1 pending`). VarSense `npm test` paso (`29 passing`) e incluye compile, compile:tests y lint.
- Pendiente tecnico: Fase 2 aun mantiene watchers y singleton en `VariableScanner`; falta extraer `FileWatcherProvider` real para eventos y preparar config Node/CLI. Fase 3 CLI queda desbloqueada parcialmente por `core/report.ts` y los builders, pero aun necesita providers Node y parser de config.

## Avance 2026-05-08 - CLI Sentinel

- `085A-3`: Sentinel avanzo Fase 3 con `src/cli/index.ts` y binario `sentinel` en `package.json`.
- El comando soporta `sentinel analyze --workspace . --format markdown --output .sentinel-report.md` y `sentinel analyze --file path --format json`.
- La CLI lee `sentinel.config.json` cuando existe, acepta `includePatterns`, `excludePatterns`, `directoryExceptions` y overrides `rules` compatibles con `ConfigReglaUsuario`.
- Codigos de salida implementados: `0` sin errores, `1` con hallazgos de severidad error, `2` fallo de ejecucion/config.
- Durante el smoke test aparecio una fuga indirecta de `vscode`: `reactAnalyzer` cargaba `apiContractRules`, que cargaba `apiContractIndexer`. Se separo `apiFallbackRules.ts` para que la CLI pueda arrancar en Node puro.
- Validacion: Sentinel `npm run compile` y `npm run test:unit` pasaron (`287 passing`, `1 pending`). Smoke CLI JSON y Markdown pasaron sobre fixtures temporales con `hardcoded-secret` y exit `1` esperado.
- Pendiente tecnico: el indexador de contratos Glory/API sigue atado a VS Code y queda fuera del core CLI hasta extraer providers Node/workspace. La Fase 4 debe agregar fixtures de equivalencia CLI/core para evitar regresiones.

## Avance 2026-05-10 - LSP, Zed y CI operativo

- `105A-1`: Sentinel agrego `src/lsp/server.ts` y `src/lsp/diagnostics.ts`. El servidor LSP publica `textDocument/publishDiagnostics` desde `CoreFinding` usando el mismo `analyzeDocument` que CLI y VS Code.
- `105A-1`: Sentinel movio defaults y overrides compartidos a `src/core/config.ts` para que CLI y LSP no diverjan en `includePatterns`, `excludePatterns`, `directoryExceptions` ni `rules`.
- `105A-1`: Sentinel agrego binario `sentinel-lsp`, scripts `lsp`, `smoke:lsp`, `check:zed`, dependencias LSP y smoke stdio contra la fixture `language-selector-design-spec`.
- `105A-1`: Sentinel agrego integracion Zed minima en `integrations/zed/` y tareas `.zed/tasks.json`; la extension solo localiza/lanza `sentinel-lsp` via `SENTINEL_LSP_PATH`, PATH u `out/lsp/server.js`.
- `105A-1`: Sentinel dejo `npm run lint` operativo con ESLint TypeScript. Se corrigieron escapes regex que bloqueaban lint y quedo una excepcion local documentada para el rango Unicode de emojis compuestos.
- VarSense no requirio cambios en este bloque: ya contaba con CLI, LSP, equivalencia, smoke LSP, check core y Zed. Se valido completo con `npm test`.
- Validacion Sentinel: `npm run lint` paso con 14 warnings preexistentes y 0 errors; `npm run test:unit` paso (`294 passing`, `1 pending`) incluyendo `check:core` y `smoke:lsp`; `npm run check:zed` paso.
- Validacion VarSense: `npm test` paso (`36 passing`) incluyendo compile, compile:tests, lint, `check:core`, `smoke:lsp`, fixtures de equivalencia y pruebas VS Code.
- Pendiente tecnico restante: Sentinel todavia tiene reglas Glory/API acopladas a watchers/cache de VS Code (`gloryAnalyzer`, `apiEndpointAnalyzer`, indexadores de schema/islas/contratos/tipos/constantes). El LSP cubre las reglas core puras; para que absolutamente todas las reglas lleguen a CLI/LSP/Zed falta extraer providers Node/workspace de esa familia.

## Avance 2026-05-10 - cierre Glory/API, watchers y crash de fixtures

- `105A-2`: Sentinel extrajo la familia Glory/API del runtime VS Code: `gloryAnalyzer`, `apiEndpointAnalyzer`, `schemaLoader`, `islandTracker`, `apiContractIndexer`, `phpConstantIndexer` y `tsTypeResolver` cargan indices desde raices inyectadas por CLI/LSP/VS Code.
- `105A-2`: Sentinel movio los watchers reales a `src/platform/vscode/gloryAnalyzerAdapter.ts`; el provider VS Code ya no inyecta Glory/API como `extraAnalyzers`, sino que todo pasa por `core/analyzeDocument.ts`.
- `105A-2`: Sentinel agrego `src/core/language.ts` y `src/core/workspaceRoots.ts` para compartir resolucion de lenguajes y raices sin importar la CLI ni `vscode`.
- `105A-2`: Sentinel amplio equivalencia con fixtures PHP, Rust y React. El crash de `npm run compile` se corrigio limitando `tsconfig.json` a `src/**/*.ts`, evitando que TypeScript compile fixtures `.tsx` fuera de `rootDir`.
- `105A-2`: Sentinel agrego CI con `npm ci`, lint, `test:unit` y `check:zed`; tambien agrego SCSS a activacion/defaults/Zed.
- `105A-2`: VarSense completo el pendiente de Fase 2: `VariableScanner` recibe watchers por `FileWatcherProvider` y el adaptador VS Code implementa `VscodeFileWatcherProvider`.
- `105A-2`: VarSense agrego CI con `npm ci`, `xvfb-run -a npm test` y `check:zed`.
- Validacion Sentinel: `npm run compile`, `npm run lint` (0 errores, 11 warnings), `npm run test:unit` (`297 passing`, `1 pending`, incluye `check:core` y `smoke:lsp`) y `npm run check:zed` pasaron.
- Validacion VarSense: `npm test` (`36 passing`, incluye compile, compile:tests, lint, `check:core`, `smoke:lsp`, equivalencia y pruebas VS Code) y `npm run check:zed` pasaron.
- Estado global: VS Code, CLI, LSP y Zed consumen el mismo core para las familias implementadas, incluyendo Glory/API; los pendientes restantes son publicar/instalar empaquetados y seguir ampliando fixtures por cada regla nueva.

## Riesgos y mitigaciones

- Riesgo: duplicar reglas entre CLI y VS Code. Mitigacion: VS Code debe llamar core, nunca al reves.
- Riesgo: rangos distintos por diferencias de normalizacion de saltos de linea. Mitigacion: `createCoreDocument` normaliza lineas y todos los tests usan rangos 0-indexed.
- Riesgo: VarSense rompe hover/completion al separar parser. Mitigacion: no mover providers hasta tener tests de parser y sugerencias.
- Riesgo: LSP demasiado pronto. Mitigacion: no iniciar LSP hasta que CLI y fixtures sean estables.
- Riesgo: configs divergentes. Mitigacion: parser unico de config core y adaptadores por superficie.

## Pruebas obligatorias por fase

- Unitarias core: tipos, rangos, documento, serializacion.
- Unitarias reglas: una por regla o familia de reglas.
- Equivalencia core vs CLI: snapshots JSON.
- Adaptador VS Code: conversion de severidad, range y code.
- CLI: codigos de salida y generacion de Markdown/JSON.
- LSP: publishDiagnostics con fixture minimo.
- Zed: smoke test manual documentado y tarea CLI funcionando.

## Definicion de hecho global

- Se puede desarrollar una regla nueva una sola vez en core.
- La regla aparece en VS Code como diagnostic.
- La misma regla aparece en reporte CLI.
- La misma regla aparece via LSP en Zed.
- Hay fixture que prueba esa equivalencia.
- El core sigue sin imports de `vscode`.
