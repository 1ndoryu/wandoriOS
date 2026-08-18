# wandori.us — Roadmap

> **Producto:** blog, portfolio y tienda digital dentro de un OS retro minimalista.
> **Stack:** Rust/Axum + PostgreSQL + Vanilla TypeScript/Vite.
> **Deploy:** fuera de alcance hasta instrucción explícita; producción solo con Coolify Manager.
> **Epic:** 297A-4 — OS persistente, cuentas, programas y comercio.
> **Visual:** desktop/tablet y prototipo móvil aprobados; el chrome sigue monocromo, minimalista y con JetBrains Mono.

## Fuentes canónicas

- Índice: `Agente/documentacion/indice-documentacion-2026-07-29.md`
- Arquitectura: `Agente/documentacion/arquitectura/manual-arquitectura-wandorius-2026-07-29.md`
- Identidad: `Agente/documentacion/design-system/manual-identidad-visual-os-2026-07-29.md`
- Plan maestro: `Agente/planes/plan-escritorio-persistente-cuentas-admin-apps-2026-07-29.md`
- Plan móvil: `Agente/planes/plan-experiencia-movil-launcher-2026-07-29.md`
- Tema claro/oscuro: `Agente/planes/plan-modo-oscuro-os-2026-07-31.md`
- Deep links: `Agente/planes/plan-deep-links-ventanas-2026-07-31.md`
- Apps editoriales: `Agente/planes/plan-programas-editoriales-2026-07-31.md`
- Interacción y medición: `Agente/planes/plan-contratos-interaccion-comandos-medicion-2026-07-29.md`

## Cómo leer este archivo

- Esta lista contiene únicamente trabajo pendiente. Las casillas no se duplican en otro bloque.
- El estado base implementado se resume abajo para conservar contexto sin convertir el roadmap en un historial.
- El detalle de cada entrega terminada vive en `Agente/completados/` y en los planes archivados.
- Una tarea solo se marca cuando tiene evidencia de código, pruebas, quality gate y, si es UI, navegador.
- El cierre normal usa `npm run gate:check -- {ID}`; `task:check` y `self-check` son compatibilidad temporal.

## Estado base implementado (resumen operativo)

