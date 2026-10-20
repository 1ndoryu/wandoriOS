# Roadmap — WANDORIUS

Blog, portfolio y tienda digital dentro de un OS retro minimalista (Rust/Axum + PostgreSQL + Vanilla TypeScript/Vite); epic 297A-4 — OS persistente, cuentas, programas y comercio. Se edita en el portátil; se compila, prueba y ejecuta en el VPS 89; producción (Coolify) fuera de alcance hasta instrucción explícita. Índice: `Agente/documentacion/indice-documentacion-2026-07-29.md`; arquitectura: `Agente/documentacion/arquitectura/manual-arquitectura-wandorius-2026-07-29.md`; identidad: `Agente/documentacion/design-system/manual-identidad-visual-os-2026-07-29.md`. Detalle del roadmap anterior: `Agente/completados/roadmap-historico-2026-10-19.md`.

## Siguiente bloque

- [ ] `297A-17` — **Hardening, identidad, accesibilidad y SEO.**
  Depende de 297A-6–16 y de la revisión CSS anterior; es el bloque habilitado por el plan maestro (`Agente/planes/plan-escritorio-persistente-cuentas-admin-apps-2026-07-29.md`). Hechos el 18-ago: threat review de sesión/CSRF/rate limits, SEO de rutas públicas y accesibilidad base (ver histórico). Pendiente: completar MFA/passkey y recuperación avanzada; auditar SEO restante (sitemap, robots.txt y JSON-LD sin drafts ni rutas privadas); verificar el manual visual en desktop, tablet y móvil (claro/oscuro y tamaños aprobados); verificar foco, live regions, zoom 200%, alto contraste y multimedia accesible en navegador; ejecutar E2E críticos, observabilidad real y el runbook de operación (deploy fuera de alcance, sin SSH).
  Gate/salida: checklist de hardening y accesibilidad evidenciado en navegador, tests y quality gate.

## Pendientes

- [ ] `10AA-2` — **Ciclo Rust F4: target por proyecto, perfil dev reducido, sccache y BD de test aislada (en curso).**
  Commits en `main`: `55c6ab66`, `c20680bc`, `db63fb1b`. Plan del área (fuera de este repo, raíz `area-trabajo`): plan-mejora-flujo-herramientas-2026-10-10.md (F4). `check --tests` rc=0 (2026-10-11). Falta `npm run gate:check -- 10AA-2` con la BD `<nombre>_test` migrada (la última prueba, `glory_backend` sin migrar y anterior a `db63fb1b`, dio 8 fallos `no existe la relación «resources»`/`«auth_sessions»`). Cierre: sin hallazgos nuevos del gate; después la entrada pasa al registro de completadas del área (tareas-2026-10-11.md, fuera de este repo).

- [ ] `11AA-1` — **Vulnerabilidades npm de `frontend` sin parche en rango.**
  `npm audit` (lock sin cambios): 26 hallazgos (25 moderate, 1 high), todos con corrección solo por salto mayor; `npm audit fix` sin `--force` no aplica nada (exit 1 = quedan vulnerabilidades, no error de npm). High `vite <=6.4.2` (declarado `^5.4.0`, instalado 5.4.21) → vite 8.3.4; moderate `esbuild <=0.24.2` (arrastrado por vite 5) → vite 8.3.4; moderate `@tiptap/*` (declarado `^2.6.0`) → `@tiptap/*` 3.31.4. Decidido: no se fuerza ningún salto mayor sin migración probada. Desbloqueo: migración verificable (`npm run build` + editor tiptap y dev server probados) en rama propia; sin `npm audit fix --force`. Lock sin cambios.

- [ ] `11AA-2` — **Alerta Dependabot abierta: `rand`.**
  GitHub (`1ndoryu/wandoriOS`, main): alerta #26, severidad low, paquete `rand`. Sin verificar si es el crate de Cargo o un paquete npm, ni si coincide con 11AA-1. Pendiente: confirmar la versión instalada en el lock; corregir con patch-bump o descartar con motivo (sin saltos mayores sin migración probada). Gate: `sentinel check 11AA-2`.

