use axum::extract::{ConnectInfo, State};
use axum::http::header::SET_COOKIE;
use axum::http::{HeaderMap, StatusCode};
use axum::routing::{delete, get, post};
use axum::{Json, Router};
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Mutex;
use std::time::Instant;
use uuid::Uuid;
use validator::Validate;

use argon2::PasswordVerifier;

use crate::errors::AppError;
use crate::middleware::AuthUser;
use crate::models::user::UserResponse;
use crate::models::{
    ConfirmPasswordResetRequest, LoginRequest, PasswordResetRequest, RegisterRequest,
    RegistrationResponse, VerifyEmailRequest,
};
use crate::repositories::auth_audit_repo::AuthAuditRepository;
use crate::repositories::UserRepository;
use crate::services::session::Session;
use crate::services::{AuthService, SessionService};
use crate::AppState;

/// [297A-8] Rate limit: máximo 5 intentos de login por IP por minuto
const MAX_LOGIN_ATTEMPTS: u8 = 5;
const RATE_LIMIT_WINDOW_SECS: u64 = 60;
const MAX_AUTH_ACTION_ATTEMPTS: u8 = 3;
const AUTH_ACTION_WINDOW_SECS: u64 = 300;

/// Almacén de rate limit por IP (en memoria)
pub type LoginRateLimit = Mutex<HashMap<String, (u8, Instant)>>;
pub type AuthActionRateLimit = Mutex<HashMap<String, (u8, Instant)>>;

/// Verifica rate limit para una IP. Retorna Ok(()) si permitido, Err si bloqueado.
fn check_rate_limit(
    rate_limit: &AuthActionRateLimit,
    key: &str,
    max_attempts: u8,
    window_secs: u64,
    message: &'static str,
) -> Result<(), AppError> {
    let mut map = rate_limit
        .lock()
        .map_err(|e| AppError::Internal(format!("Error verificando rate limit: {e}")))?;

    let now = Instant::now();

    // Limpiar entradas expiradas
    map.retain(|_, (_, instant)| now.duration_since(*instant).as_secs() < window_secs);

    if let Some((count, first)) = map.get_mut(key) {
        if now.duration_since(*first).as_secs() >= window_secs {
            /* Ventana expirada — resetear */
            map.insert(key.to_string(), (1, now));
            Ok(())
        } else if *count >= max_attempts {
            Err(AppError::Forbidden(message.into()))
        } else {
            *count += 1;
            Ok(())
        }
    } else {
        map.insert(key.to_string(), (1, now));
        Ok(())
    }
}

fn check_login_rate_limit(rate_limit: &LoginRateLimit, ip: &str) -> Result<(), AppError> {
    check_rate_limit(
        rate_limit,
        ip,
        MAX_LOGIN_ATTEMPTS,
        RATE_LIMIT_WINDOW_SECS,
        "Demasiados intentos de login. Intenta de nuevo en un minuto.",
    )
}

pub(crate) fn check_auth_action_rate_limit(
    rate_limit: &AuthActionRateLimit,
    action: &str,
    ip: &str,
) -> Result<(), AppError> {
    let key = format!("{action}:{ip}");
    check_rate_limit(
        rate_limit,
        &key,
        MAX_AUTH_ACTION_ATTEMPTS,
        AUTH_ACTION_WINDOW_SECS,
        "Demasiadas solicitudes. Intenta de nuevo más tarde.",
    )
}

async fn record_auth_audit(
    state: &AppState,
    user_id: Option<Uuid>,
    event_type: &str,
    ip: &str,
    succeeded: bool,
) -> Result<(), AppError> {
    AuthAuditRepository::record(&state.pool, user_id, event_type, ip, succeeded).await?;
    Ok(())
}

