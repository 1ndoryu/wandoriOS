/* wandori.us — Dev Mailbox
 * [297A-13] Buzón de correo en memoria SOLO para desarrollo: cuando no hay
 * proveedor (RESEND_API_KEY ausente), los emails transaccionales se "envían"
 * aquí y a log para poder verificar la cuenta sin depender de un proveedor.
 * Fail-closed: si el entorno tiene proveedor configurado, el endpoint dev
 * responde 404 y no expone nada. */

use std::sync::Mutex;

use axum::extract::State;
use axum::routing::get;
use axum::{Json, Router};
use chrono::{DateTime, Utc};
use serde::Serialize;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::errors::AppError;
use crate::AppState;

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct DevMailMessage {
    pub id: Uuid,
    pub to: String,
    pub subject: String,
    pub link: String,
    pub created_at: DateTime<Utc>,
}

impl DevMailMessage {
    pub fn new(to: &str, subject: &str, link: &str) -> Self {
        Self {
            id: Uuid::new_v4(),
            to: to.to_string(),
            subject: subject.to_string(),
            link: link.to_string(),
            created_at: Utc::now(),
        }
    }
}

/// Tipo del buzón en memoria compartido por AppState.
pub type DevMailbox = Mutex<Vec<DevMailMessage>>;

/// Lista los correos mockeados. Solo existe en desarrollo: si el proveedor
/// real está configurado (producción), la ruta no está disponible.
#[utoipa::path(
    get,
    path = "/api/dev/mail",
    responses(
        (status = 200, description = "Correos mockeados en desarrollo", body = [DevMailMessage]),
        (status = 404, description = "No disponible fuera de desarrollo", body = ErrorResponse)
    )
)]
pub async fn list_dev_mail(
    State(state): State<AppState>,
) -> Result<Json<Vec<DevMailMessage>>, AppError> {
    /* Fail-closed: en producción nunca se expone el buzón de desarrollo. */
    if state.resend_api_key.is_some() {
        return Err(AppError::NotFound(
            "El buzón de desarrollo no está disponible".into(),
        ));
    }
    let messages = state
        .dev_mailbox
        .lock()
        .map_err(|e| AppError::Internal(format!("Error leyendo buzón dev: {e}")))?
        .clone();
    Ok(Json(messages))
}

pub fn routes() -> Router<AppState> {
    Router::new().route("/dev/mail", get(list_dev_mail))
}
