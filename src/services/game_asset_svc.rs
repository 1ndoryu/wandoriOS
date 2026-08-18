use sha2::Digest;
use sqlx::PgPool;
use std::path::PathBuf;

use crate::errors::AppError;
use crate::models::game_asset::{
    CreateGameAssetRequest, GameAssetDefinition, GameAssetVersionAdminResponse,
    GameAssetVersionPublicResponse, UpdateGameAssetRequest, UpdateGameAssetVersionRequest,
    GAME_ASSET_GLB_KIND, GAME_ASSET_GLB_MAGIC, GAME_ASSET_GLB_MAX_BYTES, GAME_ASSET_STORAGE_PREFIX,
};
use crate::models::game_audit::{
    ACTION_ASSET_CREATED, ACTION_ASSET_UPDATED, ACTION_ASSET_VERSION_ACTIVATED,
    ACTION_ASSET_VERSION_CREATED, ACTION_ASSET_VERSION_UPDATED,
};
use crate::repositories::game_asset_repo::GameAssetRepository;
use crate::services::game_audit_svc::GameAuditService;

pub struct GameAssetService;

impl GameAssetService {
    pub async fn list_active(pool: &PgPool) -> Result<Vec<GameAssetDefinition>, AppError> {
        Ok(GameAssetRepository::list_active(pool).await?)
    }

    /// Listado completo para el panel admin (activas e inactivas).
    pub async fn list_all(pool: &PgPool) -> Result<Vec<GameAssetDefinition>, AppError> {
        Ok(GameAssetRepository::list_all(pool).await?)
    }

    /// Alta de un nuevo asset allowlisted. La autorización ya fue resuelta por
    /// el extractor `AdminUser` del handler; aquí solo se valida el input.
    /// [297A-60] La creación y su evento de auditoría comparten transacción.
    pub async fn create(
        pool: &PgPool,
        actor_id: uuid::Uuid,
        request: CreateGameAssetRequest,
    ) -> Result<GameAssetDefinition, AppError> {
        let display_name = validate_fields(&request.id, &request.display_name, &request.category)?;
        let mut tx = pool.begin().await?;

        let asset = match GameAssetRepository::create(
            &mut tx,
            &request.id,
            &display_name,
            &request.category,
        )
        .await
        {
            Ok(asset) => asset,
            Err(error) if is_unique_violation(&error) => {
                return Err(AppError::Conflict("Ya existe un asset con ese id".into()));
            }
            Err(error) => return Err(error.into()),
        };

        let payload = serde_json::json!({
            "displayName": asset.display_name,
            "category": asset.category,
            "isActive": asset.is_active,
        });
        GameAuditService::record_asset_change(
            &mut tx,
            actor_id,
            ACTION_ASSET_CREATED,
            &asset.id,
            &payload,
        )
        .await?;
        tx.commit().await?;
        Ok(asset)
    }

    /// [297A-72] Ruta content-addressed de un GLB bajo `upload_dir/assets`.
    /// El nombre solo depende del hash, por lo que no admite traversal.
    fn asset_storage_path(upload_dir: &str, content_hash: &str) -> PathBuf {
        PathBuf::from(upload_dir)
            .join(GAME_ASSET_STORAGE_PREFIX)
            .join(format!("{content_hash}.glb"))
    }

    /// Importa un GLB como nueva versión (inactiva) de un asset.
    /// [297-72] Valida el header binario y el tamaño ANTES de guardar, almacena
    /// por hash (content-addressed, deduplicado si ya existe) y registra la
    /// versión en la misma transacción con su evento de auditoría.
    pub async fn import_version(
        pool: &PgPool,
        upload_dir: &str,
        actor_id: uuid::Uuid,
        asset_id: &str,
        bytes: &[u8],
    ) -> Result<GameAssetVersionAdminResponse, AppError> {
        if !GameAssetDefinition::is_valid_id(asset_id) {
            return Err(AppError::Validation(
                "Identificador de asset no válido".into(),
            ));
        }
        if bytes.is_empty() || bytes.len() > GAME_ASSET_GLB_MAX_BYTES {
            return Err(AppError::Validation(format!(
                "El GLB debe pesar entre 1 byte y {} MiB",
                GAME_ASSET_GLB_MAX_BYTES / (1024 * 1024)
            )));
        }
        if bytes.len() < 12 || bytes[0..4] != GAME_ASSET_GLB_MAGIC {
            return Err(AppError::Validation(
                "El archivo no es un GLB válido (magic glTF ausente)".into(),
            ));
        }
        if u32::from_le_bytes([bytes[4], bytes[5], bytes[6], bytes[7]]) != 2 {
            return Err(AppError::Validation("Solo se admiten GLB versión 2".into()));
        }

        let asset = GameAssetRepository::get(pool, asset_id)
            .await?
            .ok_or_else(|| AppError::NotFound("Asset no encontrado".into()))?;

        let content_hash = hex::encode(sha2::Sha256::digest(bytes));
        let storage_path = Self::asset_storage_path(upload_dir, &content_hash);
        if let Some(parent) = storage_path.parent() {
            std::fs::create_dir_all(parent).map_err(|error| {
                AppError::Internal(format!("Error creando storage de assets: {error}"))
            })?;
        }
        /* Deduplicación: el hash ya existe en disco → no se reescribe. */
        if !storage_path.exists() {
            std::fs::write(&storage_path, bytes)
                .map_err(|error| AppError::Internal(format!("Error guardando el GLB: {error}")))?;
        }

        let storage_rel = format!("{GAME_ASSET_STORAGE_PREFIX}/{content_hash}.glb");
        let byte_size = i32::try_from(bytes.len())
            .map_err(|_| AppError::Validation("GLB demasiado grande".into()))?;

        let mut tx = pool.begin().await?;
        let version = GameAssetRepository::create_version(
            &mut tx,
            &asset.id,
            &content_hash,
            &storage_rel,
            byte_size,
            &asset.category,
            actor_id,
        )
        .await?;

        let payload = serde_json::json!({
            "version": version.version,
            "contentHash": version.content_hash,
            "byteSize": version.byte_size,
            "kind": GAME_ASSET_GLB_KIND,
        });
        GameAuditService::record_asset_change(
            &mut tx,
            actor_id,
            ACTION_ASSET_VERSION_CREATED,
            &asset.id,
            &payload,
        )
        .await?;
        tx.commit().await?;
        Ok(version.into())
    }

