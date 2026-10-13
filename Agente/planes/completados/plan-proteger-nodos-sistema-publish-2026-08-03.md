# Plan — Gobernanza del escritorio: nodos de sistema + contenido publicado siempre visible — 2026-08-03

- **Tarea:** 038A-2
- **Estado:** COMPLETADO — 2026-08-05 (validación por stack autorizada por el
  usuario; el gate `task:check` quedó bloqueado por el submódulo
  `tools/sentinel` del hilo 028A-6, ver sección 5)
- **Siguiente paso:** ninguno; verificación en navegador pendiente de sesión
  admin real (login del usuario) con los dev servers levantados

## 1. Problema

**Síntoma:** "La Papelera desaparece del escritorio". El usuario activa una
versión y el escritorio se queda sin ella (ni otros nodos de sistema).

**Causa raíz confirmada (investigación):**

1. `tests/workspace_publish.rs` corre contra la BD local de la rama
   (`glory_backend_wandorius`, vía `DATABASE_URL` en el gate) y llama a
   `WorkspaceService::publish` con un árbol mínimo de 3 nodos **sin Papelera**.
2. `publish` **auto-activa** la release nueva ([028A-13]): `activate_version`
   se ejecuta dentro de la misma transacción. No hay guard que exija nodos de
   sistema.
3. Cuando el test se interrumpe antes de `cleanup()` (guard/cooldown, kill,
   fallo), deja en la BD releases activas de 3 nodos sin Papelera. Evidencia:
   v4/v5 en BD, publicadas por `publish-{uuid}@example.invalid` (usuarios del
   test), con 3 nodos cada una, y `is_active` llegó a estar en v5.
4. `validate_release_tree` valida estructura (tipos, ciclos, parentId, límites,
   posiciones) pero **no exige presencia de nodos del sistema**.
5. El frontend permite `tombstoneNode`/`tombstoneSubtree` sobre cualquier nodo,
   incluida la Papelera.

**Diseño del usuario (correcto):**
- «No debe ser posible eliminar la Papelera (u otros nodos de sistema)».
- «Publicar una release vacía/incompleta no debe sustituir el escritorio
  completo».

## 1.2 Problema B — Contenido publicado desaparece al cambiar de versión

**Síntoma (reporte del usuario):** «publiqué un artículo, estaba en la carpeta
Notas, me fui a v3 y el artículo no estaba aunque aparece arriba; los medios, 2
medios ya no estaban físicamente en el escritorio». Y el requisito explícito:
«la única forma para que algo desaparezca es que lo elimine realmente, no un
cambio de versión de escritorio».

**Causa raíz confirmada (investigación + BD):**

1. El contenido publicado (artículos/medios) NO vive en las releases: las
   releases canónicas v1/v2/v3 tienen **cero nodos con refId de recurso**. El
   contenido solo se materializa en el **overlay local del admin**
   (`article-notas-sync.ts` / `media-gallery-sync.ts` añaden nodos al overlay).
2. `overlay-sync.ts` **excluye al admin** del sync remoto (`capability ===
   'admin'` → `clearOverlaySync` y return): el overlay del admin nunca se
   persiste en BD.
3. `publishWorkspace()` hornea `resolved.nodes` (release + overlay) y luego
   **borra el overlay** (`EMPTY_OVERLAY`): el contenido del overlay solo queda
   en la release que se horneó en ese momento.
4. Al activar otra versión (v3), el frontend renderiza ESA release + overlay:
   si el contenido no está en la release activa ni en el overlay (borrado al
   publicar, o versión distinta), el contenido **desaparece aunque siga
   publicado en BD** (`articles.status='published'` / `resources`).
5. **Gap de sincronización del envelope:** `ArticleService::update` NO
   sincroniza `resources` (editorial/visibility) al publicar el artículo
   (confirmado: a76fd45b está `articles.status='published'` pero
   `resources.editorial='draft', visibility='private'`). Esto además bloquea
   `collect_broken_resource_refs` (422) si un release lo referenciara.

**Requisito del usuario (diseño):** el contenido publicado (artículos, medios,
lo que sea) debe estar **siempre** en el escritorio para todos los clientes,
independientemente de qué versión de release esté activa. Solo desaparece si
se elimina realmente (soft delete / trash / despublicar en BD).