- **Runtime y shell:** `MountedView` con `AbortSignal`/teardown, `AppRegistry`, `WindowManager`, `CommandRegistry`, `RouteAppAdapter`, taskbar reactivo, foco/z-index, drag y resize por bordes, atajos, analytics tipado y toolbar común. Las apps devuelven contenido; el shell crea el chrome.
- **Workspace:** release público inmutable + overlay personal, merge por ID/campo, tombstones, clipboard, undo, papelera, carpetas, Finder real, drag/drop, menús unificados, referencias por `resourceKind`, publicar/preview/rollback y organizador público aislado del workspace admin.
- **Recursos y programas:** envelope de recursos con estados editorial/visibilidad/lifecycle/comercio independientes, DTOs público/admin/upload, About como recurso, versiones de producto, biblioteca de media con soft delete/restore y editores lazy de artículos, proyectos y productos con autosave compartido.
- **Comercio:** Tienda, Checkout, Pedidos y Descargas son programas del OS; idempotencia de órdenes, webhook firmado, outbox deduplicado, entitlements y grants temporales. Precio, pago, entrega y autorización permanecen server-side.
- **Cuenta y preferencias:** sesión opaca en cookie HttpOnly, login dentro de Cuenta, recuperación hashada, rate limits, auditoría sin secretos, Cuenta como app singleton, preferencias/overlay remotos con revisión optimista y conflicto `local/remote` embebido en Cuenta. Admin no usa overlay personal.
- **Presentaciones:** desktop/tablet usa ventanas; móvil usa launcher y apps a pantalla completa con las mismas apps, comandos, permisos, rutas y analítica. La transición móvil↔tablet reinstancia de forma segura y conserva el recurso enfocado.
- **Tema e identidad:** modo claro/oscuro con tokens semánticos, botón único, persistencia local/remota, prevención de flash y evento `theme_changed`; Lucide oficial a 1px; botones, tabs, estados vacíos, labels, toolbar TipTap y franja inferior de acciones siguen recetas compartidas.
- **Persistencia y URLs:** sesión versionada de ventanas con restauración fail-closed, debounce/flush y stack móvil; deep links allowlisted, foco representado por la URL, `Copiar URL`, History API y eventos de navegación/foco. La restauración reconstruye acciones desde `MountedView`, nunca persiste DOM.
- **Layout de iconos:** escritorio usa `position` snap-grid; móvil usa `mobilePosition` con fallback `mobileOrder`; colisiones, reflow y Finder están separados por presentación. El grid del escritorio distribuye el espacio libre con `space-between`/center y el snap-grid replica esa distribución (`rowGapEffective`); al redimensionar, los iconos se recolocan a la última columna visible en vez de quedar cortados por `overflow: hidden`, y el highlight del drag queda alineado con la celda real (058A-1, 058A-2). El shell oculta cualquier nodo del workspace sin apertura posible: sin URL pública válida (`resolvePublicResourceTarget`), sin visor de imagen local fuera del Finder ni app con `refId` no aparecen en Finder, escritorio ni launcher móvil (`canOpenNodeFromShell`, 058A-3). La selección múltiple con el mouse es estilo Windows en escritorio y Finder: Ctrl/Cmd+clic alterna, Shift+clic extiende rango, banda de selección desde el fondo con feedback provisional (aditiva con Ctrl), drag de grupo con offset relativo, menú contextual y comandos multi (trash borra todos los targets; open/rename solo con selección simple); la banda se recorta al contenedor y previene el scroll durante el gesto (058A-4).
- **Contratos y seguridad:** OpenAPI `tags-split`, mutator compartido, clientes Orval por dominio y retiro del cliente manual; sin Bearer/JWT público, sin serving estático de uploads, sin DTOs internos ni storage keys en respuestas públicas.
- **Calidad y arquitectura:** quality gate incremental local/full CI con Sentinel + VarSense, cachés separadas, `test:changed`, suite frontend completa en CI, builds/budgets gzip, runbook Coolify y checkpoints SOLID/OCP/DIP/SRP documentados. El mínimo desbloqueante está cerrado: `quality:test` 31/31 y 24 reglas activas.
- **Correcciones recientes relevantes:** se resolvieron la ruta legacy `/admin`, visibilidad editorial de proyectos (018A-83), contratos de URL/autosave, select nativo, `createEl` para `textarea`, Reader TipTap, sincronización del Finder, iconos por registro único, rejilla compacta y bordes/flechas del tema oscuro. La carpeta vacía "Galería" se sustituyó por "Documentos" con subcarpetas por tipo y sync de media al workspace (018A-87): los archivos subidos aparecen en el Finder, se abren con visor, se retiran al moverlos a la papelera y se restauran. El menú contextual ahora funciona dentro de las carpetas con acciones de creación (nuevo artículo/proyecto/producto, subir archivo, nueva carpeta, pegar) y el clic en ítems del Finder y del escritorio muestra selección visual con los tokens del OS (018A-88). El clic derecho dentro de las carpetas responde en todo el alto del panel del Finder, no solo sobre los ítems (018A-89). El menú sobre una carpeta dentro del Finder ofrece gestión completa — Abrir, Renombrar, Cortar, Copiar, Pegar en y Eliminar con borrado seguro (confirmación + subárbol restaurable) y `Ctrl+V` con destino (018A-90); el crear permanece en el fondo. La restauración de sesión conserva el chrome inferior de las apps (`MountedView.actions`) validado visualmente en desktop y tablet sin duplicar ventanas ni alterar geometría/taskbar/URL (018A-69). El fallback local del prototipo Bosque/Bosque 3D evita que un release local anterior al registro oculte los accesos durante desarrollo, sin sobrescribir la organización del release ni activar apps en producción (018A-92); el 05-ago se retiraron los bocetos Bosque (game) y Bosque 3D (game-3d) del registro, del release y del código (dirección visual decidida) y solo queda la app jugable `game-playable` (GAME-01). Una carpeta vacía del Finder ya no muestra texto (el grid queda en blanco y el clic derecho sigue abriendo el menú) y la barra de ruta tiene botón "volver a la carpeta anterior" con historial de navegación, deshabilitado en la raíz (018A-91). El grid del Finder alinea sus iconos al inicio, igual que el grid del escritorio, en vez de centrarlos (018A-93). La selección del Finder ya no se refleja en el escritorio (y viceversa): el `selectionStore` se escala por superficie (`desktop`/`finder`) y cada una solo refleja su propia selección, sin romper copiar/cortar (018A-95). Los planes GAME-01 y de assets/terreno ahora exigen auditoría de SOLID, rendimiento, escalabilidad, seguridad, observabilidad y accesibilidad al cierre de cada fase, con evidencia antes de avanzar (018A-94). GAME-01 añadió el fixture `game-playable` lazy/full-bleed: movimiento offline con `game-core`, cámara limitada, teclado/D-pad, pausa background y teardown WebGL; type-check, 40 tests, build, diff-check y navegador en `/forest-playable` pasan. Después se añadió el contrato puro `MapVersion` con terreno por chunks, manifiesto de assets, instancias, spawns, cuotas fail-closed, adaptación a colliders X/Z y 41 tests; build/diff-check y navegador siguen verdes. Endpoint, validación server-side, persistencia, realtime, identidad, editor y mediciones repetidas de GPU/memoria siguen pendientes. Gobernanza del escritorio (038A-2): la Papelera y los nodos de sistema (`trash`, `admin`, `settings`, `profile`, `about`) no pueden eliminarse (guard backend en `validate_release_tree` + guards frontend `tombstoneNode`/`tombstoneSubtree`/`workspace:trash`), y el contenido publicado (artículos/medios ready/public/active) SIEMPRE se materializa en la release efectiva server-side (`find_public_content` + `materialize_content_nodes`, sin mutar la release) bajo Notas/Documentos, para cualquier versión activa y cualquier cliente — solo desaparece con eliminación real en BD; `ArticleService::update` sincroniza el envelope al publicar/despublicar, y el borrado de artículos es soft delete transaccional con papelera y restore (028A-12). Validado por stack (`cargo build`/`--tests` EXIT 0, frontend sin errores TS); gate diferido por submódulo `tools/sentinel` sucio del hilo 028A-6. Los detalles y gotchas permanecen archivados.

## Sentinel/quality — CANCELADO (2026-08-12)

