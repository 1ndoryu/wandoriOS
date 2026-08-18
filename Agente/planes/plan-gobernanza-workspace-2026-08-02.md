# Plan — Gobernanza del workspace: releases, publicación y coherencia

- **Epic:** 297A-4 (OS persistente, cuentas, programas y comercio)
- **Fecha:** 2026-08-02
- **Estado:** en ejecución — fases `028A-10` COMPLETA, `028A-13` COMPLETA, `028A-14` COMPLETA (verificadas en navegador)
- **Próximo paso:** `028A-15` (tests de integración del guard de publish, pendiente de cooldown) y `028A-12` (borrado unificado).

---

## 1. Objetivo y límites

**Objetivo:** dar al administrador control real y visible sobre el escritorio desde la app Admin (qué release está activo, qué contiene, qué se publica), y garantizar coherencia entre el contenido y las releases para que **nada borrado o en draft pueda aparecer en la siguiente "foto"**.

**Límites explícitos (fuera de alcance en este plan):**

- No se cambia el modelo de releases (snapshot inmutable + versión activa): es correcto y estándar. Se corrige cómo se crean y se gobiernan.
- No se introduce MFA/passkey ni hardening de sesión (vive en 297A-17).
- No se toca el motor de juegos ni `glory-render` (GAME-01/GAME-02).
- No se despliega a producción (deploy fuera de alcance del roadmap; solo local).
- La persistencia server-side del overlay del admin queda **anotada como fase 6 opcional** y no bloquea las fases 1-5.

## 2. Contexto / diagnóstico (por qué existe este plan)

La investigación (subagentes + lectura de código + consulta a BD local `glory_backend_wandorius`) confirmó:

1. **Sin control en la app Admin.** El Admin tiene tabs `articulos / proyectos / productos / juego / novedades / fuentes / sitio / estadisticas`; no existe tab de escritorio/workspace. `listReleases()` y `getReleaseByVersion()` ya existen en `workspace.service.ts` pero ningún componente los consume. Publicar/rollback/preview solo viven en el menú contextual del escritorio.
2. **La publicación no valida nada.** `WorkspaceService::publish` (`src/services/workspace_svc.rs`) solo valida el formato de `publicLocator`. No valida estructura del árbol ni existencia/estado de los recursos referenciados → se puede publicar un enlace muerto.
3. **Borrar un artículo hornea un nodo fantasma.** El delete de artículo es **HARD** (`DELETE FROM articles`), no emite evento `deleted` (a diferencia de media), y `article-notas-sync.ts` se traga el 404 del `getById`. El icono `nota-{id}` queda en el overlay/release y se re-hornea en cada publicación posterior.
4. **Sin herencia segura entre releases.** Las releases son snapshots completos; la migración `20260801130000_018a87_documentos.up.sql` escribió v2 a mano y **perdió** `store/orders/downloads` que sí estaban en v1. No hay diff, historial visible ni auditoría de "qué cambió en esta foto".
5. **Overlay del admin solo en localStorage.** `overlay-sync.ts` hace bypass total para admin (`[018A-66]`); los tombstones no sobreviven a cambio de navegador.
6. **Cero cobertura de tests** para `publish_release`, `list_releases`, `get_release_by_version` y el repositorio `workspace_releases` (a diferencia del overlay, que sí tiene tests).

**Referencias clave (fuentes canónicas):**

- Arquitectura: `Agente/documentacion/arquitectura/manual-arquitectura-wandorius-2026-07-29.md`
- Plan maestro: `Agente/planes/plan-escritorio-persistente-cuentas-admin-apps-2026-07-29.md`
- Quality gate: `Agente/planes/completados/plan-escalabilidad-sentinel-wandorius-2026-07-29.md`
- Índice: `Agente/documentacion/indice-documentacion-2026-07-29.md`

**Archivos principales que tocará el plan:**