- [ ] `318A-3` — **Evaluar reactivación de `mixed-barrel-logic`.**
  Seguimiento del cierre de PROYECTO TASKS (plan 318A-3): este proyecto tiene `mixed-barrel-logic` deshabilitada. Acción propuesta (no ejecutada aquí, sin tocar el gate): evaluar su reactivación y, si procede, limpiar los barrels mixtos; requerirá autorización explícita para modificar `sentinel.config.json` de WANDORIUS. (Nota 318A-4 sobre sentinel v0.7.6/v0.7.7: en el histórico.)

- [ ] `138A-16` — **Coordinación entre agentes: auditar MD del área de trabajo y `conducta-global`.**
  Pendiente de investigación (no iniciar ahora): auditar todos los MD del área de trabajo (AGENTS.md de cada proyecto, skill `conducta-global` y demás docs de coordinación) para corregir que los agentes trabajen de forma correcta y coordinada — flujo `sentinel task claim/start/integrate/cleanup/release` con worktree por tarea aplicado de forma consistente, sin pisarse en el checkout compartido (incidente del 14-ago entre 138A-14 y 138A-15 en `roadmap.md`/`Agente/completados/tareas-2026-08-14.md`).
  - Auditar los MD del área de trabajo y `conducta-global`.
  - Definir y automatizar la coordinación entre agentes (worktree + lock por tarea).

- [ ] `018A-66` — **Separar overlay personal de la sesión admin.**
  Depende de 297A-13 y capacidades server-side. Cerrado 18-ago salvo un resto: login/logout/reload con usuario ADMIN en navegador real (requiere credenciales admin, no disponibles en preview; el contrato automatizado `overlay-sync.test.ts`, 8 tests, y la validación no-admin en preview ya están hechos — ver histórico). Gate/salida: admin publica el release global; solo cuentas personales resuelven overlay remoto (verificado: admin nunca llama a la API de overlay).


- [ ] `297A-12` — **Experiencia móvil tipo launcher.**
  Depende de 297A-9/11; tablet conserva el escritorio. Hecho el umbral de presentación (18-ago: launcher móvil solo ≤480px, tablet 481–1023 con escritorio responsive; `getPresentationMode`, matchMedia en main.ts y tests de límites — ver histórico). Pendiente navegador real: E2E visual/táctil en 320/360/390px (el webview del preview no baja de ~900px); validar long press/drag, orientación, safe areas, teclado virtual, foco, scroll y apps críticas; confirmar refresh, transición móvil↔tablet y sincronización de URL sin duplicar el stack. Gate/salida: launcher móvil funciona a los viewports definidos y conserva estado sin crear lógica paralela.

- [ ] `297A-19` — **URLs canónicas, deep links y ventana enfocada.**
  Depende de 297A-9/11/12/13. Hecha la validación de History API y privacidad (18-ago: popstate, refreshRoute sin entrada nueva, marker interno; deep link `/article/:slug` abre/enfoca; state sin IDs internos, tokens, geometría, overlays ni preferencias — ver histórico). Pendiente navegador real: E2E de transición desktop/tablet/móvil con la URL enfocando solo la ventana activa, sesión limpia, deduplicación multi-ventana y refresh en cada modo. Gate/salida: E2E de History API y deep links compartibles sin serializar IDs internos, tokens, posiciones ni overlays.

- [ ] `297A-22` — **Reordenamiento por arrastre con grid.**
  Depende de 297A-12 y overlay. Hecha la validación del arrastre con grid (18-ago: tests de separación de mutaciones `moveMobileNodesPosition`/`moveNodesPosition` y casos de `planMobilePlacement` — ver histórico). Pendiente navegador real: gesto táctil long press→drag en 320/360/390px, drag de escritorio con pointer capture (no simulable con eventos sintéticos), foco/teclado y transición móvil↔tablet con reload/sync; verificar que move prev/next siga siendo alternativa accesible. Gate/salida: orden móvil compacto y persistente, sin contaminar `position` desktop.

- [ ] `297A-21` — **Notificaciones de novedades.**
  Depende de 297A-13 y releases versionados. Hecho el ciclo E2E (18-ago: `tests/notifications.rs`, 3; una release publicada produce UNA notificación idempotente, dedupe anti-spam, lectura aislada por cuenta — ver histórico). Pendiente: E2E de logout/login y dos dispositivos, y admin de novedades con capacidades en navegador real. Gate/salida: una release pública produce una notificación idempotente y la lectura queda aislada por cuenta.

