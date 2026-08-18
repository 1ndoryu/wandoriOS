# _archivo/juego — Frente de videojuego archivado (2026-08-18)

**Decisión del usuario (2026-08-18):** ya no se trabaja en nada relacionado con
videojuegos. Todo el frente (motor, app jugable, editor, constructor, realtime,
multijugador, estilo Sakura/Curved Island) queda **archivado** y oculto del front.

## Organización

```
_archivo/juego/
  frontend/       código frontend (misma estructura relativa a frontend/src)
    game-core/      motor puro (blocks, procedural, contracts, map-version, realtime…)
    game-playable/  app jugable + editor 2D + constructor + sakura + runtime Three
    game-shared/    modelos compartidos (forest-models)
    services/       game-*.service.ts + tests
    registrations/  app-registration-game-playable.ts / -game-routes.ts
    styles/         desktop-game-playable.css
  backend/        código backend (handlers, models, services, repos, tests)
  documentacion/  planes, ADR, referencias visuales, investigación estilo-sakura
```

## Qué se conservó deliberadamente

- **Migraciones de BD** (`migrations/*game*`): se dejan en `migrations/` porque ya están
  aplicadas en las bases de la rama; retirarlas rompería el checksum/estado de `sqlx`.
  Las tablas de juego quedan inertes (no se usan, no se crean de nuevo).
- **Limpieza de cookie `guest_game`** en login/logout (backend auth): se conserva en
  `handlers/auth.rs` como limpieza de cookie; no es funcionalidad de juego.

## Cómo restaurar (si algún día se retoma)

1. Mover `frontend/` de vuelta a `frontend/src/features/...` (rutas originales).
2. Mover `backend/` de vuelta a `src/handlers|models|services|repositories` y `tests/`.
3. Restaurar el cableado retirado: `handlers/mod.rs` (mods/rutas/OpenAPI), `lib.rs`
   (campos de `AppState`), `config/mod.rs` (GLORY_GAME_TICKET_SECRET), registro de app
   en `app-registration.ts`, comandos `game:*`, nodo `gamePlayable` en `default-release.ts`
   e import de rutas en `main.ts`.
4. `scripts/quality/bench-fixtures.mjs` referencia un archivo de juego; se renombró al
   archivo real vigente en el momento del archivado.
