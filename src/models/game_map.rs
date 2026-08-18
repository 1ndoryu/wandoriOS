use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use sha2::Digest;
use std::collections::{BTreeMap, HashSet};
use utoipa::ToSchema;

pub const MAP_VERSION_SCHEMA: u8 = 1;
pub const MAP_VERSION_CHUNK_SIZE: u32 = 16;
pub const MAP_VERSION_MAX_ASSETS: usize = 256;
pub const MAP_VERSION_MAX_CHUNKS: usize = 1_024;
pub const MAP_VERSION_MAX_INSTANCES: usize = 10_000;
pub const MAP_VERSION_MAX_SPAWN_POINTS: usize = 64;
pub const MAP_VERSION_MIN_CELL_SIZE: f64 = 0.25;
pub const MAP_VERSION_MAX_CELL_SIZE: f64 = 8.0;
pub const MAP_VERSION_MAX_HEIGHT: f64 = 64.0;
pub const MAP_VERSION_MIN_SCALE: f64 = 0.1;
pub const MAP_VERSION_MAX_SCALE: f64 = 4.0;
pub const MAP_VERSION_MAX_ID_LENGTH: usize = 128;
pub const MAP_VERSION_MAX_CONTENT_HASH_LENGTH: usize = 256;
pub const MAP_VERSION_MAX_WORLD_WIDTH: f64 = 4_096.0;
pub const MAP_VERSION_MAX_WORLD_DEPTH: f64 = 4_096.0;
pub const MAP_VERSION_MAX_COLLIDER_SIZE: f64 = 256.0;
pub const MAP_VERSION_MAX_SPAWN_RADIUS: f64 = 8.0;
/// Límite por defecto para un documento antes de materializarlo con `serde_json`.
pub const MAP_VERSION_MAX_JSON_BYTES: usize = 4 * 1024 * 1024;

/// Normaliza recursivamente un documento para que el orden de claves no dependa
/// de cómo llegó el JSON del cliente ni de la representación de `jsonb`.
#[must_use]
pub fn canonicalize_document(document: &JsonValue) -> JsonValue {
    match document {
        JsonValue::Object(object) => {
            let mut keys = object.keys().collect::<Vec<_>>();
            keys.sort_unstable();
            let mut canonical = serde_json::Map::new();
            for key in keys {
                if let Some(value) = object.get(key) {
                    canonical.insert(key.clone(), canonicalize_document(value));
                }
            }
            JsonValue::Object(canonical)
        }
        JsonValue::Array(values) => {
            JsonValue::Array(values.iter().map(canonicalize_document).collect())
        }
        value => value.clone(),
    }
}

/// Bytes JSON deterministas usados como representación canónica del snapshot.
/// Publicación y lectura deben usar siempre esta misma función.
#[must_use]
pub fn document_json_bytes(document: &JsonValue) -> Option<Vec<u8>> {
    serde_json::to_vec(&canonicalize_document(document)).ok()
}

/// Hash estable del documento JSON que se almacena en `document`.
/// La publicación futura debe calcularlo sobre la misma representación JSON
/// que se persiste; el service lo vuelve a comprobar antes de servir.
#[must_use]
pub fn document_content_hash(document: &JsonValue) -> Option<String> {
    let bytes = document_json_bytes(document)?;
    Some(hex::encode(sha2::Sha256::digest(bytes)))
}

/// Valida un snapshot que ya está asociado a metadata de persistencia.
/// Se usa dentro de la transacción de publicación y al leer el mapa activo.
pub fn validate_snapshot_document(
    document: &JsonValue,
    map_id: &str,
    schema_version: i32,
    content_hash: &str,
) -> Result<MapVersion, String> {
    let bytes = document_json_bytes(document)
        .ok_or_else(|| "El documento no es serializable".to_string())?;
    let map = MapVersion::from_bounded_json(&bytes, MAP_VERSION_MAX_JSON_BYTES)?;
    if map.id != map_id || i32::from(map.schema_version) != schema_version {
        return Err("La metadata del snapshot no coincide con su documento".to_string());
    }
    if document_content_hash(document).as_deref() != Some(content_hash) {
        return Err("La integridad del snapshot del mapa no se pudo verificar".to_string());
    }
    Ok(map)
}

