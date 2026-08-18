# Analytics privado y consentido — 2026-08-01

> Estado: fase técnica cerrada; quedan solo auditoría visual/E2E y operación de la política en producción.

## Objetivo

Medir únicamente después de consentimiento explícito, sin IP ni user-agent en claro, con deduplicación existente y una purga administrativa acotada. Analytics no es audit ni autoridad para pagos.

## Checklist

- [x] Consentimiento local `unknown/granted/denied` persistido y banner accesible.
- [x] Tracker no encola ni envía mientras no exista `granted`.
- [x] Backend exige `X-Analytics-Consent: granted` y responde 204 sin almacenar si falta.
- [x] IP y user-agent se guardan como SHA-256; migración elimina user-agent histórico en claro.
- [x] Purga admin validada entre 30 y 730 días y devuelve cantidad/cutoff auditable.
- [x] Stats como app admin con Overview/Content/OS/Commerce/Reliability y exportación JSON.
- [ ] Revisar texto legal/retención con el responsable y confirmar jurisdicción.
- [ ] E2E con consentimiento, logout, bloqueo de red y dos cuentas.

## Gate y salida

- `cargo fmt --check`, `cargo check`, `cargo clippy -- -D warnings`, `npm test`, type-check, suite frontend y `task:check -- 297A-16` deben pasar.
- La salida no promete anonimato irreversible de datos ya publicados sin aplicar la migración; el down no restaura user-agents por diseño.
