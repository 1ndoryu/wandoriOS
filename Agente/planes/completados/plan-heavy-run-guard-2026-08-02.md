> **CANCELADO (2026-08-12, decisión del usuario):** plan de Sentinel/quality gate. Se archiva sin ejecutar; no es trabajo pendiente.

# Plan 028A-3/028A-5 — Guard global de validaciones pesadas y targets

> **Fecha:** 2026-08-02
> **Estado:** activo; núcleo y bloqueo global implementados, queda la limpieza periódica opcional.
> **Dueño:** `roadmap.md` y `roadmap-sentinel.md`.

## Objetivo y límites

Evitar que una tarea o un agente lance `cargo test`, `cargo clippy`, `cargo bench`, Vitest, TypeScript o un quality full fuera del gate, y detener la acumulación ilimitada de targets bajo `C:\tmp`. El control es por proyecto, pero se ejecuta globalmente a través del estado compartido del guard y wrappers de PowerShell/CMD. CI puede ejecutar full desde el orquestador sin pasar por los shims interactivos.

## Política efectiva

- Cooldown por proyecto: **180 minutos** después de cualquier intento pesado, incluso si terminó con error.
- Concurrencia: un proceso pesado a la vez por target base.
- Excepción manual: `--allow-heavy` o `GLORY_QUALITY_ALLOW_HEAVY=1`; debe quedar visible en el reporte.
- Full bloqueado: se degrada a `local-light` y no deja al agente esperando ni recompilando tests.
- Targets: cuota estricta de 15 GB, retención de 7 días y comprobación en cada gate, con lock entre agentes; limpieza únicamente bajo una raíz validada `*/tmp/glory-target`, preservando marcadores, procesos cargados y escrituras recientes. Si los targets activos por sí solos superan la cuota, se informa el bloqueo sin matar procesos.
- `cargo test 2>&1`: se clasifica como el mismo `cargo test`; la redirección no cambia el coste.
- `npx vitest`, `vitest`, `npm test`, `npm run test:*`, `npm run type-check`, `npm run lint`, `npm run build` y validaciones Cargo directas se bloquean dentro de un workspace Glory.
- El mensaje de bloqueo siempre recomienda `npm run task:check -- <TareaId>`; desarrollo, `task:check`, `quality:*` y comandos fuera del workspace siguen permitidos.

## Checklist

### Fase 1 — Guard del quality gate

- [x] Añadir estado compartido por proyecto y cooldown configurable en `quality.config.json`.
- [x] Bloquear concurrencia pesada y liberar el lock aun con error/señal.
- [x] Convertir full bloqueado a local-light con razón y siguiente comando reproducible.
- [x] Separar el fingerprint/report mode y recordar `--allow-heavy`.

### Fase 2 — Cargo directo y wrappers

- [x] Aplicar el guard a `scripts/run-with-db.mjs` para `test/clippy/bench`.
- [x] Añadir `cargo.cmd` y wrapper PowerShell que localizan el proyecto y pasan comandos pesados al guard.
- [x] Instalar el shim por PATH sin modificar perfiles automáticamente.
- [x] Revisar y activar ambos perfiles PowerShell tras backup y autorización explícita; nunca reescribir perfiles ajenos sin revisión.

### Fase 3 — Targets y mantenimiento

- [x] Añadir limpieza dry-run/real, cuota, retención y detección de procesos activos.
- [x] Ejecutar limpieza inicial de los targets huérfanos bajo `C:\tmp\glory-target`.
- [ ] Añadir ejecución periódica opcional al cierre de `task:check` sin escanear/borrar fuera de la raíz validada.

### Fase 4 — Bloqueo de validaciones directas (028A-5)

- [x] Centralizar la clasificación de comandos en `quality-command-guard.mjs`, con detección por workspace y código de salida no cero.
- [x] Bloquear desde PowerShell `npm`, `npx`, `vitest`, `tsc` y `cargo` cuando la orden sea una validación directa.
- [x] Añadir shims CMD para `npm`, `npx` y `cargo`, preservando el ejecutable real y los comandos de desarrollo.
- [x] Mantener una sola recomendación operativa: `npm run task:check -- <TareaId>`.
- [x] Cubrir scripts frontend, herramientas directas, Cargo, workspace ajeno y recomendación en 5 pruebas unitarias nuevas.

## Validación y Definition of Done

- [x] `npm run quality:test` pasa con las pruebas del guard y del parser.
- [x] `npm run quality:cleanup:dry` muestra candidatos sin borrar; la limpieza real preserva el target activo.
- [x] `cmd /c where cargo` muestra primero el shim administrado y después el Cargo real.
- [x] Perfil PowerShell cargado sin errores y `cargo test` bloqueado durante cooldown en una nueva sesión.
- [x] `npx vitest`, `npm run test` y `cargo check` bloqueados en PowerShell y CMD sin iniciar la herramienta real; `quality:test` sigue permitido.
- [x] Auditoría SOLID/rendimiento/seguridad: clasificación central, rutas verificadas, sin secretos en mensajes, una sola política reutilizable.
