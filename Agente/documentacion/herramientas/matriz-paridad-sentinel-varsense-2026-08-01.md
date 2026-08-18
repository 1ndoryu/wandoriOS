# Matriz de paridad Sentinel/VarSense — 2026-08-01

> **Actualización 2026-08-04 — SNT-10 + sourcePathEnv:** VarSense `main` `858ec62` y Sentinel `main` `9f4ed4d` están publicados y son consumidos directamente por el gate mediante `sourcePathEnv`. Las copias `.quality-tools/sentinel` y `.quality-tools/varsense` fueron retiradas. El lock valida commit, capacidades, hash de archive y `sourcePathEnv`; preflight resuelve la ruta local, compara el `realpath` actual sin persistirlo y valida el checkout. Lock-check, preflight y 127/127 quality tests PASS. La persistencia entre ejecuciones, watchers/LSP persistentes y grafo de dependencias siguen pendientes.

## Versiones fijadas

| Herramienta | Versión | Commit | CLI | LSP/VS Code | Fixture/gate |
| --- | --- | --- | --- | --- | --- |
| Glory Sentinel | 0.4.0 | `9f4ed4d4d866a016022f2458e69c0226eeee345a` | PASS | Core editor-agnóstico PASS | `npm run test:unit`, `task:check` |
| VarSense | 2.2.0 | `858ec62c8efc1239fea241e3092e1939ae6b63df` | `scan`, `orphan-classes`, `all`, `--files-from`; sourcePathEnv externo | Core/LSP/VS Code PASS | 60 pruebas upstream, `npm test` |
| VarSense upstream | 2.2.0 | `858ec62c8efc1239fea241e3092e1939ae6b63df` | `scan`, `orphan-classes`, `all`, `--files-from` | CLI/core PASS; sourcePath externo activo | 60 pruebas, compile/lint/check-core/smoke LSP |

> **Migración 028A-6 (2026-08-04):** los commits de Sentinel y VarSense se promovieron a sus `main` publicados (`glory-sentinel=9f4ed4d`, `varsense=858ec62`). El gate consume directamente esos checkouts externos mediante `sourcePathEnv`; las copias `.quality-tools/sentinel` y `.quality-tools/varsense` fueron retiradas. `sentinel.lock.json` valida commit, capacidades y hash de archive; preflight comprueba el `realpath` resuelto sin persistirlo.

## Contratos

El gate de este checkout consume los checkouts externos `main` declarados por
`sourcePathEnv` en `quality-tools.json` y los valida contra `sentinel.lock.json`.
Las copias históricas `.quality-tools/sentinel` y `.quality-tools/varsense` fueron
retiradas. La paridad se verifica comparando commit, árbol, `sourcePathEnv` y el `realpath` resuelto
y hash del archive; ya no se aplica un patch local al runtime instalado.

- Los dos CLIs escriben JSON con `schemaVersion: 1`, `entries`, severidad y rango estable.
- Sentinel añade `remediation`, `confidence` y `analyzerVersion` al contrato core; los adapters traducen sin importar APIs del editor.
- VarSense `all` comparte un `CachedNodeDocumentProvider` para que scan e orphan-classes reutilicen el snapshot de archivos dentro de una ejecución.
- `scripts/quality/adapters/varsense.mjs` invoca `all` una sola vez; no mantiene dos procesos ni dos reportes como camino normal.
- Sentinel recibe boundaries por `portableBoundaries`; el proyecto configura sus excepciones en `sentinel.config.json`.
- VarSense `all` añade `token-duplicate` y `token-unused` sobre el mismo snapshot de documentos.
- `varsense all` es la única etapa normal del gate; `scan` y `orphan-classes` se conservan para compatibilidad CLI y no crean un segundo scheduler/reporte.

## Política de migración

- `sentinel.lock.json` fija versiones, protocolo, commits e identidad SHA-256 de los analizadores; el runtime de transición es `project-adapter` y mantiene `artifactSha256: null` hasta existir un runtime global instalable.
- Los reportes, cachés y locks del gate se particionan por `branch-key-v1` bajo `.quality-reports/branches/<branch-key>/`; la retención usa TTL/cuotas y la poda destructiva requiere confirmación explícita.

- El patch downstream de clases dinámicas se retiró de `quality-tools.json`; la capacidad está fijada en el commit upstream de VarSense.
- Un cambio de schema, ruleId o severidad requiere actualizar esta matriz, fixtures de equivalencia y el fingerprint de caché antes de cambiar el manifest.
- El empaquetado `.vsix` y la instalación en el editor se ejecutan solo después de compile, lint, smoke LSP y suite; nunca se reinicia VS Code automáticamente.

## Nota de sincronización

Los commits fijados en `quality-tools.json` identifican los checkouts `main` externos consumidos por este gate: Sentinel `9f4ed4d4…` y VarSense `858ec62c…`. `[317A-3]` ya está incorporado en Sentinel `main`; no hay patch local aplicado. El lock conserva el hash del archive y la variable `sourcePathEnv`; el `realpath` de cada checkout se valida en memoria. La migración 028A-6 mantiene el formato Sentinel v1 como configuración del analizador durante la transición y no simula la instalación del runtime global.

## Pendientes explícitos

- Benchmark small/medium/full con memoria RSS comparable en Windows/Linux CI.
- Paridad visual del panel VS Code frente a CLI/LSP para los nuevos metadatos.
- Publicar releases upstream en sus repositorios remotos; Sentinel 0.5.0 ya está integrado en `main` y etiquetado como `v0.5.0` (commit `20c13a2`); la publicación formal de VarSense queda pendiente si aplica a ese consumidor.
- Instalar el runtime global, exigir `artifactSha256` real y ejecutar la matriz multi-shell/multi-proyecto; estas capacidades no se declaran implementadas en este repositorio.