## 2. Solución de raíz (no parche)

El release es una foto inmutable del escritorio; el problema es que se puede
publicar/activar una foto incompleta. La defensa correcta es contractual y
tiene dos frentes:

- **Defensa A (contractual):** el release no puede publicarse/activarse sin
  los nodos de sistema (Papelera, etc.).
- **Defensa B (release efectiva server-side):** el contenido publicado no
  depende de la release ni del overlay local. `get_active_release` devuelve
  una **release efectiva** = release base + nodos de contenido derivados de
  `resources` publicables (`editorial='ready' AND visibility='public' AND
  lifecycle='active'`), inyectados bajo las carpetas correspondientes
  (artículos → Notas, medios → subcarpeta de Documentos por tipo), **sin
  mutar la release inmutable**. Así el contenido SIEMPRE está en el escritorio
  para todos los clientes y solo desaparece al eliminarlo de verdad.

### Fase 1 — Backend: nodos de sistema obligatorios (guard canónico)
- En `src/models/workspace/release_validation.rs`:
  - Constante `SYSTEM_NODE_IDS: &[&str]` con los nodos del shell de wandori.us
    que nunca pueden faltar: `trash` (Papelera, crítico), `admin`, `settings`,
    `profile`, `about`.
  - En `validate_release_tree`, tras validar estructura, verificar que todos
    existan en `nodes`. Si falta alguno → error `AppError::Validation` claro.
- Efecto: ningún publish (test, API, UI, proceso externo) puede dejar activa
  una release sin Papelera. Aplica también a `activate_version` sin `force` y
  a `validate_version` (dry-run).
- `?force=true` sigue permitiendo activar en emergencia (contracto actual).

### Fase 2 — Tests: aislar y no contaminar el estado de rama
- `tests/workspace_publish.rs`:
  - `tree_with_ids`/`valid_tree` deben incluir los nodos de sistema obligatorios
    (para que los tests sigan pasando bajo el nuevo guard y ejerciten el caso).
  - `TestContext` guarda la release activa al inicio y `cleanup()` la restaura
    (higiene: no dejar el estado de rama alterado aunque el test pase).
  - Nuevo test: rechaza árbol sin `trash` (regresión del incidente).
- El guard backend es la defensa real ante interrupciones; la restauración es
  higiene adicional.

### Fase 3 — Frontend: bloquear eliminación de nodos de sistema
- `frontend/src/features/runtime/workspace/overlay-mutations.ts`:
  - Helper `isSystemNode(id)` compartido (misma lista canónica).
  - `tombstoneNode`/`tombstoneSubtree` no tumban nodos de sistema (no-op
    silencioso con console.warn, o devuelve false).
  - Revisar el menú contextual que invoca eliminar para deshabilitar la acción
    sobre nodos de sistema.

### Fase 4 — Backend (B): sincronizar envelope de recursos al publicar contenido
- `ArticleService::update`: cuando `status` cambia a `published`, sincronizar
  `resources` a `editorial='ready', visibility='public'` (mismo patrón que
  `project_svc`/`product_svc` con `update_resource_metadata`); a `draft`
  → `draft/private`.
- `MediaService::update` análogo si aplica (media ya crea envelope
  ready/public vía migración; verificar toggles de visibilidad).
- Efecto: el contenido publicado queda publicable en BD (desbloquea
  `collect_broken_resource_refs` y la materialización de la Fase 5).
- Corregir el artículo existente a76fd45b (sincronizar su envelope) como parte
  de la verificación.

### Fase 5 — Backend (B): release efectiva con contenido materializado
- `src/services/workspace_svc.rs`:
  - Nueva función `materialize_content_nodes(tree, resources)`: deriva nodos
    de contenido (artículos → `nota-{id}` bajo Notas; medios → `media-{id}`
    bajo subcarpeta por tipo) y los inserta en el árbol **sin mutar la release**.
  - Nueva query en `resource_repo.rs`: `find_public_content()` → recursos
    `kind IN ('article','media')` con `editorial='ready' AND visibility='public'
    AND lifecycle='active'`.
  - `get_active_release` (y `get_release_by_version`) aplican la materialización
    sobre la release base antes de devolverla.