    /// [297A-73] Devuelve el contenido binario de una versión (GLB) para el
    /// preview 3D del panel admin. Solo admin (capacidad en el handler); el
    /// path se resuelve contra `upload_dir` sin exponer rutas de storage.
    pub async fn read_version_file(
        pool: &PgPool,
        upload_dir: &str,
        asset_id: &str,
        version: i32,
    ) -> Result<Vec<u8>, AppError> {
        if !GameAssetDefinition::is_valid_id(asset_id) {
            return Err(AppError::Validation(
                "Identificador de asset no válido".into(),
            ));
        }
        if version <= 0 {
            return Err(AppError::Validation("Versión no válida".into()));
        }
        let row = GameAssetRepository::get_version(pool, asset_id, version)
            .await?
            .ok_or_else(|| AppError::NotFound("Versión de asset no encontrada".into()))?;
        let path = crate::services::commerce::resolve_private_download_path(
            upload_dir,
            &row.storage_path,
        )?;
        tokio::fs::read(&path)
            .await
            .map_err(|error| AppError::Internal(format!("Error leyendo el GLB: {error}")))
    }

    /// Lista las versiones de un asset (admin, sin storage paths).
    pub async fn list_versions(
        pool: &PgPool,
        asset_id: &str,
    ) -> Result<Vec<GameAssetVersionAdminResponse>, AppError> {
        if !GameAssetDefinition::is_valid_id(asset_id) {
            return Err(AppError::Validation(
                "Identificador de asset no válido".into(),
            ));
        }
        let _ = GameAssetRepository::get(pool, asset_id)
            .await?
            .ok_or_else(|| AppError::NotFound("Asset no encontrado".into()))?;
        Ok(GameAssetRepository::list_versions(pool, asset_id)
            .await?
            .into_iter()
            .map(Into::into)
            .collect())
    }

    /// Versión activa de un asset para el contrato público (editor/runtime).
    /// 404 si el asset no existe o aún no tiene versión activa.
    pub async fn get_active_version(
        pool: &PgPool,
        asset_id: &str,
    ) -> Result<GameAssetVersionPublicResponse, AppError> {
        if !GameAssetDefinition::is_valid_id(asset_id) {
            return Err(AppError::Validation(
                "Identificador de asset no válido".into(),
            ));
        }
        let row = GameAssetRepository::get_active_version(pool, asset_id)
            .await?
            .ok_or_else(|| AppError::NotFound("El asset no tiene versión activa".into()))?;
        Ok(row.public_response())
    }

    /// Actualiza proxy/scale de una versión AÚN NO ACTIVA (metadata antes de
    /// publicar). Una versión activa es inmutable: 409.
    /// [297A-72] La edición y su evento de auditoría comparten transacción.
    pub async fn update_version_metadata(
        pool: &PgPool,
        actor_id: uuid::Uuid,
        asset_id: &str,
        version: i32,
        request: UpdateGameAssetVersionRequest,
    ) -> Result<GameAssetVersionAdminResponse, AppError> {
        validate_version_metadata(&request)?;
        let mut tx = pool.begin().await?;
        let proxy = request
            .proxy
            .map(|proxy| serde_json::to_value(&proxy))
            .transpose()
            .map_err(|_| AppError::Validation("Proxy de colisión inválido".into()))?;

        let row = GameAssetRepository::update_version_metadata(
            &mut tx,
            asset_id,
            version,
            proxy,
            request.scale,
        )
        .await?
        .ok_or_else(|| {
            AppError::Conflict("La versión no existe o ya está activa (inmutable)".into())
        })?;

        let payload = serde_json::json!({
            "version": row.version,
            "proxy": row.proxy,
            "scale": row.scale,
        });
        GameAuditService::record_asset_change(
            &mut tx,
            actor_id,
            ACTION_ASSET_VERSION_UPDATED,
            &row.asset_id,
            &payload,
        )
        .await?;
        tx.commit().await?;
        Ok(row.into())
    }

