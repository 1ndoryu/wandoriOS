use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Serialize;
use utoipa::ToSchema;

/// Tipos de error de la aplicación — cada variante mapea a un HTTP status code
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("No encontrado: {0}")]
    NotFound(String),

    #[error("Solicitud inválida: {0}")]
    BadRequest(String),

    #[error("No autorizado")]
    Unauthorized,

    #[error("Prohibido: {0}")]
    Forbidden(String),

    #[error("Demasiadas solicitudes: {0}")]
    TooManyRequests(String),

    #[error("Conflicto: {0}")]
    Conflict(String),

    #[error("Error interno: {0}")]
    Internal(String),

    #[error("Error de base de datos: {0}")]
    Database(#[from] sqlx::Error),

    #[error("Error de validación: {0}")]
    Validation(String),

    /// [028A-11] Validación 422 con detalle estructurado (p. ej. lista de refs
    /// de recursos rotos al publicar un release). El `details` viaja en la
    /// respuesta para que el panel admin pueda pintarlos, no solo el mensaje.
    #[error("Error de validación: {message}")]
    ValidationDetails {
        message: String,
        details: serde_json::Value,
    },
}

/// Estructura de respuesta de error expuesta en la API
#[derive(Serialize, ToSchema)]
pub struct ErrorResponse {
    /// Tipo de error (`not_found`, `unauthorized`, etc.)
    pub error: String,
    /// Mensaje legible para el usuario
    pub message: String,
    /// Detalle estructurado opcional (p. ej. refs rotos de un release)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<serde_json::Value>,
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, error_type, message) = match &self {
            Self::NotFound(msg) => (StatusCode::NOT_FOUND, "not_found", msg.clone()),
            Self::BadRequest(msg) => (StatusCode::BAD_REQUEST, "bad_request", msg.clone()),
            Self::Unauthorized => (
                StatusCode::UNAUTHORIZED,
                "unauthorized",
                "Credenciales inválidas o ausentes".to_string(),
            ),
            Self::Forbidden(msg) => (StatusCode::FORBIDDEN, "forbidden", msg.clone()),
            Self::TooManyRequests(msg) => (
                StatusCode::TOO_MANY_REQUESTS,
                "too_many_requests",
                msg.clone(),
            ),
            Self::Conflict(msg) => (StatusCode::CONFLICT, "conflict", msg.clone()),
            Self::Internal(msg) => {
                tracing::error!("Error interno: {msg}");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "internal_error",
                    "Ocurrió un error interno".to_string(),
                )
            }
            Self::Database(err) => {
                tracing::error!("Error de base de datos: {err}");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "database_error",
                    "Ocurrió un error de base de datos".to_string(),
                )
            }
            Self::Validation(msg) => (
                StatusCode::UNPROCESSABLE_ENTITY,
                "validation_error",
                msg.clone(),
            ),
            Self::ValidationDetails { message, .. } => (
                StatusCode::UNPROCESSABLE_ENTITY,
                "validation_error",
                message.clone(),
            ),
        };

        let details = match &self {
            Self::ValidationDetails { details, .. } => Some(details.clone()),
            _ => None,
        };

        let body = ErrorResponse {
            error: error_type.to_string(),
            message,
            details,
        };

        (status, Json(body)).into_response()
    }
}