const RESERVED_IDS: [&str; 6] = [
    "__proto__",
    "prototype",
    "constructor",
    "toString",
    "valueOf",
    "hasOwnProperty",
];

/// Bounds del plano lógico X/Z de un mapa publicado.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MapBounds {
    #[serde(rename = "minX")]
    pub min_x: f64,
    #[serde(rename = "maxX")]
    pub max_x: f64,
    #[serde(rename = "minZ")]
    pub min_z: f64,
    #[serde(rename = "maxZ")]
    pub max_z: f64,
}

/// Coordenada continua del mundo lógico.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MapPosition {
    pub x: f64,
    pub z: f64,
}

/// Proxy estático allowlisted compartido por el renderer y la simulación.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", deny_unknown_fields)]
pub enum ColliderShape {
    #[serde(rename = "circle")]
    Circle { radius: f64 },
    #[serde(rename = "aabb")]
    Aabb {
        #[serde(rename = "halfWidth")]
        half_width: f64,
        #[serde(rename = "halfDepth")]
        half_depth: f64,
    },
}

/// Categorías de asset aceptadas por la primera versión del mapa.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AssetCategory {
    Terrain,
    Tree,
    Rock,
    Water,
    Character,
    Generic,
}

/// Anclaje de una instancia respecto del terreno.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TerrainAnchor {
    Surface,
    Absolute,
}

/// Versión inmutable de un asset referenciada por un mapa.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GameAssetVersion {
    pub id: String,
    pub category: AssetCategory,
    pub content_hash: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub collision_proxy: Option<ColliderShape>,
}

/// Chunk de terreno con vértices compartidos en los bordes.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TerrainChunk {
    pub x: i64,
    pub z: i64,
    pub heights: Vec<f64>,
    pub surfaces: Vec<u8>,
}

/// Documento de terreno finito que forma parte de un mapa publicado.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TerrainDocument {
    pub schema_version: u8,
    pub bounds: MapBounds,
    pub cell_size: f64,
    pub chunk_size: u32,
    pub chunks: Vec<TerrainChunk>,
}

/// Instancia estática de un asset dentro del mundo.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AssetInstance {
    pub id: String,
    pub asset_version_id: String,
    pub position: MapPosition,
    pub rotation_y: f64,
    pub scale: f64,
    pub terrain_anchor: TerrainAnchor,
}

/// Punto válido de aparición para jugadores.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SpawnPoint {
    pub id: String,
    pub position: MapPosition,
    pub radius: f64,
}

/// Snapshot publicado que el futuro servicio de mapas validará antes de usar.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MapVersion {
    pub schema_version: u8,
    pub id: String,
    pub terrain: TerrainDocument,
    pub asset_manifest: BTreeMap<String, GameAssetVersion>,
    pub instances: Vec<AssetInstance>,
    pub spawn_points: Vec<SpawnPoint>,
}

/// Request admin para publicar una versión inmutable del mapa.
#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PublishMapRequest {
    /// `0` para la primera publicación; después debe coincidir con la activa.
    pub expected_version: i32,
    /// Permite que el caller explicite el ID, pero siempre debe coincidir con `document.id`.
    pub map_id: Option<String>,
    #[schema(value_type = Object)]
    pub document: JsonValue,
}

impl PublishMapRequest {
    pub fn validate_metadata(&self) -> Result<(), &'static str> {
        if self.expected_version < 0 {
            return Err("expectedVersion no puede ser negativo");
        }
        if let Some(map_id) = &self.map_id {
            if map_id.trim().is_empty() || map_id.chars().count() > MAP_VERSION_MAX_ID_LENGTH {
                return Err("mapId no es válido");
            }
        }
        Ok(())
    }
}

/// Request admin para guardar el borrador editable de un mapa.
/// La revisión es optimista: el servidor rechaza con 409 si `revision` ya no
/// es la actual (otro editor guardó mientras tanto). `0` crea el borrador.
#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SaveDraftRequest {
    /// `0` para el primer guardado; después debe coincidir con la revisión actual.
    pub expected_revision: i32,
    /// Permite que el caller explicite el ID, pero siempre debe coincidir con `document.id`.
    pub map_id: Option<String>,
    #[schema(value_type = Object)]
    pub document: JsonValue,
}

