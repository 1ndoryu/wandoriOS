/* wandori.us — Private download grants
 * Los productos no se sirven desde `/uploads` directamente. El enlace opaco
 * se almacena como hash, expira y solo resuelve archivos dentro de upload_dir.
 * [297A-15] El endpoint mantiene la decisión de autorización en el backend. */

use axum::body::Body;
use axum::extract::{Path, State};
use axum::http::{header, HeaderValue, StatusCode};
use axum::response::Response;
use axum::routing::get;
use axum::Router;
use chrono::Utc;

use crate::errors::AppError;
use crate::repositories::commerce_repo::EntitlementRepository;
use crate::services::commerce::{hash_download_token, resolve_private_download_path};
use crate::AppState;

fn safe_download_name(product_name: &str, extension: Option<&str>) -> String {
    let base: String = product_name
        .chars()
        .filter(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | ' ')
        })
        .collect();
    let base = base.trim().replace(' ', "-");
    let base = if base.is_empty() { "download" } else { &base };
    match extension.filter(|value| {
        value
            .chars()
            .all(|character| character.is_ascii_alphanumeric())
    }) {
        Some(value) if !value.is_empty() => format!("{base}.{value}"),
        _ => format!("{base}.bin"),
    }
}

/// Descarga un producto usando un grant de corta duración.
/* [018A-27] El enlace opaco también forma parte del contrato OpenAPI: se
 * documenta el parámetro público y los estados de autorización sin exponer
 * rutas de storage ni conceder confianza al navegador. */
#[utoipa::path(
    get,
    path = "/api/downloads/{token}",
    params(("token" = String, Path, description = "Grant opaco de descarga")),
    responses(
        (status = 200, description = "Archivo descargable", content_type = "application/octet-stream"),
        (status = 403, description = "Grant inexistente, revocado o expirado", body = ErrorResponse),
        (status = 404, description = "Archivo no disponible", body = ErrorResponse)
    )
)]
pub async fn download(
    State(state): State<AppState>,
    Path(token): Path<String>,
) -> Result<Response, AppError> {
    if token.len() != 64 || !token.chars().all(|character| character.is_ascii_hexdigit()) {
        return Err(AppError::NotFound("Descarga no disponible".into()));
    }

    let token_hash = hash_download_token(&token);
    let Some(grant) = EntitlementRepository::find_by_token_hash(&state.pool, &token_hash).await?
    else {
        return Err(AppError::NotFound("Descarga no disponible".into()));
    };
    if grant.status != "active" {
        return Err(AppError::Forbidden(
            "El enlace de descarga ya no está activo".into(),
        ));
    }
    if grant.expires_at <= Utc::now() {
        EntitlementRepository::expire(&state.pool, &token_hash).await?;
        return Err(AppError::Forbidden(
            "El enlace de descarga ha expirado".into(),
        ));
    }

    let file_path = grant
        .file_path
        .as_deref()
        .ok_or_else(|| AppError::NotFound("Archivo no disponible".into()))?;
    let path = resolve_private_download_path(&state.upload_dir, file_path)?;
    let extension = path.extension().and_then(|value| value.to_str());
    let file_name = safe_download_name(&grant.product_name, extension);
    let data = tokio::fs::read(&path)
        .await
        .map_err(|error| AppError::Internal(format!("Error leyendo descarga: {error}")))?;

    let content_disposition = format!("attachment; filename=\"{file_name}\"");
    let content_disposition = HeaderValue::from_str(&content_disposition)
        .map_err(|_| AppError::Internal("Nombre de descarga inválido".into()))?;
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "application/octet-stream")
        .header(header::CONTENT_DISPOSITION, content_disposition)
        .body(Body::from(data))
        .map_err(|error| AppError::Internal(format!("Error preparando descarga: {error}")))
}

pub fn routes() -> Router<AppState> {
    Router::new().route("/downloads/:token", get(download))
}

#[cfg(test)]
mod tests {
    use super::safe_download_name;

    #[test]
    fn nombre_de_descarga_no_permite_header_injection() {
        assert_eq!(
            safe_download_name("tema\"\r\nmalicioso", Some("zip")),
            "temamalicioso.zip"
        );
        assert_eq!(safe_download_name("", None), "download.bin");
    }
}
