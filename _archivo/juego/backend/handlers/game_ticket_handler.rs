use axum::extract::{ConnectInfo, State};
use axum::http::{header::SET_COOKIE, HeaderMap};
use axum::routing::post;
use axum::{Json, Router};
use std::net::SocketAddr;
use utoipa::ToSchema;

use crate::errors::AppError;
use crate::handlers::auth::check_auth_action_rate_limit;
use crate::middleware::OptionalAuthUser;
use crate::repositories::game_profile_repo::GameProfileRepository;
use crate::services::game_ticket::{
    GAME_GUEST_COOKIE_NAME, GAME_GUEST_COOKIE_TTL_SECS, GAME_TICKET_DEFAULT_TTL_SECS,
};
use crate::AppState;

#[derive(Debug, serde::Serialize, ToSchema)]
pub struct GameTicketResponse {
    /// Ticket opaco de un solo uso para el futuro transporte realtime.
    pub ticket: String,
}

/// Emite un ticket corto para conectar el juego.
///
/// La identidad procede de la sesión opaca o de una identidad invitada temporal
/// creada server-side; el cliente no puede elegir el subject. El endpoint no
/// abre todavía WebSocket ni crea salas.
#[utoipa::path(
    post,
    path = "/api/game/ticket",
    responses(
        (status = 200, description = "Ticket de juego emitido para cuenta o invitado", body = GameTicketResponse),
        (status = 401, description = "Sesión inválida", body = ErrorResponse),
        (status = 403, description = "CSRF inválido", body = ErrorResponse),
        (status = 429, description = "Límite de invitados", body = ErrorResponse),
        (status = 500, description = "Ticket no configurado", body = ErrorResponse)
    ),
    security(("session_cookie" = []), ())
)]
pub async fn issue_game_ticket(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    auth: OptionalAuthUser,
    headers: HeaderMap,
) -> Result<(HeaderMap, Json<GameTicketResponse>), AppError> {
    let secret = state
        .game_ticket_secret
        .as_deref()
        .ok_or_else(|| AppError::Internal("secreto de tickets de juego no configurado".into()))?;

    if let Some(user_id) = auth.user_id {
        /* [297A-77] El personaje se resuelve aquí (capa HTTP con BD) y viaja
         * server-side en el ticket; el transporte realtime lo usa para que
         * cada jugador se vea con su tono sin tocar BD en el socket. Un
         * fallo del perfil no bloquea el ticket: se emite sin personaje. */
        let character_id = GameProfileRepository::get(&state.pool, user_id)
            .await
            .ok()
            .flatten()
            .map(|profile| profile.character_id);
        let ticket = state.game_ticket_store.issue(
            user_id,
            character_id.as_deref(),
            GAME_TICKET_DEFAULT_TTL_SECS,
            secret,
        )?;
        /* [297A-76] Reclamación invitado→cuenta: si una cookie temporal viaja
         * con una sesión autenticada, la identidad invitada se revoca server-
         * side (deja de resolver) aunque el navegador aún la conserve. La
         * cuenta es la autoridad; nunca se fusiona ni degrada. */
        if let Some(guest_cookie) = extract_cookie(&headers, GAME_GUEST_COOKIE_NAME) {
            let _ = state.game_ticket_store.revoke_guest(guest_cookie, secret);
        }
        return Ok((HeaderMap::new(), Json(GameTicketResponse { ticket })));
    }

    let ip = addr.ip().to_string();
    check_auth_action_rate_limit(&state.auth_action_rate_limit, "game-guest-ticket", &ip).map_err(
        |error| match error {
            AppError::Forbidden(message) => AppError::TooManyRequests(message),
            other => other,
        },
    )?;
    let existing_cookie = extract_cookie(&headers, GAME_GUEST_COOKIE_NAME);
    let (subject, guest_cookie) = if let Some(cookie) = existing_cookie {
        if let Some(subject) = state.game_ticket_store.resolve_guest(cookie, secret)? {
            (subject, None)
        } else {
            let (subject, cookie) = state.game_ticket_store.issue_guest(secret)?;
            (subject, Some(cookie))
        }
    } else {
        let (subject, cookie) = state.game_ticket_store.issue_guest(secret)?;
        (subject, Some(cookie))
    };
    /* Los invitados no tienen perfil: el ticket viaja sin personaje y el room
     * aplica la opción por defecto del catálogo. */
    let ticket =
        state
            .game_ticket_store
            .issue(subject, None, GAME_TICKET_DEFAULT_TTL_SECS, secret)?;
    let mut response_headers = HeaderMap::new();
    if let Some(guest_cookie) = guest_cookie {
        let secure = if state.site_url.starts_with("https") {
            "; Secure"
        } else {
            ""
        };
        let cookie = format!(
            "{GAME_GUEST_COOKIE_NAME}={guest_cookie}; Path=/; HttpOnly; SameSite=Strict; Max-Age={GAME_GUEST_COOKIE_TTL_SECS}{secure}"
        );
        response_headers.append(
            SET_COOKIE,
            cookie.parse().map_err(|e| {
                AppError::Internal(format!("Error construyendo cookie de invitado: {e}"))
            })?,
        );
    }
    Ok((response_headers, Json(GameTicketResponse { ticket })))
}

fn extract_cookie<'a>(headers: &'a HeaderMap, name: &str) -> Option<&'a str> {
    let cookie_header = headers.get("cookie")?.to_str().ok()?;
    cookie_header.split(';').map(str::trim).find_map(|pair| {
        pair.strip_prefix(name)
            .and_then(|value| value.strip_prefix('='))
            .filter(|value| !value.is_empty())
    })
}

pub fn routes() -> Router<AppState> {
    Router::new().route("/game/ticket", post(issue_game_ticket))
}
