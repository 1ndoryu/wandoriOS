use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use utoipa::ToSchema;
use uuid::Uuid;
use validator::Validate;

/// Configuracion del sitio (clave-valor)
#[derive(Debug, Clone, FromRow, Serialize, ToSchema)]
pub struct SiteSetting {
    pub key: String,
    pub value: String,
    pub updated_at: DateTime<Utc>,
}

/// Request para actualizar settings
#[derive(Debug, Deserialize, ToSchema)]
pub struct UpdateSettingsRequest {
    pub settings: std::collections::HashMap<String, String>,
}

/// Evento de analytics
#[derive(Debug, Clone, FromRow, Serialize, ToSchema)]
pub struct AnalyticsEvent {
    pub id: Uuid,
    pub event_type: String,
    pub target_type: Option<String>,
    pub target_id: Option<Uuid>,
    #[schema(value_type = Object)]
    pub metadata: Option<serde_json::Value>,
    pub ip_hash: Option<String>,
    pub user_agent: Option<String>,
    pub created_at: DateTime<Utc>,
}

/// Request batch de eventos
#[derive(Debug, Deserialize, Serialize, Validate, ToSchema)]
pub struct TrackEventsRequest {
    #[validate(length(max = 50, message = "El lote no puede superar 50 eventos"))]
    pub events: Vec<TrackEvent>,
}

/// Solicitud administrativa de purga de analytics antiguos.
#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct AnalyticsRetentionRequest {
    #[validate(range(
        min = 30,
        max = 730,
        message = "La retención debe estar entre 30 y 730 días"
    ))]
    pub max_age_days: i32,
}

/// Resultado auditable de la purga de analytics.
#[derive(Debug, Serialize, ToSchema)]
pub struct AnalyticsRetentionResponse {
    pub deleted: u64,
    pub cutoff: DateTime<Utc>,
}

/// Evento individual
#[derive(Debug, Deserialize, Serialize, Validate, ToSchema)]
pub struct TrackEvent {
    pub event_id: Option<Uuid>,
    #[validate(length(min = 1, max = 50, message = "Tipo de evento inválido"))]
    pub event_type: String,
    pub target_type: Option<String>,
    pub target_id: Option<Uuid>,
    #[schema(value_type = Object)]
    pub metadata: Option<serde_json::Value>,
}

/// Estadisticas agregadas
#[derive(Debug, Serialize, ToSchema)]
pub struct AnalyticsStats {
    pub total_page_views: i64,
    pub total_clicks: i64,
    pub total_downloads: i64,
    pub total_purchases: i64,
    pub top_articles: Vec<TopArticle>,
    pub recent_events: Vec<RecentEvent>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct TopArticle {
    pub id: Uuid,
    pub title: String,
    pub views: i64,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct RecentEvent {
    pub event_type: String,
    pub target_type: Option<String>,
    pub created_at: DateTime<Utc>,
}