> **Decisión del usuario:** no se continúa con el backlog de Sentinel/quality gate.
> Los 11 planes (`plan-*-sentinel*`, `plan-heavy-run-guard`, `plan-triage-alertas-quality`,
> `plan-mejora-quality-tool`, `plan-calidad-tooling`, `plan-ejecucion-auditoria-sentinel`,
> `plan-agilizar-ceremonia-cierre-calidad`, `plan-global-quality-guard-agnostico`) fueron marcados
> CANCELADOS y archivados en `Agente/planes/completados/`. `roadmap-sentinel.md` queda como historia cancelada.
> El gate ya implementado (`npm run gate:check`, `quality:test`, etc.) no se toca: sigue funcionando,
> simplemente deja de tener backlog pendiente.


## Juego — ARCHIVADO (2026-08-18)

> **Decisión del usuario:** ya no se trabaja en nada relacionado con videojuegos.
> Todo el frente (motor `game-core`, app `game-playable`, editor/constructor,
> realtime/multijugador, estilos Curved Island/Sakura) quedó **archivado** en
> `_archivo/juego/` (código frontend + backend + documentación) y **oculto del
> front**: sin app, sin ruta `/forest-playable`, sin comandos `game:*`, sin nodo
> en el release y sin rutas backend de juego. Los planes, ADR y referencias
> viven en `_archivo/juego/documentacion/`. Las migraciones `*game*` se
> conservan en `migrations/` por ser historia de esquema ya aplicada
> (decisión documentada en `_archivo/juego/README.md`).
## Decisiones de producto (2026-08-12)

- **Registro (297A-13):** registro público habilitado con verificación por email (Resend) + token de un solo uso.
- **Conflictos preferencias/overlay (297A-13):** merge por campo + LWW por campo en colisión real, con aviso no bloqueante.
- **MFA (297A-13/297A-17):** TOTP (códigos 6 dígitos, RFC 6238); passkey/WebAuthn queda como mejora posterior.
- **Correo transaccional (297A-13):** Resend real solo en producción; en local se mockea (token en log/almacén de dev).
- **Configuración (297A-29 Fase 4):** la app Configuración se convierte en el **panel de control**: fondo de pantalla, fuentes y escala (todo con default y restauración), config por usuario con la del admin como default, y ajustes de cuenta (nombre, foto de perfil, preferencias). Abierto a más ideas.

## Pendientes ordenados

### 138A-16 — Coordinación entre agentes: auditar MD del área de trabajo y conducta-global (pendiente)

**Pendiente de investigación (no iniciar ahora):** auditar todos los MD del
área de trabajo (AGENTS.md de cada proyecto, skill `conducta-global` y demás
docs de coordinación) para corregir que los agentes trabajen de forma
correcta y coordinada — flujo `sentinel task claim/start/integrate/cleanup/
release` con worktree por tarea aplicado de forma consistente, sin pisarse en
el checkout compartido (incidente del 14-ago entre 138A-14 y 138A-15 en
`roadmap.md`/`Agente/completados/tareas-2026-08-14.md`).

- [ ] Auditar los MD del área de trabajo y `conducta-global`.
- [ ] Definir y automatizar la coordinación entre agentes (worktree + lock por tarea).

### 028A-5 — Novedades: popover de campana + admin "novedades" con borrado

**Depende de:** 297A-21 (notificaciones) y las recetas de popover/modal del OS.

- [x] La app `notifications` deja de ser una ventana: la campana (desktop y launcher móvil) abre un popover compacto de ~300px anclado, con lista de hasta ~40 avisos, scroll de ~260px, recargar, marcar todas y cierre por clic fuera/Escape.
- [x] El admin de novedades vive en la app Admin como tab "novedades": listado de avisos, modal "+ nuevo aviso" y cambio de estado con `createSelect`.
- [x] Borrado de avisos (incluidos los publicados) con confirmación; las lecturas se limpian en cascada (`ON DELETE CASCADE`).
- [x] El tag de estado muestra etiqueta en español (borrador/publicado/archivado) en una línea (`white-space: nowrap`).
- [x] Retiro del código legacy (`notifications-view.ts`, `notifications-admin.ts`) y de los estilos `.notificaciones`/`.notificacionesAdmin`.

**Gate/salida:** popover y tab "novedades" validados en navegador (crear, cambiar estado y borrar un aviso publicado); type-check, clippy y suite frontend verdes.

### Plan de gobernanza del workspace (028A-10..14)

**Fuente canónica:** `Agente/planes/plan-gobernanza-workspace-2026-08-02.md` (aprobado). Objetivo: dar al admin control real del escritorio desde la app Admin (release activo, validación, publicación) y garantizar coherencia para que nada borrado o en draft aparezca en la siguiente release.

