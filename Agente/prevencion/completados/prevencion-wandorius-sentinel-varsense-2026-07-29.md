> **CANCELADO (2026-08-12, decisión del usuario):** contenido de Sentinel/quality gate. Se archiva sin ejecutar; no es trabajo pendiente.

# Prevención canónica: Glory Sentinel y VarSense para wandori.us

> **Fecha:** 2026-07-29  
> **Estado:** activo como inventario; infraestructura y gate mínimo cerrados (018A-43). Las reglas de dominio restantes se implementan solo durante la tarea dueña y no bloquean el roadmap principal.
> **Autoridad:** inventario único de reglas automatizables del proyecto  
> **Arquitectura:** `Agente/documentacion/arquitectura/manual-arquitectura-wandorius-2026-07-29.md`  
> **Identidad:** `Agente/documentacion/design-system/manual-identidad-visual-os-2026-07-29.md`

## Reglas de implementación

- Las reglas genéricas se implementan en Glory Sentinel/VarSense y permanecen agnósticas.
- wandori.us solo configura severidad, rutas y excepciones mínimas en archivos canónicos.
- Toda regla incluye fixture positiva, negativa, equivalencia CLI/LSP/editor y documentación.
- Baseline primero, corrección después, bloqueo CI al final.
- Prohibidas regex locales o scripts paralelos que dupliquen el motor.

## Checklist 1 — Seguridad inmediata

- [x] Detectar endpoint admin protegido solo por autenticación y no por capacidad. *(297A-7: AdminUser extractor con verificación de rol en DB)*
- [x] Detectar request público que acepte rol/promoción. *(297A-7: RegisterRequest nunca acepta rol; se asigna 'user' server-side)*
- [x] Detectar token/JWT de sesión persistido en Web Storage. *(297A-8: migrado a sesiones opacas en cookie `HttpOnly`; JWT eliminado del frontend)*
- [x] Detectar credenciales o auto-registro en frontend. *(297A-7: auto-login eliminado; registro apagado por feature flag)*
- [x] Detectar endpoint público sin predicados obligatorios de visibilidad/lifecycle. *(297A-7: artículos públicos solo status='published'; productos solo is_active)*
- [x] Detectar DTO público con `download_path`, `storage_key`, URL firmada o IDs internos de pago. *(297A-28/29/46: DTOs de media y productos separados; storage keys, rutas e IDs de proveedor quedan fuera del contrato)*
- [x] Detectar directorio de entregables servido estáticamente. *(297A-28: serving estático de `/uploads` retirado; el finding queda como prevención futura)*
- [x] Detectar checkout que acepte precio/moneda/ruta/éxito desde cliente. *(297A-7: checkout valida is_active, requiere Stripe configurado)*
- [x] Detectar webhook sin firma, evento único, validación de importe/moneda y transacción. *(297A-15/42: firma, idempotencia, transacción y outbox con reintento; proveedor real/E2E quedan diferidos)*
- [x] Detectar descarga sin entitlement y grant revalidado. *(297A-15: entitlement/grant se revalidan server-side; pruebas con proveedor real quedan diferidas)*
- [x] Detectar fallos silenciosos en pago, persistencia, email o fulfillment. *(297A-15/42: errores visibles, outbox y backoff; observabilidad avanzada queda diferida)*
- [ ] Activar estas reglas como error después de corregir el baseline. *(pendiente rollout Sentinel)*

## Checklist 2 — Datos y publicación

- [ ] Detectar recurso creado sin defaults `draft`, `private`, `active`.
- [ ] Detectar un único `status` mezclando editorial, visibilidad, lifecycle o comercio.
- [ ] Detectar preferencia personal escrita en settings globales.
- [x] El endpoint público de settings usa allowlist y no devuelve claves de auth/admin. *(018A-47: `SettingsRepository::get_public` + `SettingsService.getPublic`)*
- [ ] Detectar publicación de workspace sin revisión, transacción y auditoría.
- [ ] Detectar persistencia desktop sin `schemaVersion` y validación.
- [ ] Detectar purga sin capacidad, retención, auditoría o capa explícita.
- [ ] Detectar portapapeles interno con HTML, funciones, secretos o URLs firmadas.

## Checklist 3 — Lifecycle y frontend

- [ ] `MountedView` async requiere `AbortSignal`.
- [ ] Listener global requiere signal/teardown.
- [ ] Fetch requiere cliente común y comprobación de resultado.
- [ ] Catch vacío o error convertido en éxito es error.
- [ ] HTML dinámico requiere sanitizador central.
- [ ] Router/history desde apps fuera del adaptador es error.
- [ ] Open externo exige `noopener,noreferrer`.
- [ ] Iframe externo exige sandbox y allowlist.

## Checklist 4 — Escritorio reutilizable

