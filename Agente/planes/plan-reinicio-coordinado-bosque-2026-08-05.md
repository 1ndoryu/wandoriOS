# Plan — Reinicio coordinado del Bosque (decisión 8)

> **Fecha:** 2026-08-05 · **Epic:** GAME-01 · **Tarea planificada:** 297A-78
> **Estado:** planificación; contrato `server_restart` y UX del cliente cerrados.
> **Fuente:** `Agente/documentacion/producto/decisiones-pendientes-bosque-2026-08-05.md` §8 y
> ADR `Agente/documentacion/arquitectura/adr-bosque-mundo-unico-reinicio-coordinado-2026-08-05.md`.

## Objetivo y límites

- Al publicar una versión nueva del mapa, el servidor avisa a todos los jugadores
  que **el mundo se reiniciará en 5 minutos** y, tras la cuenta atrás, migra de
  forma coordinada a la versión nueva. No se mantienen salas con snapshots
  inmutables antiguos (reemplaza la política de "solo salas nuevas").
- **Fuera de alcance:** matchmaking, réplicas, rollback automático (se revisa en
  el runbook), cuentas atrás configurables por admin (fija 300 s).

## Ya cerrado (05-ago)

- [x] Contrato `server_restart` en ambos stacks (`game_realtime.rs` / `game-realtime.ts`)
  con motivo bounded (200) y cuenta atrás 1..=3600 s, validación fail-closed y tests.
- [x] Cliente: callback `onServerRestart` en `game-realtime-client.ts` + banner de
  cuenta atrás (`game-restart-notice.ts`, show/hide/destroy, 6 tests); la reconexión
  tras el cierre del socket ya usa backoff con jitter (297A-57), y el join recarga la
  versión activa de la BD (297A-65).

## Fase 1 — Broadcast del aviso (backend) — CERRADA (05-ago)

- [x] `RoomCommand::Broadcast { message }` en `run_room`: enviar el mensaje a todos
  los players activos (`try_send` al output, sin bloquear el actor ni el tick).
- [x] `GameRoomState::announce_restart(reason, seconds)`: iterar los rooms activos y
  difundir `GameRealtimeServerMessage::ServerRestart` (v:1).
- [x] `GameWsState::announce_restart(reason, seconds)` como passthrough del wrapper.
- [x] Tests: el broadcast llega a todos los players de cada sala (2 jugadores de la
  misma sala reciben el aviso con motivo y cuenta); sala vacía es no-op y sigue
  aceptando joins; passthrough del wrapper llega al room (3 tests nuevos,
  18 unitarios del lib en verde vía cargo test directo por gate bloqueado).

**Gate F1:** cargo check + tests de `game_room` — PASS vía cargo directo (el gate
está bloqueado por WIP ajeno en `tools/sentinel`; sin tocar SNT-11).

## Fase 2 — Trigger de publicación y migración coordinada — CERRADA (05-ago)

- [x] `publish_map` (handler): tras `GameMapService::publish` exitoso, `schedule_restart`
  (`GameWsState`) difunde `announce_restart("publicación de versión nueva", 300)` en un
  task y espera la cuenta atrás.
- [x] Al expirar: `shutdown_all_rooms` (drena las salas): el actor hace break, los
  Senders se dropean y el socket cierra con **4002 "mundo reiniciado"** (nuevo, distinto
  del 4001 de identidad reemplazada) — el cliente reintenta con backoff; el mapa
  cacheado se invalida y el join recarga la versión activa nueva de la BD.
- [x] Publicaciones concurrentes durante la cuenta atrás: `restart_pending`
  (AtomicBool) — la primera gana, las siguientes son no-op sin acumular tasks.
- [x] Sin jugadores conectados: el aviso es no-op; tras el drenaje el primer join
  recrea la sala con la versión nueva.
- [x] Tests: `schedule_restart` con cuenta de 1 s (aviso → drenaje → mapa invalidado),
  `shutdown_all_rooms` cierra outputs, y prueba TCP completa de reconexión tras 4002
  (aviso → cierre → rejoin OK).

**Gate F2:** cargo check + lib 98/98 + game_ws_tcp 9/9 (validado vía cargo directo;
full CI queda para F3).

## Fase 3 — Verificación y cierre

- [ ] `task:check -- 297A-78 --full` (tras cooldown, sin excepción manual — SNT-11).
- [ ] Flujo real en navegador: publicar → banner con cuenta atrás → socket cierra →
  reconexión → mundo nuevo renderiza.
- [x] Runbook de rollback actualizado con la política de migración coordinada
  (commit `92cdeaab`): el rollback de mapa sigue siendo re-publicación de la
  versión buena; la migración coordinada reemplaza la política vieja de
  "solo salas nuevas" (el reinicio avisa, drena y el cliente recarga).
- [x] Decisiones §8, roadmap y ADR coherentes: decisión 8 marcada en el
  documento de decisiones, roadmap sincronizado con F1/F2 cerradas (05-ago) y
  ADR `adr-bosque-mundo-unico-reinicio-coordinado-2026-08-05.md` creado.

**Gate F3 / DoD:** gate local-light PASS, full CI PASS (clippy + tests Rust), suite
frontend completa verde, navegador verificado y documentación sincronizada.

## Pruebas obligatorias

- Frontend: `game-restart-notice.test.ts` + `game-realtime-client.test.ts` (4002
  reintenta, 4001 no) + suite completa + type-check — verde.
- Backend: lib 98/98 (incluye broadcast, shutdown y schedule_restart con cuenta de
  1 s) + `game_ws_tcp` 9/9 (aviso → cierre 4002 → reconexión) — verde.
- Gate: `npm run task:check -- 297A-78` y `--full` tras cooldown (F3; hoy el gate
  está bloqueado por WIP ajeno en `tools/sentinel`).
