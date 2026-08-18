use chrono::{DateTime, Duration, Utc};
use rand::Rng;
use serde::Serialize;
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::errors::AppError;

/// Duración de la sesión: 7 días
const SESSION_DURATION_HOURS: i64 = 168;

/// Longitud del token opaco en bytes (32 bytes = 64 hex chars)
const TOKEN_BYTES: usize = 32;

/// Datos de una sesión almacenada
#[derive(Debug, Clone, Serialize, ToSchema, sqlx::FromRow)]
pub struct Session {
    pub id: Uuid,
    pub user_id: Uuid,
    pub expires_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
    pub last_used_at: DateTime<Utc>,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
}

/// Resultado de crear una sesión
pub struct SessionResult {
    /// Token opaco (64 hex chars) — se envía al cliente en cookie
    pub raw_token: String,
    /// Token CSRF — se envía al cliente en cookie separada
    pub csrf_token: String,
    /// Datos de la sesión almacenada
    pub session: Session,
}

pub struct SessionService;

impl SessionService {
    /// Crea una nueva sesión para un usuario.
    /// Retorna el token opaco y el token CSRF.
    pub async fn create(
        pool: &PgPool,
        user_id: Uuid,
        ip_address: Option<&str>,
        user_agent: Option<&str>,
    ) -> Result<SessionResult, AppError> {
        let raw_token = generate_token();
        let csrf_token = generate_token();
        let token_hash = hash_token(&raw_token);
        let csrf_hash = hash_token(&csrf_token);

        let expires_at = Utc::now() + Duration::hours(SESSION_DURATION_HOURS);

        let session = sqlx::query_as::<_, Session>(
            "INSERT INTO auth_sessions (id, user_id, token_hash, expires_at, ip_address, user_agent) \
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5) \
             RETURNING id, user_id, expires_at, created_at, last_used_at, ip_address, user_agent",
        )
        .bind(user_id)
        .bind(format!("{token_hash}:{csrf_hash}"))
        .bind(expires_at)
        .bind(ip_address)
        .bind(user_agent)
        .fetch_one(pool)
        .await
        .map_err(|e| AppError::Internal(format!("Error creando sesión: {e}")))?;

        Ok(SessionResult {
            raw_token,
            csrf_token,
            session,
        })
    }

    /// Valida una sesión por token opaco.
    /// Si es válida, extiende la expiración (sliding window).
    pub async fn validate(pool: &PgPool, raw_token: &str) -> Result<Option<Session>, AppError> {
        let token_hash = hash_token(raw_token);

        let session = sqlx::query_as::<_, Session>(
            "SELECT id, user_id, expires_at, created_at, last_used_at, ip_address, user_agent \
             FROM auth_sessions WHERE token_hash LIKE $1 || '%'",
        )
        .bind(&token_hash)
        .fetch_optional(pool)
        .await
        .map_err(|e| AppError::Internal(format!("Error validando sesión: {e}")))?;

        let Some(session) = session else {
            return Ok(None);
        };

        // Verificar expiración
        if session.expires_at < Utc::now() {
            // Sesión expirada — eliminar
            Self::revoke_by_id(pool, session.id).await?;
            return Ok(None);
        }

        // Extender expiración (sliding window)
        let new_expires = Utc::now() + Duration::hours(SESSION_DURATION_HOURS);
        sqlx::query("UPDATE auth_sessions SET last_used_at = NOW(), expires_at = $1 WHERE id = $2")
            .bind(new_expires)
            .bind(session.id)
            .execute(pool)
            .await
            .map_err(|e| AppError::Internal(format!("Error actualizando sesión: {e}")))?;

        Ok(Some(session))
    }

    /// Valida el token CSRF contra el almacenado en la sesión
    pub async fn validate_csrf(
        pool: &PgPool,
        raw_token: &str,
        csrf_token: &str,
    ) -> Result<bool, AppError> {
        let token_hash = hash_token(raw_token);

        let stored: Option<(String,)> =
            sqlx::query_as("SELECT token_hash FROM auth_sessions WHERE token_hash LIKE $1 || '%'")
                .bind(&token_hash)
                .fetch_optional(pool)
                .await
                .map_err(|e| AppError::Internal(format!("Error validando CSRF: {e}")))?;

        let Some((stored_hash,)) = stored else {
            return Ok(false);
        };

        // stored_hash es "token_hash:csrf_hash"
        let csrf_hash = hash_token(csrf_token);
        Ok(stored_hash.ends_with(&csrf_hash))
    }

    /// Revoca una sesión por ID
    pub async fn revoke_by_id(pool: &PgPool, session_id: Uuid) -> Result<(), AppError> {
        sqlx::query("DELETE FROM auth_sessions WHERE id = $1")
            .bind(session_id)
            .execute(pool)
            .await
            .map_err(|e| AppError::Internal(format!("Error revocando sesión: {e}")))?;
        Ok(())
    }

    /// Revoca una sesión por token opaco
    pub async fn revoke_by_token(pool: &PgPool, raw_token: &str) -> Result<(), AppError> {
        let token_hash = hash_token(raw_token);
        sqlx::query("DELETE FROM auth_sessions WHERE token_hash LIKE $1 || '%'")
            .bind(&token_hash)
            .execute(pool)
            .await
            .map_err(|e| AppError::Internal(format!("Error revocando sesión: {e}")))?;
        Ok(())
    }

    /// Revoca todas las sesiones de un usuario
    pub async fn revoke_all_for_user(pool: &PgPool, user_id: Uuid) -> Result<(), AppError> {
        sqlx::query("DELETE FROM auth_sessions WHERE user_id = $1")
            .bind(user_id)
            .execute(pool)
            .await
            .map_err(|e| AppError::Internal(format!("Error revocando sesiones: {e}")))?;
        Ok(())
    }

    /// Lista las sesiones activas de un usuario (sin exponer tokens)
    pub async fn list_for_user(pool: &PgPool, user_id: Uuid) -> Result<Vec<Session>, AppError> {
        let sessions = sqlx::query_as::<_, Session>(
            "SELECT id, user_id, expires_at, created_at, last_used_at, ip_address, user_agent \
             FROM auth_sessions WHERE user_id = $1 AND expires_at > NOW() \
             ORDER BY last_used_at DESC",
        )
        .bind(user_id)
        .fetch_all(pool)
        .await
        .map_err(|e| AppError::Internal(format!("Error listando sesiones: {e}")))?;

        Ok(sessions)
    }

    /// Limpia sesiones expiradas (llamar periódicamente)
    pub async fn cleanup_expired(pool: &PgPool) -> Result<u64, AppError> {
        let result = sqlx::query("DELETE FROM auth_sessions WHERE expires_at < NOW()")
            .execute(pool)
            .await
            .map_err(|e| AppError::Internal(format!("Error limpiando sesiones: {e}")))?;
        Ok(result.rows_affected())
    }
}

/// Genera un token opaco de 32 bytes (64 hex chars)
fn generate_token() -> String {
    let mut rng = rand::rngs::OsRng;
    let mut bytes = [0u8; TOKEN_BYTES];
    rng.fill(&mut bytes);
    hex::encode(bytes)
}

/// Hashea un token con SHA-256
fn hash_token(token: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    hex::encode(hasher.finalize())
}
