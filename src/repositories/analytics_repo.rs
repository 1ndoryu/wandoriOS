// sentinel-disable-file sqlx-query-sin-macro sqlx-query-as-sin-macro
// [por que] sqlx 0.8 sin feature "macros" y sin DB en compile-time (sin
// .sqlx cache ni DATABASE_URL de build): convertir a query!/query_as!
// romperia el build. Restriccion documentada en PLAN-corregir-1408.md §5.
use chrono::{DateTime, Utc};
use sqlx::{PgPool, Postgres, QueryBuilder};
use uuid::Uuid;

use crate::models::settings::{AnalyticsStats, RecentEvent, TopArticle, TrackEvent};

pub struct AnalyticsRepository;

impl AnalyticsRepository {
    pub async fn delete_before(pool: &PgPool, cutoff: DateTime<Utc>) -> Result<u64, sqlx::Error> {
        let result = sqlx::query("DELETE FROM analytics_events WHERE created_at < $1")
            .bind(cutoff)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }

    pub async fn insert_events(
        pool: &PgPool,
        events: &[TrackEvent],
        ip_hash: Option<&str>,
        user_agent: Option<&str>,
    ) -> Result<(), sqlx::Error> {
        if events.is_empty() {
            return Ok(());
        }
        let mut builder = QueryBuilder::<Postgres>::new(
            "INSERT INTO analytics_events (id, event_id, event_type, target_type, target_id, metadata, ip_hash, user_agent) ",
        );
        builder.push_values(events, |mut row, event| {
            row.push_bind(Uuid::new_v4())
                .push_bind(event.event_id.unwrap_or_else(Uuid::new_v4))
                .push_bind(&event.event_type)
                .push_bind(&event.target_type)
                .push_bind(event.target_id)
                .push_bind(&event.metadata)
                .push_bind(ip_hash)
                .push_bind(user_agent);
        });
        builder
            .push(" ON CONFLICT (event_id) WHERE event_id IS NOT NULL DO NOTHING")
            .build()
            .execute(pool)
            .await?;
        Ok(())
    }

    pub async fn get_stats(pool: &PgPool) -> Result<AnalyticsStats, sqlx::Error> {
        let (page_views,): (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM analytics_events WHERE event_type = 'page_view'")
                .fetch_one(pool)
                .await?;

        let (clicks,): (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM analytics_events WHERE event_type = 'click'")
                .fetch_one(pool)
                .await?;

        let (downloads,): (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM analytics_events WHERE event_type = 'download'")
                .fetch_one(pool)
                .await?;

        let (purchases,): (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM analytics_events WHERE event_type = 'purchase'")
                .fetch_one(pool)
                .await?;

        /* Top articulos por page views */
        let top_articles = sqlx::query_as::<_, (Uuid, String, i64)>(
            "SELECT a.id, a.title, COUNT(e.id) as views \
             FROM analytics_events e \
             JOIN articles a ON a.id::text = e.target_id::text \
             WHERE e.event_type = 'page_view' AND e.target_type = 'article' \
             GROUP BY a.id, a.title \
             ORDER BY views DESC LIMIT 10",
        )
        .fetch_all(pool)
        .await?
        .into_iter()
        .map(|(id, title, views)| TopArticle { id, title, views })
        .collect();

        /* Eventos recientes */
        let recent_events =
            sqlx::query_as::<_, (String, Option<String>, chrono::DateTime<chrono::Utc>)>(
                "SELECT event_type, target_type, created_at \
             FROM analytics_events ORDER BY created_at DESC LIMIT 20",
            )
            .fetch_all(pool)
            .await?
            .into_iter()
            .map(|(event_type, target_type, created_at)| RecentEvent {
                event_type,
                target_type,
                created_at,
            })
            .collect();

        Ok(AnalyticsStats {
            total_page_views: page_views,
            total_clicks: clicks,
            total_downloads: downloads,
            total_purchases: purchases,
            top_articles,
            recent_events,
        })
    }
}
