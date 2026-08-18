use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use utoipa::ToSchema;
use uuid::Uuid;

/// Tipo de recurso en el catálogo editorial/comercial
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "lowercase")]
#[derive(sqlx::Type)]
#[sqlx(type_name = "resource_kind", rename_all = "lowercase")]
pub enum ResourceKind {
    Article,
    Project,
    Media,
    Product,
    Asset,
}

/// Estado editorial del recurso
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "lowercase")]
#[derive(sqlx::Type)]
#[sqlx(type_name = "editorial_state", rename_all = "lowercase")]
pub enum EditorialState {
    Draft,
    Ready,
}

/// Visibilidad del recurso
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "lowercase")]
#[derive(sqlx::Type)]
#[sqlx(type_name = "visibility_state", rename_all = "lowercase")]
pub enum VisibilityState {
    Private,
    Public,
    Unlisted,
}

/// Ciclo de vida del recurso
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "lowercase")]
#[derive(sqlx::Type)]
#[sqlx(type_name = "lifecycle_state", rename_all = "lowercase")]
pub enum LifecycleState {
    Active,
    Trashed,
}

/// Sobre común de todo recurso editorial/comercial.
/// Defaults de DB: draft, private, active.
#[derive(Debug, Clone, FromRow, Serialize, ToSchema)]
pub struct Resource {
    pub id: Uuid,
    pub kind: ResourceKind,
    pub title: String,
    pub editorial: EditorialState,
    pub visibility: VisibilityState,
    pub lifecycle: LifecycleState,
    pub deleted_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Parámetros para crear un recurso envelope
pub struct CreateResourceParams<'a> {
    pub id: Uuid,
    pub kind: ResourceKind,
    pub title: &'a str,
    pub editorial: EditorialState,
    pub visibility: VisibilityState,
}

/// [038A-2] Contenido publicado listo para materializar en la release efectiva.
/// Extiende `Resource` con los campos específicos que cada tipo necesita para
/// construir su nodo de escritorio con el mismo contrato que el frontend:
/// artículos → `slug` (publicLocator del reader), medios → `file_type`
/// (subcarpeta destino en Documentos).
#[derive(Debug, Clone, FromRow, Serialize, ToSchema)]
pub struct PublicContent {
    pub id: Uuid,
    pub kind: ResourceKind,
    pub title: String,
    pub slug: Option<String>,
    pub file_type: Option<String>,
}
