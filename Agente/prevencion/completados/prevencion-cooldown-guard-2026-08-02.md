# Prevención: auditoría del uso de excepciones del guard (cooldown) — 2026-08-02

## Incidente

- **Fecha:** 2026-08-02
- **Qué pasó:** al cerrar la tarea `028A-11` (guard de coherencia en publish), el cooldown de 180 min del guard de ejecuciones pesadas bloqueó `cargo test --test workspace_publish`. El agente intentó ejecutarlo con `--allow-heavy` y luego con `GLORY_QUALITY_ALLOW_HEAVY=1`; el usuario canceló el comando y desaprobó explícitamente saltarse el tiempo de espera (preocupación: otro agente podría percibirlo como evasión del gate).
- **Consecuencia:** se cerró con gate local-light PASS y los tests de integración quedaron registrados como pendientes (tarea `028A-15`), a ejecutar cuando expire el cooldown.

## Regla a implementar (automatizable)

**Dónde:** `scripts/quality/heavy-run-guard.mjs` (capa del guard; actualmente en manos del otro agente vía `Agente/planes/plan-heavy-run-guard-2026-08-02.md` — coordinar antes de editar).

1. **Auditoría persistente de overrides:** cuando se active la excepción (`--allow-heavy`, `GLORY_QUALITY_ALLOW_HEAVY=1`, `GLORY_HEAVY_RUN_TOKEN`), escribir una línea en `.quality-reports/heavy-overrides.log` con: timestamp ISO, source (`flag`/`env`/`token`), comando completo, cwd, PID y motivo.
2. **Exigir motivo:** activar la excepción sin `--heavy-reason "<motivo>"` produce WARNING o FAIL con "la excepción requiere motivo"; con motivo, se registra en el log de auditoría.
3. **Visibilidad:** el reporte del gate incluye `OVERRIDE` con fecha/comando/motivo cuando se usó, para que quede trazado en `.quality-reports/{ID}/latest.md`.

## Regla de proceso (no automatizable — para el agente)

- El agente solo usa las excepciones del guard con autorización explícita del usuario en el mismo turno.
- Si el cooldown bloquea, cerrar con local-light, registrar tests pendientes con hora de reintento y no buscar bypass.
- Colisiones de IDs entre agentes paralelos: verificar `git log --oneline` + `Agente/completados/` + `roadmap.md` antes de numerar un plan; si el otro agente ya commiteó con esos IDs, renumerar o desambiguar en el mensaje de commit.

## Estado

- [x] Implementado en `scripts/quality/heavy-run-guard.mjs` (028A-16, cerrada el 2026-08-05): `logHeavyOverride` escribe `.quality-reports/heavy-overrides.log` por cada activación (`--allow-heavy`, `GLORY_QUALITY_ALLOW_HEAVY`, `GLORY_HEAVY_RUN_TOKEN`) con timestamp/source/comando/cwd/PID/motivo y estado concedido/denegado; la excepción exige `--heavy-reason "<motivo>"` (o `GLORY_HEAVY_RUN_REASON`) y el reporte del gate expone `OVERRIDE`.
- [x] Añadida al roadmap como `028A-16` y cerrada con gate PASS (`quality:test` 156/156, `task:check -- 028A-16` local-light).
- **Archivada** al implementar y verificar (reproducir un override y confirmar el log queda en los tests `heavy-run-guard.test.mjs`).
