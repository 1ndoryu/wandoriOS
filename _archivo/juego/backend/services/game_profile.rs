use sqlx::PgPool;
use uuid::Uuid;

use crate::errors::AppError;
use crate::models::game_profile::{
    GameProfile, UpdateGameProfileRequest, GAME_PROFILE_DEFAULT_CHARACTER_ID,
    GAME_PROFILE_DEFAULT_DISPLAY_NAME,
};
use crate::repositories::game_profile_repo::{GameProfileRepository, GameProfileUpdateResult};

pub struct GameProfileService;

impl GameProfileService {
    pub async fn get(pool: &PgPool, user_id: Uuid) -> Result<GameProfile, AppError> {
        Ok(GameProfileRepository::get(pool, user_id)
            .await?
            .unwrap_or_else(|| GameProfile {
                user_id,
                display_name: GAME_PROFILE_DEFAULT_DISPLAY_NAME.to_string(),
                character_id: GAME_PROFILE_DEFAULT_CHARACTER_ID.to_string(),
                revision: 0,
                updated_at: chrono::Utc::now(),
            }))
    }

    pub async fn update(
        pool: &PgPool,
        user_id: Uuid,
        request: UpdateGameProfileRequest,
    ) -> Result<GameProfile, AppError> {
        let display_name = request
            .validate()
            .map_err(|message| AppError::Validation(message.into()))?;
        match GameProfileRepository::update_if_revision(
            pool,
            user_id,
            &display_name,
            &request.character_id,
            request.expected_revision,
        )
        .await?
        {
            GameProfileUpdateResult::Updated(profile) => Ok(profile),
            GameProfileUpdateResult::CharacterUnavailable => {
                Err(AppError::Validation("Personaje no disponible".into()))
            }
            GameProfileUpdateResult::RevisionConflict => Err(AppError::Conflict(
                "El perfil cambió; vuelve a leerlo".into(),
            )),
        }
    }
}
