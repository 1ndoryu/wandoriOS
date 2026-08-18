# Lecciones aprendidas

## 2026-05-08 — Core editor-agnostico en extensiones
- Para extraer un core real no basta cambiar tipos: hay que eliminar imports indirectos de servicios del editor, como `configService`, `vscode.workspace` o registries que lean settings globales.
- Si una regla aun necesita workspace/watchers, aislarla como callback/adaptador permite avanzar el core sin romper el provider existente.
- Los reportes y scanners deben recibir datos y providers como parametros; escribir archivos, abrir documentos y escuchar watchers pertenece al adaptador, no al core.
- Las pruebas unitarias con mocks de VS Code no garantizan que una CLI arranque en Node puro; despues de compilar hay que ejecutar el JS real y buscar imports indirectos de `vscode`.

## 2026-05-10 — LSP y lint como cierre de arquitectura
- Un LSP fino debe importar core y adaptadores de transporte, no la CLI; si CLI y LSP comparten defaults, moverlos a `core/config.ts` evita drift silencioso.
- Smoke stdio real debe buscar `textDocument/publishDiagnostics` y un `ruleId` esperado; compilar no prueba que el entrypoint LSP no este ejecutando codigo CLI.
- Activar lint tarde puede revelar errores de regex antiguos. Corregir escapes redundantes es bajo riesgo; patrones Unicode compuestos intencionales necesitan excepcion local documentada.
- Si se agregan fixtures `.tsx` fuera de `src`, `tsconfig.json` debe declarar `include` explicito; si no, `tsc` intenta compilar fixtures fuera de `rootDir` y crashea antes de ejecutar tests reales.

## 2026-07-29 — Documentación canónica y planes ejecutables
- Mezclar visión, arquitectura, identidad, auditoría y tareas en varios planes crea fuentes de verdad competidoras aunque cada documento sea correcto por separado.
- El roadmap debe responder únicamente qué sigue y qué lo bloquea; los contratos viven en manuales y la secuencia detallada en un solo plan maestro.
- Un plan ejecutable necesita checklists, dependencias, gates y criterio de salida por bloque; una lista narrativa de fases no basta para trabajar una por una.
- Los estados visuales, editoriales, comerciales y de papelera deben documentarse como ejes distintos antes de diseñar API o UI; un `status` único produce contradicciones y fugas.
- Archivar planes históricos evita que decisiones superadas —Admin monolítico, uploads públicos, fuentes pixel o productos ligados a artículos— reaparezcan durante la implementación.

## 297A-6 — Un gate full debe incluir sus inputs y excluir sus artefactos

Un analizador instalado dentro del workspace puede terminar analizándose a sí mismo si sus carpetas de herramientas/reportes no están excluidas. A la vez, un cache full no es seguro si solo hashea el diff visible: debe depender de todo el árbol versionado, configs y versiones fijadas. Ambas condiciones se validan antes de aceptar un PASS cacheado.

## 297A-24 — El chrome del shell no es una ruta runtime

`Perfil` se registra como `shell-profile` en `windowStore`, no en `AppRegistry`, y por diseño no tiene URL pública. El sincronizador de URL debe proyectar únicamente apps runtime; si enfocar una entrada shell sin ruta fuerza `/`, la reconciliación puede interpretar una acción visual como navegación fuera del OS y cerrar todas las apps. La guardia debe considerar la superficie activa y cualquier app runtime abierta, mientras que el cierre masivo queda reservado a una navegación documental explícita. ## 297A-14 — El 404 silencioso de la sintaxis de rutas

- axum 0.7.9 documenta `{id}`, pero el parámetro real lo decide matchit resuelto por `Cargo.lock`: este proyecto tiene matchit 0.7.3, que parsea `:param` (estilo axum 0.6). `{id}` se registra como segmento literal y devuelve 404 sin error de compilación ni warning.
- Un contrato de rutas nunca debe asumirse por la doc del framework: verificar empíricamente la sintaxis con un router mínimo + `oneshot` contra el build real y leer el README/parser de la versión exacta de matchit en el lock.
- `utoipa::path` conserva `{id}` (templating OpenAPI) y convive con `:param` en el routing; no «corregirlo».
- Cuando un test HTTP devuelve 404 donde el contrato exige 401/403, sospechar de la ruta antes del middleware: el router de producción y un router mínimo deben coincidir.
- Regla Sentinel candidata: detectar `{` en strings de `.route()`.

## 018A-4 — Suite selectiva segura y procesos acotados

- Un selector incremental no debe inferir dependencias desde cualquier `--changed HEAD`: solo tests modificados pueden ejecutarse selectivamente; código, configuración, borrados, renombres y untracked requieren suite completa.
- El contrato de suite completa debe permanecer explícito (`test`/`test:full`), mientras el modo local selectivo se ofrece como comando separado para no convertir un PASS parcial en una garantía global.
- Limitar workers y captura de salida evita que varios agentes saturen CPU/memoria; el gate debe fallar rápido ante locks duplicados y dejar el detalle en artifacts, no en stdout/contexto.

## 138A-4 — Gate vía scripts del proyecto, no `npx sentinel`

- `npx sentinel` en este checkout resuelve al paquete npm ajeno `sentinel@1.0.1`, NO al runtime fijado del submódulo `tools/sentinel`; cualquier veredicto basado en ese binario es inválido.
- Los agentes deben invocar siempre los scripts del proyecto (`npm run gate:check -- <ID>`, `npm run quality:doctor`, etc.) o el binario de `tools/sentinel`; nunca asumir que `npx <tool>` usa el runtime fijado.
- Antes de afirmar capacidades de Sentinel/VarSense hay que comprobar commit, `--help`, doctor y artefacto instalado (coincide con AGENTS.md §7).

## 058A-3 — El render filtra lo que el sync no puede garantizar

- El sync local (`article-notas-sync`) ya exige `published && slug` antes de crear el nodo, pero los releases públicos ya publicados pueden persistir nodos huérfanos con `publicLocator` roto (slug nulo). La condición de escritura no garantiza que el estado persistido sea válido: la garantía de «nunca aparecen» vive en el filtro de render del shell.
- Un nodo del workspace solo debe mostrarse si su apertura hace algo útil (navegar, abrir app, visor local o URL pública). Centralizar esa regla en un helper único (`canOpenNodeFromShell`) evita que Finder, escritorio y launcher móvil dupliquen criterios y diverjan.
- `resolvePublicResourceTarget` devuelve `null` para locators que no pasan el allowlist (p. ej. `slug: null`) — es la misma regla que produce el aviso «sin referencia pública disponible», así que filtrar por ella y mantener el toast como red de seguridad cubre ambos extremos sin silenciar fallos.

