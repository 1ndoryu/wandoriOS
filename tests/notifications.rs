// sentinel-disable-file sqlx-query-sin-macro sqlx-query-as-sin-macro
// [por que] sqlx 0.8 sin feature "macros" y sin DB en compile-time (sin
// .sqlx cache ni DATABASE_URL de build): convertir a query!/query_as!
// romperia el build. Restriccion documentada en PLAN-corregir-1408.md §5.
//! Tests de integración del ciclo de notificaciones de novedades (297A-21).
//! Verifican: idempotencia de la notificación por release (una release → una
//! notificación, sin duplicados al reintentar), dedupe (el índice único parcial
//! no admite dos avisos para la misma versión) y aislamiento por cuenta
//! (marcar leída una cuenta no afecta a las demás).
//! Necesitan `DATABASE_URL` apuntando a la BD local (glory_backend_wandorius).

use std::sync::OnceLock;

use sqlx::postgres::PgPoolOptions;
use uuid::Uuid;

use glory_backend::repositories::notification_repo::NotificationRepository;
use glory_backend::services::notification_svc::NotificationService;

/// Serializa los tests que publican: cada uno calcula version = max+1, y dos
/// publicaciones concurrentes colisionarían en la versión.
static PUBLISH_LOCK: OnceLock<tokio::sync::Mutex<()>> = OnceLock::new();
fn publish_lock() -> &'static tokio::sync::Mutex<()> {
    PUBLISH_LOCK.get_or_init(|| tokio::sync::Mutex::new(()))
}

struct TestContext {
    pool: sqlx::PgPool,
    admin_id: Uuid,
    releases_created: Vec<i32>,
    notifications_created: Vec<Uuid>,
}

impl TestContext {
    async fn new() -> Self {
        let database_url =
            std::env::var("DATABASE_URL").expect("DATABASE_URL requerido para tests");
        let pool = PgPoolOptions::new()
            .max_connections(8)
            .connect(&database_url)
            .await
            .expect("BD disponible");

        let admin_id = Uuid::new_v4();
        sqlx::query("INSERT INTO users (id, email, password_hash) VALUES ($1, $2, 'test-hash')")
            .bind(admin_id)
            .bind(format!("notifications-{admin_id}@example.invalid"))
            .execute(&pool)
            .await
            .expect("usuario admin de prueba creado");

        Self {
            pool,
            admin_id,
            releases_created: Vec::new(),
            notifications_created: Vec::new(),
        }
    }

    /// Crea una release de prueba con la siguiente versión libre.
    async fn create_release(&mut self) -> i32 {
        let next_version: i32 =
            sqlx::query_scalar("SELECT COALESCE(MAX(version), 0) + 1 FROM workspace_releases")
                .fetch_one(&self.pool)
                .await
                .expect("siguiente versión calculada");

        sqlx::query(
            "INSERT INTO workspace_releases (version, tree, published_by) \
             VALUES ($1, '{\"version\": 1, \"nodes\": {}}'::jsonb, $2)",
        )
        .bind(next_version)
        .bind(self.admin_id)
        .execute(&self.pool)
        .await
        .expect("release de prueba creada");

        self.releases_created.push(next_version);
        next_version
    }

    async fn cleanup(self) {
        for id in &self.notifications_created {
            let _ = sqlx::query("DELETE FROM notifications WHERE id = $1")
                .bind(id)
                .execute(&self.pool)
                .await;
        }
        for version in &self.releases_created {
            let _ = sqlx::query("DELETE FROM notifications WHERE release_version = $1")
                .bind(version)
                .execute(&self.pool)
                .await;
            let _ = sqlx::query("DELETE FROM workspace_releases WHERE version = $1")
                .bind(version)
                .execute(&self.pool)
                .await;
        }
        let _ = sqlx::query("DELETE FROM notification_reads WHERE user_id = $1")
            .bind(self.admin_id)
            .execute(&self.pool)
            .await;
        let _ = sqlx::query("DELETE FROM users WHERE id = $1")
            .bind(self.admin_id)
            .execute(&self.pool)
            .await;
    }
}

/// Crea un usuario secundario para probar el aislamiento de lecturas.
async fn create_user(pool: &sqlx::PgPool) -> Uuid {
    let id = Uuid::new_v4();
    sqlx::query("INSERT INTO users (id, email, password_hash) VALUES ($1, $2, 'test-hash')")
        .bind(id)
        .bind(format!("reader-{id}@example.invalid"))
        .execute(pool)
        .await
        .expect("usuario lector creado");
    id
}

