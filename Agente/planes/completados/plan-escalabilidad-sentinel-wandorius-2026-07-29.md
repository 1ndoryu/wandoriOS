# Plan completado: quality gate Sentinel/VarSense

> **Tarea:** 297A-6
> **Fecha:** 2026-07-29
> **Estado:** completado
> **Reglas futuras:** `Agente/prevencion/prevencion-wandorius-sentinel-varsense-2026-07-29.md`

## Entregables

- [x] Sentinel 0.4.0 y VarSense 2.2.0 agnósticos, versionados y reproducibles.
- [x] Configuración específica de wandori.us solo en archivos raíz.
- [x] Único comando `npm run task:check -- {ID}` con alcance automático.
- [x] Preflight, adapters, timeouts, cancelación y exit codes 0/1/2/130.
- [x] Cache PASS por fingerprint completo; FAIL/ERROR nunca se reutiliza.
- [x] Terminal con máximo tres hallazgos y cuatro recordatorios.
- [x] Reportes Markdown/JSON/logs redactados y atómicos.
- [x] Wrapper self-check sin validación duplicada.
- [x] CI full con PostgreSQL efímero y reportes como artefacto.
- [x] Fixtures core/CLI/adapters y prueba automática de salida de bajo contexto.
- [x] Baseline final: cero errores bloqueantes.

## Evidencia

- Sentinel: `440cd481e92cf8a86ff9398f758fa4c8baacd202`, 305 tests.
- VarSense: `b299040d2daa4b4dd3c3aeb4cca7dd5998b29901`, contratos CLI/equivalencia y smoke LSP.
- Proyecto: `npm run task:check -- 297A-6 --fresh` pasa Sentinel, VarSense, Rust, frontend y docs.
- El output compacto identifica estado, tres hallazgos máximos, recordatorios y comando siguiente en menos de 20 líneas.

## Decisión de rollout

297A-6 entrega la infraestructura y las reglas de alta confianza activas. Las reglas específicas de lifecycle, desktop, API, comercio y visual se implementan durante sus tareas dueñas usando el inventario de prevención; no se hardcodean en las herramientas ni se congelan como baseline invisible.