## 038A-1 — Procesos huérfanos en Windows rompen dev y poda de targets

- `child.kill()` de Node en Windows NO mata el árbol de procesos: cargo → glory-backend quedan huérfanos (nietos), bloqueando recompilaciones ("Acceso denegado os error 5" al reutilizar el .exe) y haciendo que `clean-cargo-target.ps1` detecte "build activo" y salte toda la limpieza.
- Solución en `glory-rs/scripts/dev.mjs`: `killProcessTree` con `taskkill /PID <pid> /T /F` en `cleanup()` y al arrancar (`killStaleProjectProcesses`) antes del pre-cleanup, protegido por marcador vivo `.glory-cargo-active-*.json`.
- Patrón reutilizable: si una herramienta se queda colgada o un servicio no libera recursos en Windows, sospechar procesos huérfanos y usar `taskkill /T` (árbol completo), no `Stop-Process`/`kill` que solo atacan al origen.

## 018A-95 — Colisión de IDs entre agentes en paralelo

- Con dos agentes activos en el mismo repositorio, un ID de tarea puede asignarse dos veces (el otro agente archivó su `018A-94` de GAME-01 mientras este bloque usaba el mismo número). Antes de cerrar, verificar en `Agente/completados/` que el ID no esté ya en uso; si colisiona, renumerar a la siguiente cifra libre (018A-95) y actualizar roadmap, gate y completados de forma consistente.
- El archivo de completados es compartido: al commitearlo se arrastran también las entradas de documentación del otro agente (aceptable), pero NUNCA sus archivos de código (main.ts, workspace-store.ts, registros de apps, assets de juego, etc.) — el staging debe seguir siendo explícito por archivo.
- El `selectionStore` global sin scope de superficie filtra selección entre superficies que muestran los mismos node-ids (Finder en raíz vs escritorio). La solución raíz es escalar por `source` en el contrato, no limpiar la selección al navegar (rompería copiar/cortar por teclado que usa la última selección como fallback).

## 028A-10 — La colisión de IDs también ocurre contra el roadmap pendiente

- Un plan nuevo asignó `028A-8..12` mientras el roadmap ya tenía `028A-8` (optimización Sentinel/VarSense) pendiente y `028A-9` (guard Bash) completada: la colisión no estaba en `completados/` sino en los pendientes del roadmap.
- Antes de numerar cualquier plan nuevo, `grep_search` en `roadmap.md` y `Agente/completados/` con el patrón del prefijo (`028A-\d+`) y verificar qué cifras están ocupadas; si el plan es reciente (mismo día) y sin commits, renumerar las fases del plan y renombrar/re-aplicar las migraciones ya creadas.
- Tras renumerar una migración aplicada: `DELETE FROM workspace_releases WHERE version = N` + `DELETE FROM _sqlx_migrations WHERE version = <timestamp>` y re-aplicar con `cargo sqlx migrate run` (DATABASE_URL explícito a `glory_backend_wandorius`, `.env` stale).
- `cargo fmt` sobre archivos del otro agente es seguro (rustfmt determinista) y deja su código formateado, pero esos archivos NO deben entrar en el commit propio: el staging por archivo los excluye y el otro agente los commitea con su tarea.

## 018A-5 — Commit condicional y migración de reglas

- El quality gate no debe ordenar commit a ciegas: diagnósticos, bloques intermedios y trabajo compartido pueden documentarse sin commit; el recordatorio debe indicar commit/push solo cuando el bloque sea entregable.
- Antes de mover una regla del proyecto al core, conservar el bridge durante una fase, añadir fixture y filtrar el duplicado en el adapter; así se puede comparar sin duplicar ruido al usuario.
- Un comando combinado (`all`) es más seguro que dos procesos si comparte provider y snapshot; cambiar el contrato requiere mantener `scan` y `orphan-classes` para no romper consumidores existentes.

## 018A-6 — Gate mínimo antes del roadmap de producto

- Una herramienta de calidad puede seguir mejorando indefinidamente; para no bloquear el producto hay que separar explícitamente el gate mínimo reproducible del backlog de benchmarks, paridad y releases.
- Si el gate mínimo pasa y no hay errores de infraestructura, las mejoras diferidas solo se reactivan cuando una tarea concreta las necesita o aparece una regresión medible.

## 317A-5 — Restaurar antes del router sin cerrar la raíz

- La restauración de ventanas debe ocurrir antes de inicializar el router para conservar foco y deep links, pero la primera reconciliación de `/` no puede interpretar el escritorio como navegación documental y cerrar el estado restaurado.
- Una opción explícita de inicialización (`preserveRootOnInit`) mantiene esa excepción solo una vez; las navegaciones posteriores siguen limpiando el runtime cuando corresponde.
- La evidencia mínima útil combina navegador real en desktop/tablet y móvil con una suite completa y un gate único; no basta con tests unitarios del serializador.

## 018A-8 — Instrumentar foco desde una sola frontera

- Emitir eventos de foco desde cada botón o comando crea duplicados y deja fuera los clicks directos del shell; el store/sincronizador de foco es la frontera única.
- Las rutas protegidas deben medirse solo después de validar capacidad y parámetros, evitando que la analítica revele la existencia de recursos privados.

## 018A-9 — Reintentos seguros de comercio y analytics

- La idempotencia debe existir en dos fronteras: la orden local y el proveedor de pago; una sola no evita cobros o grants duplicados.
- Un webhook repetido no debe depender de memoria: `provider_event_id`, entitlement por orden y outbox con `dedupe_key` permiten reanudar sin duplicar efectos.
- Los enlaces de descarga se envían en claro solo una vez; la base conserva únicamente el hash y el endpoint vuelve a comprobar expiración y confinamiento de path.
- Un batch de analytics necesita `event_id` antes de reintentar; de lo contrario una caída de red infla las métricas aunque el inserto sea multi-fila.
- La auditoría de login debe hashear IP y omitir email/credenciales; registrarla después de validar la entrada evita convertir el log en una fuente de secretos.

## 018A-11 — Notificaciones derivadas del release

