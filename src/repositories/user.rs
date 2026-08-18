use sqlx::PgPool;
use uuid::Uuid;

use crate::models::User;

pub struct UserRepository;

impl UserRepository {
    pub async fn create_unverified(
        conn: &mut sqlx::PgConnection,
        email: &str,
        password_hash: &str,
    ) -> Result<User, sqlx::Error> {
        sqlx::query_as::<_, User>(
            "INSERT INTO users (id, email, password_hash, email_verified_at)
             VALUES (gen_random_uuid(), $1, $2, NULL)
             RETURNING id, email, password_hash, role, status, created_at",
        )
        .bind(email)
        .bind(password_hash)
        .fetch_one(&mut *conn)
        .await
    }

    /// Crea un usuario con rol 'user' y estado 'active'.
    /// El rol NUNCA se acepta del request — siempre se asigna server-side.
    pub async fn create(
        pool: &PgPool,
        email: &str,
        password_hash: &str,
    ) -> Result<User, sqlx::Error> {
        let id = Uuid::new_v4();
        sqlx::query_as::<_, User>(
            "INSERT INTO users (id, email, password_hash, email_verified_at) \
             VALUES ($1, $2, $3, NOW()) \
             RETURNING id, email, password_hash, role, status, created_at",
        )
        .bind(id)
        .bind(email)
        .bind(password_hash)
        .fetch_one(pool)
        .await
    }

    /// Busca un usuario por email (solo activos)
    pub async fn find_by_email(pool: &PgPool, email: &str) -> Result<Option<User>, sqlx::Error> {
        sqlx::query_as::<_, User>(
            "SELECT id, email, password_hash, role, status, created_at \
             FROM users WHERE email = $1 AND status = 'active'",
        )
        .bind(email)
        .fetch_optional(pool)
        .await
    }

    /// Busca un usuario por ID (solo activos)
    pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<User>, sqlx::Error> {
        sqlx::query_as::<_, User>(
            "SELECT id, email, password_hash, role, status, created_at \
             FROM users WHERE id = $1 AND status = 'active'",
        )
        .bind(id)
        .fetch_optional(pool)
        .await
    }

    pub async fn is_email_verified(pool: &PgPool, id: Uuid) -> Result<bool, sqlx::Error> {
        let row: Option<(Option<chrono::DateTime<chrono::Utc>>,)> = sqlx::query_as(
            "SELECT email_verified_at FROM users WHERE id = $1 AND status = 'active'",
        )
        .bind(id)
        .fetch_optional(pool)
        .await?;
        Ok(row.and_then(|value| value.0).is_some())
    }

    pub async fn mark_email_verified(pool: &PgPool, id: Uuid) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE users SET email_verified_at = COALESCE(email_verified_at, NOW())
             WHERE id = $1 AND status = 'active'",
        )
        .bind(id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    pub async fn update_password(
        pool: &PgPool,
        id: Uuid,
        password_hash: &str,
    ) -> Result<bool, sqlx::Error> {
        let result =
            sqlx::query("UPDATE users SET password_hash = $2 WHERE id = $1 AND status = 'active'")
                .bind(id)
                .bind(password_hash)
                .execute(pool)
                .await?;
        Ok(result.rows_affected() > 0)
    }

    /* [297A-13] MFA TOTP: el secreto nunca se expone en respuestas públicas;
     * solo viaja en el setup de un solo uso y en la URI de aprovisionamiento. */

    pub async fn totp_state(
        pool: &PgPool,
        id: Uuid,
    ) -> Result<Option<TotpState>, sqlx::Error> {
        let row: Option<(Option<String>, bool)> = sqlx::query_as(
            "SELECT totp_secret, totp_enabled FROM users WHERE id = $1 AND status = 'active'",
        )
        .bind(id)
        .fetch_optional(pool)
        .await?;
        Ok(row.map(|(secret, enabled)| TotpState { secret, enabled }))
    }

    pub async fn is_totp_enabled(pool: &PgPool, id: Uuid) -> Result<bool, sqlx::Error> {
        Ok(Self::totp_state(pool, id)
            .await?
            .is_some_and(|state| state.enabled))
    }

    /// Guarda un secreto nuevo; fail-closed si el segundo factor ya está activo.
    pub async fn set_totp_secret(
        pool: &PgPool,
        id: Uuid,
        secret: &str,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE users SET totp_secret = $2, totp_confirmed_at = NULL, totp_enabled = FALSE
             WHERE id = $1 AND status = 'active' AND totp_enabled = FALSE",
        )
        .bind(id)
        .bind(secret)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Activa el segundo factor solo si hay secreto confirmado por un código.
    pub async fn enable_totp(pool: &PgPool, id: Uuid) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE users SET totp_enabled = TRUE, totp_confirmed_at = NOW()
             WHERE id = $1 AND status = 'active' AND totp_secret IS NOT NULL
               AND totp_enabled = FALSE",
        )
        .bind(id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    pub async fn disable_totp(pool: &PgPool, id: Uuid) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE users SET totp_enabled = FALSE, totp_confirmed_at = NULL
             WHERE id = $1 AND status = 'active'",
        )
        .bind(id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }
}

/// Estado TOTP de un usuario (secreto + flag habilitado).
#[derive(Debug, Clone)]
pub struct TotpState {
    pub secret: Option<String>,
    pub enabled: bool,
}