impl SaveDraftRequest {
    pub fn validate_metadata(&self) -> Result<(), &'static str> {
        if self.expected_revision < 0 {
            return Err("expectedRevision no puede ser negativo");
        }
        if let Some(map_id) = &self.map_id {
            if map_id.trim().is_empty() || map_id.chars().count() > MAP_VERSION_MAX_ID_LENGTH {
                return Err("mapId no es válido");
            }
        }
        Ok(())
    }
}

/// Envelope admin del borrador. No incluye `updated_by`, UUID interno ni flags;
/// el documento ya fue validado por el service.
#[derive(Debug, Clone, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct GameMapDraftPublic {
    #[serde(rename = "mapId")]
    pub map_id: String,
    pub revision: i32,
    #[serde(rename = "schemaVersion")]
    pub schema_version: i32,
    #[serde(rename = "contentHash")]
    pub content_hash: String,
    #[serde(rename = "updatedAt")]
    pub updated_at: DateTime<Utc>,
    #[schema(value_type = Object)]
    pub document: JsonValue,
}

/// Envelope público del snapshot activo. No incluye `published_by`, UUID interno
/// ni flags administrativos; el documento ya fue validado por el service.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct GameMapVersionPublic {
    #[serde(rename = "mapId")]
    pub map_id: String,
    pub version: i32,
    #[serde(rename = "schemaVersion")]
    pub schema_version: i32,
    #[serde(rename = "contentHash")]
    pub content_hash: String,
    #[serde(rename = "publishedAt")]
    pub published_at: DateTime<Utc>,
    #[schema(value_type = Object)]
    pub document: JsonValue,
}

impl MapVersion {
    /// Deserializa y valida solo documentos cuyo tamaño cabe en la cuota indicada.
    /// La profundidad de JSON debe limitarse en el boundary HTTP que recibe el
    /// body; este módulo puro no materializa red ni sustituye ese límite.
    pub fn from_bounded_json(bytes: &[u8], max_bytes: usize) -> Result<Self, String> {
        if bytes.len() > max_bytes {
            return Err("MapVersion supera el tamaño máximo permitido".to_string());
        }
        let map: Self = serde_json::from_slice(bytes)
            .map_err(|_| "MapVersion contiene JSON inválido".to_string())?;
        map.validate()?;
        Ok(map)
    }

    /// Deserializa y valida usando el límite operativo por defecto.
    pub fn from_json(bytes: &[u8]) -> Result<Self, String> {
        Self::from_bounded_json(bytes, MAP_VERSION_MAX_JSON_BYTES)
    }

