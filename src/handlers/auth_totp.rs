use axum::extract::{ConnectInfo, State};
use axum::http::StatusCode;
use axum::response::Response;
use axum::Json;
use std::net::SocketAddr;
use validator::Validate;

use crate::errors::AppError;
use crate::middleware::AuthUser;
use crate::models::{MfaVerifyRequest, TotpCodeRequest, TotpSetupResponse, TotpStatusResponse};
use crate::repositories::auth_audit_repo::AuthAuditRepository;
use crate::repositories::UserRepository;
use crate::services::AuthService;
use crate::AppState;

use super::auth::{check_auth_action_rate_limit, issue_session};

/// Estado del segundo factor de la cuenta autenticada.
#[utoipa::path(
    get,
    path = "/api/auth/mfa/totp/status",
    responses(
        (status = 200, description = "Estado TOTP", body = TotpStatusResponse),
        (status = 401, description = "No autorizado", body = ErrorResponse)
    ),
    security(("session_cookie" = []))
)]
pub async fn totp_status(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<Json<TotpStatusResponse>, AppError> {
    Ok(Json(
        AuthService::totp_status(&state.pool, auth.user_id).await?,
    ))
}

/// Inicia el alta de TOTP: genera secreto base32 y URI otpauth de un solo uso.
#[utoipa::path(
    post,
    path = "/api/auth/mfa/totp/setup",
    responses(
        (status = 200, description = "Secreto y URI de aprovisionamiento", body = TotpSetupResponse),
        (status = 401, description = "No autorizado", body = ErrorResponse),
        (status = 409, description = "Segundo factor ya activo", body = ErrorResponse)
    ),
    security(("session_cookie" = []))
)]
pub async fn totp_setup(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<Json<TotpSetupResponse>, AppError> {
    let user = UserRepository::find_by_id(&state.pool, auth.user_id)
        .await?
        .ok_or(AppError::Unauthorized)?;
    Ok(Json(
        AuthService::begin_totp_setup(&state.pool, auth.user_id, &user.email).await?,
    ))
}

/// Confirma el alta verificando un código TOTP y activa el segundo factor.
#[utoipa::path(
    post,
    path = "/api/auth/mfa/totp/confirm",
    request_body = TotpCodeRequest,
    responses(
        (status = 204, description = "Segundo factor activado"),
        (status = 401, description = "No autorizado", body = ErrorResponse),
        (status = 400, description = "Código inválido", body = ErrorResponse)
    ),
    security(("session_cookie" = []))
)]
pub async fn totp_confirm(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(req): Json<TotpCodeRequest>,
) -> Result<StatusCode, AppError> {
    req.validate()
        .map_err(|e| AppError::Validation(e.to_string()))?;
    AuthService::confirm_totp(&state.pool, auth.user_id, &req.code).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Desactiva TOTP verificando un código válido (confirmación de propiedad).
#[utoipa::path(
    post,
    path = "/api/auth/mfa/totp/disable",
    request_body = TotpCodeRequest,
    responses(
        (status = 204, description = "Segundo factor desactivado"),
        (status = 401, description = "No autorizado", body = ErrorResponse),
        (status = 400, description = "Código inválido", body = ErrorResponse)
    ),
    security(("session_cookie" = []))
)]
pub async fn totp_disable(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(req): Json<TotpCodeRequest>,
) -> Result<StatusCode, AppError> {
    req.validate()
        .map_err(|e| AppError::Validation(e.to_string()))?;
    AuthService::disable_totp(&state.pool, auth.user_id, &req.code).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Verifica el reto de segundo factor y emite la sesión (login de dos pasos).
#[utoipa::path(
    post,
    path = "/api/auth/mfa/totp/verify",
    request_body = MfaVerifyRequest,
    responses(
        (status = 204, description = "Login completado; la sesión viaja en cookie"),
        (status = 400, description = "Reto o código inválido", body = ErrorResponse),
        (status = 403, description = "Rate limit", body = ErrorResponse)
    )
)]
pub async fn mfa_verify(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Json(req): Json<MfaVerifyRequest>,
) -> Result<Response, AppError> {
    let ip = addr.ip().to_string();
    check_auth_action_rate_limit(&state.auth_action_rate_limit, "mfa-verify", &ip)?;
    req.validate()
        .map_err(|e| AppError::Validation(e.to_string()))?;

    let result = AuthService::verify_totp_challenge(&state.pool, &req.challenge, &req.code).await;
    match result {
        Ok(user_id) => {
            AuthAuditRepository::record(&state.pool, Some(user_id), "mfa_verify", &ip, true)
                .await?;
            issue_session(&state, user_id, &ip).await
        }
        Err(error) => {
            AuthAuditRepository::record(&state.pool, None, "mfa_verify", &ip, false).await?;
            Err(error)
        }
    }
}
