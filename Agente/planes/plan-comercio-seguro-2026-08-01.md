# Plan de comercio seguro — 2026-08-01

Estado: backend y primera superficie OS completados; worker local de outbox implementado; quedan proveedor real, reembolsos y E2E.

## Alcance

El navegador solo inicia un checkout. PostgreSQL y el webhook son la autoridad para pago, versión adquirida, entitlement y descarga. Los enlaces son opacos, temporales y nunca exponen rutas internas.

## Fase 1 — Idempotencia y modelo de entrega

- [x] Añadir `orders.idempotency_key`, usuario opcional y versión adquirida.
- [x] Crear índice único parcial por cliente + clave para reintentos seguros.
- [x] Aceptar la clave en body/header y enviarla también a Stripe.
- [x] Mantener compatibilidad con órdenes legacy sin clave.
- [x] Validar email, longitud de lote y tamaño de clave en el boundary.

Gate: `cargo check`, tests Rust y type-check frontend pasan; una misma clave no crea una segunda orden.

## Fase 2 — Webhook y grants

- [x] Registrar eventos Stripe por `provider_event_id` y hacer el procesamiento repetible.
- [x] Crear entitlement por orden, asociando la última versión inmutable del producto.
- [x] Generar token aleatorio; persistir solo su SHA-256.
- [x] Añadir endpoint `/api/downloads/:token` con expiración, revocación y path traversal fail-closed.
- [x] Emitir evento outbox deduplicado para la creación del grant.
- [x] Enviar al comprador el enlace privado y marcar la orden entregada solo después de éxito.

Gate: tests de firma/evento duplicado/grant y descarga con archivo válido, expirado, revocado y ruta inválida.

## Fase 3 — Superficie OS (completada en alcance mínimo)

- [x] Registrar `Tienda`, `Pedidos` y `Descargas` en AppRegistry con las mismas rutas en desktop/tablet/móvil.
- [x] Añadir catálogo público SQL que solo devuelve productos `active + public + is_active`.
- [x] Separar la respuesta pública/admin del modelo interno del producto; `download_path` e IDs Stripe solo viven en services/repositories/webhook.
- [x] Mostrar checkout dentro de la app Tienda: validación de email, clave de idempotencia delegada al servicio y redirección solo a la URL de Stripe devuelta por backend.
- [x] Dejar estados vacíos explícitos para Pedidos/Descargas hasta que exista endpoint de historial por cuenta y grants consultables.
- [x] Añadir los programas al release público existente con migración no destructiva y posiciones publicables.

Gate: type-check, suite Rust/frontend y quality gate pasan; ningún producto privado aparece en Tienda.

## Fase 4 — Pendiente con intervención humana

- [x] Worker/outbox ejecutable una vez (`--process-commerce-outbox`): claim con `SKIP LOCKED`, backoff 30s–32m, rotación explícita del hash del grant y `processed_at` solo tras correo + orden entregada. *(018A-42; el scheduler/cron de producción queda fuera de alcance)*
- [ ] Integrar Resend/Stripe en entorno de staging con secretos reales y webhook firmado.
- [ ] Historial server-side de Pedidos/Descargas por cuenta y panel de estado de entrega.
- [ ] Reembolso, chargeback, revocación manual y política de retención de grants.
- [ ] Migrar archivos legacy de `/uploads` a storage privado y retirar el servicio estático público.

## Definition of Done

- No se concede acceso desde el cliente.
- Reintentos del proveedor no duplican órdenes, grants ni correos exitosos.
- Descarga privada verifica estado, expiración y confinamiento al storage.
- Las tareas humanas permanecen explícitas hasta disponer de credenciales, UI y pruebas E2E.

## Evidencia

- `npm test`: 28 tests Rust PASS.
- `cargo check` y `npx tsc --noEmit`: PASS.
- `npm --prefix frontend run test:full`: 382 tests en 49 suites PASS.