/// Registrar nuevo usuario
/// [297A-7] Registro público deshabilitado por defecto.
/// Solo se permite cuando `registration_enabled = 'true'` en `site_settings`.
#[utoipa::path(
    post,
    path = "/api/auth/register",
    request_body = RegisterRequest,
    responses(
        (status = 202, description = "Verificación requerida", body = RegistrationResponse),
        (status = 403, description = "Registro deshabilitado", body = ErrorResponse),
        (status = 409, description = "Email ya registrado", body = ErrorResponse),
        (status = 422, description = "Error de validación", body = ErrorResponse)
    )
)]
pub async fn register(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Json(req): Json<RegisterRequest>,
) -> Result<(StatusCode, Json<RegistrationResponse>), AppError> {
    let ip = addr.ip().to_string();
    check_auth_action_rate_limit(&state.auth_action_rate_limit, "register", &ip)?;
    req.validate()
        .map_err(|e| AppError::Validation(e.to_string()))?;

    /* Verificar feature flag de registro */
    let settings = crate::repositories::settings_repo::SettingsRepository::get_all(&state.pool)
        .await
        .map_err(|e| AppError::Internal(format!("Error verificando registro: {e}")))?;
    let registration_enabled = settings
        .get("registration_enabled")
        .is_some_and(|v| v == "true");

    if !registration_enabled {
        record_auth_audit(&state, None, "register", &ip, false).await?;
        return Err(AppError::Forbidden(
            "El registro público está deshabilitado".into(),
        ));
    }

    let email = req.email.clone();
    let (user_id, token) = match AuthService::register_verified(&state.pool, &req).await {
        Ok(result) => result,
        Err(error) => {
            record_auth_audit(&state, None, "register", &ip, false).await?;
            return Err(error);
        }
    };
    record_auth_audit(&state, Some(user_id), "register", &ip, true).await?;
    if let Some(api_key) = state.resend_api_key.as_deref() {
        let link = format!("{}/verify-email?token={token}", state.site_url);
        crate::services::email::EmailService::send_account_link(
            api_key,
            &state.email_from,
            &email,
            "verifica tu cuenta",
            "verifica tu correo",
            &link,
        )
        .await?;
    } else {
        tracing::warn!("Registro creado sin proveedor de correo configurado");
    }
    Ok((
        StatusCode::ACCEPTED,
        Json(RegistrationResponse {
            message: "Revisa tu correo para verificar la cuenta".into(),
        }),
    ))
}

#[utoipa::path(
    post,
    path = "/api/auth/verify-email",
    request_body = VerifyEmailRequest,
    responses((status = 200, body = RegistrationResponse), (status = 400, body = ErrorResponse))
)]
pub async fn verify_email(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Json(req): Json<VerifyEmailRequest>,
) -> Result<Json<RegistrationResponse>, AppError> {
    let ip = addr.ip().to_string();
    req.validate()
        .map_err(|e| AppError::Validation(e.to_string()))?;
    let result = AuthService::verify_email(&state.pool, &req.token).await;
    record_auth_audit(&state, None, "verify_email", &ip, result.is_ok()).await?;
    result?;
    Ok(Json(RegistrationResponse {
        message: "Cuenta verificada. Ya puedes iniciar sesión".into(),
    }))
}

#[utoipa::path(
    post,
    path = "/api/auth/password-reset",
    request_body = PasswordResetRequest,
    responses((status = 202, body = RegistrationResponse))
)]
pub async fn request_password_reset(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Json(req): Json<PasswordResetRequest>,
) -> Result<(StatusCode, Json<RegistrationResponse>), AppError> {
    let ip = addr.ip().to_string();
    check_auth_action_rate_limit(&state.auth_action_rate_limit, "password-reset", &ip)?;
    req.validate()
        .map_err(|e| AppError::Validation(e.to_string()))?;
    let token = match AuthService::issue_password_reset(&state.pool, &req.email).await {
        Ok(token) => {
            record_auth_audit(&state, None, "password_reset_request", &ip, true).await?;
            token
        }
        Err(error) => {
            record_auth_audit(&state, None, "password_reset_request", &ip, false).await?;
            return Err(error);
        }
    };
    if let Some(token) = token {
        if let Some(api_key) = state.resend_api_key.as_deref() {
            let link = format!("{}/reset-password?token={token}", state.site_url);
            crate::services::email::EmailService::send_account_link(
                api_key,
                &state.email_from,
                &req.email,
                "restablece tu contraseña",
                "restablecer contraseña",
                &link,
            )
            .await?;
        }
    }
    Ok((
        StatusCode::ACCEPTED,
        Json(RegistrationResponse {
            message: "Si la cuenta existe, recibirás instrucciones por correo".into(),
        }),
    ))
}

