// sentinel-disable-file sqlx-query-sin-macro sqlx-query-as-sin-macro
// [por que] sqlx 0.8 sin feature "macros" y sin DB en compile-time (sin
// .sqlx cache ni DATABASE_URL de build): convertir a query!/query_as!
// romperia el build. Restriccion documentada en PLAN-corregir-1408.md §5.
/* wandori.us — Auditoría de autenticación
 * Solo conserva tipo, resultado, usuario opcional y hash de IP; nunca email,
 * contraseña, sesión ni token. [297A-13] */

use sha2::{Digest, Sha256};
use sqlx::PgPool;
use uuid::Uuid;

pub struct AuthAuditRepository;

impl AuthAuditRepository {
    pub async fn record(
        pool: &PgPool,
        user_id: Option<Uuid>,
        event_type: &str,
        ip: &str,
        succeeded: bool,
    ) -> Result<(), sqlx::Error> {
        let ip_hash = hex::encode(Sha256::digest(ip.as_bytes()));
        sqlx::query(
            "INSERT INTO auth_audit_events (user_id, event_type, ip_hash, succeeded) \
             VALUES ($1, $2, $3, $4)",
        )
        .bind(user_id)
        .bind(event_type)
        .bind(ip_hash)
        .bind(succeeded)
        .execute(pool)
        .await?;
        Ok(())
    }
}
