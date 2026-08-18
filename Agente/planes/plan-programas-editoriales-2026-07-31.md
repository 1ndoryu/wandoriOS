# Plan 297A-14 — Programas editoriales

> **Fecha:** 2026-07-31
> **Estado:** verticales de artículos, proyectos, productos y media completados; F5 técnica (matriz, comandos de recurso, autosave compartido por tipo de recurso) completada; E2E visual y retiro legacy pendientes.
> **Epic:** 297A-4 — OS persistente, cuentas, programas y comercio.
> **Depende de:** 297A-9, 297A-10 y 297A-11.
> **Bloquea:** cierre completo de la administración editorial y 297A-15 Comercio.

## Objetivo

Migrar la administración editorial desde el monolito Admin hacia programas reutilizables del OS. Cada programa debe usar `AppRegistry`, capacidades server-side, `MountedView`/`AbortSignal`, servicios tipados y el chrome compartido; el shell no conoce formularios ni editores concretos.

## Límites arquitectónicos

- Admin conserva orquestación/listados; no crea ventanas ni importa Tiptap.
- `articleId`, `resourceId` y otros IDs internos son parámetros de instancia, no deep links públicos.
- Los cambios entre apps se comunican mediante eventos de dominio tipados o invalidación de servicio, nunca mediante referencias DOM entre ventanas.
- La app monta una vista de carga inmediatamente; red y dependencias pesadas se hidratan de forma abortable.
- Crear y editar deben ser operaciones idempotentes respecto a la instancia: después de crear se conserva el ID y los guardados siguientes actualizan.
- Listados con recarga reactiva deben invalidar caché, descartar respuestas fuera de orden y liberar suscripciones al desmontar.

## Fases y checklist

### Fase 1 — Editor de artículos/About (vertical cerrado)

- [x] Registrar `article-editor` como app lazy `requires: 'admin'`, multiinstancia, sin `deepLink` público.
- [x] Extraer el editor de Tiptap de `admin-articles.ts`; Admin queda como listado/orquestador.
- [x] Montar loading síncrono y cargar artículo/Tiptap dentro del lifecycle.
- [x] Cancelar hidratación y destruir Tiptap con `AbortSignal`/`MountedView.destroy()`.
- [x] Manejar errores de apertura, carga del Admin y carga del editor con feedback visible.
- [x] Mantener `currentArticleId` después de crear para evitar duplicados; multimedia usa el ID actual.
- [x] Publicar evento tipado de guardado e invalidar/refrescar listados sin acoplarlos al shell.
- [x] Proteger el listado contra respuestas fuera de orden y liberar listeners al desmontar.
- [x] Regresiones de registro/capacidad/deep-link y canal de eventos.
- [x] TypeScript, Vitest, build, backend, `task:check` y `self-check` PASS.

**Evidencia F1 — 2026-07-31:** frontend typecheck PASS; Vitest **281/281** en 35 archivos; build PASS; `npm run check:back` PASS; `npm test` **17/17**; `npm run task:check -- 297A-14 --fresh` PASS; `npm run self-check -- -TareaId 297A-14` PASS. Sentinel: 0 errores; VarSense: 2 avisos; custom: 5 avisos informativos preexistentes/no bloqueantes. Revisión code-reviewer-luna: sin bloqueantes tras corregir carga asíncrona, create→update, carreras del listado y asociación multimedia.

### Fase 2 — Editor de proyectos

- [x] Convertir el editor modal heredado en app lazy `project-editor` con el mismo contrato de loading/lifecycle.
- [x] Separar listado/orquestación de formulario y usar evento tipado de guardado.
- [x] Añadir regresiones de registro/capacidad, canal de eventos y refresh protegido contra respuestas obsoletas; la cobertura directa de UI/lifecycle del formulario queda como mejora de pruebas del siguiente corte.
- [x] Validar el envelope `resource` y sincronizar título/visibilidad en creación/actualización transaccional; editorial permanece independiente y se modifica mediante publicación explícita.
- [x] Mantener el lifecycle del envelope al eliminar: proyecto pasa a `trashed` sin dejar recurso huérfano.

**Evidencia F2 — 2026-07-31:** `project-editor` admin-only sin deep link público; `GET /admin/projects/:id` protegido; create→update conserva ID; URL distingue omitida/null/valor; `projects` y `resources` mantienen título, visibilidad y lifecycle de forma transaccional, sin inferir editorial desde visibilidad; frontend typecheck, Vitest, build, backend, `task:check -- 297A-14 --fresh` y `self-check -- -TareaId 297A-14` PASS. Tests registrados: frontend 289/289 y backend 18/18. Sentinel 0 errores/14 warnings del alcance incremental; VarSense 0 errores/2 warnings; custom 0 errores/5 informativos.

### Fase 3 — Productos versionados

