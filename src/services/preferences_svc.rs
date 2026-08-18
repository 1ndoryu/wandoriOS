use sqlx::PgPool;
use uuid::Uuid;

use crate::errors::AppError;
use crate::models::preferences::{UpdateUserPreferencesRequest, UserPreferences};
use crate::repositories::preferences_repo::PreferencesRepository;

pub struct PreferencesService;

impl PreferencesService {
    pub async fn get(pool: &PgPool, user_id: Uuid) -> Result<UserPreferences, AppError> {
        Ok(PreferencesRepository::get(pool, user_id)
            .await?
            .unwrap_or_else(|| UserPreferences {
                user_id,
                theme: "system".to_string(),
                revision: 0,
                updated_at: chrono::Utc::now(),
            }))
    }

    pub async fn update(
        pool: &PgPool,
        user_id: Uuid,
        request: UpdateUserPreferencesRequest,
    ) -> Result<UserPreferences, AppError> {
        request
            .validate()
            .map_err(|message| AppError::Validation(message.into()))?;

        PreferencesRepository::update_if_revision(
            pool,
            user_id,
            &request.theme,
            request.expected_revision,
        )
        .await?
        .ok_or_else(|| AppError::Conflict("Las preferencias cambiaron; vuelve a leerlas".into()))
    }
}
