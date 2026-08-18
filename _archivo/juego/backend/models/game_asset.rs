use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use utoipa::ToSchema;

pub const GAME_ASSET_ID_MAX_CHARS: usize = 48;
pub const GAME_ASSET_DISPLAY_NAME_MAX_CHARS: usize = 64;

/// [297A-72] Límites de la importación de un GLB binario (Assets 3D).
pub const GAME_ASSET_GLB_MAX_BYTES: usize = 16 * 1024 * 1024;
pub const GAME_ASSET_GLB_KIND: &str = "glb";
/// Magic header del contenedor GLB (`glTF` en little-endian) y versión 2.
pub const GAME_ASSET_GLB_MAGIC: [u8; 4] = [0x67, 0x6C, 0x54, 0x46];
/// Prefijo de storage por hash bajo `upload_dir` (content-addressed).
pub const GAME_ASSET_STORAGE_PREFIX: &str = "assets";

/// Categorías del catálogo, alineadas con `AssetCategory` del contrato de mapa
/// (`terrain`, `tree`, `rock`, `water`, `character`, `generic`).
pub const GAME_ASSET_CATEGORIES: [&str; 6] =
    ["terrain", "tree", "rock", "water", "character", "generic"];

/// Asset del catálogo; no incluye storage keys ni scripts. `category`,
/// `is_active` y `created_at` son metadata administrativa interna.
#[derive(Debug, Clone, FromRow)]
pub struct GameAssetDefinition {
    pub id: String,
    pub display_name: String,
    pub category: String,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
}

/// Contrato público: solo lo necesario para colocar el asset en el editor.
#[derive(Debug, Clone, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct GameAssetPublicResponse {
    pub id: String,
    pub display_name: String,
    pub category: String,
}

impl From<GameAssetDefinition> for GameAssetPublicResponse {
    fn from(asset: GameAssetDefinition) -> Self {
        Self {
            id: asset.id,
            display_name: asset.display_name,
            category: asset.category,
        }
    }
}

/// Contrato administrativo: incluye el estado y la fecha para gestionar el catálogo.
#[derive(Debug, Clone, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct GameAssetAdminResponse {
    pub id: String,
    pub display_name: String,
    pub category: String,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
}

impl From<GameAssetDefinition> for GameAssetAdminResponse {
    fn from(asset: GameAssetDefinition) -> Self {
        Self {
            id: asset.id,
            display_name: asset.display_name,
            category: asset.category,
            is_active: asset.is_active,
            created_at: asset.created_at,
        }
    }
}

/// Alta de un nuevo asset allowlisted del catálogo (admin).
#[derive(Debug, Clone, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateGameAssetRequest {
    pub id: String,
    pub display_name: String,
    pub category: String,
}

/// Actualización completa de un asset del catálogo (admin).
#[derive(Debug, Clone, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdateGameAssetRequest {
    pub display_name: String,
    pub category: String,
    pub is_active: bool,
}

/// Proxy de colisión allowlisted de una versión (mismo contrato que el mapa).
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GameAssetVersionProxy {
    pub kind: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub radius: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub half_width: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub half_depth: Option<f64>,
}

/// Fila interna de una versión de asset. No se expone `storage_path` ni el
/// UUID interno desde HTTP (el público y el admin reciben DTOs acotados).
#[derive(Debug, Clone, FromRow)]
pub struct GameAssetVersionRow {
    pub id: uuid::Uuid,
    pub asset_id: String,
    pub version: i32,
    pub content_hash: String,
    pub storage_path: String,
    pub byte_size: i32,
    pub kind: String,
    pub category: String,
    pub proxy: Option<serde_json::Value>,
    pub scale: f64,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
}

/// Contrato admin de una versión: metadata sin rutas de storage.
#[derive(Debug, Clone, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct GameAssetVersionAdminResponse {
    pub asset_id: String,
    pub version: i32,
    pub content_hash: String,
    pub byte_size: i32,
    pub kind: String,
    pub category: String,
    pub proxy: Option<GameAssetVersionProxy>,
    pub scale: f64,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
}

impl From<GameAssetVersionRow> for GameAssetVersionAdminResponse {
    fn from(version: GameAssetVersionRow) -> Self {
        Self {
            asset_id: version.asset_id,
            version: version.version,
            content_hash: version.content_hash,
            byte_size: version.byte_size,
            kind: version.kind,
            category: version.category,
            proxy: version.proxy.and_then(parse_proxy),
            scale: version.scale,
            is_active: version.is_active,
            created_at: version.created_at,
        }
    }
}

/// Contrato público de la versión activa de un asset: lo que el editor y el
/// runtime necesitan para referenciar y colocar el modelo (id semántico
/// `{assetId}-v{version}` compatible con `assetVersionId` del mapa).
#[derive(Debug, Clone, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct GameAssetVersionPublicResponse {
    pub asset_id: String,
    pub version_id: String,
    pub version: i32,
    pub content_hash: String,
    pub category: String,
    pub proxy: Option<GameAssetVersionProxy>,
    pub scale: f64,
}

impl GameAssetVersionRow {
    #[must_use]
    pub fn version_id(&self) -> String {
        format!("{}-v{}", self.asset_id, self.version)
    }

    #[must_use]
    pub fn public_response(&self) -> GameAssetVersionPublicResponse {
        GameAssetVersionPublicResponse {
            asset_id: self.asset_id.clone(),
            version_id: self.version_id(),
            version: self.version,
            content_hash: self.content_hash.clone(),
            category: self.category.clone(),
            proxy: self.proxy.clone().and_then(parse_proxy),
            scale: self.scale,
        }
    }
}

/// Actualización de metadata de una versión AÚN NO ACTIVA (proxy/scale).
/// Una vez activada, la versión es inmutable: el trigger SQL bloquea cualquier
/// cambio salvo `is_active`, y el servicio rechaza la edición con 409.
#[derive(Debug, Clone, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdateGameAssetVersionRequest {
    pub proxy: Option<GameAssetVersionProxy>,
    pub scale: f64,
}

fn parse_proxy(value: serde_json::Value) -> Option<GameAssetVersionProxy> {
    serde_json::from_value(value).ok()
}

impl GameAssetDefinition {
    /// El ID de un asset solo contiene minúsculas ASCII, dígitos y guiones.
    #[must_use]
    pub fn is_valid_id(id: &str) -> bool {
        !id.is_empty()
            && id.chars().count() <= GAME_ASSET_ID_MAX_CHARS
            && id
                .bytes()
                .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
    }

    /// Etiqueta visible de un asset: sin controles, entre 1 y 64 caracteres.
    pub fn validate_display_name(value: &str) -> Result<String, &'static str> {
        let trimmed = value.trim();
        let count = trimmed.chars().count();
        if trimmed.is_empty() || count > GAME_ASSET_DISPLAY_NAME_MAX_CHARS {
            return Err("La etiqueta debe tener entre 1 y 64 caracteres");
        }
        if trimmed.chars().any(char::is_control) {
            return Err("La etiqueta contiene caracteres no permitidos");
        }
        Ok(trimmed.to_string())
    }

    /// Categoría permitida por el contrato del mapa (allowlisted).
    #[must_use]
    pub fn is_valid_category(value: &str) -> bool {
        GAME_ASSET_CATEGORIES.contains(&value)
    }
}