- [ ] `297A-13` — **Registro, Cuenta y overlay remoto.**
  Depende de 297A-9/11/18. Pendiente: E2E real en dos pestañas/dispositivos y decidir/documentar merge semántico para cambios concurrentes no resolubles por local/remoto; completar correo real, UI de verificación/token y habilitación controlada de registro (tokens opacos, expirables y de un solo uso); definir MFA/passkey de Cuenta y rate limit distribuido cuando exista infraestructura autorizada; verificar logout/login, resolución de conflictos, reset, tombstones y corrupción persistida en todos los modos de presentación. Gate/salida: Cuenta, preferencias y overlay sobreviven concurrencia y recargas sin filtrar secretos ni pisar cambios silenciosamente.

- [ ] `297A-14` — **Programas editoriales.**
  Depende de 297A-9/10/11. Plan: `Agente/planes/plan-programas-editoriales-2026-07-31.md`. Hecha la trazabilidad del ciclo editorial (18-ago: `published_at` se limpia al despublicar y se reescribe al republicar; `tests/editorial_cycle.rs` — ver histórico). Pendiente: E2E visual desktop/tablet/móvil del vertical editorial completo (artículos/About, proyectos, productos, media, papelera, publicación, rollback y autosave); cubrir permisos admin, estados draft/private/public, errores de red, teardown de apps lazy y acciones de toolbar (editor requiere admin). Gate/salida: editores reutilizables y programas de contenido funcionan en las tres presentaciones sin carreras ni referencias rotas.

- [ ] `297A-16` — **Analytics, estadísticas y retiro legado.**
  Depende de 297A-9/11–15. Hechos el 18-ago: E2E de consentimiento/anonimización/dedup/purga/stats (`tests/analytics_privacy.rs`), dispatcher tipado conectado al tracker real (apps, ventanas, errores, publicaciones, tema, releases; nunca orderId, user_id, mensajes crudos ni contenido de overlays) y tracking global de errores sanitizado (ver histórico). Pendiente: retiro de CSS/clases legacy (auditado con heurística: 46 candidatas con falsos positivos de modificadores dinámicos; VarSense archivado por decisión del usuario) — revisión visual manual, no borrar a ciegas. Gate/salida: eventos críticos medibles, deduplicados y auditables; el panel no expone datos fuera de capacidad.

- [ ] `297A-24` — **Cierre automático de ventanas.**
  Depende de 297A-19. Hechos el 18-ago: prueba visual desktop y 2 tests nuevos en `route-app-adapter.test.ts` (13 total) — ver histórico. Pendiente móvil: la pila móvil ya tiene test propio (vacía al volver a ruta documental); falta el E2E visual táctil (navegador redimensionable, mismo límite que 297A-9/12). Gate/salida: no hay cierre destructivo por reconciliación de URL; taskbar, foco y ventanas permanecen coherentes.

- [ ] `297A-25` — **Política de carga de apps pesadas.**
  Depende de 297A-9/11/12. ADR: `Agente/documentacion/arquitectura/adr-carga-apps-pesadas-2026-07-31.md`. Hecha la validación de la primera app WebGL (juego `game-playable`, hoy archivado: teardown con test, registro lazy, GPU liberado — ver histórico, 2026-08-06). Pendiente: medir si hace falta `preload`/`heavy` (no activar flags sin una app real, métrica y ADR) — sigue sin activarse; la verificación de Network (chunk no descargado antes de abrir) queda pendiente de sesión de navegador real. Gate/salida: la app pesada se carga lazy, libera recursos al cerrar y no degrada el arranque ni el resto del OS.

- [ ] `297A-29` — **Escalar la app Configuración sin eliminarla.**
  Depende de 297A-27, 297A-28, 297A-13 y 297A-19; las fases de fuentes estáticas, toolbar por capacidad y Perfil admin ya están implementadas. Pendiente Fase 4: decidir si Configuración se convierte en panel de ajustes del sistema o se integra en otra app (conservar registro `settings`, nodo admin, menú y compatibilidad actual mientras se decide). Pendiente Fase 5: diseñar, aprobar y solo entonces implementar un panel escalable; cualquier selector de fuente futuro debe usar tokens, persistencia y una receta compartida, sin reintroducir estado global duplicado. Gate/salida: Configuración sigue funcionando durante la migración y una nueva acción admin se agrega por comando/capacidad, no mediante `if/else` en el shell.