- [x] **028A-10 — Release v3 con árbol canónico:** la migración `20260802010000_028a10_release_v3` publica v3 con `documentos` + 4 subcarpetas, `projects`, `profile`, `about`, `settings`, `admin`, `trash` (Papelera), `store`, `orders` y `downloads`; excluye `snake` (nodo fantasma) y `game/game3d/gamePlayable` (prototipos GAME-01 ocultados). Gate PASS: `task:check -- 028A-10` (sentinel/varsense/rust/frontend/custom), `GET /api/workspace/release` = v3 con 14 nodos, navegador desktop + launcher móvil muestran Papelera/Tienda/Pedidos/Descargas y la app Papelera renderiza vacía.
- [x] **028A-15 — Ejecutar los tests de integración del guard de publish (028A-11):** `cargo test --test workspace_publish` confirmado contra BD de rama: 4/4 PASS. Requirió corregir el fixture del test de summary (`publish_accepts_valid_tree_and_computes_summary`): [038A-2] exige el id canónico `about` del guard de sistema, pero el test pasaba `about-{uniq}` (el guard rechazaba el release con "El release debe contener el nodo de sistema 'about'"); `about` ya existe en la v1 sembrada, así que no entra en `added` y `nodeCount` es 7 (5 nodos de sistema + folder + recurso). El gate `task:check -- 028A-11` no pudo ejecutarse por el submódulo `tools/sentinel` sucio (otro hilo), mismo falso positivo conocido; la evidencia queda en los 4/4 tests HTTP contra PostgreSQL.
- [x] **028A-12 — Unificar el borrado de artículos (eliminar nodo fantasma):** soft delete transaccional (`trashed` + `deleted_at`, migración `20260805000000_028a12_article_soft_delete`), `GET /api/admin/articles/trashed` + `POST /api/admin/articles/{id}/restore`, sync del envelope `resources` (en `update_resource_metadata` con COALESCE y `soft_delete_kind_tx`/`restore_kind_tx`), evento `ArticleEditorSavedEvent.operation='deleted'` publicado al borrar desde el admin y tombstone del nodo (`removeArticleNode`) en `article-notas-sync.ts` + retiro directo del nodo al recibir el evento `deleted`. Test integral `tests/article_soft_delete.rs` (crear→borrar→papelera→envelope trashed→restore→active). Validado por stack (`cargo build`/`--tests` EXIT 0, frontend sin errores TS); gate diferido por submódulo `tools/sentinel` sucio (hilo 028A-6).
- [x] **028A-13 — Backend de gobernanza:** `GET /api/admin/workspace/control`, `POST /api/admin/workspace/releases/{version}/validate` (dry-run), `POST /api/admin/workspace/releases/{version}/activate`, DTO ligero de `list_releases`; OpenAPI/Orval + tests de permisos (AdminUser/CSRF). Migración `20260803000000_028a13_release_activation` (columna `is_active` + índice único parcial `idx_workspace_releases_active`). DTOs con `rename_all="camelCase"` (bug snake_case detectado y corregido al probar en vivo). Gate PASS `task:check -- 028A-13`. Verificado: validate/activate/control responden 200, activar v3 restaura la Papelera (14 nodos).
- [x] **028A-14 — Panel "Escritorio" en la app Admin:** estado actual (control), historial de versiones con badge activa/nodos/fecha, validar (dry-run con issues/brokenRefs en detalle), activar (con confirmación y guard de validez) y publicar (`publishWorkspace`); tab `escritorio` primero en la app Admin. Directory `frontend/src/pages/admin-workspace.ts` con patrón WeakMap + guard de generación. RESUELTO incidente observable: el panel detectó "sin versión activa" (mutación externa dejó v1..v5 inactivas), validó y activó v3 → `GET /api/workspace/release` volvió a servir v3 con 14 nodos incl. `trash`. Gate PASS: `task:check -- 028A-14` (30 archivos).

### 018A-66 — Separar overlay personal de la sesión admin

**Depende de:** 297A-13 y capacidades server-side. El contrato automatizado ya confirma que admin no solicita overlay remoto ni abre `workspace actualizado`.

- [ ] Validar en navegador login, logout y recarga con usuario admin; no debe aparecer el modal de conflicto ni el aviso `workspace actualizado`.
- [ ] Validar con una cuenta no-admin que el conflicto siga apareciendo únicamente cuando existan revisiones local/remota incompatibles.

**Gate/salida:** admin publica el release global; solo cuentas personales resuelven overlay remoto.

### 018A-73 — Refactor de deuda CSS en `components.css`

**Depende de:** revisión visual de páginas públicas y del sistema de recetas.

- [x] Dividir `components.css` (910 → índice de 21 líneas) en 8 módulos por dominio en
  `frontend/src/styles/components/` (Button/Form/Modal/Overlay/Commerce/Notifications/Analytics/Misc),
  cada uno con su propio `@layer components`; 146 clases originales = 146 en módulos (verificado),
  módulos máximos 175 líneas (<300). Gate `task:check -- 018A-73` PASS (local-light), suite 724/724
  y `vite build` OK.
- [x] Botones a `Button.css` (`.boton`, superficie OS, `.boton-con-icono`, `.boton-icono`, tabs).
- [x] `.notificaciones__item`/`.notificacionesAdmin__item` ya no existen en ningún CSS (renombradas
  a `notificacionesPopover__item` en 028A-5): el ítem quedó satisfecho de facto, sin border/padding
  locales pendientes.
- [x] `.comercio__producto h3` → clase `comercio__productoTitulo` (store-view.ts + Commerce.css).
  **Desviación documentada:** se eligió clase propia y no `modalTitulo` porque esta última impone
  fuente/tamaño/peso de modal y cambiaría la tipografía de la tarjeta; el contrato original solo
  reseteaba `margin`.
- [x] VarSense/Sentinel PASS: sin clases huérfanas NUEVAS (los 6 `claseHuerfana` de clases usadas
  dinámicamente en TS son preexistentes: 028A-17 ya reportaba 50 con el archivo único) ni
  duplicadas (146=146).

