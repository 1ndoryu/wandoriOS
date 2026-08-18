use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use sqlx::FromRow;
use utoipa::ToSchema;
use uuid::Uuid;

mod release_validation;

pub use release_validation::{validate_release_tree, ReleaseTreeIssue};

/// Release inmutable del layout del escritorio.
/// [297A-11 §12] Cada release es versionado e inmutable.
/// [028A-11] `summary` guarda el diff auditable contra la release anterior
/// (`diff_from`) o la está vacío para la primera release.
/// [028A-13] `is_active` marca la release vigente para todo el mundo; el
/// índice único parcial garantiza una sola activa. Publicar ya no equivale a
/// activar automáticamente: el panel Admin decide qué versión queda activa.
#[derive(Debug, Clone, FromRow, Serialize, ToSchema)]
pub struct WorkspaceRelease {
    pub id: Uuid,
    pub version: i32,
    #[schema(value_type = Object)]
    pub tree: JsonValue,
    pub published_at: DateTime<Utc>,
    pub published_by: Option<Uuid>,
    #[schema(value_type = Object)]
    pub summary: JsonValue,
    pub diff_from: Option<i32>,
    pub is_active: bool,
}

/// Recurso no publicable referenciado por un release (para el 422/validate).
/// [028A-13] camelCase: el contrato del API no expone `snake_case`, igual que
/// `BrokenResourceRef` en el service de publish.
#[derive(Debug, Clone, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct BrokenResourceRef {
    /// id del nodo en el árbol del release
    pub id: String,
    /// uuid del recurso referenciado que no es publicable
    pub ref_id: Uuid,
    /// label del nodo (para localizar visualmente)
    pub label: String,
}

/// Item ligero del historial de releases (sin `tree` completo).
/// [028A-13] Pensado para el panel Admin: evita transferir árboles enteros
/// en el listado; `nodeCount` da el tamaño sin enviar el JSON.
/// [028A-13-fix] `rename_all = "camelCase"` para que el contrato exponga
/// `nodeCount`/`publishedAt` y no `snake_case` (bug detectado al probar la API).
#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseListItem {
    pub id: Uuid,
    pub version: i32,
    pub published_at: DateTime<Utc>,
    pub published_by: Option<Uuid>,
    pub is_active: bool,
    pub node_count: usize,
    #[schema(value_type = Object)]
    pub summary: JsonValue,
    pub diff_from: Option<i32>,
}

impl From<WorkspaceRelease> for ReleaseListItem {
    fn from(r: WorkspaceRelease) -> Self {
        let node_count = r
            .tree
            .get("nodes")
            .and_then(JsonValue::as_object)
            .map_or(0, serde_json::Map::len);
        Self {
            id: r.id,
            version: r.version,
            published_at: r.published_at,
            published_by: r.published_by,
            is_active: r.is_active,
            node_count,
            summary: r.summary,
            diff_from: r.diff_from,
        }
    }
}

/// Estado actual de la gobernanza del workspace (dashboard del Admin).
/// [028A-13] Con `active_*` + `latest_version` el panel puede avisar si la
/// activa no es la más reciente (caso Papelera desaparecida por v4).
/// [028A-13-fix] `rename_all = "camelCase"` (bug `snake_case` detectado al probar).
#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseControlResponse {
    pub active_version: Option<i32>,
    pub active_node_count: Option<usize>,
    pub active_published_at: Option<DateTime<Utc>>,
    pub active_published_by: Option<Uuid>,
    pub latest_version: Option<i32>,
    pub total_releases: usize,
}

/// Resultado del dry-run de validación de una release publicada.
/// [028A-13] `valid` es falso si hay issues estructurales o refs rotas; el
/// panel muestra `issues` y `brokenRefs` antes de permitir activar.
/// [028A-13-fix] `rename_all = "camelCase"` (bug `snake_case` detectado al probar).
#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseValidationResponse {
    pub version: i32,
    pub valid: bool,
    pub issues: Vec<ReleaseTreeIssue>,
    pub broken_refs: Vec<BrokenResourceRef>,
}

/// Request para publicar un nuevo release.
#[derive(Debug, Deserialize, ToSchema)]
pub struct PublishReleaseRequest {
    /// Árbol del workspace a publicar (formato JSON del `WorkspaceTree` frontend).
    #[schema(value_type = Object)]
    pub tree: JsonValue,
}

/// Response pública del release activo.
#[derive(Debug, Serialize, ToSchema)]
pub struct WorkspaceReleasePublic {
    pub version: i32,
    #[schema(value_type = Object)]
    pub tree: JsonValue,
    pub published_at: DateTime<Utc>,
}

impl From<WorkspaceRelease> for WorkspaceReleasePublic {
    fn from(r: WorkspaceRelease) -> Self {
        Self {
            version: r.version,
            tree: r.tree,
            published_at: r.published_at,
        }
    }
}