- Una novedad básica puede derivarse del `version` público del workspace sin crear una segunda entidad de publicación.
- El estado leído local debe usar un ID estable y una lista acotada; la sincronización por cuenta se deja para cuando exista registro verificado y overlay remoto.
- La campana solo despacha la apertura de la app; mantener fuente y presentación separadas evita duplicar lógica en desktop y móvil.

## 018A-12 — Consentimiento debe existir en dos fronteras

- Bloquear el tracker en el navegador no basta: el backend también debe rechazar lotes sin un header explícito de consentimiento.
- IP y user-agent se anonimizan en el boundary antes del repository; una migración de privacidad no debe intentar restaurar datos que fueron eliminados.
- Una purga parametrizada y acotada permite operar retención sin SQL manual ni intervalos interpolados.

## 018A-13 — Notificaciones persistentes sin duplicar publicación

- El release y su aviso deben confirmarse en la misma transacción para no mostrar una novedad de un escritorio que no llegó a publicarse.
- `notification_reads` es un overlay por usuario; los avisos públicos siguen siendo una lista server-side y el navegador solo conserva fallback offline.
- Un índice único parcial por release evita spam incluso si el endpoint de publicación se reintenta.
- El panel admin debe reutilizar la app pública y sus servicios; añadir otra ventana de publicación crea dos fuentes de estado.

## 018A-14 — Comercio como apps sin duplicar checkout

- Tienda debe consumir el mismo `ProductService` que los artículos; el frontend no debe inventar precios ni decidir disponibilidad.
- Pedidos y Descargas pueden existir como programas desde el principio con estados vacíos honestos; no se debe simular historial antes de tener un endpoint autorizado.
- La migración del release público debe ser aditiva para conservar posiciones que el admin ya haya publicado.

## 018A-16 — Registro verificado y recuperación sin enumeración

- El correo no se considera verificado por tener contraseña: `email_verified_at` y tokens opacos de un solo uso deben vivir en la base y consumirse atómicamente.
- Recuperación responde igual exista o no el email; el token se persiste solo como hash, expira pronto y revocar sesiones después del cambio evita reutilización de una sesión robada.
- Mantener `registration_enabled=false` permite desplegar contratos y migraciones sin abrir el alta pública antes de tener correo real, UI y pruebas E2E.

## 018A-17 — OpenAPI regenerable sin servidor

- Un comando de codegen no debe exigir una base de datos ni dejar un servidor vivo: `--emit-openapi` puede serializar `ApiDoc` antes del bootstrap de configuración/pool.
- Los alias de `serde_json::Value` y tipos plenamente calificados en atributos utoipa producen referencias OpenAPI inválidas; los campos dinámicos deben declarar `value_type` y las respuestas usar nombres de esquema estables.
- En Windows, invocar `npm.cmd` con `spawnSync` puede devolver `EINVAL`; ejecutar el binario Orval con `process.execPath` evita shell, quoting y advertencias de seguridad.

## 018A-18 — Una sola autoridad de sesión

- Cuando la cookie opaca ya cubre login, CSRF, revocación y capacidades, conservar un fallback Bearer solo amplía la superficie de ataque y hace ambiguo el contrato; debe retirarse junto con su secreto y dependencia.
- La regresión mínima debe enviar un Bearer legacy al router de producción y comprobar `401`, además de mantener los casos de cookie/CSRF existentes.
- El retiro de JWT no autoriza a eliminar `/uploads`: los descargables privados y las imágenes públicas necesitan primero un contrato de asset autorizado y una migración de URLs.

## 018A-19 — El contrato generado debe reflejar la autoridad real

- Retirar JWT del runtime no basta: Swagger/utoipa y los clientes generados pueden seguir publicando Bearer como si fuera válido.
- La seguridad de sesión se documenta como `ApiKey::Cookie("session_id")`; CSRF queda explícito como header de mutación, sin inventar una segunda autoridad.

## 018A-20 — Las rutas OpenAPI deben probarse contra el router real

- Una anotación utoipa puede compilar aunque apunte a una ruta pública; comparar el path anotado con `.route()` evita que el cliente generado omita el prefijo `/admin`.
- Los campos `serde_json::Value` de DTOs expuestos necesitan `#[schema(value_type = Object)]`; de lo contrario Orval falla con referencias `JsonValue` inexistentes.

## 018A-21 — Los enums anidados también son parte del contrato

- Al añadir un request con un enum de actualización (`ProjectUrlUpdate`), incluir el enum en `components(schemas(...))`; compilar Rust no garantiza que Orval encuentre todas las referencias.

## 018A-22 — Las respuestas de terceros necesitan DTO propio

- Checkout no debe publicar `serde_json::Value` como contrato: un DTO estable conserva la forma pública aunque Stripe agregue campos internos.
- El precio, la disponibilidad y la entrega siguen siendo decisiones server-side; tipar la respuesta no autoriza al navegador a conceder acceso.

## 018A-23 — Agrupar endpoints por dominio reduce drift

- Notificaciones, analytics y settings deben aparecer en el mismo contrato que sus servicios frontend; dejar uno fuera obliga a reintroducir `fetch` y tipos manuales.
- Las respuestas públicas pueden documentarse sin exponer metadata privada; la autorización sigue en `AuthUser`/`AdminUser`, no en el schema.

## 018A-24 — Revisar prefijos al anotar rutas anidadas

- `ApiDoc` se sirve bajo `/api`; las anotaciones admin de workspace sin ese prefijo producían URLs documentadas imposibles aunque Axum respondiera correctamente.
- Las sesiones listadas pueden exponerse como DTO serializable sin tokens; el esquema debe mostrar solo metadata operativa.

## 018A-25 — Documentar multipart sin delegar confianza al cliente

- Media puede publicar filtros, estados y respuesta de upload aunque el cuerpo multipart permanezca en el adaptador manual; el tipo/extensión siempre los decide el backend.
- Papelera y restore deben conservar operaciones separadas en OpenAPI para que una app futura no confunda soft delete con borrado permanente.

## 018A-26 — Las apps internas no necesitan rutas legacy

- Una app administrativa debe registrarse una sola vez en `AppRegistry`; conservar una ruta de página sin ventana crea un segundo punto de entrada y permite que el shell pierda capacidades, foco y analítica.
- Los comandos de toolbar que crean contenido deben declarar `adminOnly` y abrir el editor por `openAppWindow`; navegar a `/admin` acopla una acción concreta a un panel monolítico.
- Retirar la ruta no implica borrar el módulo que renderiza la app: el contenido puede seguir siendo reutilizable mientras la presentación y la autorización viven en el runtime.

