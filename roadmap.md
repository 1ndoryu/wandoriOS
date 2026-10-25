# Roadmap — WANDORIUS

Blog, portfolio y tienda digital dentro de un OS retro minimalista (Rust/Axum + PostgreSQL + Vanilla TypeScript/Vite); epic 297A-4 — OS persistente, cuentas, programas y comercio. Se edita en el portátil; se compila, prueba y ejecuta en el VPS 89; producción (Coolify) fuera de alcance hasta instrucción explícita. Índice: `Agente/documentacion/indice-documentacion-2026-07-29.md`; arquitectura: `Agente/documentacion/arquitectura/manual-arquitectura-wandorius-2026-07-29.md`; identidad: `Agente/documentacion/design-system/manual-identidad-visual-os-2026-07-29.md`. Detalle del roadmap anterior: `Agente/completados/roadmap-historico-2026-10-19.md`.

## Siguiente bloque

## Pendientes

## Bloqueos

- **297A-15 — Comercio con credenciales reales.** Checkout/refund contra Stripe live y webhook firmado en staging requieren intervención humana; la migración de `/uploads` legacy a storage privado queda fuera de alcance. (El mock fail-closed y el E2E ya se cerraron el 18-ago; ver histórico.)
- **Decisiones de producto (2026-08-12).** Registro (297A-13): registro público habilitado con verificación por email (Resend) + token de un solo uso. Conflictos preferencias/overlay (297A-13): merge por campo + LWW por campo en colisión real, con aviso no bloqueante. MFA (297A-13/297A-17): TOTP (códigos de 6 dígitos, RFC 6238); passkey/WebAuthn queda como mejora posterior. Correo transaccional (297A-13): Resend real solo en producción; en local se mockea (token en log/almacén de dev). Configuración (297A-29 Fase 4): la app Configuración se convierte en el panel de control (fondo de pantalla, fuentes y escala con default y restauración; config por usuario con la del admin como default; ajustes de cuenta), abierto a más ideas.

## Planes activos

Ninguno.