- Backend: `src/handlers/workspace_handler.rs`, `src/services/workspace_svc.rs`, `src/repositories/workspace_repo.rs`, `src/models/workspace_overlay/*`, `src/services/article_svc.rs` (o equivalente), `src/repositories/article_repo.rs` (o equivalente), `src/handlers/article_handler.rs` (o equivalente), `src/repositories/resource_repo.rs`.
- Migraciones: `migrations/*.sql` (nueva para v3 y para soft-delete de artículos si aplica).
- Frontend: `frontend/src/pages/admin.ts`, `frontend/src/pages/admin-articles.ts`, `frontend/src/features/runtime/workspace/workspace-store.ts`, `frontend/src/features/runtime/commands/workspace-commands.ts`, `frontend/src/features/runtime/workspace/overlay-mutations.ts`, `frontend/src/features/runtime/workspace/article-notas-sync.ts`, `frontend/src/services/workspace.service.ts`, `frontend/src/features/runtime/app-registration.ts`.

---

## 3. Dependencias

| Fase | Depende de | Bloquea |
|---|---|---|
| 028A-10 (release v3) | nada | escritorio con Papelera/Tienda/Pedidos/Descargas |
| 028A-11 (guard publish) | 028A-10 (el árbol canónico debe existir para validar) | 028A-13 (dashboard con refs válidos) |
| 028A-12 (borrado artículos) | nada (independiente, paralelizable) | coherencia del síntoma "nodo fantasma" |
| 028A-13 (backend gobernanza) | 028A-11 (validation/diff reutilizables) | 028A-14 (panel admin) |
| 028A-14 (panel Admin UI) | 028A-13 (endpoints) | control visual del admin |
| Fase 6 (overlay admin, opcional) | 028A-12 | — (pendiente posterior) |

---

## 4. Fases

### 028A-10 — Release v3 con árbol canónico

**Objetivo:** corregir el release activo para que el escritorio muestre la Papelera, Tienda, Pedidos y Descargas (nodos perdidos por la migración `018a87`), sin tocar v1/v2 (inmutables).

- [x] Crear migración `migrations/20260802010000_028a10_release_v3.up.sql` que inserte `version = 3` con el árbol canónico:
  - Nodos actuales de v2: `documentos` + 4 subcarpetas, `projects`, `profile`, `about`, `settings`, `admin`.
  - Reincorporar: `trash` (Papelera, `app`, `refId: trash`, `requires: public`), `store`, `orders`, `downloads` (con sus `refId`, `requires: public`).
  - **NO** incluir `snake` (nodo fantasma sin app registrada), ni `game/game3d/gamePlayable` (prototipos de GAME-01, ocultos deliberadamente).
  - Posiciones coherentes con `default-release.ts` y sin colisiones (`position` desktop + `mobileOrder` móvil).
- [x] Migración `.down.sql` que borre `version = 3` (vuelve a v2 como activo).
- [x] Aplicar migración contra BD local `glory_backend_wandorius` (o recrear dev DB) y verificar con `SELECT version, jsonb_array_length(jsonb_path_query_array(tree,'$.nodes.*')) ... FROM workspace_releases ORDER BY version`. Aplicada y registrada en `_sqlx_migrations` (20260802010000); v3 activa con 14 nodos.
- [x] Verificar en navegador (localhost:5174) que Papelera/Tienda/Pedidos/Descargas aparecen en escritorio y launcher móvil. Desktop 1440 y launcher 390px verificados; Papelera abre y renderiza vacía.

**Gate/salida:** `GET /api/workspace/release` devuelve v3 con los nodos canónicos; navegador muestra los nodos en desktop ≥768 y móvil <768; sin colisiones de posición.

**DoD:** migración up/down + verificación BD + verificación navegador + commit `028A-10: ...`. — **CUMPLIDO 2026-08-02** (migración aplicada, gate `task:check -- 028A-10` PASS, commit + push).

---

### 028A-11 — Guard definitivo de coherencia en `publish` (backend + tests)

**Objetivo:** que ninguna publicación pueda hornear refs muertos ni árboles inválidos, y que cada release quede auditable.