## 018A-27 — Documentar los límites de integraciones server-side

- Descargas privadas y webhooks también son parte del contrato: documentar el grant, headers y estados evita que el cliente invente una ruta pública o una autorización alternativa.
- Un endpoint de descarga binaria puede describirse sin registrar storage keys ni modelar el token como credencial reutilizable; OpenAPI debe mostrar solo el boundary observable.
- Los webhooks externos usan cuerpo crudo y firma en header; su documentación no debe generar un cliente de usuario ni sustituir la verificación HMAC del backend.

## 018A-28 — El storage privado no debe ser una ruta pública

- Un filtro SQL en el listado no protege un archivo si `ServeDir` permite adivinar su nombre; la autorización debe repetirse en el handler que abre los bytes.
- El mismo confinamiento canónico de path sirve para media y descargas, pero la decisión de visibilidad debe vivir en el envelope (`active/public/clean`) y no en el navegador.
- Mantener temporalmente el nombre `file_path` como URL de preview permite migrar consumidores sin filtrar la storage key; el contrato DTO público/admin separado debe ser el cleanup siguiente.

## 018A-29 — Separar storage y contrato HTTP

- Un modelo que contiene la storage key no debe ser la respuesta de un handler: aunque se reescriba el valor antes de serializar, el contrato sigue siendo ambiguo y puede filtrar campos privados en una ruta futura.
- DTOs explícitos (`public`, `admin`, `upload`) permiten que cada boundary declare sus capacidades y que OpenAPI/TypeScript detecten regresiones de nombres como `file_path`.

## 018A-30 — El roadmap también es un contrato

- Cuando una implementación cambia un shape o el orden de fases, las referencias históricas activas deben actualizarse en la misma tarea; una línea obsoleta puede hacer que el siguiente agente reintroduzca un contrato retirado.

## 018A-31 — Validar CSS dinámico antes de eliminarlo

- Un selector reportado como huérfano puede construirse desde una cadena o plantilla en TypeScript; antes de borrarlo hay que buscar consumidores dinámicos y conservarlos si forman parte del runtime.

## 018A-32 — Generación y autenticación deben compartir boundary

- Generar funciones `fetch` no las hace seguras automáticamente: el mutator debe centralizar cookie, CSRF, base URL y envelope de errores antes de migrar un servicio.
- Los clientes generados ignorados son reproducibles solo si CI ejecuta codegen antes del type-check; el workflow debe validar esa dependencia explícitamente.

## 018A-33 — Adaptar contratos en el boundary, no en cada consumidor

- Migrar servicios completos al cliente generado evita que editores conozcan rutas HTTP. Cuando el contrato usa un parche semántico (`ProjectUrlUpdate`), la conversión debe vivir en el servicio y conservar omitir/limpiar/reemplazar.
- Los errores de catálogo no deben convertirse en `null` silenciosamente: si la API falla, el servicio propaga el resultado; `null` queda reservado para una respuesta exitosa sin elementos.

## 018A-34 — Migrar transporte sin perder efectos de dominio

- Un servicio de auth no es solo HTTP: la limpieza de clipboard/preferencias y la actualización de `authStore` deben permanecer fuera del mutator, después de validar el estado generado.
- Los headers de consentimiento y de seguridad son parte del contrato del servicio; al migrar a Orval se pasan como `RequestInit` y no se duplican en el cliente generado.

## 018A-35 — Los modelos ricos deben adaptarse en un único boundary

- Cuando OpenAPI expresa árboles u overlays como mapas genéricos, la conversión debe quedar en funciones nombradas del servicio. Así el runtime conserva invariantes (`version`, `nodes`, tipos de nodo) y el cliente generado conserva el contrato HTTP sin duplicación.

## 018A-36 — Retirar una abstracción solo después de cerrar consumidores

- La eliminación segura del cliente manual se confirma con búsqueda estática, type-check y tests del mutator; conservar `ApiError` evita romper boundaries de sincronización que no son transporte.

## 018A-37 — La selección incremental necesita dependencias, no solo nombres cambiados

- Ejecutar únicamente los tests modificados deja sin cobertura los tests que importan un módulo fuente cambiado; un grafo local de imports ofrece selección rápida sin convertir cada cambio en suite completa.
- En Windows, `rename`/`unlink` concurrentes pueden devolver `EPERM` aunque otro escritor esté progresando; el reemplazo atómico debe reintentar ambos pasos con límite y paths exactos.

## 018A-38 — Componer contratos sin romper consumidores

- Un DTO grande puede dividirse con `extends` manteniendo el mismo nombre exportado; así se mejora ISP y Sentinel sin introducir mapeos, cambios de serialización ni duplicación de tipos.

## 018A-39 — Toda acción declarada necesita un ejecutor

- Una matriz de recursos puede aparentar paridad aunque solo enumere acciones: cada acción visible debe resolver target, declarar capacidad y abrir/ejecutar una única ruta del runtime.
- Las propiedades pueden empezar como una lectura local segura; no se debe inventar un endpoint ni mostrar `refId` interno hasta que exista un contrato público y una decisión de privacidad.

## 018A-40 — Un warning de clase huérfana exige búsqueda dinámica

- Antes de borrar una utilidad CSS hay que buscarla en TypeScript, HTML y plantillas; nombres interpolados (`badge--${estado}`) no aparecen como literal completo y deben conservarse con evidencia.
- La limpieza incremental de utilidades sin consumidores reduce la deuda sin convertir los falsos positivos de VarSense en cambios visuales riesgosos.

## 018A-41 — Separar catálogos sin duplicar el registry

- Un catálogo de apps puede dividirse por capacidad/dominio mediante módulos de registro con efectos laterales; el entrypoint debe importar cada módulo una sola vez y conservar AppRegistry como única fuente.
- La división estructural es preferible a una suppression de límite: mantiene rutas, lazy loading y teardown intactos, pero evita que nuevas apps vuelvan a inflar el coordinador.

## 018A-42 — El webhook no debe ser el worker de entrega

- Un webhook debe confirmar rápido la autoridad del pago y encolar un evento; una llamada externa lenta o fallida dentro del request puede dejar el evento marcado sin una entrega recuperable.
- La rotación del grant debe actualizar solo el hash persistido y devolver el token raw únicamente al adaptador de correo; así el reintento genera un enlace nuevo sin convertir la cola en un almacén de credenciales.

