//! GAME-01 — Upgrade WebSocket y sesión realtime de una sala.
//!
//! El primer mensaje debe ser `join` con un ticket opaco emitido por HTTP. La
//! identidad se resuelve server-side y la sesión delega el estado al actor.

use std::time::{Duration, SystemTime, UNIX_EPOCH};

use axum::extract::ws::{CloseFrame, Message, WebSocket, WebSocketUpgrade};
use axum::extract::State;
use axum::response::Response;
use axum::Router;
use tokio::sync::mpsc;
use tokio::time::timeout;

use crate::errors::AppError;
use crate::models::game_character::GameCharacterDefinition;
use crate::models::game_profile::GAME_PROFILE_DEFAULT_CHARACTER_ID;
use crate::models::game_realtime::{
    consume_rate_budget, parse_client_message, serialize_server_message, GameRealtimeClientMessage,
    GameRealtimeErrorCode, GameRealtimeErrorPayload, GameRealtimeJoinPayload,
    GameRealtimeServerMessage, GAME_REALTIME_PROTOCOL_VERSION,
};
use crate::services::game_map_svc::GameMapService;
use crate::services::game_room::{JoinedRoom, RoomJoinError};
use crate::services::game_room_map::GameRoomMap;
use crate::services::game_ticket::GameTicketStore;
use crate::AppState;

const GAME_WS_HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(5);
const GAME_WS_INVALID_MESSAGE: &str = "mensaje realtime inválido";
const GAME_WS_UNAUTHORIZED: &str = "ticket realtime inválido";
const GAME_WS_MAP_UNAVAILABLE: &str = "mapa realtime no disponible";
/* [297A-57] Cierre por reemplazo de identidad: la misma cuenta abrió una
 * conexión nueva; el Sender del RoomPlayer anterior se dropea y el socket
 * viejo se cierra con este código para que el cliente NO reintente (evita el
 * ping-pong entre pestañas/dispositivos del mismo usuario). */
const GAME_WS_REPLACED_CLOSE_CODE: u16 = 4001;
const GAME_WS_REPLACED_REASON: &str = "identidad reemplazada";
/* [Decisión 8] Cierre por reinicio coordinado (drenaje tras la cuenta atrás):
 * el cliente SÍ debe reintentar para recargar la versión nueva del mundo. El
 * actor distingue el shutdown del reemplazo/TTL en `JoinedRoom::was_shutdown`.
 */
const GAME_WS_RESTART_CLOSE_CODE: u16 = 4002;
const GAME_WS_RESTART_REASON: &str = "mundo reiniciado";

/// Abre el transporte realtime; el primer mensaje completa la autenticación.
pub async fn upgrade_game_ws(
    State(state): State<AppState>,
    websocket: WebSocketUpgrade,
) -> Result<Response, AppError> {
    let guard = state
        .game_ws_state
        .try_acquire()
        .ok_or_else(|| AppError::Conflict("límite de conexiones realtime alcanzado".into()))?;

    Ok(websocket.on_upgrade(move |socket| handle_socket(socket, state, guard)))
}

async fn handle_socket(
    mut socket: WebSocket,
    state: AppState,
    _guard: crate::services::game_ws::GameWsConnectionGuard,
) {
    let Some(join_result) = receive_join(&mut socket).await else {
        close_socket(socket).await;
        return;
    };
    let payload = match join_result {
        Ok(payload) => payload,
        Err(code) => {
            let message = if code == GameRealtimeErrorCode::InvalidMessage {
                GAME_WS_INVALID_MESSAGE
            } else {
                "transporte realtime no configurado"
            };
            send_fatal_error(&mut socket, code, message).await;
            return;
        }
    };
    let claims = match resolve_join_ticket(
        &state.game_ticket_store,
        state.game_ticket_secret.as_deref(),
        &payload.ticket,
    ) {
        Ok(claims) => claims,
        Err(GameRealtimeErrorCode::ServerBusy) => {
            send_fatal_error(
                &mut socket,
                GameRealtimeErrorCode::ServerBusy,
                "transporte realtime no configurado",
            )
            .await;
            return;
        }
        Err(_) => {
            send_fatal_error(
                &mut socket,
                GameRealtimeErrorCode::Unauthorized,
                GAME_WS_UNAUTHORIZED,
            )
            .await;
            return;
        }
    };

    if ensure_room_map(&state).await.is_err() {
        send_fatal_error(
            &mut socket,
            GameRealtimeErrorCode::MapUnavailable,
            GAME_WS_MAP_UNAVAILABLE,
        )
        .await;
        return;
    }

    let (output, messages) = mpsc::channel(32);
    let room = state.game_ws_state.room_state();
    /* [297A-77] El personaje viaja server-side en el ticket (resuelto en HTTP
     * contra el perfil); si no hay perfil o el id es inválido, se aplica la
     * opción por defecto del catálogo. Nunca se lee BD en el socket. */
    let character_id = claims
        .character_id
        .filter(|id| GameCharacterDefinition::is_valid_id(id))
        .unwrap_or_else(|| GAME_PROFILE_DEFAULT_CHARACTER_ID.to_string());
    let joined = match room
        .join_with_character(claims.subject, &character_id, output)
        .await
    {
        Ok(joined) => joined,
        Err(error) => {
            let code = error.code();
            let message = match error {
                RoomJoinError::MapUnavailable => GAME_WS_MAP_UNAVAILABLE,
                RoomJoinError::Full => "sala realtime llena",
                RoomJoinError::Busy => "sala realtime ocupada",
            };
            send_fatal_error(&mut socket, code, message).await;
            return;
        }
    };
    if !send_joined_messages(&mut socket, &joined).await {
        joined.disconnect().await;
        return;
    }
    run_joined_session(&mut socket, joined, messages).await;
}

