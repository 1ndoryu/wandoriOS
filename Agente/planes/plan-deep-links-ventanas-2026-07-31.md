# Plan — URLs canónicas, deep links y foco del OS

> **Fecha:** 2026-07-31  
> **Estado:** contrato y sincronización de foco implementados y validados; E2E, recursos privados y compartir pendientes
> **Dependencias:** 297A-9 runtime, 297A-11 workspace, 297A-12 móvil; integra permisos de 297A-13.

## Objetivo

Cada aplicación y cada recurso abierto debe tener una URL canónica compartible. La URL representa la ventana enfocada, no todo el estado visual de la sesión: al abrirla, otra persona llega a esa app/recurso y el OS la abre o enfoca según su presentación.

## Contrato de URL

- [x] Definir un contrato allowlisted por app para rutas públicas y parámetros permitidos; no se serializan IDs internos, tokens, clipboard, posiciones, tamaños, z-index ni overlays privados. *(AppDeepLink + createPathDeepLink)*
- [x] Hacer que las apps públicas migradas declaren parser/serializer de ruta, capacidades requeridas, parámetros permitidos y fallback seguro. *(reader, finder/gallery, about y projects; legacy sin allowlist no acepta parámetros)*
- [ ] Distinguir URL canónica pública, URL autenticada de cuenta y URL local de sesión; una ruta privada sin permiso muestra login/not-found sin filtrar existencia ni metadata.
- [ ] Resolver recursos por alias/slug estable cuando sea público; versiones y descargas privadas solo mediante entitlement/grant válido.

**Gate:** una app nueva puede declarar su ruta sin modificar un router monolítico ni copiar lógica de otra app.

## Ventana enfocada como URL

- [x] Al abrir/focalizar una ventana, serializar únicamente la instancia enfocada mediante `replaceState`; aperturas intencionales usan `pushPath`, foco pasivo usa `replacePath` y el sincronizador deriva de `windowStore`/`mobileStackStore`. El router conserva una marca privada `history.state` (`createdByPush`) sin serializar datos sensibles.
- [x] Al cargar una URL pública válida, `RouteAppAdapter` valida parámetros antes de hidratar y reutiliza una instancia equivalente; URLs inválidas o sin capacidad terminan en not-found seguro.
- [x] No serializar las demás ventanas, posiciones, tamaños, orden de taskbar, overlay local ni estado transitorio; el contrato solo permite parámetros `deepLink` públicos.
- [x] Definir Back/Home y refresh para la presentación móvil: aperturas con historial coordinan `popstate`; deep links iniciales vuelven a `/` mediante `replacePath` sin abandonar el sitio. Forward y E2E de ruta completa siguen pendientes.
- [x] En móvil, la misma ruta abre la app a pantalla completa; en tablet conserva escritorio; el cambio de breakpoint pausa el sincronizador, reinstancia y reabre con `history: 'none'` sin contaminar el historial.

**Gate:** copiar la URL con varias ventanas abiertas y abrirla en una sesión limpia enfoca exactamente la app/recurso compartido.

## Compartir y seguridad

- [x] Añadir comando global `Copiar URL` al toolbar automático de cada ventana; mostrar feedback visible, usar Clipboard API con fallback seguro y medir el resultado con metadatos allowlisted. *(navigation-commands.ts + desktop-window.ts)*
- [x] Validar y normalizar rutas en el boundary: parámetros arbitrarios, segmentos inseguros y parámetros legacy son rechazados antes de hidratar; no se incluyen secretos ni estado privado.
- [ ] Aplicar capacidades server-side y no confiar en que ocultar una app en el cliente sea autorización; comprobar release/overlay/entitlement antes de hidratar.
- [ ] Resolver rutas antiguas con redirección canónica documentada, sin romper enlaces existentes ni crear bucles.

**Gate:** rutas inválidas, privadas, expiradas y manipuladas producen un estado seguro, trazable y comprensible.

## Historial, analítica y SEO

- [x] Diferenciar primitivas `pushPath` y `replacePath` sin crear un segundo router; la integración con foco desktop/mobile y la política de apertura ya están conectadas.
- [x] Emitir `deep_link_opened` y `window_focus_changed`; `share_url_copied` implementado con `routeName`, `appId`, `presentationMode` y `success`, sin enviar URL, contenido ni IDs sensibles. `window-url-sync` centraliza el foco para cubrir desktop, tablet y móvil sin duplicar eventos.
- [ ] Preparar metadata/sitemap solo para recursos públicos; no indexar rutas del Admin, overlays, drafts ni grants.
- [ ] Documentar canonical URL y título accesible por app para compartir y lectores de pantalla.

**Gate:** la misma acción produce el mismo evento semántico en desktop, tablet y móvil, con consentimiento y retención aplicables.

## Pruebas obligatorias

- [ ] Abrir una URL de Finder, Reader/artículo, About, proyecto, producto, Configuración y Estadísticas desde sesión limpia. *(Base cubierta para rutas públicas migradas; integración/E2E pendiente.)*
- [ ] Probar varias ventanas, foco alterno, Copiar URL, refresh, Back/Forward, deep link directo y colisión de instancia; Copiar URL y la reconciliación de rutas, parámetros inseguros, capacidades y semántica `push/replace` tienen tests unitarios; E2E real sigue pendiente.
- [ ] Probar 1440x900, 1024x768, 768px, 390px y 320px; incluir usuario anónimo, admin, usuario sin capacidad, recurso privado y grant expirado.
- [ ] Ejecutar E2E completo de RouteAppAdapter/WindowManager + MobileShell/popstate y viewports; type-check, **382 tests en 49 suites**, quality gate y self-check pasan. Chrome verificó `/projects` en desktop `1440×900` y carga del shell móvil en `/projects` con URL conservada; interacción móvil completa sigue pendiente por automatización.

## Definition of Done

- [ ] Cada app/recurso soportado tiene URL versionada, parser, serializer, permisos y fallback. *(Contrato base implementado para apps públicas migradas; versionado de gramática y recursos privados pendientes.)*
- [ ] La URL compartida abre/enfoca solo la ventana representada, sin filtrar la sesión del emisor.
- [ ] Historial, móvil/tablet, seguridad, analítica y accesibilidad están probados completamente; la instrumentación analítica ya está implementada, pero faltan E2E, recursos privados y el pipeline remoto de 297A-16.
- [ ] Manual de arquitectura, contratos, roadmap e índice se actualizan con la decisión final.
