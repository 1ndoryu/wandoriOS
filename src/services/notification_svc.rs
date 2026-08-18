use sqlx::PgPool;
use uuid::Uuid;
use validator::Validate;

use crate::errors::AppError;
use crate::models::notification::{
    CreateNotificationRequest, NotificationAccountList, NotificationAccountResponse,
    NotificationAdminList, NotificationAdminResponse, NotificationPublicList,
    NotificationPublicResponse, UpdateNotificationStatusRequest,
};
use crate::repositories::notification_repo::NotificationRepository;

const VALID_STATUSES: [&str; 3] = ["draft", "published", "archived"];

fn validate_status(status: &str) -> Result<(), AppError> {
    if VALID_STATUSES.contains(&status) {
        Ok(())
    } else {
        Err(AppError::Validation(
            "El estado debe ser draft, published o archived".into(),
        ))
    }
}

pub struct NotificationService;

impl NotificationService {
    pub async fn list_public(pool: &PgPool) -> Result<NotificationPublicList, AppError> {
        let items = NotificationRepository::list_public(pool).await?;
        Ok(NotificationPublicList {
            items: items.iter().map(NotificationPublicResponse::from).collect(),
            unread_count: 0,
        })
    }

    pub async fn list_for_user(
        pool: &PgPool,
        user_id: Uuid,
    ) -> Result<NotificationAccountList, AppError> {
        let items = NotificationRepository::list_for_user(pool, user_id).await?;
        let unread_count = NotificationRepository::unread_count(pool, user_id).await?;
        Ok(NotificationAccountList {
            items: items
                .iter()
                .map(NotificationAccountResponse::from)
                .collect(),
            unread_count,
        })
    }

    pub async fn mark_read(
        pool: &PgPool,
        user_id: Uuid,
        notification_id: Uuid,
    ) -> Result<(), AppError> {
        if NotificationRepository::mark_read(pool, user_id, notification_id).await? {
            Ok(())
        } else {
            Err(AppError::NotFound("Notificación no encontrada".into()))
        }
    }

    pub async fn list_admin(pool: &PgPool) -> Result<NotificationAdminList, AppError> {
        let items = NotificationRepository::list_admin(pool).await?;
        Ok(NotificationAdminList {
            items: items.iter().map(NotificationAdminResponse::from).collect(),
            unread_count: 0,
        })
    }

    pub async fn create(
        pool: &PgPool,
        request: CreateNotificationRequest,
        created_by: Uuid,
    ) -> Result<crate::models::notification::Notification, AppError> {
        request
            .validate()
            .map_err(|error| AppError::Validation(error.to_string()))?;
        validate_status(&request.status)?;
        if request.kind.trim().is_empty()
            || request.title.trim().is_empty()
            || request.body.trim().is_empty()
        {
            return Err(AppError::Validation(
                "Los campos no pueden estar vacíos".into(),
            ));
        }
        Ok(NotificationRepository::create(pool, &request, created_by).await?)
    }

    pub async fn update_status(
        pool: &PgPool,
        id: Uuid,
        request: UpdateNotificationStatusRequest,
    ) -> Result<crate::models::notification::Notification, AppError> {
        request
            .validate()
            .map_err(|error| AppError::Validation(error.to_string()))?;
        validate_status(&request.status)?;
        NotificationRepository::update_status(pool, id, &request.status)
            .await?
            .ok_or_else(|| AppError::NotFound("Notificación no encontrada".into()))
    }

    pub async fn delete(pool: &PgPool, id: Uuid) -> Result<(), AppError> {
        if NotificationRepository::delete(pool, id).await? {
            Ok(())
        } else {
            Err(AppError::NotFound("Notificación no encontrada".into()))
        }
    }
}