## 018A-43 — Separar gate mínimo de backlog de tooling

- Un roadmap de calidad puede mantener una visión amplia sin convertir cada regla futura, benchmark o paridad de adapters en una dependencia del producto.
- La fuente canónica debe declarar explícitamente qué checklist desbloquea el trabajo y qué backlog queda diferido; así el agente ejecuta el gate reproducible sin inflar el contexto ni iniciar migraciones upstream innecesarias.

## 058A-4 — Una banda de selección sin recorte crea scroll accidental

- Arrastrar un rectángulo de selección más allá de los bordes del contenedor dentro de un scroll container (`overflow: auto`) crea scrollable overflow: los scrollbars vertical y horizontal del Finder se activaban durante el gesto aunque el usuario solo quisiera seleccionar. El fix raíz es recortar la banda a `clientWidth/clientHeight` del contenedor en cada `pointermove` y llamar `e.preventDefault()`; no basta con `overflow: hidden` en la banda (no impide el scroll del ancestro).
- El re-render completo del grid por cada cambio de selección es inviable con la banda (decenas de cambios por gesto): la actualización selectiva de clases sobre los ítems existentes (Map id → elemento) reduce el costo a un `classList.toggle` por ítem. La selección provisional de la banda debe ser feedback CSS sin tocar el store hasta soltar (el store solo se actualiza en `onApply`).
- Los límites de Sentinel (util ≤150 líneas, componente ≤300) no son negociables al cierre: una util con lógica de geometría pura se extrae a un módulo math testable sin DOM (`selection-band-math.ts`), y al extraer hay que verificar que no se pierdan constantes compartidas (`MOVE_THRESHOLD_PX`).
- Un clic derecho sobre un ítem ya seleccionado debe abrir el menú sobre TODA la selección (targets multi), no solo sobre ese ítem; un clic derecho sobre un ítem no seleccionado reemplaza la selección por ese único ítem (comportamiento Windows).

## 018A-44 — Retirar nombres legacy después de extraer la responsabilidad

- Cuando un módulo deja de contener la responsabilidad que dio origen a su nombre, conservarlo como alias perpetúa una arquitectura equivocada y hace que futuras apps vuelvan a depender del boundary antiguo.
- Renombrar el adaptador manteniendo la app y su contrato permite limpiar la deuda sin borrar la compatibilidad funcional ni reintroducir lógica en el shell.

## 018A-45 — Un token huérfano se elimina solo con doble evidencia

- VarSense identifica candidatos, pero la eliminación segura exige una búsqueda global que confirme que el nombre no aparece como consumidor ni en contratos dinámicos.
- Mantener los tokens que sí tienen consumidores, aunque parezcan legacy, evita que una limpieza visual rompa preferencias de perfil, tema o geometría del OS.

## 018A-46 — El modelo SQL no es un DTO público

- Aunque el frontend omita campos, serializar directamente el modelo interno deja el contrato vulnerable a futuras rutas o consumidores que sí los acepten.
- Un DTO por boundary permite que el modelo conserve datos necesarios para checkout/webhook sin filtrar rutas de storage ni identificadores de proveedores a catálogo o artículos.

## 018A-47 — Un endpoint público de settings también necesita contrato

- Devolver un mapa completo de configuración convierte cada clave futura en una exposición pública accidental; la allowlist debe vivir en el repository y crecer solo mediante revisión explícita.
- Nombrar el cliente como `getPublic` mantiene la frontera visible también en el frontend y evita que una futura pantalla confunda configuración pública con secretos o flags administrativos.

## 018A-48 — Los metadatos de orden también son internos

- Un endpoint público puede filtrar correctamente los registros y aun así revelar cómo se organiza el escritorio si serializa el modelo SQL completo; orden y visibilidad deben pertenecer al DTO administrativo.
- Cuando el backend ya filtra/ordena, el frontend público debe renderizar el resultado directamente. Mantener un segundo filtro en el navegador crea dependencia accidental del contrato interno y facilita que vuelva a filtrarse de forma inconsistente.

## 018A-49 — Una lista compartida puede necesitar tres DTOs

- Las notificaciones parecen una lista única, pero `read` depende de la cuenta y `status`/`created_by` dependen de admin; reutilizar el modelo SQL en los tres endpoints mezcla capacidades y expone metadata.
- Separar las listas por boundary permite que el servicio conserve una sola consulta/repositorio, mientras cada handler decide exactamente qué campos puede devolver.

## 018A-50 — Cerrar lo automatizable sin ocultar deuda visual

- Una matriz de paridad puede cerrarse técnicamente aunque queden CSS huérfanos o fachadas manuales que necesitan revisión visual; conviene separarlos como backlog no bloqueante en vez de falsear el criterio de salida.
- El roadmap debe habilitar el siguiente epic solo cuando sus dependencias de contratos estén cerradas y dejar las migraciones de alto riesgo con criterio explícito de reanudación.

## 018A-51 — Suite completa en CI, alcance incremental en local

- Un gate local que ejecuta toda la suite en cada tarea degrada el equipo a medida que crecen los tests; el modo incremental debe seguir siendo la ruta rápida.
- La cobertura completa no debe desaparecer: se activa con una señal explícita de CI, comparte el mismo reporte y falla el gate si cualquier etapa devuelve error.

## 018A-52 — El caché debe incluir el nivel de evidencia

- Dos ejecuciones con los mismos archivos no tienen la misma evidencia si una ejecuta solo type-check y otra ejecuta la suite completa; el modo de validación forma parte del fingerprint.
- Al cambiar el contrato del caché hay que incrementar su versión para invalidar resultados antiguos en vez de asumir que describen el nuevo gate.

## 018A-53 — Un budget útil debe ejecutarse donde existe el artefacto

- Los límites de rendimiento solo son verificables sobre el build final; medir fuentes o cargar `test:full` en cada ciclo local no protege al producto y degrada el equipo.
- Separar CI de local permite exigir build + gzip en integración sin convertir cada tarea en un proceso pesado. El límite vive en configuración y el reporte indica exactamente el asset y bytes que exceden.

## 018A-54 — Documentar recuperación antes de necesitarla

- Un runbook útil debe definir señales de salida, límites y orden de rollback, pero no debe fingir que una operación de producción fue probada cuando solo se revisó el procedimiento.
- Mantener Coolify Manager como único canal evita que una urgencia reintroduzca SSH y deja cualquier hueco como mejora explícita de la herramienta.

