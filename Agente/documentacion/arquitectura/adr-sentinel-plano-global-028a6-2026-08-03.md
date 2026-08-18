# ADR — Sentinel como plano global de calidad (028A-6)

> **Fecha:** 2026-08-03
> **Estado:** aceptado para migración incremental

## Contexto

El repositorio tiene un quality gate operativo en `scripts/quality` y una copia fijada de Sentinel/VarSense bajo `.quality-tools`. El plan 028A-6 propone mover política, guard, scope, scheduler, caché, analyzers y reporter a un runtime global instalable fuera de cualquier checkout.

Los repositorios upstream y una instalación global administrada no forman parte de este checkout. Por tanto, instalar shims en perfiles del usuario o declarar paridad upstream como PASS desde este proyecto sería inseguro y no verificable.

## Decisión

1. Sentinel será el plano futuro de control; VarSense seguirá siendo un analyzer especializado invocado por Sentinel.
2. La migración se ejecuta por contratos y adapters, nunca sustituyendo `task-check` antes de que exista paridad.
3. `sentinel.config.json` v1 conserva su significado actual de analyzer. La política v2 se valida mediante un contrato separado durante la transición; una configuración v1 no activa enforcement v2 accidentalmente.
4. `sentinel doctor --migrate --dry-run` es la primera operación de migración. No escribe archivos, no instala herramientas y no modifica perfiles.
5. El guard conserva defaults legacy hasta que exista una política v2 válida. Una política inválida no bloquea comandos desconocidos; `doctor` y CI deben reportarla como error.
6. Los reportes, logs, caché y locks locales se particionarán por workspace y una `branch-key-v1` segura: `canonicalRef` UTF-8 normalizada NFC, SHA-256 hexadecimal minúsculo, encoding allowlisted y límite de longitud; ref CI allowlisted, rama Git o fallback detached por SHA; el nombre bruto nunca se usará como ruta.
7. La retención de `.quality-reports` será explícita y acotada por defaults de 7 días, 512 MiB por workspace y 128 MiB por rama, contando reportes/logs/tool reports/caché/locks. La rama activa puede marcar `overQuota` pero no se borra; la poda histórica será auditable, con dry-run y protección de locks/temporales/escrituras recientes. Locks huérfanos solo se eliminan tras TTL y PID inactivo; un fallo de limpieza no ocultará ni cambiará el resultado ni el exit code del gate.
8. El layout histórico `.quality-reports/<task-id>/` solo podrá leerse durante dos versiones cuando metadata de rama coincida exactamente; sin metadata es ambiguo y no se reutiliza. No habrá alias global escribible ni symlinks de compatibilidad.
9. La instalación global, los shims persistentes, los leases, la sincronización de repos upstream y la matriz multi-shell quedan bloqueados hasta disponer del runtime global versionado y sus fixtures. La resolución local y el guard descubren ancestros y rechazan `sentinel.config.json` symlink/junction antes de cargarlo o seguirlo desde un shim.

## Consecuencias

- Se puede probar el contrato y la migración sin romper `task:check` ni otros proyectos.
- Durante la transición existen dos formatos: analyzer v1 y política v2 propuesta. La futura migración aplicada deberá usar backup, hash y rollback.
- No se afirma que el enforcement global esté terminado: el gate actual sigue siendo la autoridad de cierre.

## Evidencia de este bloque

- `scripts/quality/policy.mjs`: validación estricta, descubrimiento y migración v1→v2 en memoria.
- `scripts/quality/sentinel-doctor.mjs`: diagnóstico y dry-run sin escrituras.
- `scripts/quality/policy-defaults.mjs`: catálogo único de comandos bloqueables para el guard de transición.
- `scripts/quality/quality-command-guard.mjs`: consume política v2 válida; mantiene fallback legacy seguro.
- `scripts/quality/tests/policy.test.mjs` y tests del guard: fixtures de rutas, claves desconocidas, modos y migración.
- `scripts/quality/lock-generator.mjs`: generación/verificación local del lock sin instalación, comparación estructural ignorando `generatedAt`, backup `.bak` y escritura atómica.
- `scripts/quality/sentinel-doctor.mjs --lock`: diagnóstico/generación explícita; `--check` no escribe y `--write` no modifica analyzers.
- `scripts/quality/tests/lock-generator.test.mjs`: 6 fixtures de parseo, generación, no-escritura, mismatch, backup y symlink/tamper.
- `scripts/quality/policy-decision.mjs`: contrato local único para `no-policy`, `legacy-v1`, `observe`, `enforce`, `pass-through` e `invalid-policy`; el campo es aditivo en identidad/reporte y no pretende sustituir el runtime global.
- `scripts/quality/patches/sentinel-317a-3.patch` + `quality-tools.json`: patch local [317A-3] fijado por SHA-256; `sentinel.lock.json` conserva `patchSha256` y preflight rechaza patch raíz, diff aplicado o rutas adicionales manipuladas.
- SNT-05C ya implementa `branch-key-v1`, namespaces por rama para reportes/cache/locks, retención TTL/cuota, los comandos explícitos `quality:reports:cleanup:dry`/`quality:reports:cleanup`, un lector legacy de solo lectura (`scripts/quality/report-reader.mjs`), una fixture local de aislamiento entre ramas/CI/detached (`scripts/quality/tests/branch-isolation.integration.test.mjs`) y un wrapper best-effort de retención integrado en `task-check` (`scripts/quality/report-retention-stage.mjs`). El lector prioriza el namespace canónico, exige metadata exacta para aceptar legacy, marca sin metadata como ambiguo y falla cerrado ante traversal, symlinks o JSON canónico corrupto. La retirada tras dos versiones, la concurrencia multi-proceso y la matriz CI real del runtime global siguen pendientes; el cambio de rama dentro del mismo proceso, los locks entre namespaces y refs largas/peligrosas tienen cobertura local.

## Gates pendientes

- Runtime global versionado instalado y verificable.
- Runtime global versionado con `artifactSha256` real; el adaptador local mantiene `artifactSha256: null` explícito y el lockfile rechaza el campo ausente para forzar regeneración segura.
- Upstream debe absorber [317A-3] para retirar el patch local; hasta entonces el patch declarado es la única divergencia permitida del checkout Sentinel.
- `realpath`/canonicalización verifican que lockfile, install root, backup y checkouts permanezcan dentro del workspace; el generador local añade escritura atómica y backup probado.
- Paridad CLI/LSP/VS Code y matriz PowerShell/CMD/Bash/CI.
- Retirada del lector legacy tras dos versiones y matriz multi-proceso/CI real del runtime global; la partición por rama, lectura compatible de `latest`, retención TTL/cuota, poda segura y fixture local de aislamiento de SNT-05C ya tienen implementación y cobertura.
- Lease de procesos hijos, rollback de perfiles y segundo proyecto sin política.