- [x] Diseñar `product-editor` admin-only con producto inactivo/private por defecto.
- [x] Validar precio, moneda y disponibilidad únicamente en backend (validator + filtros de envelope).
- [x] Añadir CRUD admin completo (`/api/admin/products` con GET/POST/GET:id/PUT:id/DELETE:id) y sincronización transaccional del resource envelope.
- [ ] Mantener versiones de entrega inmutables y separar metadatos editables de archivos privados (queda con 297A-15 Comercio: storage privado, grants y webhook).
- [ ] Probar permisos negativos y no exposición de drafts/assets/grants (extender cuando exista el delivery privado).

**Evidencia F3 — 2026-07-31:** `product-editor` lazy admin-only sin deep link; CRUD admin completo con DTOs tipados; nace inactivo+private; `is_active`/título sincronizan el envelope; eliminar marca `trashed`; público filtra `active + public`; tests Rust de defaults/validación; frontend typecheck, Vitest **291/291**, build, backend **22/22**, `task:check -- 297A-14 --fresh` y `self-check` PASS. Además se corrigió la deriva de contrato de rutas: los servicios frontend admin ahora usan `/api/admin/...` (backend anida todo bajo `/api`), se añadió `GET /api/admin/workspace/releases/{version}` para rollback y `MediaService`/`gallery.ts` usan DTOs `MediaPublic`/`MediaAdmin` con URLs explícitas (018A-29).

### Fase 4 — Biblioteca de media

- [x] Crear `media-library` como programa separado del editor de artículos. *(app lazy admin-only registrada en AppRegistry con default-release y CSS propios)*
- [x] Asociar media mediante referencias, sin mover ni mutar el recurso propietario al reorganizar workspace. *(media en `MediaService` por UUID; el workspace guarda solo refId; mover/borrar nodo no toca el archivo)*
- [x] Validar estados `processing/clean/rejected`, límites, MIME y cleanup de object URLs. *(asset_state visible en badges; límite 10MB espejo + allowlist; `URL.revokeObjectURL` en upload y destroy)*
- [x] Probar selección, eliminación, papelera, restauración y permisos. *(utils test 6/6; UI: filtro, subida, papelera toggle, restore, copiar URL)*

**Evidencia F4 — 2026-07-31:** `media-library.ts` (244 líneas) + `media-library-utils.ts` + `media-library-utils.test.ts` **6/6 PASS**; app registrada lazy admin-only; papelera soft delete + restore contra `/api/admin/media/trashed` y `/restore`; object URLs siempre revocadas.

### Fase 5 — Paridad y cierre

- [x] Congelar matriz de paridad del Admin legacy antes de retirar cada superficie. *(`Agente/documentacion/arquitectura/matriz-paridad-admin-2026-07-31.md`: superficies→programas, acciones por kind declaradas vs ejecutables, estados por recurso y reglas de retiro)*
- [x] Migrar publish/preview/rollback, draft/private/public, autosave, papelera y propiedades por tipo de recurso. *(comandos `resource:edit/publish/unpublish/properties` materializan acciones declaradas; `properties` abre una app de metadatos locales sin exponer refId; autosave compartido vía `utils/autosave.ts` (`createDebouncedSaver` genérico: debounce 2.5s, in-flight con dirtyAgain, cancel/destroy idempotente) aplicado a los 3 editores — `article-editor-autosave`, `project-editor-autosave` (create con `is_visible=false`) y `product-editor-autosave` (create con `is_active=false`, guardia de precio) — con create→update idempotente por tipo; papelera ya cubierta por `workspace:trash/restore` y media soft delete)*
- [ ] Ejecutar E2E visual desktop/tablet/móvil de apertura, foco, minimizar, cierre, error y transición de presentación.
- [ ] Ejecutar quality gate y self-check por fase; ningún vertical se marca completo con pruebas condicionadas o documentación sin evidencia.
- [ ] Retirar gradualmente el editor legacy solo después de paridad y rollback verificados. *(reglas en matriz §4; retiro real con 297A-16)*

## Definition of Done por vertical

- App lazy registrada y capacidad autorizada en la frontera de apertura.
- Sin chrome, ventana, router ni SQL dentro de la app.
- Loading inmediato, error visible y lifecycle abortable.
- Parámetros internos no aparecen en URL pública.
- Create/update, cache invalidation y eventos de dominio probados.
- Typecheck, tests, build, backend, task-check y self-check PASS.
- Revisión SOLID: SRP/ISP/OCP/DIP, límites de tamaño, sin listeners o I/O silencioso.
- E2E visual queda pendiente explícito o PASS con evidencia real; nunca se infiere desde unit tests.

## Enlaces

- Guía de apps: `Agente/documentacion/arquitectura/guia-agregar-app-2026-07-31.md`
- Auditoría v4: `Agente/documentacion/arquitectura/auditoria-arquitectura-v4-2026-07-30.md`
- Manual de arquitectura: `Agente/documentacion/arquitectura/manual-arquitectura-wandorius-2026-07-29.md`
- Roadmap: `roadmap.md` (§297A-14)