    /// Valida el documento completo y rechaza cualquier invariante rota.
    pub fn validate(&self) -> Result<(), String> {
        if self.schema_version != MAP_VERSION_SCHEMA {
            return Err("schemaVersion no soportado".to_string());
        }
        validate_id(&self.id, "id")?;
        self.terrain.validate()?;

        if self.asset_manifest.len() > MAP_VERSION_MAX_ASSETS {
            return Err("assetManifest supera la cuota de assets".to_string());
        }
        for (key, asset) in &self.asset_manifest {
            validate_id(key, "assetManifest key")?;
            if key != &asset.id {
                return Err(format!("assetManifest[{key}] no coincide con asset.id"));
            }
            validate_id(&asset.id, "asset.id")?;
            if asset.content_hash.trim().is_empty()
                || asset.content_hash.chars().count() > MAP_VERSION_MAX_CONTENT_HASH_LENGTH
            {
                return Err(format!("assetManifest[{key}].contentHash inválido"));
            }
            if let Some(proxy) = &asset.collision_proxy {
                proxy.validate(&format!("assetManifest[{key}].collisionProxy"))?;
            }
        }

        if self.instances.len() > MAP_VERSION_MAX_INSTANCES {
            return Err("instances supera la cuota de instancias".to_string());
        }
        let mut instance_ids = HashSet::with_capacity(self.instances.len());
        for (index, instance) in self.instances.iter().enumerate() {
            let path = format!("instances[{index}]");
            validate_id(&instance.id, &format!("{path}.id"))?;
            if !instance_ids.insert(&instance.id) {
                return Err(format!("{path}.id duplicado"));
            }
            let asset = self
                .asset_manifest
                .get(&instance.asset_version_id)
                .ok_or_else(|| format!("{path}.assetVersionId referencia un asset inexistente"))?;
            instance.position.validate(&format!("{path}.position"))?;
            if !instance.rotation_y.is_finite()
                || !instance.scale.is_finite()
                || instance.scale < MAP_VERSION_MIN_SCALE
                || instance.scale > MAP_VERSION_MAX_SCALE
            {
                return Err(format!("{path} transform fuera de límites"));
            }
            if let Some(proxy) = &asset.collision_proxy {
                if matches!(proxy, ColliderShape::Aabb { .. }) && instance.rotation_y != 0.0 {
                    return Err(format!("{path}.rotationY no permite rotar un AABB"));
                }
                let (half_width, half_depth) = proxy.half_extents();
                let effective_width = half_width * instance.scale;
                let effective_depth = half_depth * instance.scale;
                if effective_width > MAP_VERSION_MAX_COLLIDER_SIZE
                    || effective_depth > MAP_VERSION_MAX_COLLIDER_SIZE
                {
                    return Err(format!("{path}.scale produce un collider fuera de límites"));
                }
                if !inside_bounds(
                    &instance.position,
                    effective_width,
                    effective_depth,
                    &self.terrain.bounds,
                ) {
                    return Err(format!("{path}.position fuera de bounds"));
                }
            }
        }

        if self.spawn_points.is_empty() || self.spawn_points.len() > MAP_VERSION_MAX_SPAWN_POINTS {
            return Err("spawnPoints tiene una cuota inválida".to_string());
        }
        let mut spawn_ids = HashSet::with_capacity(self.spawn_points.len());
        for (index, spawn) in self.spawn_points.iter().enumerate() {
            let path = format!("spawnPoints[{index}]");
            validate_id(&spawn.id, &format!("{path}.id"))?;
            if !spawn_ids.insert(&spawn.id) {
                return Err(format!("{path}.id duplicado"));
            }
            spawn.position.validate(&format!("{path}.position"))?;
            if !spawn.radius.is_finite()
                || spawn.radius <= 0.0
                || spawn.radius > MAP_VERSION_MAX_SPAWN_RADIUS
            {
                return Err(format!("{path}.radius fuera de límites"));
            }
            if !inside_bounds(
                &spawn.position,
                spawn.radius,
                spawn.radius,
                &self.terrain.bounds,
            ) {
                return Err(format!("{path}.position fuera de bounds"));
            }
        }
        Ok(())
    }
}

impl TerrainDocument {
    fn validate(&self) -> Result<(), String> {
        if self.schema_version != MAP_VERSION_SCHEMA {
            return Err("terrain.schemaVersion no soportado".to_string());
        }
        self.bounds.validate()?;
        if !self.cell_size.is_finite()
            || !(MAP_VERSION_MIN_CELL_SIZE..=MAP_VERSION_MAX_CELL_SIZE).contains(&self.cell_size)
        {
            return Err("terrain.cellSize fuera de límites".to_string());
        }
        if self.chunk_size != MAP_VERSION_CHUNK_SIZE {
            return Err(format!(
                "terrain.chunkSize debe ser {MAP_VERSION_CHUNK_SIZE}"
            ));
        }
        if self.chunks.len() > MAP_VERSION_MAX_CHUNKS {
            return Err("terrain.chunks supera la cuota de chunks".to_string());
        }

        let expected_heights = (MAP_VERSION_CHUNK_SIZE as usize + 1).pow(2);
        let expected_surfaces = (MAP_VERSION_CHUNK_SIZE as usize).pow(2);
        let mut chunk_keys = HashSet::with_capacity(self.chunks.len());
        for (index, chunk) in self.chunks.iter().enumerate() {
            let path = format!("terrain.chunks[{index}]");
            if !chunk_keys.insert((chunk.x, chunk.z)) {
                return Err(format!("{path} duplicado"));
            }
            let chunk_x =
                u32::try_from(chunk.x).map_err(|_| format!("{path}.x fuera de límites"))?;
            let chunk_z =
                u32::try_from(chunk.z).map_err(|_| format!("{path}.z fuera de límites"))?;
            let chunk_width = f64::from(MAP_VERSION_CHUNK_SIZE) * self.cell_size;
            let chunk_min_x = self.bounds.min_x + f64::from(chunk_x) * chunk_width;
            let chunk_max_x = chunk_min_x + chunk_width;
            let chunk_min_z = self.bounds.min_z + f64::from(chunk_z) * chunk_width;
            let chunk_max_z = chunk_min_z + chunk_width;
            if !chunk_min_x.is_finite()
                || !chunk_max_x.is_finite()
                || chunk_min_x < self.bounds.min_x
                || chunk_max_x > self.bounds.max_x
                || chunk_min_z < self.bounds.min_z
                || chunk_max_z > self.bounds.max_z
            {
                return Err(format!("{path} fuera de bounds"));
            }
            if chunk.heights.len() != expected_heights {
                return Err(format!(
                    "{path}.heights debe contener {expected_heights} valores"
                ));
            }
            if chunk.surfaces.len() != expected_surfaces {
                return Err(format!(
                    "{path}.surfaces debe contener {expected_surfaces} valores"
                ));
            }
            if chunk
                .heights
                .iter()
                .any(|height| !height.is_finite() || height.abs() > MAP_VERSION_MAX_HEIGHT)
            {
                return Err(format!("{path}.heights contiene valores fuera de límites"));
            }
            if chunk.surfaces.iter().any(|surface| *surface > 15) {
                return Err(format!("{path}.surfaces contiene valores fuera de límites"));
            }
        }
        Ok(())
    }
}