- [ ] Apps solo se definen en AppRegistry.
- [ ] AppRegistry usa capacidades, no booleano `public|admin` como autorización.
- [ ] Chrome `.desktop-window*` solo se crea en factory/componente autorizado.
- [ ] Drag, resize, focus, minimize y close solo viven en gestor/controlador común.
- [ ] Estado de ventanas solo cambia mediante comandos/reducer.
- [ ] Taskbar, escritorio y Aplicaciones no mantienen listas paralelas.
- [ ] Menús reciben modelos/comandos; no hardcodean dominios.
- [ ] z-index por app es error.
- [ ] Control de menú requiere foco/teclado y nombre accesible.
- [ ] Detectar una app/store móvil paralelo en vez de reutilizar AppRegistry/MountedView/comandos.
- [ ] Detectar DesktopWindow, barra superior o taskbar montadas en presentación móvil.

## Checklist 5 — API, backend y analytics

- [ ] Orval usa Fetch + `tags-split` y no genera archivo monolítico.
- [ ] Tipos generados no se editan ni duplican manualmente.
- [ ] SQL solo vive en repositories y usa macros/query builders tipados.
- [ ] Evento analítico requiere ID, versión, nombre allowlisted y metadata limitada.
- [ ] Batch analítico exige límite, idempotencia y transacción.
- [ ] El cliente no puede declarar éxito de pago, auth, publicación o descarga.
- [x] Detectar `{param}` en strings de `.route()` de axum: este build (matchit 0.7.3) parsea `:param`; `{id}` devuelve 404 silencioso sin error de compilación. *(297A-14: regla `axum-ruta-sintaxis-rs` en core sentinel `7970dc2`, severidad `error` en config del proyecto, fixture + tests unitarios/equivalencia, gate aplicado tras reinstall. **Condición de retirada:** la regla asume matchit 0.7.3; retirarla cuando `Cargo.lock` resuelva matchit ≥ 0.8, que sí soporta `{param}`)*
- [ ] Analytics no contiene email, contenido, token, URL firmada o datos de pago.
- [ ] Audit y analytics usan contratos/tablas separados.

## Checklist 6 — Identidad visual y VarSense

- [ ] Prohibir color literal fuera de `variables.css`.
- [ ] Prohibir sombra, blur y drop-shadow.
- [ ] Prohibir radio salvo círculo de marca documentado.
- [ ] Prohibir borde visual mayor de 1 px.
- [ ] Prohibir hover/animación puramente decorativos.
- [ ] Exigir Lucide oficial con stroke token de 1 px.
- [ ] Prohibir iconos manuales/emoji en chrome.
- [ ] Detectar CSS inline salvo variable funcional autorizada de geometría.
- [ ] Detectar token CSS inexistente o huérfano.
- [x] Detectar clase usada sin definición y clase huérfana en contratos vanilla (`createEl({ className/class })`, `createContainer`, `createExternalLink`, `classList.add`, `className/contentClass`, templates/ternarios estáticos); ignorar comentarios/cadenas no ejecutables y mantener clases realmente huérfanas detectables. *(VarSense core patch hashado 2026-07-31 + 43 fixtures/tests)*
- [ ] Detectar app con receta local equivalente a ventana, título, acciones, formulario o card compartidos.
- [ ] Detectar `<select>` nativo del navegador dentro de componentes/features del OS (se usa `createSelect` custom en su lugar). *(018A-82: el select nativo se retiró; evaluado — la prohibición visual vive en el manual de identidad §select y una regla Sentinel por carpeta es frágil/ruidosa; pendiente decisión de implementarla como regla genérica en Glory Sentinel con fixtures)*

## Checklist 7 — Configuración y CI

- [x] Crear `sentinel.config.json` canónico en raíz.
- [x] Crear/normalizar config VarSense canónica.
- [x] Excluir solo artefactos, dependencias y código generado; el runner se autosupervisa.
- [ ] Registrar excepción por regla, archivo, tarea, motivo y fecha de retirada.
- [x] Integrar ambos mediante el único script `task:check`, sin comandos paralelos duplicados.
- [x] Integrar ambos en `npm run self-check` y CI.
- [x] Reporte registra herramientas/config/fecha para comprobar vigencia.
- [x] CI falla ante errores nuevos de alta confianza.
- [x] Suprimir falsos positivos conocidos: css-especificacion-diseno-local como `information`, clases fantasma sk-*/legacy en `excludeClassPatterns`, inlineDetection como `information`.
- [ ] Resolver/documentar `sqlx-query-sin-macro`/`sqlx-query-as-sin-macro`: el gate actual conserva **75 warnings Sentinel** y no los convierte en suppressions; requieren migración a macros compile-time o registro formal en `ruleRegistry` con fixtures equivalentes.
- [x] Distribuir cambios agnósticos de VarSense reproduciblemente: patch versionado en `scripts/quality/patches/`, SHA-256 en `quality-tools.json`, aplicación idempotente con diff exacto y tests en `quality:setup`.

## Criterio de cierre

- [ ] Todas las reglas de error tienen fixtures positivas/negativas.
- [ ] CLI, LSP, VS Code y Zed producen hallazgos equivalentes.
- [ ] Baseline del proyecto tiene cero errores.
- [ ] No quedan suppressions amplias.
- [ ] Self-check y CI bloquean una fixture regresiva de seguridad, arquitectura y visual.