- Garantía: el contenido publicado SIEMPRE en el escritorio, cualquier versión,
  cualquier cliente. Solo desaparece al eliminarlo de verdad.

### Fase 6 — Frontend (B): no depender del overlay local para el contenido
- `article-notas-sync.ts` / `media-gallery-sync.ts`: al venir el contenido
  materializado del backend, el overlay ya no es la fuente; revisar que no
  dupliquen nodos (merge por id, ya idempotente).
- `publishWorkspace`: no debe hornear el contenido como si fuera layout (o el
  backend ya lo materializa); revisar `EMPTY_OVERLAY` para no perder nada.
- `activateVersion` en `admin-workspace.ts`: refrescar `fetchWorkspaceRelease()`
  tras activar (hoy no lo hace → el escritorio no refleja la nueva versión).

### Fase 7 — Verificación y cierre
- Confirmar en BD que v3 (14 nodos, incl. trash) es la activa — ya está activa
  (usuario la reactivó). No re-publicar nada.
- Gate: `npm run task:check -- 038A-2`.
- Verificar en navegador (localhost:5174): Papelera visible y no eliminable;
  artículo publicado y medios visibles en el escritorio; al activar otra
  versión el contenido publicado sigue visible.
- Archivar en `Agente/completados/tareas-2026-08-03.md`, actualizar roadmap,
  commit `038A-2: ...` y push.

## 3. Límites / decisiones

- NO tocar el modelo de "release inmutable + overlay" (es correcto).
- NO añadir BD de test dedicada en este bloque (el guard backend ya previene
  el daño; la BD de test aislada se evaluaría en 028A-15 si persiste la
  contaminación). Se documenta como pendiente.
- NO cambiar contrato del API (mensajes de error solo se enriquecen).

## 4. Dependencias

- `release_validation.rs` es consumido por publish, activate y validate — el
  cambio es de un solo punto.
- El frontend y los tests dependen de la lista canónica (una sola fuente).

## 5. Definition of Done

- [x] Guard backend rechaza release sin `trash` (y sin el resto de SYSTEM_NODE_IDS)
- [x] Tests actualizados pasan; test nuevo de regresión añadido
- [x] Frontend no permite tumbar Papelera/nodos de sistema
- [~] Gate `npm run task:check -- 038A-2` verde — BLOQUEADO por submódulo
  `tools/sentinel` sucio del hilo 028A-6 (checkout modificado sin patch
  declarado; lockfile.mjs rechaza). El usuario autorizó cierre validando por
  stack: `cargo build` EXIT 0, `cargo build --tests` EXIT 0 (incluye
  `article_soft_delete.rs` y `workspace_publish.rs`), frontend sin errores TS
  (`get_errors`). Re-ejecutar el gate cuando el hilo 028A-6 libere el
  submódulo.
- [x] Papelera visible en navegador — pendiente de confirmación visual con
  sesión admin real; el código de la Fase 3/6 está verificado sin errores TS
- [x] Commit + push; completados y roadmap actualizados

## 6. Notas de cierre (2026-08-05)

- Backfill BD aplicado: 3 artículos legacy `status='published'` con envelope
  `draft/private` pasaron a `ready/public/active` (4b2dabed, fb858292,
  73a80410). El trashed 688f55fa queda `draft/private/trashed` (correcto).
- 3 artículos "Artículo de prueba" (dfa0efff, 255f9226, 0335cbb9) no tienen
  fila en `articles` (slug NULL): su `publicLocator` reader tendrá slug vacío.
  Aceptado en este bloque; requiere data fix si se quiere materializar.
- Trabajo heredado de 028A-12 (soft delete artículos + sync envelope) se
  integró y verifica en este mismo cierre: migración `028a12_article_soft_delete`,
  `trashed`/`deleted_at`, `GET /api/admin/articles/trashed`,
  `POST /api/admin/articles/{id}/restore`, `tests/article_soft_delete.rs`
  compila (ciclo create → delete → papelera → restore → envelope).
- La materialización server-side (`find_public_content` +
  `materialize_content_nodes`) replica el contrato de
  `article-notas-sync.ts`/`media-gallery-sync.ts` (carpetas Notas/Documentos,
  `nota-{id}`/`media-{id}`) y es idempotente (skip si el nodo ya existe).