**Gate/salida:** `components.css` queda bajo el límite acordado o dividido por responsabilidad, sin lints bloqueantes.

### 297A-17 — Hardening, identidad, accesibilidad y SEO

**Depende de:** 297A-6–16 y de la revisión CSS anterior.

- [x] **Threat review de sesión/CSRF/rate limits** (18-ago): sesión opaca hasheada
      `HttpOnly`/`SameSite=Lax` + `Secure` en producción, TTL 168 h; CSRF de doble
      cookie + header verificado server-side; rate limits por IP (login 5/60 s,
      auth_action 3/300 s). Deuda conocida: contadores en-memoria por instancia
      (se revisará con producción). Documento:
      `Agente/documentacion/seguridad/threat-review-sesion-csrf-2026-08-18.md`.
- [x] **SEO de rutas públicas** (18-ago): og/twitter/canonical estáticos en
      `index.html`; `page-meta.ts` aplica título/descripción a login,
      verify-email, escritorio (`/`) y checkout; las rutas de contenido
      (article/about/gallery/projects) ya tenían `updateMeta`/JSON-LD.
- [x] **Accesibilidad base** (18-ago): `:focus-visible` global monocromo
      (claro/oscuro), `prefers-reduced-motion` global, skip-link en el shell
      del escritorio. Pendiente la validación visual navegador multi-viewport.
- [ ] Completar MFA/passkey (passkey/WebAuthn queda como mejora posterior;
      TOTP ya está en 297A-13) y recuperación avanzada.
- [ ] Auditar SEO restante: sitemap, robots.txt y JSON-LD sin drafts ni rutas privadas (falta sitemap/robots como artefactos servidos).
- [ ] Verificar el manual visual en desktop, tablet y móvil, incluyendo claro/oscuro y los tamaños aprobados.
- [ ] Verificar foco, live regions, zoom 200%, alto contraste y multimedia accesible en navegador (la base CSS ya está).
- [ ] Ejecutar E2E críticos, observabilidad real y el runbook de operación; deploy sigue fuera de alcance y no se usa SSH.

**Gate/salida:** checklist de hardening y accesibilidad evidenciado en navegador, tests y quality gate.

### 297A-9 — Validación visual completa del shell

**Depende de:** runtime y recetas visuales implementadas.

- [x] **Validación base del chrome** (18-ago): shell, menú sistema, grid de iconos,
      taskbar, ventanas (abrir/minimizar/restaurar/cerrar), menú contextual (7 items,
      disabled correctos), navegación, temas claro/oscuro (contraste 15:1 y 21:1),
      sin overflows en 907×907 ni en zoom 200% aproximado. Documento:
      `Agente/documentacion/visual-shell/validacion-2026-08-18.md`.
- [x] **Fix 404 foto de perfil** (18-ago): el default del store apuntaba a
      `/uploads/profile.jpg` que el backend nunca sirve estático; cambiado al asset
      bundled `/profile.jpg`. Verificado en preview (desaparece el 404).
- [ ] Pendiente navegador redimensionable: capturas reales en 1440×900, 1024×768,
      390×844 y 320px (el preview embebido no redimensiona); 390/320 también en
      297A-12. Tabulación real y zoom nativo del navegador.

**Gate/salida:** capturas y observaciones documentadas; no quedan regresiones visuales del chrome base.

### 297A-12 — Experiencia móvil tipo launcher

**Depende de:** 297A-9/11. Tablet conserva el escritorio.

- [x] **Umbral de presentación** (18-ago): el launcher móvil (ya implementado en
      `features/mobile/*` con long press/drag, notificaciones, tema y cuenta)
      se monta solo en ≤480px; tablet (481–1023) conserva el escritorio con su
      layout responsive. Cambios: `getPresentationMode` (<481 móvil, 481–1023
      tablet), matchMedia de transición en main.ts (480) y tests de límites
      (480 móvil, 481 tablet, 1024 desktop).
- [ ] Pendiente navegador real: E2E visual/táctil en 320/360/390px (el webview
      del preview no baja de ~900px); validar long press/drag, orientación,
      safe areas (ya en CSS), teclado virtual, foco, scroll y apps críticas.
- [ ] Confirmar refresh, transición móvil↔tablet y sincronización de URL sin duplicar el stack (E2E navegador).

**Gate/salida:** launcher móvil funciona a los viewports definidos y conserva estado sin crear lógica paralela.

### 297A-19 — URLs canónicas, deep links y ventana enfocada

**Depende de:** 297A-9/11/12/13.

- [x] **Validación History API y privacidad** (18-ago): tests nuevos de popstate
      (Back/Forward re-resuelve la ruta previa con `initRouter`), refreshRoute sin
      entrada nueva, y conservación del marker interno al reemplazar. Verificado en
      preview: deep link `/article/:slug` abre/enfoca la ventana del artículo;
      al cerrarla la URL vuelve a `/`. Los deepLinks son allowlisted públicos
      (`/gallery`, `/article/:slug`, `/about`, `/projects`, `/store`…); el state de
      historial solo contiene el marker `{kind, mode, createdByPush}` — sin IDs
      internos, tokens, geometría, overlays ni preferencias.
- [ ] Pendiente navegador real: E2E de transición desktop/tablet/móvil con la URL
      enfocando solo la ventana activa, sesión limpia, deduplicación multi-ventana
      y refresh en cada modo.

