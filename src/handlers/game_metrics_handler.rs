//! GAME-01 — Métricas agregadas del realtime (Fase 8).
//!
//! Expone solo conteos agregados sin coordenadas precisas, identidades ni
//! payloads: salas/players activos, joins, rechazos, desconexiones, snapshots,
//! evictions por backpressure, rate limits y secuencias rechazadas. Es una
//! vista operativa para monitoreo; no sustituye analytics ni auditoría.

use axum::extract::State;
use axum::routing::get;
use axum::{Json, Router};
use serde::Serialize;
use utoipa::ToSchema;

use crate::services::game_room::GameRoomMetricsSnapshot;
use crate::AppState;

#[derive(Serialize, ToSchema)]
pub struct GameMetricsResponse {
    pub active_players: u64,
    pub joins: u64,
    pub joins_rejected: u64,
    pub disconnects: u64,
    pub rooms_created: u64,
    pub snapshots_sent: u64,
    pub backpressure_evictions: u64,
    pub rate_limited: u64,
    pub sequence_rejected: u64,
}

impl From<GameRoomMetricsSnapshot> for GameMetricsResponse {
    fn from(metrics: GameRoomMetricsSnapshot) -> Self {
        Self {
            active_players: metrics.active_players,
            joins: metrics.joins,
            joins_rejected: metrics.joins_rejected,
            disconnects: metrics.disconnects,
            rooms_created: metrics.rooms_created,
            snapshots_sent: metrics.snapshots_sent,
            backpressure_evictions: metrics.backpressure_evictions,
            rate_limited: metrics.rate_limited,
            sequence_rejected: metrics.sequence_rejected,
        }
    }
}

/// Métricas agregadas del realtime del Bosque — solo conteos, sin identidad.
#[utoipa::path(
    get,
    path = "/api/game/metrics",
    responses(
        (status = 200, description = "Conteos agregados del realtime", body = GameMetricsResponse)
    )
)]
/* [SNT-11] Axum 0.7.9 solo implementa `Handler` para `FnOnce -> Fut`: el
 * handler DEBE ser async aunque el cuerpo no tenga awaits (`metrics()` es
 * síncrono por clippy en `GameRoomState`). Allow justificado por la
 * restricción del framework, no para ocultar un fallo preexistente. */
#[allow(clippy::unused_async)]
pub async fn read_game_metrics(State(state): State<AppState>) -> Json<GameMetricsResponse> {
    Json(state.game_ws_state.room_state().metrics().into())
}

pub fn routes() -> Router<AppState> {
    Router::new().route("/game/metrics", get(read_game_metrics))
}
