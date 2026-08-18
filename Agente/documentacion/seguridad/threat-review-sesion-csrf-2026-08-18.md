# Threat review — Sesión, CSRF y rate limits (297A-17, 2026-08-18)

Revisión breve de la capa de autenticación, con los controles existentes y los
casos negativos que ya cubren las pruebas. Alcance: sesión, CSRF y rate limits;
MFA TOTP ya está cerrado en 297A-13 y no se repite aquí.

## Sesión

- **Cookie** `session_id`: `HttpOnly`, `SameSite=Lax`, `Max-Age` 168 h (7 días);
  `Secure` añadido cuando no es localhost (`handlers/auth.rs`).
- **Token**: opaco, 32 bytes aleatorios, guardado **solo hasheado** (SHA-256 +
  sufijo del hash CSRF) en `auth_sessions`; nunca se persiste el valor plano.
- **TTL**: `SESSION_DURATION_HOURS = 168`; limpieza de sesiones expiradas al
  arrancar (`SessionService::cleanup_expired`).
- **Casos negativos cubiertos** (tests): sesión inválida/expirada → 401; logout
  expira cookies; lista y revocación de sesiones por cuenta.

## CSRF

- **Doble cookie + header**: la mutación debe enviar `x-csrf-token` que coincida
  con la mitad CSRF del hash almacenado (`verify_csrf` en `middleware/auth.rs`);
  aplica a `AuthUser` y `AdminUser` (todas las mutaciones autenticadas).
- Cookie `csrf_token`: `SameSite=Lax`, `Max-Age` igual a la sesión; `Secure` en
  producción.
- **Casos negativos cubiertos**: mutación sin CSRF → 403; preflight CORS con
  origin permitido; `AdminUser` sin sesión → 401.
- **Frontera conocida**: SameSite=Lax (no Strict) permite el header en
  navegación misma-origen; la doble cookie + verificación server-side del hash
  es la defensa real contra CSRF cross-site, no SameSite.

## Rate limits (por IP, en memoria)

| Acción | Límite | Ventana |
|---|---|---|
| Login | 5 intentos | 60 s |
| Registro / recuperación (auth_action) | 3 intentos | 300 s |

- Devuelven 403 con mensaje de rate limit; `LoginRateLimit` y
  `AuthActionRateLimit` viven en `AppState` (por proceso).
- **Casos negativos cubiertos**: superar el límite → 403; ventana expira y el
  intento vuelve a permitirse.
- **Limitación conocida (documentada, no bloqueante)**: el contador es
  en-memoria y por instancia: con varias réplicas el límite es por proceso, y se
  reinicia al reiniciar el backend. No hay persistencia distribuida (decisión:
  sin deploy todavía; se revisará con producción).

## Otros

- La cookie `guest_game` (identidad temporal de juego) se expira en login/logout;
  el middleware nunca la interpreta como cuenta. El frente de juego quedó
  archivado (2026-08-18), así que esta cookie ya no se emite.
- Sin tokens JWT: la sesión opaca en cookie es la única autoridad
  (`middleware/auth.rs`), documentado en el OpenAPI (`session_cookie`).

## Conclusión

La capa cumple los controles esperados para un producto sin deploy: sesión
opaca hasheada + CSRF de doble cookie + rate limits por IP con casos negativos
testeados. La única deuda real es la distribución del rate limit (en-memoria),
que se retirará en el bloque de producción.
