use axum::async_trait;
use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use axum::http::Method;
use uuid::Uuid;

use crate::errors::AppError;
use crate::models::user::UserRole;
use crate::repositories::UserRepository;
use crate::services::SessionService;
use crate::AppState;

/// Nombre de la cookie de sesión
const SESSION_COOKIE: &str = "session_id";
/// Nombre de la cookie CSRF
const CSRF_COOKIE: &str = "csrf_token";

/// Extractor que valida la sesión opaca `HttpOnly` y extrae el `user_id`.
/// [018A-18] La cookie es la única autoridad; no se aceptan tokens Bearer.
pub struct AuthUser {
    pub user_id: Uuid,
}

#[async_trait]
impl FromRequestParts<AppState> for AuthUser {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let user_id = resolve_user_id(parts, state).await?;

        /* [297A-8] CSRF check para mutaciones vía cookie de sesión */
        if is_mutation(&parts.method) && has_session_cookie(parts) {
            verify_csrf(parts)?;
        }

        Ok(Self { user_id })
    }
}

/// Extractor opcional para endpoints que aceptan cuenta o identidad temporal.
/// Nunca interpreta `guest_game` como una cuenta; solo resuelve `session_id`.
pub struct OptionalAuthUser {
    pub user_id: Option<Uuid>,
}

#[async_trait]
impl FromRequestParts<AppState> for OptionalAuthUser {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let has_session = has_session_cookie(parts);
        let user_id = resolve_optional_user_id(parts, state).await?;
        if has_session && user_id.is_none() {
            return Err(AppError::Unauthorized);
        }
        if is_mutation(&parts.method) && has_session {
            verify_csrf(parts)?;
        }
        Ok(Self { user_id })
    }
}

/// Extractor que valida sesión Y verifica que el usuario sea admin.
pub struct AdminUser {
    pub user_id: Uuid,
}

#[async_trait]
impl FromRequestParts<AppState> for AdminUser {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let user_id = resolve_user_id(parts, state).await?;

        /* [297A-8] CSRF check para mutaciones vía cookie de sesión */
        if is_mutation(&parts.method) && has_session_cookie(parts) {
            verify_csrf(parts)?;
        }

        /* Verificar que el usuario existe, está activo y es admin */
        let user = UserRepository::find_by_id(&state.pool, user_id)
            .await
            .map_err(|e| AppError::Internal(format!("Error verificando usuario: {e}")))?
            .ok_or(AppError::Unauthorized)?;

        if user.role != UserRole::Admin {
            return Err(AppError::Forbidden("Se requiere rol administrador".into()));
        }

        Ok(Self { user_id })
    }
}

/// Resuelve el `user_id` únicamente desde la cookie de sesión opaca.
async fn resolve_user_id(parts: &Parts, state: &AppState) -> Result<Uuid, AppError> {
    resolve_optional_user_id(parts, state)
        .await?
        .ok_or(AppError::Unauthorized)
}

/// Resuelve una sesión válida sin interpretar cookies de juego como cuentas.
pub(crate) async fn resolve_optional_user_id(
    parts: &Parts,
    state: &AppState,
) -> Result<Option<Uuid>, AppError> {
    let Some(raw_token) = extract_cookie(parts, SESSION_COOKIE) else {
        return Ok(None);
    };
    let Some(session) = SessionService::validate(&state.pool, raw_token)
        .await
        .map_err(|e| AppError::Internal(format!("Error validando sesión: {e}")))?
    else {
        return Ok(None);
    };
    let active_user = UserRepository::find_by_id(&state.pool, session.user_id)
        .await
        .map_err(|e| AppError::Internal(format!("Error verificando usuario: {e}")))?;
    Ok(active_user.map(|_| session.user_id))
}

/// Verifica el token CSRF: compara cookie `csrf_token` con header `X-CSRF-Token`
fn verify_csrf(parts: &Parts) -> Result<(), AppError> {
    let csrf_cookie = extract_cookie(parts, CSRF_COOKIE)
        .ok_or_else(|| AppError::Forbidden("CSRF token missing from cookie".into()))?;

    let csrf_header = parts
        .headers
        .get("X-CSRF-Token")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| AppError::Forbidden("CSRF token missing from header".into()))?;

    if csrf_cookie != csrf_header {
        return Err(AppError::Forbidden("CSRF token mismatch".into()));
    }

    Ok(())
}

/// Extrae una cookie por nombre del header Cookie
fn extract_cookie<'a>(parts: &'a Parts, name: &str) -> Option<&'a str> {
    let cookie_header = parts.headers.get("cookie")?.to_str().ok()?;
    for pair in cookie_header.split(';') {
        let pair = pair.trim();
        if let Some(value) = pair.strip_prefix(name).and_then(|s| s.strip_prefix('=')) {
            return Some(value);
        }
    }
    None
}

/// Determina si el método HTTP es una mutación
fn is_mutation(method: &Method) -> bool {
    matches!(
        *method,
        Method::POST | Method::PUT | Method::PATCH | Method::DELETE
    )
}

/// Verifica si existe cookie de sesión
fn has_session_cookie(parts: &Parts) -> bool {
    extract_cookie(parts, SESSION_COOKIE).is_some()
}