#[tokio::test]
async fn release_notification_is_idempotent() {
    let _guard = publish_lock().lock().await;
    let mut ctx = TestContext::new().await;
    let version = ctx.create_release().await;

    /* La misma release publicada dos veces (reintento/transacción repetida)
     * debe producir UNA sola notificación: el índice único parcial
     * notifications_release_version_uq + ON CONFLICT DO NOTHING. */
    let mut tx = ctx.pool.begin().await.expect("tx abierta");
    NotificationRepository::create_release_notification(&mut tx, version, ctx.admin_id)
        .await
        .expect("primera notificación creada");
    tx.commit().await.expect("tx commiteada");

    let mut tx = ctx.pool.begin().await.expect("tx abierta");
    NotificationRepository::create_release_notification(&mut tx, version, ctx.admin_id)
        .await
        .expect("reintento aceptado (DO NOTHING)");
    tx.commit().await.expect("tx commiteada");

    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM notifications WHERE release_version = $1 AND kind = 'workspace_release'",
    )
    .bind(version)
    .fetch_one(&ctx.pool)
    .await
    .expect("conteo de notificaciones");

    assert_eq!(count, 1, "una release produce una única notificación");

    ctx.cleanup().await;
}

#[tokio::test]
async fn manual_notification_for_release_is_deduped() {
    let _guard = publish_lock().lock().await;
    let mut ctx = TestContext::new().await;
    let version = ctx.create_release().await;

    /* El índice único parcial también bloquea la creación manual de un aviso
     * con la misma release_version: no puede haber dos avisos para la misma
     * versión (dedupe anti-spam por fuente). */
    let first = NotificationRepository::create(
        &ctx.pool,
        &glory_backend::models::notification::CreateNotificationRequest {
            kind: "workspace_release".into(),
            title: "Novedades del escritorio".into(),
            body: format!("El escritorio público está disponible en la versión {version}."),
            release_version: Some(version),
            status: "published".into(),
        },
        ctx.admin_id,
    )
    .await
    .expect("primer aviso creado");
    ctx.notifications_created.push(first.id);

    let duplicate = NotificationRepository::create(
        &ctx.pool,
        &glory_backend::models::notification::CreateNotificationRequest {
            kind: "workspace_release".into(),
            title: "Novedades del escritorio (duplicado)".into(),
            body: format!("Versión {version} — duplicado de prueba."),
            release_version: Some(version),
            status: "published".into(),
        },
        ctx.admin_id,
    )
    .await;

    assert!(
        duplicate.is_err(),
        "no se admite un segundo aviso para la misma release_version"
    );

    ctx.cleanup().await;
}

#[tokio::test]
async fn reads_are_isolated_per_account() {
    let _guard = publish_lock().lock().await;
    let mut ctx = TestContext::new().await;
    let version = ctx.create_release().await;
    let reader = create_user(&ctx.pool).await;

    /* Crear la notificación de la release y el registro de lectura del lector
     * directamente (equivalente a mark_read por la API). */
    let mut tx = ctx.pool.begin().await.expect("tx abierta");
    NotificationRepository::create_release_notification(&mut tx, version, ctx.admin_id)
        .await
        .expect("notificación creada");
    tx.commit().await.expect("tx commiteada");

    let notification_id: Uuid =
        sqlx::query_scalar("SELECT id FROM notifications WHERE release_version = $1")
            .bind(version)
            .fetch_one(&ctx.pool)
            .await
            .expect("notificación localizada");

    /* El admin (publicador) la lee; el lector no. El flag `read` de la
     * notificación específica (no el unread_count global, sensible a avisos
     * de otros tests en la BD compartida) es lo que debe quedar aislado. */
    NotificationService::mark_read(&ctx.pool, ctx.admin_id, notification_id)
        .await
        .expect("marcada leída");

    let admin_items = NotificationService::list_for_user(&ctx.pool, ctx.admin_id)
        .await
        .expect("lista admin")
        .items;
    let admin_read = admin_items
        .iter()
        .find(|item| item.id == notification_id)
        .expect("notificación visible para el admin")
        .read;
    let reader_items = NotificationService::list_for_user(&ctx.pool, reader)
        .await
        .expect("lista lector")
        .items;
    let reader_read = reader_items
        .iter()
        .find(|item| item.id == notification_id)
        .expect("notificación visible para el lector")
        .read;

    assert!(admin_read, "el publicador la marcó leída");
    assert!(
        !reader_read,
        "el lector sigue sin leer (aislamiento por cuenta)"
    );

    /* Marcar leída es idempotente: reintentar no duplica el registro. */
    NotificationService::mark_read(&ctx.pool, ctx.admin_id, notification_id)
        .await
        .expect("reintento aceptado");
    let read_rows: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM notification_reads WHERE notification_id = $1 AND user_id = $2",
    )
    .bind(notification_id)
    .bind(ctx.admin_id)
    .fetch_one(&ctx.pool)
    .await
    .expect("conteo de lecturas");

    assert_eq!(read_rows, 1, "marcar leída no duplica el registro");

    let _ = sqlx::query("DELETE FROM users WHERE id = $1")
        .bind(reader)
        .execute(&ctx.pool)
        .await;
    ctx.cleanup().await;
}