## 018A-57 — Una UI de registro no debe habilitar registro

- El formulario puede vivir dentro de Cuenta y reutilizar el servicio generado, pero la autoridad para crear sesiones sigue en el flag server-side y la verificación de correo.
- Las respuestas de recuperación deben conservar el mensaje no enumerable; tokens de verificación/reset requieren un contrato de URL separado antes de entrar al cliente.

## 018A-59 — Buckets con ventanas distintas necesitan almacenes distintos

- Reutilizar un `HashMap` y limpiar todas sus entradas con la ventana del login hace que una llamada de login pueda borrar prematuramente el contador de recuperación.
- Separar los buckets conserva ventanas independientes y deja claro qué parte es protección local del proceso frente a un futuro limitador distribuido.

## 018A-60 — Auditar sin convertir la auditoría en un almacén de secretos

- Los eventos de auth pueden registrar tipo, éxito, usuario e IP hasheada sin copiar email, contraseña, sesión ni token; el servicio de tokens sigue siendo la única frontera que maneja el secreto crudo.
- Registrar también los fallos de consumo permite detectar replay/abuso, pero el fallo de la propia auditoría debe propagarse para no presentar una acción sensible como completada sin evidencia.

## 018A-61 — Una acción del shell debe tener un solo dueño

- Si taskbar, móvil y titlebar mutan stores directamente, la misma acción puede quedar sin analítica, sin disponibilidad uniforme o con teardown distinto. El contrato debe vivir en `CommandRegistry` y las superficies solo proyectarlo.
- El reencuadre por resize debe ser batch: una sola escritura al store evita N persistencias y mantiene el historial de rutas estable; los cambios ambientales usan `source='sync'`.

## 018A-62/63/64 — ID de tarea y gate: dos lecciones de proceso

- **El ID de tarea se asigna desde git log, no desde memoria.** Se usó `018A-14/15` creyéndolos siguientes cuando la secuencia real ya llegaba a `018A-61`; hubo que corregir comentarios en migración, servicio y handler. Antes de escribir un `[ID]`, comprobar el máximo usado: `git log --oneline | Select-String '018A-(\d+)' | % { [int]$Matches[1] } | Measure-Object -Maximum`.
- **El quality gate exige el ID en `roadmap.md`, `Agente/planes/` o `Agente/completados/`** (`preflight.mjs`). Si la tarea aún no figura, `npm run task:check -- {ID}` falla con "no existe". Registrar la tarea en el roadmap (pendiente) → gate → archivar en completados → quitar del roadmap. El roadmap debe volver a quedar idéntico a HEAD si las tareas se cierran en el mismo bloque.
- **`ON CONFLICT` contra índice parcial exige repetir el predicado `WHERE`** en el arbiter (42P10): `ON CONFLICT (col) WHERE col IS NOT NULL DO NOTHING`. Un índice UNIQUE parcial no matchea un `ON CONFLICT (col)` sin predicado.
- **Desajuste utoipa ↔ cliente generado ↔ servicio manual** causa fallos silenciosos del frontend pese a HTTP correcto (login 204 mostrado como "credenciales incorrectas"). Alinear el contrato y aceptar el status real en `unwrapGeneratedResponse`; regenerar el cliente después.

## 018A-65 — Especificidad de superficie rompe el flex de los botones

- La regla `.desktop-window .boton { display: inline-block }` (0,2,0) sobreescribe cualquier `display: flex/inline-flex` puesto en una clase `.boton` (0,1,0): icono+texto quedan inline con alineación por baseline (SVG arriba, texto abajo).
- Solución reutilizable: receta compartida `.boton-con-icono` definida con los mismos selectores de superficie y DESPUÉS en el archivo, para ganar por orden de fuente y recuperar `display: inline-flex; align-items: center; gap`.
- Antes de escribir `display`/`align-items`/`gap` en un componente `.boton`, comprobar que no lo anula una regla de superficie; si lo anula, la capacidad debe vivir en la receta del sistema, no duplicada en el componente.

## 018A-66 — Admin y overlay personal son ámbitos distintos

- La capacidad `admin` no es solo una autorización superior: cambia el ámbito de persistencia. El admin publica el release global; sincronizar además su overlay de cuenta crea conflictos que reaparecen en cada recarga.
- La corrección debe cortar el transporte en el boundary de auth y mantener una guardia de presentación para transiciones; ocultar solamente el modal deja requests y estado incorrectos.

## 018A-67 — Botones con iconos: usar las recetas del sistema, nunca `.boton` + SVG crudo

- Un botón de solo icono con `className: 'boton'`/`boton-pequeno` + `createElement(Icon)` deja el SVG de Lucide a 24px por defecto y sin caja coherente. La receta canónica es `.boton-icono` (caja 20px, SVG 14px del token, sin borde).
- Un botón de icono+texto sin `.boton-con-icono` rompe la línea por la regla de superficie `inline-block`. Antes de crear un botón con icono, elegir la receta del sistema: `.boton-icono` (solo icono) o `.boton-con-icono` (icono+texto).
- Cuando el type-check falla por un status del contrato (p. ej. `'204' is not assignable to '200 | 401 | 403'`) y el backend ya está actualizado, el cliente Orval está stale: `npm run codegen:local` lo regenera. Los generados están en `.gitignore`, así que no generan diff de commit.

## 018A-68 — Los controles de toolbar son segmentados, no formularios

- Un filtro o modo de vista dentro de una toolbar de app NO es un formulario: `.campo`/`.campo-select` (etiqueta + select con subrayado) y `.boton` con borde de superficie rompen el lenguaje visual de toolbar del OS. La receta es `.control-segmentado` (activo invertido, Mac clásico) + contenedor `.barra-herramientas`.
- Un toggle que cambia su etiqueta según el estado (p. ej. `papelera`⇄`biblioteca`) se modela mejor como un control segmentado de dos opciones: el estado activo es evidente y no hay texto mutable.
- Antes de decidir el control, preguntar por el contexto: toolbar de contenido → segmentado/íconos; formulario → `.campo`. El componente `createSegmentedControl` gestiona su propio estado activo, así el padre no depende de re-render para pintar el activo.

## 018A-69 — Restauración debe copiar todo el contrato de MountedView

- Cuando se crea una ventana desde una app hay dos rutas distintas: apertura
  normal y restauración desde sesión. Si una de ellas no copia un campo nuevo
  del contrato (`actions`, toolbar o parámetros), la app funciona al abrirla
  pero se degrada tras recargar. Toda ampliación de `MountedView` debe añadir
  una regresión en ambas rutas.