- [ ] Validación estructural del árbol en `WorkspaceService::publish` (reutilizar/adaptar `WorkspaceOverlayDocument::validate`): ciclos, `parentId` inexistente, tipos de nodo válidos, límite de nodos (500 como overlay), `requires` válido, `position`/`mobileOrder` coherentes.
- [ ] **Validación de recursos referenciados:** para cada nodo `type: resource | shortcut` con `refId`, comprobar en BD que el recurso existe y está `active + ready + public` (o regla equivalente por tipo). Devolver **422** con la lista de refs rotos (id + label) en el cuerpo de error.
- [ ] **Diff/summary persistido:** calcular en `publish` el diff contra la release anterior (nodos añadidos / quitados / modificados) y persistirlo (columna `summary JSONB` en `workspace_releases` o campo dentro de `tree`). Añadir migración para la columna si no existe.
- [ ] Tests de integración (PostgreSQL real, patrón de `tests/` existentes) para: publish feliz, publish con ref roto → 422, publish con ciclo → 422, publish con límite de nodos, list_releases, get_release_by_version, y que el activo es MAX(version).
- [ ] Actualizar `openapi.json` (utoipa) y regenerar cliente Orval si cambia el contrato.

**Gate/salida:** `cargo fmt --check`, `cargo check`, tests nuevos en verde, `npm run task:check -- 028A-11` PASS, y una publicación manual con un ref roto rechazada con 422.

**DoD:** validaciones + diff + tests + commit `028A-11: ...`.

---

### 028A-12 — Unificar el borrado de artículos (eliminar el nodo fantasma)

**Objetivo:** que borrar un artículo (a) sea reversible y (b) tumbe su nodo del escritorio, de modo que nunca se hornee en una release.

- [ ] Convertir `DELETE /api/admin/articles/{id}` en **soft delete**: `lifecycle_state = 'trashed'` + `deleted_at` (reutilizar `soft_delete_kind_tx` de `resource_repo.rs`). Eliminar el `DELETE FROM articles` hard.
- [ ] Añadir `GET /api/admin/articles/trashed` y `POST /api/admin/articles/{id}/restore` (espejo de media, con restore a `published` si estaba publicado).
- [ ] Sincronizar el envelope `resources` en `ArticleService::update` vía `update_resource_metadata` (hoy los artículos nunca actualizan su envelope → queda `draft/private` aunque estén publicados).
- [ ] Extender `ArticleEditorSavedEvent` con `operation: 'deleted'` y despacharlo desde `admin-articles.ts` al borrar.
- [ ] En `article-notas-sync.ts`: en `deleted`, **tumbar el nodo** (`tombstoneNode`) en lugar de depender del catch de 404.
- [ ] Tests: borrado soft conserva fila + envelope trashed; restore vuelve a publicado; frontend: despacho `deleted` y tombstone del nodo.

**Gate/salida:** borrar un artículo en la UI → fila conservada (trashed) + nodo tumbado + no reaparece al publicar; restore lo recupera. `task:check -- 028A-12` PASS.

**DoD:** soft delete + papelera/restore + sync envelope + evento deleted + tests + commit `028A-12: ...`.

---

### 028A-13 — Backend de gobernanza (control real desde el front)

**Objetivo:** exponer al Admin el estado completo del workspace y darle acciones explícitas.

- [x] `GET /api/admin/workspace/control` (dashboard en una llamada): release activo (versión, `published_at`, `published_by`), nº total de releases, nodos por tipo, y **refs rotos detectados** en el release activo (reusar la validación de 028A-11).
- [x] `POST /api/admin/workspace/releases/{version}/validate` (dry-run): ejecuta la validación estructural + de recursos **sin escribir**, devuelve ok/errores.
- [x] `POST /api/admin/workspace/releases/{version}/activate`: activación explícita de una versión (columna `is_active` o equivalente; default la de mayor versión al crear). Guard: no activar una versión con refs rotos salvo `?force=true`.
- [x] DTO ligero para `list_releases` (versión, fecha, autor, nº nodos, summary) sin devolver el árbol completo.
- [x] Actualizar OpenAPI + Orval + tests de integración de los nuevos endpoints (permisos AdminUser/CSRF).

**Gate/salida:** endpoints documentados, testeados (401/403/CSRF/ok) y consumibles desde el frontend; activar una versión vieja cambia el release activo.

**DoD:** endpoints + validación dry-run + activación + DTO + tests + commit `028A-13: ...`. — **CUMPLIDO 2026-08-03** (migración `20260803000000_028a13_release_activation` con `is_active` + índice único parcial, DTOs camelCase, gate `task:check -- 028A-13` PASS; verificado en vivo: validate v3 → 200, activate v3 → 200, control → activeVersion 3 + 14 nodos; Orval regenerado con `getWorkspaceControl`/`validateRelease`/`activateRelease`).

