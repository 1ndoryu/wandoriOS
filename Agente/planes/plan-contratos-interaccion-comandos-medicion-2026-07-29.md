# Plan transversal: interacción, comandos y medición del OS

> **Epic:** 297A-4
> **Fecha:** 2026-07-29
> **Estado:** contratos base de 297A-9/10 cerrados; 018A-61 alineó navegación externa, maximizar/restaurar y reencuadre batch. Los pendientes restantes requieren validación visual/E2E, proveedores o decisiones de producto.
> **Tareas dueñas:** 297A-9, 297A-10, 297A-11, 297A-12, 297A-14, 297A-15 y 297A-16
> **Arquitectura:** `Agente/documentacion/arquitectura/manual-arquitectura-wandorius-2026-07-29.md`
> **Identidad:** `Agente/documentacion/design-system/manual-identidad-visual-os-2026-07-29.md`

## 1. Objetivo y límites

Cerrar antes de implementar los contratos que conectan ventanas, menús, selección, archivos, clipboard, papelera, persistencia, accesibilidad y estadísticas.

- Las superficies invocan comandos; no mutan stores, DOM o servidor directamente.
- Un comando tiene un único ID estable y se reutiliza desde menú superior, clic derecho, taskbar, teclado y long press móvil.
- Desktop/tablet y móvil comparten comandos, permisos, recursos y analytics; solo cambia la presentación.
- Se mide la intención o resultado semántico una vez, nunca cada `pointermove`, frame o tecla.
- Analytics de producto, telemetría operativa y audit administrativo son contratos separados.
- No se usa el clipboard del sistema para transportar HTML, blobs, tokens, URLs firmadas o datos privados.
- Maximizar, undo/redo y selección múltiple forman parte del contrato, aunque una primera entrega pueda ocultarlos hasta completar sus gates.

## 2. Contrato base de comandos — dueño 297A-9

### 2.1 Modelo canónico

- [x] Definir `CommandId`, `CommandContext`, `CommandResult` y `CommandAvailability` tipados. *(command-registry.ts)*
- [x] Cada comando declara contextos, capacidades requeridas, targets aceptados, política de undo y evento analítico permitido. *(command-registry.ts)*
- [x] Disponibilidad distingue `hidden`, `disabled(reason)` y `enabled`; una UI oculta nunca sustituye autorización backend. *(command-registry.ts)*
- [x] Ejecución devuelve éxito/fallo/conflicto/cancelación con feedback visible y rollback optimista cuando aplique. *(CommandResult type)*
- [x] CommandRegistry es la única fuente para label, icono Lucide, atajo, orden y handler. *(command-registry.ts)*
- [x] Menú superior, contextual, taskbar, launcher y teclado proyectan el Registry; no mantienen listas paralelas. *(desktop-context-menu.ts, command-registration.ts)*
- [ ] Comandos repetibles incluyen `commandId`/idempotency key cuando llegan al servidor. *(pendiente: requiere backend integration en 297A-13)*
- [x] Tests prueban que una superficie no puede registrar un comando duplicado ni ejecutar uno no disponible. *(command-registry.test.ts; evidencia consolidada en 018A-61)*

### 2.2 Catálogo mínimo de shell y ventanas

- [x] `navigation:toggle-external-nav` (alias documental `navigation.toggleExternalNav`): pliega/restaura el nav exterior sin desmontar OS, apps ni rutas y emite `external_nav_toggled`. *(018A-61)*
- [x] `app.open`/`app.focus`: abre o enfoca según singleton/multiinstancia y capacidades. *(command-registration.ts)*
- [x] `window.focus`, `window.minimize`, `window.restore` y `window.close`. *(command-registration.ts)*
- [x] `window.move` y `window.resize`: actualizan preview durante gesto y confirman un solo comando al terminar. *(command-registration.ts + drag-resize.ts)*
- [x] `window:maximize`: maximiza/restaura la ventana enfocada o el target explícito; titlebar, toolbar y doble clic delegan en el mismo comando. *(018A-61)*
- [x] `window:reframe-all`: recupera ventanas fuera de bounds tras resize, zoom o cambio de pantalla con una mutación batch; las maximizadas ocupan el workspace vigente. *(018A-61)*
- [ ] Cerrar app decide explícitamente si conserva estado interno recuperable o lo destruye mediante teardown.
- [x] Taskbar usa los mismos comandos para enfocar/restaurar/cerrar; cerrar con X no cambia foco accidentalmente. *(desktop-shell.ts)*

### 2.3 Matriz de superficies