- El DOM de una barra no debe guardarse en `localStorage`; la sesión conserva
  solo estado de presentación y la app debe reinstanciar sus acciones al
  restaurarse.

## 018A-71 — Los controles de vista son menús del app toolbar, no clones en el body

- Un control de vista (filtro/modo) de una app debe vivir en el app toolbar real de la ventana (`desktop-app-toolbar`, chrome del shell), declarado en `AppDefinition.toolbar`, nunca como un botón falso estilizado dentro del contenido. Los toolbars falsos en el body duplican el chrome y rompen el modelo ventana/contenido.
- El checkmark de menú de OS se proyecta con `isActive?: (ctx) => boolean` en el contrato de comandos + icono `Check` en `createAppToolbar`, evaluado en CADA apertura del menú (estado fresco), no al abrir la ventana.
- Los separadores del menú contextual se ven mejor sin bordes entre items: la división la hace solo `.desktop-context-menu__separator`; los items sin borde (hover por inversión) respetan el lenguaje 1-bit.

## 018A-72 — CSS: un token compuesto con `var()` se resuelve donde se DECLARA, no donde se usa

- `--borde: 1px solid var(--color-borde)` declarado en `:root` resuelve su `var(--color-borde)` interno en `:root` (siempre negro), aunque un scope descendiente (modo oscuro de ventanas) redefina `--color-borde` a blanco. Sobreescribir solo el token interno NO invierte al compuesto.
- El patrón que sí funciona: redefinir el token COMPUESTO (`--borde`) en el scope de tema que ya redefine el token interno, de modo que se compute blanco allí y se herede a todos los descendientes legacy. Es el mismo mecanismo por el que `--sistema-borde` invertía: su `--sistema-texto` se sobreescribe en el propio `:root`.
- Un data URI SVG no puede usar `currentColor`; la flecha de un select necesita un token propio (`--color-select-flecha`) con versión clara/oscura.
- Antes de dar por buena la "auto-inversión" de un token compuesto, verificar empíricamente en el navegador el computed value dentro del scope de tema (getComputedStyle sobre el elemento real), no razonar sobre la intención del comentario.

## 018A-74 — Un campo necesita CSS de campo; una utilidad de borde no es un campo

- Una app de escritorio sin hoja CSS propia hereda solo utilidades genéricas: `.article-editor__content` con la clase `.border-bottom` se veía como texto con una línea inferior, mientras `.campo-textarea` (CSS propio en `components.css`) se veía como campo real. La discrepancia visual entre "campo" y "no campo" suele ser CSS faltante, no JS roto.
- Cada app de escritorio debe tener su hoja `desktop-{app}.css` importada en `main.ts` (patrón de `desktop-media-library.css`); los desktop-*.css son CSS plano sin `@layer`, así que gana el orden de importación. No volcar más reglas en `components.css` (ya supera el límite, deuda 018A-73).
- El tratamiento de campo compartido: borde completo `var(--borde)`, padding `--espacio-sm`, `min-height`, y foco que engrosa el borde a 2px (aquí `:focus-within` porque el elemento editable real es el `.ProseMirror` interno).
- El reset global elimina `list-style` de `ul`/`ol`; dentro de un editor de contenido hay que restaurarlos explícitamente (incluidas listas anidadas).
- Al verificar UI tras una recarga, recordar que la sesión solo restaura algunas ventanas: el editor de artículos se cierra y hay que reabrirlo vía Admin → "editar" para validar el estilo.

## 028A-3 — El dev launcher debe auto-recuperar el drift 42P07 de migraciones

- `glory-rs/scripts/dev.mjs` solo reconocía incompatibilidades de historial (`VersionMissing`, `VersionMismatch`, `previously applied but has been modified`). Una BD de desarrollo con objetos creados fuera de sqlx (prototipado manual, agentes paralelos, restauraciones parciales) falla en `sqlx migrate run` con `relation ... already exists` / `la relación ... ya existe` (SQLSTATE 42P07): la tabla existe sin fila en `_sqlx_migrations` y el script salía con `No se pudieron aplicar las migraciones locales.` en vez de auto-curarse.
- La cura diseñada para la BD de desarrollo ya existía (reset de `public` + reaplicar): el defecto era solo la detección. Se extendió el regex con `already exists|ya existe` para que ese drift entre al mismo flujo. Dato clave del diagnóstico: comparar `to_regclass('public.<tabla>')` contra el `MAX(version)` de `_sqlx_migrations`.
- Operación con agentes paralelos: `glory-rs` es un submódulo con repo propio; su `main` puede tener commits ajenos sin pushear. No actualizar el puntero del submódulo en el repo padre ni pushear `main` del submódulo sin coordinar; commitear dentro del submódulo y diferir el push dejando constancia. Los IDs de tarea del día también pueden colisionar: verificar `Agente/completados/tareas-YYYY-MM-DD.md` antes de asignar.

## 028A-7 — Procesos stale bloquean el binario y los puertos del dev server

- Si `npm run dev` falla con `error: failed to remove file ...\debug\glory-backend.exe / Acceso denegado (os error 5)`, hay un `glory-backend.exe` anterior aún vivo que mantiene el binario abierto (Windows no permite sobrescribir un exe en ejecución). El dev launcher muere con código 101 y deja Vite huérfanos sirviendo el puerto anterior.
- Diagnóstico: `Get-NetTCPConnection -State Listen` sobre `3000,5173,5174,5175` + `Get-CimInstance Win32_Process` con el command line completo para distinguir qué Vite pertenece al proyecto (ruta `frontend/node_modules/.../vite/bin/vite.js`) de los de otros workspaces (p. ej. `test1/freellmapi`). No matar procesos de otros proyectos.
- Limpieza: `Stop-Process -Id <pids> -Force`, verificar puertos libres y relanzar `npm run dev`. La señal de readiness es el backend respondiendo en `127.0.0.1:3000` (401 en `/api/auth/me` sin sesión es señal de que responde) y Vite en `5174` (200). Los `ECONNREFUSED` del proxy Vite mientras el backend compila son normales.

## 028A-11 — No saltarse el cooldown del guard y colisión de IDs con el agente paralelo

