# Plan de autenticación verificada — 2026-08-01

> Estado: backend implementado detrás de `registration_enabled=false`; UI de registro/verificación, proveedor de correo real, MFA y E2E quedan pendientes.

## Fase 1 — Tokens y persistencia (completada)

- [x] Añadir `users.email_verified_at` y marcar cuentas existentes como verificadas.
- [x] Crear `auth_action_tokens` con propósito, hash SHA-256, expiración, uso único e índices.
- [x] Registrar usuario pendiente y token de verificación dentro de una transacción.
- [x] Consumir tokens mediante `UPDATE ... RETURNING` atómico; nunca almacenar el token crudo.

## Fase 2 — Contratos de cuenta (completada)

- [x] Registro protegido por feature flag y respuesta genérica de verificación.
- [x] Verificación de correo antes de permitir login de cuentas nuevas.
- [x] Solicitud de recuperación no enumerable y token de una hora.
- [x] Cambio de contraseña invalida el token y revoca todas las sesiones.
- [x] Servicio frontend preparado para registro, verificación y recuperación.

## Fase 3 — Operación parcial

- [x] UI dentro de Cuenta para registro y solicitud de recuperación; mantiene mensajes no enumerables y respeta `registration_enabled=false`.
- [ ] UI de consumo de tokens para verificación y cambio de contraseña; requiere definir el enlace de correo y su tratamiento de URL sin filtrar secretos.
- [ ] Resend real con Resend/SMTP, secretos de staging y reintentos observables.
- [x] Rate limit específico de registro/reset por IP (3 intentos/5 min) y bucket separado del login; auditoría hash de acciones sensibles queda operativa y el rate limit distribuido permanece pendiente.
- [ ] MFA/passkey, E2E de expiración/replay y pruebas de dos dispositivos.

**Gate de la fase autónoma:** `cargo check`, clippy, 30 tests Rust, type-check frontend y `task:check` pasan; el flag permanece apagado hasta tener correo y UI.

**Definition of Done:** ninguna cuenta nueva puede iniciar sesión sin verificación, ningún token se persiste en claro y recuperar contraseña revoca sesiones anteriores.