| Contexto | Comandos iniciales |
|---|---|
| Escritorio vacío | crear carpeta permitida, pegar, ordenar/reencuadrar, restablecer layout, configuración |
| App/acceso directo | abrir/enfocar, copiar referencia, mover, renombrar referencia, papelera, propiedades |
| Carpeta | abrir, copiar/cortar, renombrar, mover, papelera, propiedades; admin gestiona publicación del nodo |
| Recurso/documento/media/producto | abrir, copiar/cortar referencia, propiedades; admin edita/publica/privatiza/manda a papelera |
| Selección múltiple | abrir solo si es válido; copiar/cortar/mover/papelera por lote atómico |
| Ventana/titlebar | foco, mover, resize, minimizar, restaurar/maximizar, cerrar |
| Tarea inferior | enfocar/restaurar, minimizar y cerrar |
| Papelera | restaurar, vaciar capa autorizada; purga permanente solo admin y con confirmación |
| Móvil | tap abre; long press muestra el mismo conjunto filtrado por presentación/capacidad |

**Gate 297A-9:** cada acción visible proviene del Registry y puede ejecutarse por teclado sin depender de coordenadas.

## 3. Selección, activación y foco — dueño 297A-9

- [x] Clic/tap selecciona; Enter o doble clic activa. *(selection-store.ts + desktop-shell.ts)*
- [x] Clic derecho selecciona el target antes de abrir su menú; clic en vacío limpia selección. *(desktop-shell.ts + desktop-context-menu.ts)*
- [x] `Ctrl/Cmd` alterna selección y `Shift` extiende rango dentro del contenedor actual. *(selection-store.ts)*
- [ ] Rectángulo de selección solo opera en escritorio y tiene alternativa mediante teclado/comando.
- [ ] Cambiar carpeta limpia o conserva selección según IDs aún visibles; nunca deja selección fantasma.
- [x] Foco de teclado, selección de objetos y ventana activa son estados distintos. *(selection-store vs window-manager)*
- [x] Menú conserva foco, Escape lo cierra y devuelve foco al invocador. *(desktop-context-menu.ts)*
- [x] El menú se reposiciona dentro del viewport y no queda cubierto por taskbar/nav. *(desktop-context-menu.ts)*
- [ ] Selección y foco se anuncian de forma accesible sin depender solo de inversión visual.

### Atajos canónicos a aprobar

| Acción | Atajo propuesto |
|---|---|
| Abrir/activar | `Enter` |
| Menú contextual | tecla Context Menu o `Shift+F10` |
| Copiar/cortar/pegar | `Ctrl/Cmd+C`, `Ctrl/Cmd+X`, `Ctrl/Cmd+V` |
| Renombrar referencia | `F2` |
| Enviar a papelera | `Delete` con confirmación según riesgo |
| Cerrar menú/cancelar gesto | `Escape` |
| Cerrar ventana activa | `Alt+F4` donde el navegador lo permita; siempre existe botón/comando accesible |

**Gate:** misma acción produce el mismo resultado desde puntero, teclado y menú contextual.

## 4. Drag, drop y geometría — dueños 297A-9/11

### 4.1 Ventanas

- [x] Pointer Events + pointer capture; un solo listener activo por gesto y cleanup garantizado. *(drag-resize.ts)*
- [ ] Umbral evita convertir clic en drag; coordenadas se calculan respecto al área útil del OS, no al viewport completo.
- [x] Bounds consideran nav exterior, barra superior, taskbar, zoom y tamaño mínimo. *(clampWindowBounds en window-manager.ts)*
- [ ] Preview puede actualizar geometría en memoria; persistencia/analytics ocurren una vez en `pointerup` o cancelación.
- [x] Resize se activa desde bordes/corners invisibles accesibles sin grip decorativo. *(drag-resize.ts)*
- [x] Teclado/comandos permiten mover y redimensionar sin arrastrar. *(command-registration.ts: window:move-*, window:resize-*)*

### 4.2 Nodos y archivos

- [ ] Drag de un elemento seleccionado arrastra toda la selección válida.
- [ ] Drop target muestra `move`, `copy`, `forbidden` o `conflict` antes de soltar.
- [ ] Movimiento dentro de una capa conserva IDs y es atómico; copiar crea referencias nuevas, no duplica contenido.
- [ ] Modificador de copia se adapta por plataforma y siempre tiene alternativa contextual.
- [ ] No se permite soltar carpeta dentro de sí misma/descendiente, cruzar capas sin comando explícito o saltar capacidades.
- [ ] Mover al mismo contenedor es reorder/no-op explícito; nunca duplica silenciosamente.
- [ ] Colisión no sobrescribe: ofrece cancelar o crear referencia con nombre resuelto; reemplazar exige comando separado cuando tenga sentido.
- [ ] Fallo remoto revierte preview y conserva selección/clipboard con mensaje accionable.

