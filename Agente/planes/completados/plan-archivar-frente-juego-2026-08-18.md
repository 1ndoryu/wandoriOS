# Plan — Archivar el frente de juego y ocultarlo del front (2026-08-18)

## Objetivo

El usuario decidió **no trabajar más en nada relacionado con videojuegos**.
Todo el frente de juego se **archiva** (código, planes, tareas, ADR, referencias)
y la aplicación sigue funcionando **sin nada de juego visible** en el front.

## Alcance

### Qué se archiva (código)

**Frontend (todo bajo `frontend/src/`):**
- `features/game-core/` (motor puro: blocks, procedural, contracts, map-version…)
- `features/desktop/apps/game-playable/` (app jugable + editor + constructor + sakura)
- `features/desktop/apps/game-shared/` (forest-models)
- `services/game-*.service.ts` (+ tests): game-map-admin, game-asset-admin, game-audit,
  game-character-admin, game-character, game-profile
- `features/runtime/app-registration-game-playable.ts` y `app-registration-game-routes.ts`
- `styles/desktop/desktop-game-playable.css`
- Clientes generados `api/generated/game-*-handler/` (se regeneran; el codegen ya no los
  emitirá porque el backend deja de exponer rutas de juego)

**Backend (todo bajo `src/` y `tests/`):**
- `handlers/game_*_handler.rs` (asset, audit, character, map, metrics, profile, ticket, ws)
- `models/game_*.rs` (asset, audit, character, map, profile, realtime)
- `services/game_*.rs` (asset_svc, audit_svc, character_svc, map_svc, profile, room, room_map, ticket, ws)
- `repositories/game_*_repo.rs` (asset, audit, character, map, profile)
- `tests/game_*.rs` (asset, asset_admin, asset_version, audit, character, character_admin,
  map_draft, map_publish, profile, ticket_issue, ws_benchmark, ws_tcp)

### Qué se archiva (documentación)

- `Agente/planes/` activos de juego: `plan-juego-bosque-multijugador-2026-08-01.md`,
  `plan-assets-terreno-bosque-3d-2026-08-01.md`, `plan-glory-render-motor-juegos-2026-08-01.md`,
  `plan-boceto-visual-bosque-2026-08-01.md`, `plan-boceto-visual-bosque-3d-2026-08-01.md`,
  `plan-reinicio-coordinado-bosque-2026-08-05.md`, `plan-constructor-mundo-v2-toolkit-edicion-2026-08-14.md`
- `Agente/planes/completados/` de juego: `plan-terreno-bloques-bosque-minecraft-2026-08-12.md`,
  `plan-toolkit-agua-lluvia-2026-08-13.md`, `plan-constructor-mundo-2026-08-14.md`,
  `plan-estilo-sakura-constructor-2026-08-14.md`
- ADR: `adr-bosque-3d-assets-terreno-2d-2026-08-01.md`, `adr-bosque-mundo-unico-reinicio-coordinado-2026-08-05.md`,
  `adr-glory-render-repositorio-agnostico-2026-08-01.md`, `auditoria-glory-render-fase0-2026-08-05.md` (si existe),
  `estrategia-integracion-glory-render-2026-08-05.md` (si existe)
- `Agente/usuario/referencia-visual-curved-island-2026-08-12.md`
- `Agente/documentacion/estilo-sakura-crossing/` (carpeta de investigación)
- `Agente/documentacion/producto/decisiones-pendientes-bosque-2026-08-05.md` (si existe)
- `roadmap.md`: se retiran las secciones/pendientes de juego y se añade una sección
  `JUEGO — ARCHIVADO` equivalente a la de Sentinel (CANCELADO) con el puntero al archivo.

### Qué NO se toca (decisiones explícitas)

- **Migraciones de BD** (`migrations/*game*`): ya aplicadas en la BD de la rama. Retirarlas
  rompería el checksum/estado de `sqlx` para bases ya migradas. Se dejan en su sitio como
  historia de esquema; no se crean tablas nuevas ni se borran datos. (Documentado aquí.)
- **Backend auth**: la expiración de cookie `guest_game` en login/logout se conserva (es
  limpieza de cookie, no funcionalidad de juego). Se revisa que no queden imports colgantes.
- **`scripts/quality/bench-fixtures.mjs`**: fixture de benchmark con un nombre de archivo
  de juego; se actualiza la referencia o se deja (solo benchmark, no build). Se decide al
  ejecutar: mínimo cambio posible (renombrar al archivo real actual).

## Destino del archivo

```
_archivo/juego/
  README.md                      — por qué se archivó y cómo está organizado
  frontend/                      — código frontend (misma estructura relativa)
    game-core/  game-playable/  game-shared/  services/  registrations/  styles/
  backend/                       — código backend (handlers/models/services/repos/tests)
  documentacion/                 — planes, ADR, referencias, estilo-sakura
```

## Pasos

1. Crear `_archivo/juego/` con `README.md`.
2. Frontend: `git mv`/`mv` de los directorios y archivos listados; eliminar cableado:
   - `main.ts`: quitar import de `app-registration-game-routes`
   - `features/runtime/app-registration.ts`: quitar import de `app-registration-game-playable`
   - `features/runtime/commands/toolbar-commands.ts`: quitar comandos `game:character` y `game:settings`
   - `features/runtime/workspace/default-release.ts`: quitar nodo `gamePlayable`
   - `features/runtime/workspace/local-development-release.ts`: quitar nodo `gamePlayable` de `LOCAL_PROTOTYPE_NODE_IDS`
   - `services/index.ts`: quitar exports de `GameCharacterService`/`GameProfileService`
   - Tests: `app-registration.test.ts`, `toolbar-commands.test.ts`, `local-development-release.test.ts`,
     `workspace-app-contract.test.ts` — retirar las aserciones sobre `game-playable`
   - `api/generated/game-*-handler/`: borrar (se regeneran)
3. Backend: mover archivos; quitar cableado en:
   - `handlers/mod.rs`: mods, paths OpenAPI, schemas OpenAPI, merges de rutas
   - `models/mod.rs`, `services/mod.rs`, `repositories/mod.rs`: mods y re-exports
   - `lib.rs`: `AppState` sin campos `game_*` + imports
   - `config/mod.rs`: quitar `game_ticket_secret` y env `GLORY_GAME_TICKET_SECRET`
   - Tests que construyen `AppState` (`media_handler.rs`, `preferences_handler.rs`,
     `workspace_overlay_handler.rs`, `handlers/mod.rs`): quitar campos `game_*`
4. Docs: mover planes/ADR/referencias a `_archivo/juego/documentacion/`; actualizar `roadmap.md`
   (retirar pendientes de juego, añadir sección `JUEGO — ARCHIVADO`).
5. Verificar: `cargo fmt`, `cargo check`, `cargo test` (backend); `npm run type-check`,
   `npm run test:full`, build (frontend). Comprobar que no queda ninguna referencia a
   `game-playable`/`game-core`/`game_` fuera de `_archivo/` y de las migraciones.
6. Commit local sin push.

## Definition of Done

- No existe referencia de juego en el código compilado/type-checkeado fuera de `_archivo/`
  (salvo migraciones de esquema documentadas).
- Frontend sin entrada de juego: sin app, sin ruta `/forest-playable`, sin comandos `game:*`,
  sin nodo en release.
- Backend compila y pasa tests sin los módulos de juego.
- Roadmap con sección `JUEGO — ARCHIVADO` y sin pendientes de juego.
- Commit local sin push.