**Gate/salida:** E2E de History API y deep links compartibles sin serializar IDs internos, tokens, posiciones ni overlays.

### 297A-22 — Reordenamiento por arrastre con grid

**Depende de:** 297A-12 y overlay.

- [x] **Validación del arrastre con grid** (18-ago): la infraestructura ya existía
      (icon-drag + snap-grid desktop con `planDesktopPlacement`/group drag, launcher
      móvil con `bindLongPressDrag` → `planMobilePlacement`). Se añadieron tests:
      separación de mutaciones (`moveMobileNodesPosition` escribe solo
      `mobilePosition`, `moveNodesPosition` solo `position`, un move no pisa al otro,
      lista vacía no muta) y casos de `planMobilePlacement` (no-op en la misma celda
      y en la última, compactación al final si el destino está fuera del alto).
- [ ] Pendiente navegador real: gesto táctil de long press→drag en 320/360/390px,
      drag de escritorio con pointer capture (no simulable con eventos sintéticos),
      foco/teclado y transición móvil↔tablet con reload/sync.
- [ ] Verificar que move prev/next siga siendo alternativa accesible al arrastre.

**Gate/salida:** orden móvil compacto y persistente, sin contaminar `position` desktop.

### 018A-97 — Grid de iconos del escritorio coherente (placeholder + debug)

**Motivo (05-ago, usuario):** el grid de iconos "está mal", hay fallas y el placeholder de
arrastre junto con las rejillas rojas de debug (Ctrl+Shift+G) no son coherentes con las celdas
reales. Además "los iconos interactúan extraños cuando los juntas": se altera todo en vez de
alterarse 1 solo (drag de grupo decidido por la selección del drop, sin colisiones ni clamp, y
reflow que reempaqueta todo el grid). **Causa raíz identificada en plan
`Agente/planes/plan-iconos-escritorio-grid-2026-08-05.md`:**
`justify-content: space-between` horizontal reparte el sobrante pero ningún cálculo lo replica
(falta `columnGapEffective`; solo existe `rowGapEffective`); el grid `direction: rtl` tiene tres
fórmulas paralelas de geometría (getCellAt / positionCellHighlight / debugGridOverlay) que ya
divergieron; `cellWidth` se mide del primer item, no del track; y la rejilla roja es depuración
temporal (297A-20) que quedó en producción.

- [x] Unificar la geometría de celdas: `columnGapEffective` + `cellOriginAt(col,row,metrics)` único
  (LTR/RTL) usado por getCellAt, highlight y debug; tests DOM sobre grid real con `space-between`+RTL
  (F1 cerrada 05-ago: suite 713/713, `icon-grid-dom.test.ts`).
- [x] Placeholder de arrastre — tests DOM del highlight (`positionCellHighlight` sobre el track real
  con sobrante, LTR/RTL en `icon-grid-dom.test.ts`); **verificación en navegador pendiente**
  (celda destino real en desktop ≥769/tablet y ajuste de transición).
- [x] Drag de grupo predecible: el grupo se captura en pointerdown (`getGroupIds` → `onPlaceCell`,
  solo superficie escritorio) y `shouldGroupDrag` aplica la regla Windows; `buildGroupPlacementMoves`
  clampa a bounds y desplaza ocupantes no seleccionados (`icon-group-drag.test.ts`, 11 tests);
  `reflowPositions` solo toca nodos que cambian. Gate `task:check -- 018A-97` PASS (local-light).
- [x] Rejilla de debug retirada: `debug-grid-overlay.ts` fuera (F1), atajo Ctrl+Shift+G eliminado y
  CSS `--depurar`/`__debug*` retirado en este bloque; VarSense sin huérfanas.
- [x] **Enforcement de tomas de tarea (05-ago, commit `ea675ffd`):** `task:check -- {ID}` BLOQUEA
  (exit 78) el cierre de una tarea tomada por otro agente activo salvo `--allow-foreign` explícito;
  la toma propia se renueva en cada gate (heartbeat con compare-and-write para no pisar un re-toma
  ajeno); cualquier `task:check`, `run-with-db` o `glory-dev` muestra un banner `EN CURSO` por cada
  toma ajena activa, no solo la tarea objetivo. `AGENTS.md` §6 y `roadmap-sentinel.md`
  actualizados; 3 tests nuevos (8/8) y suite quality 210/210. Cierre documental 06-ago.
- [x] **Verificación final: el usuario probó el 05-ago y SIGUE MAL; causa raíz encontrada y
  corregida el 06-ago (F6).** El desfase real era el eje VERTICAL: `align-content: space-between`
  reparte el sobrante entre las filas que el CONTENIDO materializa (2 filas → fila 2 en top 772px)
  mientras la geometría JS asumía las 9 filas que caben por altura (fila 2 en 96.5px) — desfase
  ~675px que hacía aterrizar el icono lejos del highlight (y al caer sobre ocupantes, desplazar
  varios). Fix: `align-content: start` (filas deterministas desde arriba, mismo criterio que el
  Finder 018A-93), verificado en navegador real a 1440px con reflow forzado (26 items → filas 0/96,
  no 0/772). Validación visual final confirmada por el usuario (12-ago): resuelto.

