use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use utoipa::ToSchema;
use uuid::Uuid;
use validator::Validate;

/// Public/admin notification row. `read` is resolved per authenticated user.
#[derive(Debug, Clone, FromRow)]
pub struct Notification {
    pub id: Uuid,
    pub kind: String,
    pub title: String,
    pub body: String,
    pub release_version: Option<i32>,
    pub status: String,
    pub created_by: Option<Uuid>,
    pub published_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub read: bool,
}

/// [018A-49] Contrato público: no expone quién creó la novedad ni su estado
/// editorial interno; el endpoint ya filtra únicamente publicaciones activas.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct NotificationPublicResponse {
    pub id: Uuid,
    pub kind: String,
    pub title: String,
    pub body: String,
    pub release_version: Option<i32>,
    pub published_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

/// Contrato para una cuenta autenticada, con lectura resuelta por usuario.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct NotificationAccountResponse {
    pub id: Uuid,
    pub kind: String,
    pub title: String,
    pub body: String,
    pub release_version: Option<i32>,
    pub published_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub read: bool,
}

/// Contrato administrativo completo; solo se usa tras `AdminUser`.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct NotificationAdminResponse {
    pub id: Uuid,
    pub kind: String,
    pub title: String,
    pub body: String,
    pub release_version: Option<i32>,
    pub status: String,
    pub created_by: Option<Uuid>,
    pub published_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub read: bool,
}

impl From<&Notification> for NotificationPublicResponse {
    fn from(notification: &Notification) -> Self {
        Self {
            id: notification.id,
            kind: notification.kind.clone(),
            title: notification.title.clone(),
            body: notification.body.clone(),
            release_version: notification.release_version,
            published_at: notification.published_at,
            created_at: notification.created_at,
        }
    }
}

impl From<&Notification> for NotificationAccountResponse {
    fn from(notification: &Notification) -> Self {
        Self {
            id: notification.id,
            kind: notification.kind.clone(),
            title: notification.title.clone(),
            body: notification.body.clone(),
            release_version: notification.release_version,
            published_at: notification.published_at,
            created_at: notification.created_at,
            read: notification.read,
        }
    }
}

impl From<&Notification> for NotificationAdminResponse {
    fn from(notification: &Notification) -> Self {
        Self {
            id: notification.id,
            kind: notification.kind.clone(),
            title: notification.title.clone(),
            body: notification.body.clone(),
            release_version: notification.release_version,
            status: notification.status.clone(),
            created_by: notification.created_by,
            published_at: notification.published_at,
            created_at: notification.created_at,
            read: notification.read,
        }
    }
}

#[derive(Debug, Serialize, ToSchema)]
pub struct NotificationPublicList {
    pub items: Vec<NotificationPublicResponse>,
    pub unread_count: i64,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct NotificationAccountList {
    pub items: Vec<NotificationAccountResponse>,
    pub unread_count: i64,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct NotificationAdminList {
    pub items: Vec<NotificationAdminResponse>,
    pub unread_count: i64,
}

#[cfg(test)]
mod tests {
    use super::{Notification, NotificationAdminResponse, NotificationPublicResponse};
    use chrono::Utc;
    use uuid::Uuid;

    #[test]
    fn contrato_publico_no_expone_estado_ni_autor() {
        let notification = Notification {
            id: Uuid::new_v4(),
            kind: "release".into(),
            title: "Novedad".into(),
            body: "Contenido".into(),
            release_version: Some(3),
            status: "published".into(),
            created_by: Some(Uuid::new_v4()),
            published_at: Some(Utc::now()),
            created_at: Utc::now(),
            read: false,
        };

        let public = serde_json::to_value(NotificationPublicResponse::from(&notification)).unwrap();
        assert!(public.get("status").is_none());
        assert!(public.get("created_by").is_none());

        let admin = serde_json::to_value(NotificationAdminResponse::from(&notification)).unwrap();
        assert!(admin.get("status").is_some());
        assert!(admin.get("created_by").is_some());
    }
}

#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct CreateNotificationRequest {
    #[validate(length(min = 1, max = 40))]
    pub kind: String,
    #[validate(length(min = 1, max = 160))]
    pub title: String,
    #[validate(length(min = 1, max = 500))]
    pub body: String,
    pub release_version: Option<i32>,
    #[validate(length(min = 1, max = 16))]
    pub status: String,
}

#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct UpdateNotificationStatusRequest {
    #[validate(length(min = 1, max = 16))]
    pub status: String,
}