#[utoipa::path(
    post,
    path = "/api/auth/password-reset/confirm",
    request_body = ConfirmPasswordResetRequest,
    responses((status = 204), (status = 400, body = ErrorResponse))
)]
pub async fn reset_password(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Json(req): Json<ConfirmPasswordResetRequest>,
) -> Result<StatusCode, AppError> {
    let ip = addr.ip().to_string();
    check_auth_action_rate_limit(&state.auth_action_rate_limit, "password-reset-confirm", &ip)?;
    req.validate()
        .map_err(|e| AppError::Validation(e.to_string()))?;
    let result = AuthService::reset_password(&state.pool, &req.token, &req.password).await;
    record_auth_audit(&state, None, "password_reset_confirm", &ip, result.is_ok()).await?;
    result?;
    Ok(StatusCode::NO_CONTENT)
}

/// Iniciar sesión — [297A-8] crea sesión opaca en cookie `HttpOnly`
/* [018A-63] El contrato declara 204 (no 200): la sesión viaja en Set-Cookie sin
 * cuerpo, igual que logout/resetPassword. Antes el cliente esperaba 200 y
 * mostraba "credenciales incorrectas" pese al login exitoso. */
#[utoipa::path(
    post,
    path = "/api/auth/login",
    request_body = LoginRequest,
    responses(
        (status = 204, description = "Login exitoso; la sesión viaja en cookie Set-Cookie"),
        (status = 401, description = "Credenciales inválidas", body = ErrorResponse),
        (status = 403, description = "Rate limit", body = ErrorResponse)
    )
)]
pub async fn login(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Json(req): Json<LoginRequest>,
) -> Result<(HeaderMap, StatusCode), AppError> {
    req.validate()
        .map_err(|e| AppError::Validation(e.to_string()))?;

    /* [297A-8] Rate limit por IP */
    let ip = addr.ip().to_string();
    check_login_rate_limit(&state.login_rate_limit, &ip)?;

    /* Verificar credenciales */
    let Some(user) = UserRepository::find_by_email(&state.pool, &req.email)
        .await
        .map_err(|e| AppError::Internal(format!("Error buscando usuario: {e}")))?
    else {
        crate::repositories::auth_audit_repo::AuthAuditRepository::record(
            &state.pool,
            None,
            "login_failed",
            &ip,
            false,
        )
        .await?;
        return Err(AppError::Unauthorized);
    };

    let parsed_hash = argon2::PasswordHash::new(&user.password_hash)
        .map_err(|e| AppError::Internal(format!("Hash almacenado inválido: {e}")))?;

    if argon2::Argon2::default()
        .verify_password(req.password.as_bytes(), &parsed_hash)
        .is_err()
    {
        crate::repositories::auth_audit_repo::AuthAuditRepository::record(
            &state.pool,
            Some(user.id),
            "login_failed",
            &ip,
            false,
        )
        .await?;
        return Err(AppError::Unauthorized);
    }

    if !UserRepository::is_email_verified(&state.pool, user.id).await? {
        return Err(AppError::Forbidden(
            "Debes verificar tu correo antes de iniciar sesión".into(),
        ));
    }

    /* [297A-8] Crear sesión opaca */
    let session_result = SessionService::create(&state.pool, user.id, Some(&ip), None).await?;
    crate::repositories::auth_audit_repo::AuthAuditRepository::record(
        &state.pool,
        Some(user.id),
        "login_succeeded",
        &ip,
        true,
    )
    .await?;

    /* Construir cookies */
    let mut headers = HeaderMap::new();

    // Cookie de sesión: HttpOnly, Secure en producción, SameSite=Lax
    let session_cookie = format!(
        "session_id={}; Path=/; HttpOnly; SameSite=Lax; Max-Age={}",
        session_result.raw_token,
        7 * 24 * 60 * 60, // 7 días
    );
    // En producción añadir Secure
    let session_cookie = if state.site_url.starts_with("https") {
        format!("{session_cookie}; Secure")
    } else {
        session_cookie
    };
    headers.append(
        SET_COOKIE,
        session_cookie
            .parse()
            .map_err(|e| AppError::Internal(format!("Error construyendo cookie de sesión: {e}")))?,
    );

    // Cookie CSRF: NO HttpOnly (el frontend necesita leerla), SameSite=Lax
    let csrf_cookie = format!(
        "csrf_token={}; Path=/; SameSite=Lax; Max-Age={}",
        session_result.csrf_token,
        7 * 24 * 60 * 60,
    );
    let csrf_cookie = if state.site_url.starts_with("https") {
        format!("{csrf_cookie}; Secure")
    } else {
        csrf_cookie
    };
    headers.append(
        SET_COOKIE,
        csrf_cookie
            .parse()
            .map_err(|e| AppError::Internal(format!("Error construyendo cookie CSRF: {e}")))?,
    );

    /* [297A-76] Reclamación invitado→cuenta: al autenticarse, la identidad
     * temporal de juego deja de aplicarse. Se expira la cookie `guest_game`
     * para que el navegador la elimine; la revocación server-side la hace
     * el handler del ticket si el cliente la reenviara (fail-closed). */
    headers.append(
        SET_COOKIE,
        "guest_game=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0"
            .parse()
            .expect("cookie estática de invitado"),
    );

    Ok((headers, StatusCode::NO_CONTENT))
}