- Cuando el guard bloquea una validación pesada por cooldown (180 min), el agente NO debe intentar `--allow-heavy`, `GLORY_QUALITY_ALLOW_HEAVY` ni variantes: el usuario lo desaprueba explícitamente (riesgo de que otro agente lo perciba como evasión del gate). La vía correcta es cerrar con gate local-light, registrar los tests como pendientes con su hora de reintento y ejecutarlos cuando el cooldown expire.
- Los overrides del guard existen para emergencias reales y quedan visibles en reportes; usarlos para "no esperar" rompe el propósito del cooldown (limitar ejecuciones pesadas).
- Colisión de IDs con agente paralelo: mientras el plan de gobernanza usaba `028A-10..14`, el otro agente commiteó `028A-10/11/12` para Sentinel (f26d649b, a3a93cc6, c3d91c7a). La colisión era contra commits ya hechos, no solo contra el roadmap. Verificar SIEMPRE `git log --oneline` + `Agente/completados/` + `roadmap.md` antes de numerar; si ya hay commits del otro agente con esos IDs, renumerar o aceptar con mensajes de commit descriptivos que desambigüen.

## 028A-17 — Superficies del OS fuera de las ventanas de apps no reciben el override dark de `--color-*`

- El dark mode solo redefine `--color-*` a blanco dentro de `.desktop-window`/`.movilApp`/`.movilLauncher`; cualquier superficie `--sistema-*` que viva FUERA de esos contenedores (p. ej. el banner de consentimiento anclado al shell) conserva `--color-texto` negro en `:root`. Un componente compartido como `.boton` que usa `--color-texto` queda invisible sobre esa superficie en dark mode.
- Regla reutilizable: dentro de una superficie del sistema, los componentes consumen `--sistema-*` (que se auto-invierte), no `--color-*`. Antes de usar `.boton` (o cualquier receta compartida) en una superficie OS, verificar qué token de color consume y dónde vive el contenedor respecto al override del dark mode.

## 108A-1 — Auditoría de Sentinel y quality gate (F0–F6, 2026-08-10)

### Redacción de secretos: dos bugs de seguridad encontrados por los fixtures

- **`Authorization: Bearer <token>` dejaba el token expuesto:** el regex `ASSIGNMENT` consumía "Bearer" como valor del campo `Authorization:`, y el token real quedaba sin redactar en la salida (`Authorization: [REDACTED] eyJhbGci...token`). La corrección: añadir `(?:Bearer\s+)?` como prefijo opcional del valor en el ASSIGNMENT, para que Bearer+token sean redactados como una unidad. Mismo patrón en `core/redaction.ts` y `scripts/quality/redaction.mjs` (transferido de la fuente original).
- **Backtracking catastrófico de `URL_CREDENTIALS`:** el regex `([a-z][a-z0-9+.-]*:\/\/)[^\s:@/]+:[^\s@/]+@` degeneraba a O(n²) sobre líneas largas sin `://` (60 s en 300 KiB). Causa: el esquema `[a-z0-9+.-]*` greedy seguido de `://` obligatorio en una corrida de 300k x's, y el `[^\s:@/]+` sin acotar. Corrección: esquema acotado `{0,32}` y credenciales acotadas `{1,256}` en ambos lados del `:` → 50 ms. Aplicado en core y consumidor.
- **Lección general:** los fixtures de seguridad deben probar la redacción con entradas largas SIN secretos (p.ej. `data=` + 300k x's) para detectar backtracking catastrófico. Probar también `Authorization: Bearer <token>` como entrada unitaria, no solo `Bearer <token>` suelto.

### Shims del guard: overhead medido y retiro de la ruta normal

- El presupuesto de overhead de shims del checklist F6 es p95 < 50 ms. La medición real (bench-shims, pareado shim vs directo con `--version`, 10 muestras) dio: node p95 ~291 ms, npm ~769 ms, cargo ~391 ms. **NO se alcanza el presupuesto.** El coste viene del `where` del shim + arranque de Node del guard + lógica del guard. Conclusión: los shims legacy deben salir de la ruta normal, y el reemplazo canónico es `sentinel guard` / `sentinel check` (retiro ya marcado en la cabecera de los shims).
- `doctor --shims` (nuevo `src/core/shimDiagnostics.ts`) lista qué ejecutable gana realmente en PATH y marca si el shim gana: verificado en vivo — cargo lo gana el shim de GlorySentinel, node/npm/npx ganan el real.

### Logging a stderr: stdout debe ser JSON puro

- El fallback del logger sin canal (`console.log` en vez de `console.error`) contaminaba stdout con prefijos `[INFO]`/`[WARN]` antes del JSON solicitado, rompiendo `sentinel analyze --format json | parser`. Corregido en F1: toda salida de diagnóstico (INFO/WARN/ERROR) va a stderr. Verificación: `analyze --format json` → stdout es un único JSON parseable, con diagnósticos del analyzer en stderr.

### Reglas regex locales: 50% de falsos positivos

- Las reglas `async-without-abort` (`/\bfetch\s*\(/g`) y `subscription-without-dispose` (`/\.subscribe\s*\(/g`) marcan también los casos correctos (fetch con AbortSignal y subscribe con unsubscribe). Fixture `f5-abort-dispose.fixture.ts` lo confirmó: 4 findings, 2 falsos positivos. El core de Sentinel no tiene regla equivalente (`fetch-sin-timeout` es timeout, `listen-sin-cleanup` es listen/addEventListener). Decisión: observe-only (no bloquean el gate, se conservan en el log como telemetría) hasta que exista una regla semántica (una regla un dueño, ADR 0001).

### Worktrees para cambios upstream sin contaminar el checkout consumidor

- Los cambios en `tools/sentinel` (upstream) no se hacen en el checkout del consumidor: se rechazan por el lock del submódulo y contaminarían el gitlink. En su lugar, se crea un worktree exclusivo del repo del submódulo (`git -C tools/sentinel worktree add`), se trabaja allí, y la adopción se hace en F8 mediante la actualización del gitlink + `quality-tools.json` + regeneración del lock. El mismo patrón se usó para VarSense.

### Idempotencia de `sentinel init`

- La implementación inicial de `planInit` trataba cualquier archivo existente sin `--force` como conflicto, incluso si el contenido era idéntico. La corrección: leer el contenido actual, comparar, y marcar `skip` para contenido idéntico (idempotencia). Si el contenido difiere y no hay `--force`, conflicto. Si difiere con `--force`, `update` con backup. Esto evita que el segundo `init` sobre un proyecto ya configurado falle o sobrescriba innecesariamente.