    /// Activa una versión (desactiva las demás). La versión activa queda
    /// inmutable: el trigger SQL bloquea cualquier cambio posterior.
    /// [297A-72] La activación y su evento de auditoría comparten transacción.
    pub async fn activate_version(
        pool: &PgPool,
        actor_id: uuid::Uuid,
        asset_id: &str,
        version: i32,
    ) -> Result<GameAssetVersionAdminResponse, AppError> {
        let mut tx = pool.begin().await?;
        let row = GameAssetRepository::activate_version(&mut tx, asset_id, version)
            .await?
            .ok_or_else(|| AppError::NotFound("Versión de asset no encontrada".into()))?;

        let payload = serde_json::json!({
            "version": row.version,
            "contentHash": row.content_hash,
            "isActive": true,
        });
        GameAuditService::record_asset_change(
            &mut tx,
            actor_id,
            ACTION_ASSET_VERSION_ACTIVATED,
            &row.asset_id,
            &payload,
        )
        .await?;
        tx.commit().await?;
        Ok(row.into())
    }

    /// Actualización completa de un asset, incluyendo desactivación.
    /// [297A-60] La actualización y su evento de auditoría comparten transacción.
    pub async fn update(
        pool: &PgPool,
        actor_id: uuid::Uuid,
        id: &str,
        request: UpdateGameAssetRequest,
    ) -> Result<GameAssetDefinition, AppError> {
        let display_name = validate_fields(id, &request.display_name, &request.category)?;
        let mut tx = pool.begin().await?;

        let asset = GameAssetRepository::update(
            &mut tx,
            id,
            &display_name,
            &request.category,
            request.is_active,
        )
        .await?
        .ok_or_else(|| AppError::NotFound("Asset no encontrado".into()))?;

        let payload = serde_json::json!({
            "displayName": asset.display_name,
            "category": asset.category,
            "isActive": asset.is_active,
        });
        GameAuditService::record_asset_change(
            &mut tx,
            actor_id,
            ACTION_ASSET_UPDATED,
            &asset.id,
            &payload,
        )
        .await?;
        tx.commit().await?;
        Ok(asset)
    }
}

fn validate_fields(id: &str, display_name: &str, category: &str) -> Result<String, AppError> {
    if !GameAssetDefinition::is_valid_id(id) {
        return Err(AppError::Validation(
            "Identificador de asset no válido".into(),
        ));
    }
    let display_name = GameAssetDefinition::validate_display_name(display_name)
        .map_err(|message| AppError::Validation(message.into()))?;
    if !GameAssetDefinition::is_valid_category(category) {
        return Err(AppError::Validation("Categoría de asset no válida".into()));
    }
    Ok(display_name)
}

fn is_unique_violation(error: &sqlx::Error) -> bool {
    matches!(error, sqlx::Error::Database(database) if database.is_unique_violation())
}

/// Valida la metadata allowlisted de una versión antes de persistirla:
/// escala finita dentro de 0.1..=4 y proxy con forma conocida y parámetros
/// coherentes (mismo contrato de colisión que el mapa).
fn validate_version_metadata(request: &UpdateGameAssetVersionRequest) -> Result<(), AppError> {
    if !request.scale.is_finite() || !(0.1..=4.0).contains(&request.scale) {
        return Err(AppError::Validation(
            "scale debe estar entre 0.1 y 4".into(),
        ));
    }
    if let Some(proxy) = &request.proxy {
        match proxy.kind.as_str() {
            "circle" => {
                let radius = proxy
                    .radius
                    .ok_or_else(|| AppError::Validation("proxy circle requiere radius".into()))?;
                if !radius.is_finite() || radius <= 0.0 || radius > 256.0 {
                    return Err(AppError::Validation("proxy radius fuera de límites".into()));
                }
            }
            "aabb" => {
                let half_width = proxy
                    .half_width
                    .ok_or_else(|| AppError::Validation("proxy aabb requiere halfWidth".into()))?;
                let half_depth = proxy
                    .half_depth
                    .ok_or_else(|| AppError::Validation("proxy aabb requiere halfDepth".into()))?;
                if !half_width.is_finite()
                    || !half_depth.is_finite()
                    || half_width <= 0.0
                    || half_depth <= 0.0
                    || half_width > 256.0
                    || half_depth > 256.0
                {
                    return Err(AppError::Validation("proxy aabb fuera de límites".into()));
                }
            }
            _ => {
                return Err(AppError::Validation(
                    "kind de proxy debe ser circle o aabb".into(),
                ));
            }
        }
    }
    Ok(())
}