async fn receive_join(
    socket: &mut WebSocket,
) -> Option<Result<GameRealtimeJoinPayload, GameRealtimeErrorCode>> {
    let first_message = timeout(GAME_WS_HANDSHAKE_TIMEOUT, socket.recv()).await;
    match first_message.ok().flatten() {
        Some(Ok(Message::Text(text))) => {
            let Ok(GameRealtimeClientMessage::Join { payload, .. }) =
                parse_client_message(text.as_bytes())
            else {
                return Some(Err(GameRealtimeErrorCode::InvalidMessage));
            };
            Some(Ok(payload))
        }
        Some(Ok(Message::Binary(_) | Message::Ping(_) | Message::Pong(_))) => {
            Some(Err(GameRealtimeErrorCode::InvalidMessage))
        }
        _ => None,
    }
}

async fn send_joined_messages(socket: &mut WebSocket, joined: &JoinedRoom) -> bool {
    let joined_message = GameRealtimeServerMessage::Joined {
        v: GAME_REALTIME_PROTOCOL_VERSION,
        payload: crate::models::game_realtime::GameRealtimeJoinedPayload {
            player_id: joined.player_id.clone(),
            map_version: joined.map_version.clone(),
            tick: joined.tick,
        },
    };
    if !send_server_message(socket, &joined_message).await {
        return false;
    }
    let initial_message = GameRealtimeServerMessage::Snapshot {
        v: GAME_REALTIME_PROTOCOL_VERSION,
        payload: joined.initial_snapshot.clone(),
    };
    send_server_message(socket, &initial_message).await
}

async fn run_joined_session(
    socket: &mut WebSocket,
    joined: JoinedRoom,
    mut messages: mpsc::Receiver<GameRealtimeServerMessage>,
) {
    let mut frame_history = Vec::new();
    loop {
        tokio::select! {
            incoming = socket.recv() => {
                let Some(result) = incoming else { break };
                let Ok(frame) = result else { break };
                if matches!(frame, Message::Close(_)) { break; }
                let now = now_millis();
                let Ok(history) = consume_rate_budget(&frame_history, now) else {
                    send_fatal_error(socket, GameRealtimeErrorCode::RateLimited, "rate limit realtime excedido").await;
                    break;
                };
                frame_history = history;
                match frame {
                    Message::Text(text) => {
                        let Ok(message) = parse_client_message(text.as_bytes()) else {
                            send_fatal_error(socket, GameRealtimeErrorCode::InvalidMessage, GAME_WS_INVALID_MESSAGE).await;
                            break;
                        };
                        if joined.send(message).is_err() {
                            send_fatal_error(socket, GameRealtimeErrorCode::ServerBusy, "sala realtime ocupada").await;
                            break;
                        }
                    }
                    Message::Ping(payload) => {
                        if socket.send(Message::Pong(payload)).await.is_err() { break; }
                    }
                    Message::Binary(_) | Message::Pong(_) => {
                        send_fatal_error(socket, GameRealtimeErrorCode::InvalidMessage, GAME_WS_INVALID_MESSAGE).await;
                        break;
                    }
                    Message::Close(_) => break,
                }
            }
            outgoing = messages.recv() => {
                let Some(message) = outgoing else {
                    /* [297A-57] El Sender se dropeó: la identidad fue reemplazada
                     * por una conexión nueva (o la sala cerró por TTL).
                     * [Decisión 8] Si la sala cerró por drenaje coordinado, el
                     * código es 4002 y el cliente reintenta la migración. */
                    let (code, reason) = if joined.was_shutdown() {
                        (GAME_WS_RESTART_CLOSE_CODE, GAME_WS_RESTART_REASON)
                    } else {
                        (GAME_WS_REPLACED_CLOSE_CODE, GAME_WS_REPLACED_REASON)
                    };
                    let _ = socket
                        .send(Message::Close(Some(CloseFrame {
                            code,
                            reason: reason.to_string().into(),
                        })))
                        .await;
                    break;
                };
                if !send_server_message(socket, &message).await { break; }
            }
        }
    }
    joined.disconnect().await;
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| {
            u64::try_from(duration.as_millis()).unwrap_or(u64::MAX)
        })
}