/// Obtener usuario actual — [297A-8] lee sesión de cookie
/* [018A-24] Las rutas de sesión se documentan con la misma cookie opaca que
 * consume el middleware; no se expone token ni contrato Bearer. */
#[utoipa::path(
    get,
    path = "/api/auth/me",
    responses(
        (status = 200, description = "Usuario autenticado", body = UserResponse),
        (status = 401, description = "No autorizado", body = ErrorResponse)
    ),
    security(("session_cookie" = []))
)]
pub async fn me(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<Json<UserResponse>, AppError> {
    let user = UserRepository::find_by_id(&state.pool, auth.user_id)
        .await
        .map_err(|e| AppError::Internal(format!("Error buscando usuario: {e}")))?
        .ok_or(AppError::Unauthorized)?;

    Ok(Json(UserResponse::from(user)))
}

/// Cerrar sesión — [297A-8] revoca sesión y limpia cookies
#[utoipa::path(
    post,
    path = "/api/auth/logout",
    responses(
        (status = 204, description = "Sesión cerrada"),
        (status = 401, description = "No autorizado", body = ErrorResponse)
    ),
    security(("session_cookie" = []))
)]
pub async fn logout(
    State(state): State<AppState>,
    _auth: AuthUser,
    headers: HeaderMap,
) -> Result<(HeaderMap, StatusCode), AppError> {
    /* Extraer token de sesión para revocarlo */
    let cookie_header = headers
        .get("cookie")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    for pair in cookie_header.split(';') {
        let pair = pair.trim();
        if let Some(token) =
            pair.strip_prefix("session_id=")
                .and_then(|s| if s.is_empty() { None } else { Some(s) })
        {
            let _ = SessionService::revoke_by_token(&state.pool, token).await;
            break;
        }
    }

    /* Limpiar cookies */
    let mut response_headers = HeaderMap::new();
    response_headers.append(
        SET_COOKIE,
        "session_id=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"
            .parse()
            .expect("cookie statique"),
    );
    response_headers.append(
        SET_COOKIE,
        "csrf_token=; Path=/; SameSite=Lax; Max-Age=0"
            .parse()
            .expect("cookie statique"),
    );
    /* [297A-76] El logout también expira la identidad temporal de juego. */
    response_headers.append(
        SET_COOKIE,
        "guest_game=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0"
            .parse()
            .expect("cookie statique"),
    );

    Ok((response_headers, StatusCode::NO_CONTENT))
}

