use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use sqlx::FromRow;
use utoipa::{IntoParams, ToSchema};
use uuid::Uuid;
use validator::Validate;

/// Articulo del blog almacenado en base de datos.
/// [297A-10] Incluye campos legacy (status) y envelope (editorial, visibility, lifecycle)
/// durante la fase de transición. `system_alias` identifica artículos de sistema como 'about'.
#[derive(Debug, Clone, FromRow, Serialize, ToSchema)]
pub struct Article {
    pub id: Uuid,
    pub title: String,
    pub slug: String,
    /* [018A-20] TipTap JSON se expone como objeto OpenAPI explícito para que
     * Orval no cree una referencia huérfana `JsonValue`. */
    #[schema(value_type = Object)]
    pub content: JsonValue,
    pub excerpt: String,
    pub cover_image: Option<String>,
    /// Legacy: 'draft' | 'published'. Se mantiene hasta fase contract.
    pub status: String,
    pub is_pinned: bool,
    pub published_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    /// [297A-10] Alias de sistema (e.g. 'about') para artículos especiales.
    pub system_alias: Option<String>,
    /// [028A-12] Soft delete: el borrado conserva la fila para restaurarla
    /// desde la Papelera admin. Las queries por defecto excluyen trashed.
    pub trashed: bool,
    pub deleted_at: Option<DateTime<Utc>>,
}

/// Request para crear un articulo
#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct CreateArticleRequest {
    #[validate(length(
        min = 1,
        max = 500,
        message = "El titulo debe tener entre 1 y 500 caracteres"
    ))]
    pub title: String,
    #[schema(value_type = Object)]
    pub content: JsonValue,
    #[serde(default)]
    pub excerpt: String,
    pub cover_image: Option<String>,
    #[serde(default = "default_status")]
    pub status: String,
    #[serde(default)]
    pub is_pinned: bool,
}

fn default_status() -> String {
    "draft".to_string()
}

/// Request para actualizar un articulo
#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct UpdateArticleRequest {
    #[validate(length(min = 1, max = 500))]
    pub title: Option<String>,
    #[schema(value_type = Object)]
    pub content: Option<JsonValue>,
    pub excerpt: Option<String>,
    pub cover_image: Option<String>,
    pub status: Option<String>,
    pub is_pinned: Option<bool>,
}

/// Response paginada de articulos (admin — incluye campos internos)
#[derive(Debug, Serialize, ToSchema)]
pub struct PaginatedArticles {
    pub items: Vec<Article>,
    pub total: i64,
    pub page: i64,
    pub per_page: i64,
}

/// [297A-10] Response paginada pública — sin campos internos
#[derive(Debug, Serialize, ToSchema)]
pub struct PaginatedArticlesPublic {
    pub items: Vec<ArticlePublic>,
    pub total: i64,
    pub page: i64,
    pub per_page: i64,
}

/// [297A-10] DTO público para artículos — no expone campos internos del sistema.
/// Usado en endpoints públicos. Admin usa el struct `Article` completo.
#[derive(Debug, Serialize, ToSchema)]
pub struct ArticlePublic {
    pub id: Uuid,
    pub title: String,
    pub slug: String,
    #[schema(value_type = Object)]
    pub content: JsonValue,
    pub excerpt: String,
    pub cover_image: Option<String>,
    pub published_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl From<Article> for ArticlePublic {
    fn from(a: Article) -> Self {
        Self {
            id: a.id,
            title: a.title,
            slug: a.slug,
            content: a.content,
            excerpt: a.excerpt,
            cover_image: a.cover_image,
            published_at: a.published_at,
            created_at: a.created_at,
            updated_at: a.updated_at,
        }
    }
}

/// Query params para listar articulos
#[derive(Debug, Deserialize, IntoParams)]
pub struct ArticleQueryParams {
    #[serde(default = "default_page")]
    pub page: i64,
    #[serde(default = "default_per_page")]
    pub per_page: i64,
    pub status: Option<String>,
}

fn default_page() -> i64 {
    1
}
fn default_per_page() -> i64 {
    20
}