**Gate 297A-11:** drag, menú y teclado llegan al mismo comando y pasan las mismas validaciones.

## 5. Clipboard, undo y conflictos — dueño 297A-11

### 5.1 Clipboard interno

- [ ] Payload versionado con operación `copy|cut`, IDs de referencias, capa origen, revisión y timestamp.
- [ ] Prohibir contenido editorial, blobs, HTML, credenciales, URLs privadas y handlers.
- [ ] `copy` puede pegar varias veces durante la sesión; `cut` se consume solo tras movimiento confirmado.
- [ ] Cambio de cuenta, logout, recurso retirado o pérdida de capacidad invalida entradas afectadas.
- [ ] Pegar revalida existencia, permisos, ciclos, profundidad, cuota y revisión; nunca confía en snapshot cliente.
- [ ] Cross-tab solo se habilita con formato validado y namespace por cuenta/sesión; no se mezcla visitante con usuario.

### 5.2 Undo/redo

- [ ] Journal acotado de comandos reversibles: move, reorder, rename de referencia, paste, trash/restore y geometría.
- [ ] No son reversibles localmente: login/logout, pago, publicación, purga, cambio de rol o entrega.
- [ ] Undo de operación remota usa comando compensatorio con revisión, no restaura snapshots ciegamente.
- [ ] Un conflicto 409 pausa la cadena afectada y ofrece recargar, conservar local o resolver campo cuando sea seguro.
- [ ] Historial se limpia al cambiar identidad/release incompatible y nunca se sincroniza como código ejecutable.

### 5.3 Papelera

- [ ] Papelera personal elimina tombstones del overlay; no escribe release global.
- [ ] Papelera de layout retira/restaura referencias del draft/release.
- [ ] Papelera de recursos usa soft delete administrativo, retención, dependencias, compras y audit.
- [ ] Vaciar/purgar muestra capa, cantidad, consecuencias y elementos no eliminables antes de confirmar.

**Gate:** copiar/cortar/pegar/undo/papelera no puede mutar una capa o recurso fuera de autorización.

## 6. Persistencia de shell y ventanas — dueños 297A-9/11/13

- [ ] Separar `SessionWindowState`, disposición inicial publicada y preferencias/overlay personales.
- [ ] Admin publica ventanas iniciales mediante release versionado; no sobrescribe overlays personales existentes.
- [ ] Visitante persiste localmente; cuenta usa overlay remoto con revisión optimista.
- [ ] Estado versionado incluye app/resource ID, open/minimized, bounds desktop/tablet, z-order relativo y schema version.
- [ ] No persistir listeners, DOM, contenido, tokens, URLs firmadas ni z-index arbitrario.
- [ ] Guardar al terminar comando con debounce; flush en visibility change solo para estado ya validado.
- [ ] Geometría se reencuadra/migra ante viewport, zoom, DPR o schema nuevo; siempre existe reset.
- [ ] Nav exterior se guarda como preferencia de layout separada y ocultarlo no altera ventanas.
- [ ] Móvil conserva app/recurso activo y `mobileOrder`; bounds desktop permanecen dormidos para volver a tablet.
- [ ] Política explícita para release nuevo: defaults nuevos se fusionan por ID sin resucitar tombstones.

**Gate:** recargar, iniciar sesión, cambiar dispositivo y cambiar móvil↔tablet preservan solo el estado que corresponde a cada capa.

## 7. Tipos de archivos y asociación de programas — dueño 297A-10

- [x] Crear registry `resourceKind/mime -> appId + preview + acciones`, separado del AppRegistry pero validado contra él. *(resource-type-registry.ts)*
- [x] Artículo/About/texto abre Reader; imagen abre Viewer; galería/carpeta abre Finder; proyecto abre Browser/launcher seguro. *(resource-type-registry.ts)*
- [ ] Producto abre Store/Compra para público y Editor de producto para admin según comando/capacidad.
- [ ] Archivo genérico abre Properties/Download solo si existe grant autorizado; nunca ejecuta contenido arbitrario.
- [ ] Extensión y MIME del cliente no son autoridad; backend entrega tipo normalizado y política de apertura.
- [ ] Asociación ausente muestra fallback accesible con propiedades, no una ventana vacía.
- [ ] Accesos directos resuelven target vigente; recurso retirado muestra estado y acciones permitidas sin filtrar metadata.
- [x] Tabla de acciones por tipo incluye open, preview, edit, publish/private, copy reference, trash, restore y download. *(resource-type-registry.ts)*