async fn ensure_room_map(state: &AppState) -> Result<(), String> {
    if state.game_ws_state.has_room_map() {
        return Ok(());
    }
    let Some(map_id) = std::env::var("GAME_MAP_ID")
        .ok()
        .filter(|value| !value.trim().is_empty())
    else {
        return Err("GAME_MAP_ID no configurado".to_string());
    };
    let public = GameMapService::get_active(&state.pool, &map_id)
        .await
        .map_err(|_| "mapa activo no encontrado".to_string())?;
    let map = GameRoomMap::from_public(&public)?;
    state.game_ws_state.set_room_map(Some(map));
    Ok(())
}

async fn send_server_message(socket: &mut WebSocket, message: &GameRealtimeServerMessage) -> bool {
    let Ok(bytes) = serialize_server_message(message) else {
        return false;
    };
    socket
        .send(Message::Text(String::from_utf8_lossy(&bytes).into_owned()))
        .await
        .is_ok()
}

fn resolve_join_ticket(
    store: &GameTicketStore,
    secret: Option<&str>,
    ticket: &str,
) -> Result<crate::services::game_ticket::GameTicketClaims, GameRealtimeErrorCode> {
    let Some(secret) = secret else {
        return Err(GameRealtimeErrorCode::ServerBusy);
    };
    store
        .consume(ticket, secret)
        .map_err(|_| GameRealtimeErrorCode::Unauthorized)
}

async fn send_fatal_error(socket: &mut WebSocket, code: GameRealtimeErrorCode, message: &str) {
    let response = GameRealtimeServerMessage::Error {
        v: GAME_REALTIME_PROTOCOL_VERSION,
        payload: GameRealtimeErrorPayload {
            code,
            message: message.to_string(),
            fatal: true,
        },
    };
    if let Ok(bytes) = serialize_server_message(&response) {
        let _ = socket
            .send(Message::Text(String::from_utf8_lossy(&bytes).into_owned()))
            .await;
    }
    let _ = socket.send(Message::Close(None)).await;
}

async fn close_socket(socket: WebSocket) {
    let _ = socket.close().await;
}

pub fn routes() -> Router<AppState> {
    Router::new().route("/game/ws", axum::routing::get(upgrade_game_ws))
}

#[cfg(test)]
mod tests {
    use super::{resolve_join_ticket, GAME_WS_HANDSHAKE_TIMEOUT};
    use crate::services::game_ticket::GameTicketStore;
    use uuid::Uuid;

    #[test]
    fn handshake_timeout_is_short_and_bounded() {
        assert!(GAME_WS_HANDSHAKE_TIMEOUT.as_secs() <= 5);
        assert!(GAME_WS_HANDSHAKE_TIMEOUT.as_secs() > 0);
    }

    #[test]
    fn valid_ticket_resolves_subject_once_and_replay_is_rejected() {
        let store = GameTicketStore::default();
        let subject = Uuid::new_v4();
        let ticket = store.issue(subject, None, 30, "secret").expect("ticket");

        let claims = resolve_join_ticket(&store, Some("secret"), &ticket).expect("claims");
        assert_eq!(claims.subject, subject);
        assert!(resolve_join_ticket(&store, Some("secret"), &ticket).is_err());
    }

    #[test]
    fn missing_or_wrong_secret_fails_closed_without_resolving_identity() {
        let store = GameTicketStore::default();
        let ticket = store
            .issue(Uuid::new_v4(), None, 30, "secret")
            .expect("ticket");

        assert!(resolve_join_ticket(&store, None, &ticket).is_err());
        assert!(resolve_join_ticket(&store, Some("wrong"), &ticket).is_err());
    }
}
