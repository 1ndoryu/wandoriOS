use chrono::{DateTime, Utc};
use sqlx::{PgConnection, PgPool};
use uuid::Uuid;

#[derive(Debug, Clone, Copy)]
pub enum AuthTokenPurpose {
    EmailVerification,
    PasswordReset,
    /// [297A-13] Reto de segundo factor: opaco, un solo uso, TTL corto.
    TotpChallenge,
}

impl AuthTokenPurpose {
    fn as_str(self) -> &'static str {
        match self {
            Self::EmailVerification => "email_verification",
            Self::PasswordReset => "password_reset",
            Self::TotpChallenge => "totp_challenge",
        }
    }
}

pub struct AuthTokenRepository;

impl AuthTokenRepository {
    pub async fn create(
        pool: &PgPool,
        user_id: Uuid,
        purpose: AuthTokenPurpose,
        token_hash: &str,
        expires_at: DateTime<Utc>,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            "INSERT INTO auth_action_tokens (user_id, purpose, token_hash, expires_at)
             VALUES ($1, $2, $3, $4)",
        )
        .bind(user_id)
        .bind(purpose.as_str())
        .bind(token_hash)
        .bind(expires_at)
        .execute(pool)
        .await?;
        Ok(())
    }

    pub async fn create_tx(
        tx: &mut PgConnection,
        user_id: Uuid,
        purpose: AuthTokenPurpose,
        token_hash: &str,
        expires_at: DateTime<Utc>,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            "INSERT INTO auth_action_tokens (user_id, purpose, token_hash, expires_at)
             VALUES ($1, $2, $3, $4)",
        )
        .bind(user_id)
        .bind(purpose.as_str())
        .bind(token_hash)
        .bind(expires_at)
        .execute(&mut *tx)
        .await?;
        Ok(())
    }

    /// Consume atomically: a token cannot be replayed or consumed after expiry.
    pub async fn consume(
        pool: &PgPool,
        purpose: AuthTokenPurpose,
        token_hash: &str,
    ) -> Result<Option<Uuid>, sqlx::Error> {
        let user = sqlx::query_as::<_, (Uuid,)>(
            "UPDATE auth_action_tokens SET used_at = NOW()
             WHERE purpose = $1 AND token_hash = $2 AND used_at IS NULL AND expires_at > NOW()
             RETURNING user_id",
        )
        .bind(purpose.as_str())
        .bind(token_hash)
        .fetch_optional(pool)
        .await?;
        Ok(user.map(|row| row.0))
    }
}