**Gate:** todo tipo conocido abre una app registrada y todo tipo desconocido falla de forma segura y visible.

## 8. Errores, concurrencia y accesibilidad — dueños 297A-9/11/17

- [ ] Resultados tipados: validation, forbidden, not-found, conflict, offline, retryable e internal con request ID.
- [ ] Updates optimistas conservan snapshot mínimo para rollback y no muestran éxito antes de confirmación crítica.
- [ ] Operación larga muestra progreso/cancelación; respuesta stale no cambia selección, ventana o carpeta actual.
- [ ] Confirmaciones se reservan para pérdida/purga/publicación/pago; no fatigar en acciones reversibles.
- [ ] Live region anuncia abrir/cerrar, move/paste, error, conflicto y undo sin narrar cada pixel.
- [ ] Orden Tab, roving tabindex en grids, focus trap en diálogos y retorno de foco quedan probados.
- [ ] Zoom 200 %, 320 px, reduced motion y high contrast conservan comandos completos.
- [ ] E2E cubre puntero, teclado, touch/long press, dos pestañas y dos dispositivos.

## 9. Contrato de medición — dueños 297A-9/15/16

### 9.1 Envelope y privacidad

- [x] Evento incluye `eventId`, `schemaVersion`, `eventName`, timestamp servidor/cliente, session ID rotatorio, actor category, presentation mode, app/command/target kind, outcome y propiedades allowlisted. *(dispatcher.ts)*
- [x] No guardar texto/contenido, email, nombre, IP cruda, token, ruta privada, URL firmada, datos de pago ni coordenadas precisas. *(extractProperties en dispatcher.ts)*
- [ ] Identificadores de recurso se omiten, agrupan o seudonimizan según la métrica; Estadísticas no permite vigilancia individual.
- [ ] Telemetría esencial cubre seguridad/fiabilidad mínima; analytics de producto respeta consentimiento y revocación.
- [ ] Cliente puede informar intención; backend confirma auth, publicación, pago, entitlement, entrega y audit.
- [x] Cola tiene límite, backoff y descarte explícito; analytics nunca bloquea la acción del usuario. *(dispatcher.ts MAX_QUEUE_SIZE)*
- [ ] Batch usa IDs únicos, límite, rate limit y transacción; duplicados no cuentan dos veces.
- [ ] Definir y documentar duración exacta para raw, agregados y audit antes de activar producción.

### 9.2 Catálogo inicial de eventos

| Dominio | Eventos semánticos previstos | Fuente autoritativa |
|---|---|---|
| Sesión | `session.started`, `consent.updated` | cliente/backend según evento |
| Navegación | `route.viewed`, `external_nav.toggled` | cliente |
| Apps | `app.opened`, `app.closed`, `app.failed` | CommandRegistry |
| Ventanas | `window.minimized`, `window.restored`, `window.moved`, `window.resized` | WindowManager al terminar comando |
| Contenido | `resource.opened`, `image.viewed`, `project.launched` | app/dispatcher validado |
| Workspace | `workspace.command_completed`, `workspace.conflict`, `workspace.reset` | command service |
| Publicación | `resource.published/private/trashed/restored`, `workspace.released/rolled_back` | backend + audit |
| Comercio | `product.viewed`, `checkout.started`; `order.paid`, `delivery.granted`, `refund.completed` | cliente para intención; backend para resultado |
| Fiabilidad | `operation.failed`, latencia agrupada y retry outcome | cliente/backend sin payload sensible |

- [x] Elegir nombres definitivos y versión; prohibir eventos ad-hoc fuera del catálogo. *(dispatcher.ts SCHEMA_VERSION=1, TrackEvent union)*
- [ ] Una ejecución de comando emite como máximo un evento final con outcome; gestos no emiten por frame.
- [ ] Eventos de lote registran cantidad y tipos agregados, no lista privada de IDs.
- [ ] Navegación móvil reutiliza nombres y agrega `presentationMode=mobile`; no crea catálogo paralelo.

### 9.3 Métricas y programa Estadísticas

