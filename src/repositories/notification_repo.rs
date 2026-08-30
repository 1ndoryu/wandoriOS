// sentinel-disable-file sqlx-query-sin-macro sqlx-query-as-sin-macro
// [por que] sqlx 0.8 sin feature "macros" y sin DB en compile-time (sin
// .sqlx cache ni DATABASE_URL de build): convertir a query!/query_as!
// romperia el build. Restriccion documentada en PLAN-corregir-1408.md §5.
use sqlx::{PgConnection, PgPool};
use uuid::Uuid;

use crate::models::notification::{CreateNotificationRequest, Notification};

pub struct NotificationRepository;

impl NotificationRepository {
    pub async fn list_public(pool: &PgPool) -> Result<Vec<Notification>, sqlx::Error> {
        sqlx::query_as::<_, Notification>(
            "SELECT id, kind, title, body, release_version, status, created_by, published_at, created_at, false AS read
             FROM notifications WHERE status = 'published' ORDER BY created_at DESC LIMIT 50",
        )
        .fetch_all(pool)
        .await
    }

    pub async fn list_for_user(
        pool: &PgPool,
        user_id: Uuid,
    ) -> Result<Vec<Notification>, sqlx::Error> {
        sqlx::query_as::<_, Notification>(
            "SELECT n.id, n.kind, n.title, n.body, n.release_version, n.status, n.created_by,
                    n.published_at, n.created_at, (r.user_id IS NOT NULL) AS read
             FROM notifications n
             LEFT JOIN notification_reads r ON r.notification_id = n.id AND r.user_id = $1
             WHERE n.status = 'published' ORDER BY n.created_at DESC LIMIT 50",
        )
        .bind(user_id)
        .fetch_all(pool)
        .await
    }

    pub async fn unread_count(pool: &PgPool, user_id: Uuid) -> Result<i64, sqlx::Error> {
        let (count,): (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM notifications n
             LEFT JOIN notification_reads r ON r.notification_id = n.id AND r.user_id = $1
             WHERE n.status = 'published' AND r.user_id IS NULL",
        )
        .bind(user_id)
        .fetch_one(pool)
        .await?;
        Ok(count)
    }

    pub async fn mark_read(
        pool: &PgPool,
        user_id: Uuid,
        notification_id: Uuid,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "INSERT INTO notification_reads (notification_id, user_id)
             SELECT id, $2 FROM notifications WHERE id = $1 AND status = 'published'
             ON CONFLICT (notification_id, user_id) DO UPDATE SET read_at = NOW()",
        )
        .bind(notification_id)
        .bind(user_id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    pub async fn list_admin(pool: &PgPool) -> Result<Vec<Notification>, sqlx::Error> {
        sqlx::query_as::<_, Notification>(
            "SELECT id, kind, title, body, release_version, status, created_by, published_at, created_at, false AS read
             FROM notifications ORDER BY created_at DESC LIMIT 200",
        )
        .fetch_all(pool)
        .await
    }

    pub async fn create(
        pool: &PgPool,
        request: &CreateNotificationRequest,
        created_by: Uuid,
    ) -> Result<Notification, sqlx::Error> {
        sqlx::query_as::<_, Notification>(
            "INSERT INTO notifications (kind, title, body, release_version, status, created_by, published_at)
             VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $5 = 'published' THEN NOW() ELSE NULL END)
             RETURNING id, kind, title, body, release_version, status, created_by, published_at, created_at, false AS read",
        )
        .bind(&request.kind)
        .bind(&request.title)
        .bind(&request.body)
        .bind(request.release_version)
        .bind(&request.status)
        .bind(created_by)
        .fetch_one(pool)
        .await
    }

    pub async fn update_status(
        pool: &PgPool,
        id: Uuid,
        status: &str,
    ) -> Result<Option<Notification>, sqlx::Error> {
        sqlx::query_as::<_, Notification>(
            "UPDATE notifications SET status = $2,
                published_at = CASE WHEN $2 = 'published' AND published_at IS NULL THEN NOW()
                                    WHEN $2 <> 'published' THEN NULL ELSE published_at END
             WHERE id = $1
             RETURNING id, kind, title, body, release_version, status, created_by, published_at, created_at, false AS read",
        )
        .bind(id)
        .bind(status)
        .fetch_optional(pool)
        .await
    }

    /// Elimina una notificacion (incluye sus lecturas via ON DELETE CASCADE).
    pub async fn delete(pool: &PgPool, id: Uuid) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM notifications WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Inserts the release notice in the same transaction as the release.
    pub async fn create_release_notification(
        tx: &mut PgConnection,
        version: i32,
        created_by: Uuid,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            "INSERT INTO notifications (kind, title, body, release_version, status, created_by, published_at)
             SELECT 'workspace_release', 'Novedades del escritorio',
                    'El escritorio público está disponible en la versión ' || version || '.',
                    version, 'published', $2, published_at
             FROM workspace_releases WHERE version = $1
             ON CONFLICT (release_version) WHERE release_version IS NOT NULL DO NOTHING",
        )
        .bind(version)
        .bind(created_by)
        .execute(&mut *tx)
        .await?;
        Ok(())
    }
}
