use sqlx::PgPool;

use crate::errors::AppError;
use crate::models::game_audit::{ACTION_CHARACTER_CREATED, ACTION_CHARACTER_UPDATED};
use crate::models::game_character::{
    CreateGameCharacterRequest, GameCharacterDefinition, UpdateGameCharacterRequest,
};
use crate::repositories::game_character_repo::GameCharacterRepository;
use crate::services::game_audit_svc::GameAuditService;

pub struct GameCharacterService;

impl GameCharacterService {
    pub async fn list_active(pool: &PgPool) -> Result<Vec<GameCharacterDefinition>, AppError> {
        Ok(GameCharacterRepository::list_active(pool).await?)
    }

    /// Listado completo para el panel admin (activas e inactivas).
    pub async fn list_all(pool: &PgPool) -> Result<Vec<GameCharacterDefinition>, AppError> {
        Ok(GameCharacterRepository::list_all(pool).await?)
    }

    /// Alta de una nueva opción allowlisted. La autorización ya fue resuelta
    /// por el extractor `AdminUser` del handler; aquí solo se valida el input.
    /// [297A-55] La creación y su evento de auditoría comparten transacción.
    pub async fn create(
        pool: &PgPool,
        actor_id: uuid::Uuid,
        request: CreateGameCharacterRequest,
    ) -> Result<GameCharacterDefinition, AppError> {
        let display_name = validate_fields(&request.id, &request.display_name, &request.body_tone)?;
        let mut tx = pool.begin().await?;

        let character = match GameCharacterRepository::create(
            &mut tx,
            &request.id,
            &display_name,
            &request.body_tone,
        )
        .await
        {
            Ok(character) => character,
            Err(error) if is_unique_violation(&error) => {
                return Err(AppError::Conflict(
                    "Ya existe un personaje con ese id".into(),
                ));
            }
            Err(error) => return Err(error.into()),
        };

        let payload = serde_json::json!({
            "displayName": character.display_name,
            "bodyTone": character.body_tone,
            "isActive": character.is_active,
        });
        GameAuditService::record_character_change(
            &mut tx,
            actor_id,
            ACTION_CHARACTER_CREATED,
            &character.id,
            &payload,
        )
        .await?;
        tx.commit().await?;
        Ok(character)
    }

    /// Actualización completa de una opción, incluyendo desactivación.
    /// [297A-55] La actualización y su evento de auditoría comparten transacción.
    pub async fn update(
        pool: &PgPool,
        actor_id: uuid::Uuid,
        id: &str,
        request: UpdateGameCharacterRequest,
    ) -> Result<GameCharacterDefinition, AppError> {
        let display_name = validate_fields(id, &request.display_name, &request.body_tone)?;
        let mut tx = pool.begin().await?;

        let character = GameCharacterRepository::update(
            &mut tx,
            id,
            &display_name,
            &request.body_tone,
            request.is_active,
        )
        .await?
        .ok_or_else(|| AppError::NotFound("Personaje no encontrado".into()))?;

        let payload = serde_json::json!({
            "displayName": character.display_name,
            "bodyTone": character.body_tone,
            "isActive": character.is_active,
        });
        GameAuditService::record_character_change(
            &mut tx,
            actor_id,
            ACTION_CHARACTER_UPDATED,
            &character.id,
            &payload,
        )
        .await?;
        tx.commit().await?;
        Ok(character)
    }
}

fn validate_fields(id: &str, display_name: &str, body_tone: &str) -> Result<String, AppError> {
    if !GameCharacterDefinition::is_valid_id(id) {
        return Err(AppError::Validation(
            "Identificador de personaje no válido".into(),
        ));
    }
    let display_name = GameCharacterDefinition::validate_display_name(display_name)
        .map_err(|message| AppError::Validation(message.into()))?;
    if !GameCharacterDefinition::is_valid_body_tone(body_tone) {
        return Err(AppError::Validation("Tono de cuerpo no válido".into()));
    }
    Ok(display_name)
}

fn is_unique_violation(error: &sqlx::Error) -> bool {
    matches!(error, sqlx::Error::Database(database) if database.is_unique_violation())
}
