use std::collections::HashMap;

use chrono::{DateTime, Duration, Utc};

use sqlx::PgPool;

use crate::errors::AppError;
use crate::models::settings::{AnalyticsStats, TrackEvent};
use crate::repositories::analytics_repo::AnalyticsRepository;
use crate::repositories::settings_repo::SettingsRepository;

pub struct SettingsService;

impl SettingsService {
    pub async fn get_public(pool: &PgPool) -> Result<HashMap<String, String>, AppError> {
        Ok(SettingsRepository::get_public(pool).await?)
    }

    pub async fn update_batch(
        pool: &PgPool,
        settings: &HashMap<String, String>,
    ) -> Result<(), AppError> {
        SettingsRepository::upsert_batch(pool, settings).await?;
        Ok(())
    }
}

pub struct AnalyticsService;

impl AnalyticsService {
    pub async fn track_events(
        pool: &PgPool,
        events: &[TrackEvent],
        ip_hash: Option<&str>,
        user_agent: Option<&str>,
        consent_granted: bool,
    ) -> Result<(), AppError> {
        if !consent_granted {
            return Ok(());
        }
        if events.len() > 50 {
            return Err(AppError::Validation(
                "El lote de analytics no puede superar 50 eventos".into(),
            ));
        }
        AnalyticsRepository::insert_events(pool, events, ip_hash, user_agent).await?;
        Ok(())
    }

    pub async fn purge_older_than(
        pool: &PgPool,
        max_age_days: i32,
    ) -> Result<(u64, DateTime<Utc>), AppError> {
        let cutoff = Utc::now() - Duration::days(i64::from(max_age_days));
        let deleted = AnalyticsRepository::delete_before(pool, cutoff).await?;
        Ok((deleted, cutoff))
    }

    pub async fn get_stats(pool: &PgPool) -> Result<AnalyticsStats, AppError> {
        Ok(AnalyticsRepository::get_stats(pool).await?)
    }
}
