use axum::routing::get;
use axum::{Json, Router};
use serde::Serialize;
use utoipa::ToSchema;

use crate::AppState;

#[derive(Serialize, ToSchema)]
pub struct HealthResponse {
    pub status: String,
    pub version: String,
}

/// Endpoint de health check — siempre público
#[utoipa::path(
    get,
    path = "/api/health",
    responses(
        (status = 200, description = "Servicio funcionando", body = HealthResponse)
    )
)]
pub async fn health_check() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
    })
}

pub fn routes() -> Router<AppState> {
    Router::new().route("/health", get(health_check))
}