/// Listar sesiones activas del usuario — [297A-8]
#[utoipa::path(
    get,
    path = "/api/auth/sessions",
    responses(
        (status = 200, description = "Sesiones activas", body = [Session]),
        (status = 401, description = "No autorizado", body = ErrorResponse)
    ),
    security(("session_cookie" = []))
)]
pub async fn list_sessions(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<Json<Vec<Session>>, AppError> {
    let sessions = SessionService::list_for_user(&state.pool, auth.user_id).await?;
    Ok(Json(sessions))
}

/// Revocar una sesión específica — [297A-8]
#[utoipa::path(
    delete,
    path = "/api/auth/sessions/{id}",
    params(("id" = uuid::Uuid, Path, description = "ID de la sesión")),
    responses(
        (status = 204, description = "Sesión revocada"),
        (status = 401, description = "No autorizado", body = ErrorResponse),
        (status = 404, description = "No encontrado", body = ErrorResponse)
    ),
    security(("session_cookie" = []))
)]
pub async fn revoke_session(
    State(state): State<AppState>,
    auth: AuthUser,
    axum::extract::Path(session_id): axum::extract::Path<uuid::Uuid>,
) -> Result<StatusCode, AppError> {
    /* Verificar que la sesión pertenece al usuario */
    let sessions = SessionService::list_for_user(&state.pool, auth.user_id).await?;
    if !sessions.iter().any(|s| s.id == session_id) {
        return Err(AppError::NotFound("Sesión no encontrada".into()));
    }

    SessionService::revoke_by_id(&state.pool, session_id).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/auth/register", post(register))
        .route("/auth/verify-email", post(verify_email))
        .route("/auth/password-reset", post(request_password_reset))
        .route("/auth/password-reset/confirm", post(reset_password))
        .route("/auth/login", post(login))
        .route("/auth/me", get(me))
        .route("/auth/logout", post(logout))
        .route("/auth/sessions", get(list_sessions))
        .route("/auth/sessions/:id", delete(revoke_session))
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;
    use std::sync::Mutex;

    use super::{
        check_auth_action_rate_limit, check_login_rate_limit, AuthActionRateLimit, LoginRateLimit,
    };

    #[test]
    fn auth_action_limit_is_separate_from_login_limit() {
        let limit: AuthActionRateLimit = Mutex::new(HashMap::new());
        for _ in 0..3 {
            assert!(check_auth_action_rate_limit(&limit, "register", "127.0.0.1").is_ok());
        }
        assert!(check_auth_action_rate_limit(&limit, "register", "127.0.0.1").is_err());
        let login_limit: LoginRateLimit = Mutex::new(HashMap::new());
        assert!(check_login_rate_limit(&login_limit, "127.0.0.1").is_ok());
    }

    #[test]
    fn different_auth_actions_do_not_share_a_bucket() {
        let limit: AuthActionRateLimit = Mutex::new(HashMap::new());
        for _ in 0..3 {
            assert!(check_auth_action_rate_limit(&limit, "register", "127.0.0.1").is_ok());
        }
        assert!(check_auth_action_rate_limit(&limit, "password-reset", "127.0.0.1").is_ok());
    }
}