impl MapBounds {
    fn validate(&self) -> Result<(), String> {
        if !self.min_x.is_finite()
            || !self.max_x.is_finite()
            || !self.min_z.is_finite()
            || !self.max_z.is_finite()
        {
            return Err("terrain.bounds requiere números finitos".to_string());
        }
        if self.min_x >= self.max_x || self.min_z >= self.max_z {
            return Err("terrain.bounds tiene mínimos inválidos".to_string());
        }
        if self.max_x - self.min_x > MAP_VERSION_MAX_WORLD_WIDTH {
            return Err("terrain.bounds supera el ancho máximo".to_string());
        }
        if self.max_z - self.min_z > MAP_VERSION_MAX_WORLD_DEPTH {
            return Err("terrain.bounds supera la profundidad máxima".to_string());
        }
        Ok(())
    }
}

impl MapPosition {
    fn validate(&self, path: &str) -> Result<(), String> {
        if !self.x.is_finite() || !self.z.is_finite() {
            return Err(format!("{path} requiere coordenadas finitas"));
        }
        Ok(())
    }
}

impl ColliderShape {
    fn validate(&self, path: &str) -> Result<(), String> {
        match self {
            Self::Circle { radius } => {
                if !radius.is_finite() || *radius <= 0.0 || *radius > MAP_VERSION_MAX_COLLIDER_SIZE
                {
                    return Err(format!("{path}.radius fuera de límites"));
                }
            }
            Self::Aabb {
                half_width,
                half_depth,
            } => {
                if !half_width.is_finite()
                    || !half_depth.is_finite()
                    || *half_width <= 0.0
                    || *half_depth <= 0.0
                    || *half_width > MAP_VERSION_MAX_COLLIDER_SIZE
                    || *half_depth > MAP_VERSION_MAX_COLLIDER_SIZE
                {
                    return Err(format!("{path} fuera de límites"));
                }
            }
        }
        Ok(())
    }

    fn half_extents(&self) -> (f64, f64) {
        match self {
            Self::Circle { radius } => (*radius, *radius),
            Self::Aabb {
                half_width,
                half_depth,
            } => (*half_width, *half_depth),
        }
    }
}

fn inside_bounds(
    position: &MapPosition,
    half_width: f64,
    half_depth: f64,
    bounds: &MapBounds,
) -> bool {
    position.x - half_width >= bounds.min_x
        && position.x + half_width <= bounds.max_x
        && position.z - half_depth >= bounds.min_z
        && position.z + half_depth <= bounds.max_z
}

