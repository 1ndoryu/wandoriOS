use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use utoipa::{IntoParams, ToSchema};
use uuid::Uuid;

/// Estado de procesamiento de un asset multimedia
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "lowercase")]
#[derive(sqlx::Type)]
#[sqlx(type_name = "asset_processing_state", rename_all = "lowercase")]
pub enum AssetProcessingState {
    Processing,
    Clean,
    Rejected,
}

/// Archivo multimedia (imagen, audio, video). [297A-10] Añade `asset_state`.
#[derive(Debug, Clone, FromRow, Serialize, ToSchema)]
pub struct Media {
    pub id: Uuid,
    pub article_id: Option<Uuid>,
    pub file_path: String,
    pub file_type: String,
    pub file_size: i64,
    pub alt_text: String,
    pub created_at: DateTime<Utc>,
    /// [297A-10] Estado de procesamiento del asset.
    pub asset_state: AssetProcessingState,
}

/* [018A-29] Separamos el modelo de storage de las respuestas HTTP para que
 * ninguna ruta vuelva a serializar accidentalmente la storage key. Las URLs
 * son contratos explícitos y pueden evolucionar sin cambiar la persistencia. */
/// DTO público de media. Nunca incluye la storage key ni el estado privado
/// del procesamiento; `url` apunta al preview autorizado.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct MediaPublicResponse {
    pub url: String,
    pub file_name: String,
    pub file_type: String,
    pub file_size: i64,
    pub alt_text: String,
    pub created_at: DateTime<Utc>,
}

/// DTO administrativo: añade el estado de procesamiento, pero nunca expone
/// el path físico del storage. `url` es el preview público si existe.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct MediaAdminResponse {
    pub id: Uuid,
    pub article_id: Option<Uuid>,
    pub url: String,
    pub admin_url: String,
    pub file_name: String,
    pub file_type: String,
    pub file_size: i64,
    pub alt_text: String,
    pub created_at: DateTime<Utc>,
    pub asset_state: AssetProcessingState,
}

/// Respuesta de subida: el editor recibe la URL pública y el admin conserva
/// una URL separada para previsualizar estados no públicos.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct MediaUploadResponse {
    pub id: Uuid,
    pub article_id: Option<Uuid>,
    pub url: String,
    pub admin_url: String,
    pub file_name: String,
    pub file_type: String,
    pub file_size: i64,
    pub alt_text: String,
    pub created_at: DateTime<Utc>,
    pub asset_state: AssetProcessingState,
}

impl Media {
    fn file_name(&self) -> String {
        self.file_path
            .rsplit(['/', '\\'])
            .next()
            .filter(|name| !name.is_empty())
            .unwrap_or("media")
            .to_string()
    }

    #[must_use]
    pub fn into_public_response(self, url: String) -> MediaPublicResponse {
        MediaPublicResponse {
            url,
            file_name: self.file_name(),
            file_type: self.file_type,
            file_size: self.file_size,
            alt_text: self.alt_text,
            created_at: self.created_at,
        }
    }

    #[must_use]
    pub fn into_admin_response(self, url: String, admin_url: String) -> MediaAdminResponse {
        MediaAdminResponse {
            id: self.id,
            article_id: self.article_id,
            url,
            admin_url,
            file_name: self.file_name(),
            file_type: self.file_type,
            file_size: self.file_size,
            alt_text: self.alt_text,
            created_at: self.created_at,
            asset_state: self.asset_state,
        }
    }

    #[must_use]
    pub fn into_upload_response(self, url: String, admin_url: String) -> MediaUploadResponse {
        MediaUploadResponse {
            id: self.id,
            article_id: self.article_id,
            url,
            admin_url,
            file_name: self.file_name(),
            file_type: self.file_type,
            file_size: self.file_size,
            alt_text: self.alt_text,
            created_at: self.created_at,
            asset_state: self.asset_state,
        }
    }
}

/// Request para registrar un archivo media
#[derive(Debug, Deserialize, ToSchema)]
pub struct CreateMediaRequest {
    pub article_id: Option<Uuid>,
    pub file_path: String,
    pub file_type: String,
    pub file_size: i64,
    #[serde(default)]
    pub alt_text: String,
}

/// Query params para filtrar media
#[derive(Debug, Deserialize, IntoParams)]
pub struct MediaQueryParams {
    pub file_type: Option<String>,
    pub article_id: Option<Uuid>,
}