- [ ] `249A-1` — **Rate limit en POST fuera de auth (en gate).**
  9× `ruta-post-sin-rate-limit` (notes, articles restore, notifications ×2, products checkout, settings ×3, workspace ×3; stripe exento HMAC+idempotencia). `src/rate_limit.rs` + `Retry-After`; 429 real 120+5; clippy/fmt limpios; 52/52 tests. Falta solo `gate:check` canónico tras cooldown heavy-guard (~2026-09-25T05:06Z).

- [ ] `249A-2` — **Waiver html en 2 productores (en gate).**
  2× `html-sin-origen-declarado` (article.ts, article-editor-ui.ts + `urlSeguraParaMedia()`). Mismo gate pendiente que 249A-1.

## Bloqueos

- **297A-15 — Comercio con credenciales reales.** Checkout/refund contra Stripe live y webhook firmado en staging requieren intervención humana; la migración de `/uploads` legacy a storage privado queda fuera de alcance. (El mock fail-closed y el E2E ya se cerraron el 18-ago; ver histórico.)
- **Decisiones de producto (2026-08-12).** Registro (297A-13): registro público habilitado con verificación por email (Resend) + token de un solo uso. Conflictos preferencias/overlay (297A-13): merge por campo + LWW por campo en colisión real, con aviso no bloqueante. MFA (297A-13/297A-17): TOTP (códigos de 6 dígitos, RFC 6238); passkey/WebAuthn queda como mejora posterior. Correo transaccional (297A-13): Resend real solo en producción; en local se mockea (token en log/almacén de dev). Configuración (297A-29 Fase 4): la app Configuración se convierte en el panel de control (fondo de pantalla, fuentes y escala con default y restauración; config por usuario con la del admin como default; ajustes de cuenta), abierto a más ideas.

## Planes activos

- `Agente/planes/plan-escritorio-persistente-cuentas-admin-apps-2026-07-29.md` — `297A-4` — plan maestro del OS persistente (cuentas, admin y apps).
- `Agente/planes/plan-experiencia-movil-launcher-2026-07-29.md` — `297A-12` — experiencia móvil tipo launcher.
- `Agente/planes/plan-deep-links-ventanas-2026-07-31.md` — `297A-19` — URLs canónicas, deep links y foco.
- `Agente/planes/plan-programas-editoriales-2026-07-31.md` — `297A-14` — programas editoriales.
- `Agente/planes/plan-contratos-interaccion-comandos-medicion-2026-07-29.md` — `297A-9..16` — contratos de interacción, comandos y medición.
- `Agente/planes/plan-gobernanza-workspace-2026-08-02.md` — `028A-10..15` — gobernanza del workspace (releases y publicación).
- `Agente/planes/plan-iconos-escritorio-grid-2026-08-05.md` — `018A-97` — grid de iconos del escritorio.
- `Agente/planes/plan-modo-oscuro-os-2026-07-31.md` — `297A-17` — modo claro/oscuro del OS.
- `Agente/planes/plan-notificaciones-2026-08-01.md` — `297A-21` — notificaciones de novedades.
- `Agente/planes/plan-persistencia-sesion-ventanas-2026-08-01.md` — `317A-5` — persistencia de sesión de ventanas.
- `Agente/planes/plan-reordenamiento-arrastre-grid-2026-07-31.md` — `297A-22` — reordenamiento por arrastre con grid.
- `Agente/planes/plan-comercio-seguro-2026-08-01.md` — `297A-15` — comercio seguro.
- `Agente/planes/plan-analytics-privacidad-2026-08-01.md` — `297A-16` — analytics privado y consentido.
- `Agente/planes/plan-auth-verificado-2026-08-01.md` — `297A-13` — autenticación verificada (registro y tokens).
- `Agente/planes/plan-barra-acciones-ventanas-2026-08-01.md` — `018A-1` — franja inferior de acciones de ventana.
- `Agente/planes/plan-componentizacion-ui-2026-07-30.md` — `297A-11` — componentización UI (backlog diferido).