fn validate_id(value: &str, path: &str) -> Result<(), String> {
    if value.trim().is_empty()
        || value.chars().count() > MAP_VERSION_MAX_ID_LENGTH
        || value.chars().any(char::is_control)
        || RESERVED_IDS.contains(&value)
    {
        return Err(format!("{path} requiere un id válido"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_map() -> MapVersion {
        let mut asset_manifest = BTreeMap::new();
        asset_manifest.insert(
            "tree-v1".to_string(),
            GameAssetVersion {
                id: "tree-v1".to_string(),
                category: AssetCategory::Tree,
                content_hash: "sha256:tree-v1".to_string(),
                collision_proxy: Some(ColliderShape::Circle { radius: 0.5 }),
            },
        );
        MapVersion {
            schema_version: MAP_VERSION_SCHEMA,
            id: "map-v1".to_string(),
            terrain: TerrainDocument {
                schema_version: MAP_VERSION_SCHEMA,
                bounds: MapBounds {
                    min_x: 0.0,
                    max_x: 32.0,
                    min_z: 0.0,
                    max_z: 32.0,
                },
                cell_size: 2.0,
                chunk_size: MAP_VERSION_CHUNK_SIZE,
                chunks: vec![TerrainChunk {
                    x: 0,
                    z: 0,
                    heights: vec![0.0; 289],
                    surfaces: vec![0; 256],
                }],
            },
            asset_manifest,
            instances: vec![AssetInstance {
                id: "tree-instance".to_string(),
                asset_version_id: "tree-v1".to_string(),
                position: MapPosition { x: 8.0, z: 8.0 },
                rotation_y: 0.0,
                scale: 1.0,
                terrain_anchor: TerrainAnchor::Surface,
            }],
            spawn_points: vec![SpawnPoint {
                id: "spawn".to_string(),
                position: MapPosition { x: 2.0, z: 2.0 },
                radius: 0.5,
            }],
        }
    }

    #[test]
    fn public_envelope_excludes_internal_publication_fields() {
        let envelope = GameMapVersionPublic {
            map_id: "map-v1".to_string(),
            version: 1,
            schema_version: 1,
            content_hash: "hash".to_string(),
            published_at: chrono::DateTime::parse_from_rfc3339("2026-08-01T00:00:00Z")
                .expect("fecha")
                .with_timezone(&Utc),
            document: serde_json::json!({ "id": "map-v1" }),
        };
        let json = serde_json::to_value(envelope).expect("serializa envelope");
        assert!(json.get("publishedBy").is_none());
        assert!(json.get("id").is_none());
        assert!(json.get("isActive").is_none());
        assert_eq!(json["mapId"], "map-v1");
    }

    #[test]
    fn rejects_negative_publish_revisions() {
        let request = PublishMapRequest {
            expected_version: -1,
            map_id: None,
            document: serde_json::json!({}),
        };
        assert_eq!(
            request.validate_metadata(),
            Err("expectedVersion no puede ser negativo")
        );
    }

    #[test]
    fn canonicalizes_object_key_order_before_hashing() {
        let mut first = serde_json::Map::new();
        first.insert("z".to_string(), serde_json::json!(1));
        first.insert("a".to_string(), serde_json::json!({ "y": 2, "b": 3 }));
        let mut second = serde_json::Map::new();
        second.insert("a".to_string(), serde_json::json!({ "b": 3, "y": 2 }));
        second.insert("z".to_string(), serde_json::json!(1));
        let first = JsonValue::Object(first);
        let second = JsonValue::Object(second);
        assert_eq!(document_json_bytes(&first), document_json_bytes(&second));
        assert_eq!(
            document_content_hash(&first),
            document_content_hash(&second)
        );
    }

    #[test]
    fn hashes_the_stored_json_document_deterministically() {
        let document = serde_json::json!({ "id": "map-v1", "schemaVersion": 1 });
        let canonical = canonicalize_document(&document);
        assert_eq!(
            document_content_hash(&canonical),
            Some("23fb4b973fd5e37023d9ede955e4f534b3cf854534f982078c9c5d432f087dbb".to_string())
        );
    }

    #[test]
    fn accepts_valid_map_and_uses_frontend_json_names() {
        let map = valid_map();
        assert_eq!(map.validate(), Ok(()));
        let json = serde_json::to_value(&map).expect("serializa MapVersion");
        assert_eq!(json["schemaVersion"], 1);
        assert_eq!(
            json["assetManifest"]["tree-v1"]["contentHash"],
            "sha256:tree-v1"
        );
        assert_eq!(json["terrain"]["chunkSize"], 16);
        let decoded: MapVersion = serde_json::from_value(json).expect("deserializa MapVersion");
        assert_eq!(decoded, map);
    }

    #[test]
    fn bounded_json_rejects_oversized_input_before_deserialization() {
        let bytes = vec![b' '; 32];
        let error = MapVersion::from_bounded_json(&bytes, 31).expect_err("cuota de bytes");
        assert!(error.contains("tamaño máximo"));
    }

    #[test]
    fn bounded_json_rejects_invalid_json_and_accepts_optional_proxy_omission() {
        let error = MapVersion::from_bounded_json(b"{invalid", 128).expect_err("JSON inválido");
        assert!(error.contains("JSON inválido"));

        let mut json = serde_json::to_value(valid_map()).expect("serializa MapVersion");
        json["assetManifest"]["tree-v1"]
            .as_object_mut()
            .expect("asset object")
            .remove("collisionProxy");
        let bytes = serde_json::to_vec(&json).expect("serializa proxy opcional");
        let decoded = MapVersion::from_json(&bytes).expect("proxy opcional");
        assert_eq!(decoded.asset_manifest["tree-v1"].collision_proxy, None);
    }

    #[test]
    fn accepts_assets_without_optional_collision_proxy() {
        let mut json = serde_json::to_value(valid_map()).expect("serializa MapVersion");
        json["assetManifest"]["tree-v1"]
            .as_object_mut()
            .expect("asset object")
            .remove("collisionProxy");
        let decoded: MapVersion = serde_json::from_value(json).expect("proxy opcional");
        assert_eq!(decoded.asset_manifest["tree-v1"].collision_proxy, None);
        assert_eq!(decoded.validate(), Ok(()));
    }

    #[test]
    fn rejects_unknown_contract_fields() {
        let mut json = serde_json::to_value(valid_map()).expect("serializa MapVersion");
        json.as_object_mut()
            .expect("map object")
            .insert("unexpected".to_string(), serde_json::json!(true));
        assert!(serde_json::from_value::<MapVersion>(json).is_err());
    }

    #[test]
    fn rejects_schema_and_broken_asset_references() {
        let mut map = valid_map();
        map.schema_version = 99;
        assert!(map.validate().is_err());
        let mut map = valid_map();
        map.instances[0].asset_version_id = "missing".to_string();
        let error = map.validate().expect_err("referencia inexistente");
        assert!(error.contains("assetVersionId"));
    }

    #[test]
    fn rejects_chunk_shape_duplicates_and_out_of_bounds() {
        let mut map = valid_map();
        map.terrain.chunks[0].heights.clear();
        assert!(map.validate().is_err());
        let mut map = valid_map();
        map.terrain.chunks.push(map.terrain.chunks[0].clone());
        assert!(map.validate().is_err());
        let mut map = valid_map();
        map.terrain.chunks[0].x = 1;
        assert!(map.validate().is_err());
    }

    #[test]
    fn rejects_reserved_ids_invalid_proxies_rotation_and_spawns() {
        let mut map = valid_map();
        map.id = "__proto__".to_string();
        assert!(map.validate().is_err());
        let mut map = valid_map();
        map.instances[0].rotation_y = 0.5;
        map.asset_manifest
            .get_mut("tree-v1")
            .expect("asset")
            .collision_proxy = Some(ColliderShape::Aabb {
            half_width: 1.0,
            half_depth: 1.0,
        });
        assert!(map.validate().is_err());
        let mut map = valid_map();
        map.spawn_points[0].position = MapPosition { x: -1.0, z: 2.0 };
        assert!(map.validate().is_err());
    }

    #[test]
    fn rejects_oversized_collections_and_non_finite_values() {
        let mut map = valid_map();
        map.terrain.chunks = (0..=MAP_VERSION_MAX_CHUNKS)
            .map(|index| TerrainChunk {
                x: i64::try_from(index).expect("test chunk index fits i64"),
                z: 0,
                heights: vec![0.0; 289],
                surfaces: vec![0; 256],
            })
            .collect();
        assert!(map.validate().is_err());
        let mut map = valid_map();
        map.instances[0].position.x = f64::NAN;
        assert!(map.validate().is_err());
    }
}