**Gate/salida:** un único helper de geometría alimenta todo; el placeholder coincide con la celda
real (verificado por el usuario — acta de 05-ago: falla); el drag de grupo no altera iconos no
implicados (ni se superpone ni sale del grid); sin rejillas rojas en producción; tests
DOM fijan la geometría frente a `space-between`+RTL. **Estado 12-ago: cerrado (user confirmó resuelto).**

**Refuerzo 18-ago (018A-97 + 297A-22):** casos límite añadidos en `icon-grid-dom.test.ts`
(highlight RTL col 0/2 con gap efectivo y coincidencia con el rect del icono real, bordes
LTR/RTL con null); verificado en vivo a 907px (tablet ≥769): `cellOriginAt(0,0)` == rect del
primer icono real (1086px) con RTL+space-between, `getCellAt` inverso exacto, y
`positionCellHighlight(col 2,row 1)` == origen calculado (868px, ancho 88px). Suite 496 ✅.

### 297A-21 — Notificaciones de novedades

**Depende de:** 297A-13 y releases versionados.

- [x] **Ciclo E2E verificado** (18-ago): tests de integración nuevos
      (`tests/notifications.rs`, 3): una release publicada produce UNA notificación
      idempotente (ON CONFLICT del índice único parcial, también con reintento
      manual); la creación manual con la misma release_version se rechaza (dedupe
      anti-spam por fuente); la lectura queda aislada por cuenta (flag `read` por
      usuario vía `notification_reads`, mark_read idempotente). Preview: campana
      con badge real (3 sin leer), popover con lista/hora/recargar/marcar todo,
      marcar leída por API 204 con CSRF correcto, sin duplicados de versión.
- [ ] Pendiente: E2E de logout/login y dos dispositivos, y admin de novedades con
      capacidades en navegador real.

**Gate/salida:** una release pública produce una notificación idempotente y la lectura queda aislada por cuenta.

### 297A-13 — Registro, Cuenta y overlay remoto

**Depende de:** 297A-9/11/18.

- [ ] Ejecutar E2E real en dos pestañas/dispositivos y decidir/documentar merge semántico para cambios concurrentes no resolubles por local/remoto.
- [ ] Completar correo real, UI de verificación/token y habilitación controlada de registro; mantener tokens opacos, expirables y de un solo uso.
- [ ] Definir MFA/passkey de Cuenta y rate limit distribuido cuando exista infraestructura autorizada.
- [ ] Verificar logout/login, resolución de conflictos, reset, tombstones y corrupción persistida en todos los modos de presentación.

**Gate/salida:** Cuenta, preferencias y overlay sobreviven concurrencia y recargas sin filtrar secretos ni pisar cambios silenciosamente.

### 297A-14 — Programas editoriales

**Depende de:** 297A-9/10/11. Plan: `Agente/planes/plan-programas-editoriales-2026-07-31.md`.

- [x] **Trazabilidad del ciclo editorial** (18-ago): fix en `article_repo.update` —
      `published_at` se limpia al despublicar (un draft no arrastra fecha vieja) y
      se reescribe al publicar/republicar (fecha de la publicación vigente). Test de
      integración `tests/editorial_cycle.rs`: borrador → published (ready/public +
      fecha) → despublicar (draft/private + fecha NULL) → republicar (fecha
      actualizada). Envelope `resources` sincronizado en cada transición.
- [ ] Ejecutar E2E visual desktop/tablet/móvil del vertical editorial completo: artículos/About, proyectos, productos, media, papelera, publicación, rollback y autosave.
- [ ] Cubrir permisos admin, estados draft/private/public, errores de red, teardown de apps lazy y acciones de toolbar (permisos verificados por API: editor requiere admin).

**Gate/salida:** editores reutilizables y programas de contenido funcionan en las tres presentaciones sin carreras ni referencias rotas.

### 297A-15 — Comercio seguro

**Depende de:** 297A-7/10/14. **Cerrado 18-ago** (mock fail-closed + E2E; sin credenciales reales).