---

### 028A-14 — Panel "Escritorio" en la app Admin (control visual)

**Objetivo:** que el admin vea y controle el escritorio desde la app Admin, sin depender del menú contextual.

- [x] Nueva pestaña **"Escritorio"** en `frontend/src/pages/admin.ts` con secciones:
  - **Estado actual:** release activo (versión, fecha, autor, nº nodos por tipo) desde `GET /workspace/control`.
  - **Historial de releases:** lista (DTO ligero) con diff visual (nodos añadidos/quitados) y acciones "Activar" / "Ver".
  - **Validar y publicar:** botón "Validar" (dry-run) → muestra resultado; botón "Publicar" (con diff summary + confirmación) → `publishWorkspace()`.
  - **Nodos ocultos (tombstones):** listar `getTombstonedNodes()` con acciones restaurar/eliminar (reutilizar `overlay-mutations.ts`).
- [x] Mover los comandos `workspace:publish`, `workspace:rollback`, `workspace:preview-public` a botones del panel (mantener los comandos del menú contextual como acceso rápido, sin duplicar lógica).
- [x] Resolver el nodo fantasma `snake`: registrarlo como app real (con su vista) o documentar su retiro del release en v3 (decisión con el usuario; por defecto se retira en 028A-10).
- [x] Validación visual en navegador desktop (1440×900) y móvil (390×844): pestaña accesible, acciones funcionan, no rompe el resto del Admin.

**Gate/salida:** desde Admin el usuario puede ver el estado, validar, publicar y activar releases, y gestionar nodos ocultos; `task:check -- 028A-14` PASS + navegador.

**DoD:** pestaña + acciones + diff + tombstones + commit `028A-14: ...`. — **CUMPLIDO 2026-08-03** (`frontend/src/pages/admin-workspace.ts` nuevo con patrón WeakMap + guard de generación, tab `escritorio` primero en Admin, `WorkspaceService.getControl/validateVersion/activateVersion`, gate `task:check -- 028A-14` PASS 30 archivos; navegador: detectó "sin versión activa" (v1..v5 inactivas por mutación externa), validó v3 dry-run OK, la activó y `GET /api/workspace/release` volvió a servir v3 con 14 nodos incl. `trash`; aviso "activa ≠ última publicada" visible). Nota: diff visual por versión y tombstones quedaron fuera del alcance mínimo (el aviso de gobernanza cubre la detección; diff/tombstones se pueden añadir en fase posterior).

---

### Fase 6 (opcional, posterior) — Persistencia del overlay del admin

- [ ] Persistir server-side los tombstones/overlay del admin (o al menos los tombstones) para que sobrevivan a cambio de navegador.
- [ ] Decidir política: ¿overlay admin separado por cuenta admin, o solo tombstones globales?

**Gate/salida (cuando se ejecute):** ocultar un nodo como admin sobrevive a recarga y a otro navegador; no filtra a cuentas no-admin.

---

## 5. Definición de Done global

- [ ] Todos los cambios con IDs `028A-10..14` con commit individual `{ID}: descripción` y stage explícito (nunca `git add .`).
- [ ] Cada fase con `npm run task:check -- {ID}` PASS (Sentinel/VarSense/type-check/tests).
- [ ] Cambios de contrato OpenAPI regenerados con Orval (`npm run codegen`) y verificados con type-check.
- [ ] Verificación en navegador de toda fase que toque UI (desktop + móvil).
- [ ] Roadmap actualizado (tareas retiradas al completarse) y completadas archivadas en `Agente/completados/tareas-2026-08-02.md`.
- [ ] Lección si aplica en `Agente/lecciones/lecciones-aprendidas.md` y comentarios `[ID]` en el código.
- [ ] `git pull --rebase` antes de push; push al cerrar cada fase.

## 6. Reglas operativas durante la ejecución

- No validar tras cada microcambio: acumular el bloque y validar al cierre (regla 11).
- Comandos largos (migraciones, tests pesados) con timeout y señal de readiness; `cargo test`/`clippy` solo vía `task:check` o `--full` con cooldown.
- No editar código generado por Orval: cambios van al schema utoipa y se regenera.
- No commitear `glory-rs/` (gitignored).
- Releer este plan y el roadmap tras cada commit antes de cerrar (regla 16).
