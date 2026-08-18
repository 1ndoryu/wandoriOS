# ADR — Bosque: mundo único compartido y transición coordinada con aviso de reinicio

> **Fecha:** 2026-08-05
> **Epic:** GAME-01 — Bosque multijugador 3D
> **Estado:** aprobada (decisiones 4, 8 y 9 del documento de decisiones de producto)
> **Fuente canónica:** `Agente/documentacion/producto/decisiones-pendientes-bosque-2026-08-05.md`

## Contexto

La implementación inicial del realtime (297A-44/75) usa **salas** claveadas por
`map.map_version()` con cap de 8 jugadores por sala, TTL independiente e interés por
proximidad. El usuario decidió el 05-ago:

- **Sin salas:** todos los jugadores comparten **un único mundo/mapa**; no hay matchmaking
  ni instancias separadas con cap 8 por sala.
- **Transición coordinada:** al publicar una versión nueva del mapa, el servidor avisa a
  todos los jugadores que **el mundo se reiniciará en 5 minutos** y, tras la cuenta atrás,
  el mundo migra a la versión nueva de forma coordinada. No se mantienen salas con
  snapshots inmutables antiguos (reemplaza la decisión previa de "solo salas nuevas").
- **Single-instance:** un solo servidor con el mundo único para la primera versión.

## Opciones evaluadas

- a) **Mantener salas con cap 8 por mapa** (implementado): simple y con presupuesto fijo,
  pero contradice la decisión de producto de que todos se vean siempre en un mismo mundo.
- b) **Mundo único ilimitado** sin salas ni límite: escala mal (fanout O(n) en snapshots y
  colisiones); se descarta.
- c) **Mundo único compartido con presupuesto global** (elegida): un actor de mundo por mapa
  activo, límite global de jugadores y presupuesto de snapshot/fanout con interés por
  proximidad; publicación con transición coordinada.

## Decisión

- **Un solo actor de mundo por versión activa del mapa** (evoluciona `GameRoomState`: el
  `map_version` deja de particionar salas y pasa a identificar el mundo activo).
- **Límite global de jugadores simultáneos** (el cap 8 por sala se convierte en presupuesto
  del mundo único; se define con medición, no por diseño).
- **Transición coordinada:** al publicar (o ante reinicio operativo), el servidor difunde el
  evento `server_restart` con motivo bounded y cuenta atrás; los clientes muestran el aviso;
  al agotarse la cuenta, el mundo migra a la versión nueva (los jugadores conectados se
  rehidratan con un ticket nuevo sobre el mundo activo).
- El **contrato realtime v1 ya incluye** `server_restart` (motivo ≤ 200 caracteres sin
  controles, cuenta atrás 1..=3600 s; validación fail-closed en `game_realtime.rs` y
  `game-realtime.ts`, callback `onServerRestart` en `game-realtime-client.ts`).
- **Single-instance:** si se requieren réplicas, se abre un ADR de coordinación/estado antes
  de cambiar el contrato.

## Consecuencias

- El cap 8 por sala desaparece como contrato público (`maxPlayersPerRoom` pasa a ser un
  límite interno del mundo, sujeto al presupuesto global).
- La publicación requiere un mecanismo de drenaje: dejar de aceptar joins, difundir
  `server_restart`, agotar la cuenta y recrear el actor del mundo con la versión nueva.
- El runbook de rollback (297A-75) debe cubrir la migración coordinada y la falla a mitad
  de la cuenta atrás.
- Interés por proximidad y presupuesto de snapshot se mantienen; se definen los límites
  globales con medición en el entorno dedicado (presupuesto de decisión 8 del ADR de
  presupuesto, pendiente).

## Rollback

- Volver a `GameRoomState` multi-sala (297A-44/75) sin cambios de contrato: el evento
  `server_restart` queda como mensaje opcional del servidor que los clientes antiguos
  ignoran con seguridad (validado y despachado por callback, sin efectos en simulación).

## Tareas afectadas

- Siguiente bloque: cuenta atrás de 5 min + migración coordinada server-side y UX del aviso
  en el cliente (sección 8 del documento de decisiones).
- Planificación de `GameRoomState` mundo único + límite global (decisión 4).
- Revisión del runbook de rollback (297A-75) con la nueva política.