- [ ] Overview: sesiones consentidas, vistas, apps utilizadas y errores agregados por periodo.
- [ ] Contenido: aperturas de artículos/galería/proyectos y tendencias; excluir borradores/privados de métricas públicas.
- [ ] OS: aperturas por app, comandos usados, minimizar/restaurar, personalización y conflictos; no mapas de movimiento.
- [ ] Comercio: product view → checkout start → orden pagada → entrega, ingresos/refunds server-side y conversión por periodo.
- [ ] Fiabilidad: fallos por operación/app, latencia por buckets y reintentos; enlazar request ID solo en logs privados.
- [ ] Filtros de fecha, presentación y app usan agregados/índices; nunca escanean indefinidamente raw events.
- [ ] Roles/capacidades determinan paneles; datos comerciales, audit y seguridad no aparecen a usuario normal.
- [ ] Empty/loading/error/stale data y zona horaria se definen y prueban.
- [ ] Exportación, si se habilita, aplica los mismos permisos, límites y redacción.

### 9.4 Audit separado

- [ ] Audit obligatorio para rol/sesión sensible, cambios de configuración, publicación/rollback, trash/purge administrativo, orden/refund/entitlement y grants.
- [ ] Entrada incluye actor, acción, target, transición, request ID, timestamp y resultado; no contiene secretos ni analytics opcional.
- [ ] Audit es inmutable y consultable solo por capacidad; la política de retención sigue ADR-004.

**Gate 297A-16:** cada panel declara fórmula, fuente, consentimiento, retención, permisos y prueba de no filtración.

## 10. Matriz de implementación por tarea

| Tarea | Contrato que debe cerrar |
|---|---|
| 297A-9 | CommandRegistry, selección/foco, ventanas, nav, geometría, atajos y dispatcher base |
| 297A-10 | asociaciones recurso→programa, MIME normalizado y acciones permitidas |
| 297A-11 | drag de nodos, clipboard, undo/redo, colisiones, papelera y persistencia local/release |
| 297A-12 | tap/long press, reorder y adaptación móvil de comandos/analytics |
| 297A-13 | persistencia/sync remoto, conflictos 409 y merge de preferencias |
| 297A-14 | comandos editoriales/capacidades y audit de transiciones |
| 297A-15 | eventos y audit de comercio server-authoritative |
| 297A-16 | consentimiento, pipeline, agregados, programa Estadísticas y catálogo definitivo |
| 297A-17 | accesibilidad/E2E, privacidad, performance y observabilidad |

## 11. Pruebas obligatorias

- [ ] Unit: reducer de ventanas, disponibilidad de comandos, selección, geometría, clipboard, ciclos, undo y schemas de eventos.
- [ ] DOM: foco, menú, taskbar, atajos, drag cancelado, resize y cleanup.
- [ ] Integración: command → store/service → persistencia → evento único; error revierte y emite outcome correcto.
- [ ] Seguridad: comando oculto invocado manualmente sigue dando 403; clipboard/evento malicioso se rechaza.
- [ ] Privacidad: fixtures demuestran ausencia de email, contenido, tokens, URLs firmadas, paths e IDs prohibidos.
- [ ] Concurrencia: dos pestañas, release nuevo, conflicto 409, undo tras cambio remoto y retry idempotente.
- [ ] Responsive: 320/360/390, tablet 768, 1024 y 1440; cambio de modo no pierde app/recurso.
- [ ] Analytics: duplicate event ID cuenta una vez; resultado crítico solo llega del backend; sin consentimiento no entra evento opcional.
- [ ] Estadísticas: fórmulas verificadas con fixtures, permisos negativos y periodos/zona horaria.

## 12. Definition of Done transversal

- [ ] Ninguna superficie contiene lógica de negocio o lista propia de acciones.
- [ ] Toda acción importante tiene comando, disponibilidad, feedback, undo policy y medición/audit explícitos.
- [ ] Menú contextual está definido para vacío, app, carpeta, recurso, selección, ventana y papelera.
- [ ] Puntero, teclado y touch producen comandos equivalentes.
- [ ] Drag/clipboard/papelera no atraviesan capas ni permisos.
- [ ] Persistencia distingue release, overlay, cuenta y sesión; existe migración/reset.
- [ ] Tipos de recursos abren apps registradas con fallback seguro.
- [ ] Analytics mide resultados útiles sin datos sensibles ni eventos por píxel.
- [ ] Estadísticas declara fórmulas, fuentes, permisos, consentimiento y retención.
- [ ] Audit administrativo permanece separado e inmutable.
- [ ] Quality gate, tests y manuales coinciden antes de cerrar cada tarea dueña.
