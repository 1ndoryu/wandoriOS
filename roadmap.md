# Roadmap — WANDORIUS

Blog, portfolio y tienda digital dentro de un OS retro minimalista (Rust/Axum + PostgreSQL + Vanilla TypeScript/Vite); epic 297A-4 — OS persistente, cuentas, programas y comercio. Se edita en el portátil; se compila, prueba y ejecuta en el VPS 89; producción (Coolify) fuera de alcance hasta instrucción explícita. Índice: `Agente/documentacion/indice-documentacion-2026-07-29.md`; arquitectura: `Agente/documentacion/arquitectura/manual-arquitectura-wandorius-2026-07-29.md`; identidad: `Agente/documentacion/design-system/manual-identidad-visual-os-2026-07-29.md`. Detalle del roadmap anterior: `Agente/completados/roadmap-historico-2026-10-19.md`.

## Siguiente bloque

## Pendientes

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