- [x] Reembolsos y chargeback con autoridad server-side e idempotencia (`charge.refunded`/`charge.dispute.created` + `POST /api/admin/orders/:id/refund`; revocación de grant idempotente).
- [x] Worker de outbox verificado con backoff (30s–32m), SKIP LOCKED y recuperación; fix de SQL roto por continuación `\` de Rust (nunca corrió contra BD real).
- [x] E2E con proveedor mock (real solo en producción, patrón Resend/DevMailbox): checkout invitado → webhook → entitlement → outbox → descarga privada → reembolso/chargeback; idempotencia en cada paso.
- [x] Historial por cuenta: `GET /api/me/orders` y `GET /api/me/downloads` (sin tokens ni ids de proveedor); Pedidos/Descargas del frontend ya consumen los endpoints.

**Gate/salida:** el comprador recibe solo la versión adquirida; fallos de pago/webhook no conceden acceso ni duplican órdenes (verificado: replay de webhook y reembolso idempotentes, evento `livemode:true` sin secreto rechazado).

**Pendiente con credenciales reales (documentado, requiere intervención humana):** checkout/refund contra Stripe live y webhook firmado en staging; migración de `/uploads` legacy a storage privado (fuera de alcance).

### 297A-16 — Analytics, estadísticas y retiro legado

**Depende de:** 297A-9/11–15. **Cerrado 18-ago** (pipeline batch conectado, E2E de privacidad; retiro CSS pendiente manual).

- [x] E2E de consentimiento (fail-closed server-side), anonimización (ip/user-agent solo SHA-256), dedup por event_id, purga por retención y stats sin datos fuera de capacidad — `tests/analytics_privacy.rs`.
- [x] Dispatcher tipado conectado al tracker real: apps, ventanas, errores, publicaciones, tema y releases ahora llegan al backend (antes solo page_view); regla de privacidad: nunca orderId, user_id, mensajes de error crudos ni contenido de overlays.
- [x] Tracking global de errores sanitizado (solo categoría, no mensaje/stack) y métrica de releases al abrir Novedades.
- [ ] Retiro de CSS/clases legacy: auditado con heurística (46 candidatas con falsos positivos de modificadores dinámicos); VarSense archivado por decisión de usuario → pendiente revisión visual manual, no borrar a ciegas.

**Gate/salida:** eventos críticos son medibles, deduplicados y auditables; el panel no expone datos fuera de capacidad (verificado: `theme` guarda solo preferencia resuelta; `error` guarda solo la categoría — el mensaje crudo no se almacena).

### 297A-24 — Cierre automático de ventanas

**Depende de:** 297A-19. La causa raíz y las regresiones automatizadas ya están corregidas.

- [ ] Prueba visual desktop/móvil para apertura canónica/no canónica, Perfil, refresh, Back/Home y varias ventanas.
- [ ] Confirmar que abrir una app nunca cierre otras y que solo una navegación real fuera del runtime permita cerrar el conjunto.

**Gate/salida:** no hay cierre destructivo por reconciliación de URL; taskbar, foco y ventanas permanecen coherentes.

### 297A-25 — Política de carga de apps pesadas

**Depende de:** 297A-9/11/12. ADR: `Agente/documentacion/arquitectura/adr-carga-apps-pesadas-2026-07-31.md`.

- [x] Primera app WebGL validada (el juego `game-playable`): teardown verificado con test
  automatizado `game-playable-teardown.test.ts` (5 tests: destroy idempotente + DOM limpio,
  cancelación de RAF sin re-agenda, remoción de listeners window/document, desconexión de
  ResizeObserver + cierre de socket, fail-closed con signal abortado); registro lazy confirmado
  (chunk propio, sin `three` estático en el shell); sin workers ni audio; object URL revocado;
  timers de perfil limpiados; GPU liberado (geometrías/materiales/renderer + `forceContextLoss`).
  ADR actualizado con el checklist de la primera app pesada (2026-08-06). Gate `task:check --
  297A-25` PASS (local-light), 5/5 tests, type-check limpio.
- [ ] Medir si hace falta `preload`/`heavy`; no activar flags sin una app real, métrica y ADR:
  sigue sin activarse — el juego carga lazy al abrir y el teardown ya libera; la verificación
  de Network (chunk no descargado antes de abrir) queda pendiente de sesión de navegador real.

**Gate/salida:** la app pesada se carga lazy, libera recursos al cerrar y no degrada el arranque ni el resto del OS.

### 297A-29 — Escalar la app Configuración sin eliminarla

**Depende de:** 297A-27, 297A-28, 297A-13 y 297A-19. Las fases de fuentes estáticas, toolbar por capacidad y Perfil admin ya están implementadas.

- [ ] Fase 4: decidir si Configuración se convierte en panel de ajustes del sistema o se integra en otra app; conservar registro `settings`, nodo admin, menú y compatibilidad actual mientras se decide.
- [ ] Fase 5: diseñar, aprobar y solo entonces implementar un panel escalable; cualquier selector de fuente futuro debe usar tokens, persistencia y una receta compartida, sin reintroducir estado global duplicado.

**Gate/salida:** Configuración sigue funcionando durante la migración y una nueva acción admin se agrega por comando/capacidad, no mediante `if/else` en el shell.

## Revisión SOLID y escalabilidad obligatoria

Cada bloque pendiente debe evidenciar antes de cerrarse:

- **SRP/ISP:** chrome, contenido, persistencia, permisos y analítica permanecen separados; interfaces exponen solo lo necesario.
- **OCP/DIP:** nuevas apps, recursos, comandos, temas y breakpoints se agregan por registros/adaptadores, sin duplicar shell ni listeners.
- **Límites:** componentes/CSS ≤300 líneas, lifecycle/store/hook ≤120 y utils ≤150; una excepción requiere justificación en Sentinel.
- **Contratos y seguridad:** tipos, DTOs, errores, capacidades, eventos y resultados son explícitos; sin HTML inseguro, I/O silencioso, N+1, secretos o estado privado en URL.
- **Escalabilidad:** probar un segundo caso real, revisar índices/paginación/cache, teardown, migración y rollback.
- **Calidad:** Sentinel/VarSense, type-check, tests, navegador y `task:check` pasan; los fallos preexistentes se documentan y no se silencian.

## Reglas operativas no negociables

- Un bloque entregable usa commit explícito con ID; un diagnóstico/prototipo compartido no se fuerza a commit, pero el reporte debe recordar revisar `git status`.
- Todo deploy, restart, logs, backup, restore, health o exec de producción pasa por `coolify-manager-rs`; nunca SSH/docker/scp/curl directo.
- Comandos largos tienen timeout y señal de readiness; no se espera indefinidamente ni se reintenta a ciegas.
- Tras cada commit y antes de cerrar una sesión se relee este roadmap completo.
