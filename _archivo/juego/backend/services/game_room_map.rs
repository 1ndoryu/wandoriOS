//! GAME-01 — Mapa inmutable, índice espacial y movimiento server-authoritative.

use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use crate::models::game_map::{
    GameMapVersionPublic, MapPosition, MapVersion, MAP_VERSION_MAX_COLLIDER_SIZE,
    MAP_VERSION_MAX_INSTANCES, MAP_VERSION_MAX_SPAWN_POINTS, MAP_VERSION_MAX_WORLD_DEPTH,
    MAP_VERSION_MAX_WORLD_WIDTH,
};

const SPATIAL_CELL_SIZE: f64 = 8.0;
const SPATIAL_INDEX_MAX_REFERENCES: usize = 100_000;

/* [297A-44] El validador de MapVersion limita el mundo a 4096 unidades y los
 * proxies a 256; por tanto cada coordenada de celda queda dentro de i32. */
#[allow(clippy::cast_possible_truncation)]
fn floor_cell(value: f64) -> i32 {
    let floored = value.floor();
    debug_assert!(floored >= f64::from(i32::MIN) && floored <= f64::from(i32::MAX));
    floored as i32
}

/* [297A-44] El tick usa velocidad 4 y delta máximo 0.1, así que un paso
 * nunca supera 0.4 unidades: con subpaso 0.25 solo puede requerir 1 o 2. */
fn bounded_substeps(distance: f64) -> (usize, f64) {
    debug_assert!(distance.is_finite() && distance <= 0.4);
    if distance <= 0.25 {
        (1, 1.0)
    } else {
        (2, 2.0)
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct RoomBounds {
    pub min_x: f64,
    pub max_x: f64,
    pub min_z: f64,
    pub max_z: f64,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum RoomCollider {
    Circle {
        x: f64,
        z: f64,
        radius: f64,
    },
    Aabb {
        x: f64,
        z: f64,
        half_width: f64,
        half_depth: f64,
    },
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct RoomSpawn {
    pub x: f64,
    pub z: f64,
    pub radius: f64,
}

#[derive(Debug, Clone)]
struct RoomSpatialIndex {
    cells: HashMap<(i32, i32), Vec<usize>>,
}

impl RoomSpatialIndex {
    fn build(colliders: &[RoomCollider]) -> Result<Self, String> {
        let mut total_references = 0_usize;
        for collider in colliders {
            let (x, z, half_width, half_depth) = collider.extents();
            let min_x = i64::from(floor_cell((x - half_width) / SPATIAL_CELL_SIZE));
            let max_x = i64::from(floor_cell((x + half_width) / SPATIAL_CELL_SIZE));
            let min_z = i64::from(floor_cell((z - half_depth) / SPATIAL_CELL_SIZE));
            let max_z = i64::from(floor_cell((z + half_depth) / SPATIAL_CELL_SIZE));
            let width = usize::try_from(max_x - min_x + 1)
                .map_err(|_| "índice espacial fuera de límites".to_string())?;
            let depth = usize::try_from(max_z - min_z + 1)
                .map_err(|_| "índice espacial fuera de límites".to_string())?;
            let references = width
                .checked_mul(depth)
                .ok_or_else(|| "índice espacial fuera de límites".to_string())?;
            total_references = total_references
                .checked_add(references)
                .ok_or_else(|| "índice espacial fuera de límites".to_string())?;
            if total_references > SPATIAL_INDEX_MAX_REFERENCES {
                return Err("el índice espacial supera su presupuesto".to_string());
            }
        }

        let mut cells = HashMap::<(i32, i32), Vec<usize>>::new();
        for (index, collider) in colliders.iter().enumerate() {
            let (x, z, half_width, half_depth) = collider.extents();
            let min_x = floor_cell((x - half_width) / SPATIAL_CELL_SIZE);
            let max_x = floor_cell((x + half_width) / SPATIAL_CELL_SIZE);
            let min_z = floor_cell((z - half_depth) / SPATIAL_CELL_SIZE);
            let max_z = floor_cell((z + half_depth) / SPATIAL_CELL_SIZE);
            for cell_x in min_x..=max_x {
                for cell_z in min_z..=max_z {
                    cells.entry((cell_x, cell_z)).or_default().push(index);
                }
            }
        }
        Ok(Self { cells })
    }

    fn query(&self, position: (f64, f64), radius: f64) -> impl Iterator<Item = usize> + '_ {
        let min_x = floor_cell((position.0 - radius) / SPATIAL_CELL_SIZE);
        let max_x = floor_cell((position.0 + radius) / SPATIAL_CELL_SIZE);
        let min_z = floor_cell((position.1 - radius) / SPATIAL_CELL_SIZE);
        let max_z = floor_cell((position.1 + radius) / SPATIAL_CELL_SIZE);
        let mut ids = HashSet::new();
        for cell_x in min_x..=max_x {
            for cell_z in min_z..=max_z {
                if let Some(entries) = self.cells.get(&(cell_x, cell_z)) {
                    ids.extend(entries.iter().copied());
                }
            }
        }
        ids.into_iter()
    }
}

#[derive(Debug, Clone)]
pub struct GameRoomMap {
    pub id: String,
    pub version: i32,
    pub bounds: RoomBounds,
    pub colliders: Arc<[RoomCollider]>,
    pub spawns: Arc<[RoomSpawn]>,
    spatial_index: RoomSpatialIndex,
}

impl GameRoomMap {
    pub fn from_parts(
        id: String,
        version: i32,
        bounds: RoomBounds,
        colliders: Vec<RoomCollider>,
        spawns: Vec<RoomSpawn>,
    ) -> Result<Self, String> {
        if id.trim().is_empty() || version < 1 {
            return Err("metadata de mapa inválida".to_string());
        }
        if !bounds.min_x.is_finite()
            || !bounds.max_x.is_finite()
            || !bounds.min_z.is_finite()
            || !bounds.max_z.is_finite()
            || bounds.min_x >= bounds.max_x
            || bounds.min_z >= bounds.max_z
            || bounds.max_x - bounds.min_x > MAP_VERSION_MAX_WORLD_WIDTH
            || bounds.max_z - bounds.min_z > MAP_VERSION_MAX_WORLD_DEPTH
        {
            return Err("bounds de mapa inválidos".to_string());
        }
        if colliders.len() > MAP_VERSION_MAX_INSTANCES {
            return Err("el mapa supera la cuota de colliders".to_string());
        }
        if spawns.is_empty() || spawns.len() > MAP_VERSION_MAX_SPAWN_POINTS {
            return Err("el mapa supera la cuota de spawns".to_string());
        }
        for collider in &colliders {
            let (x, z, half_width, half_depth) = collider.extents();
            if !x.is_finite()
                || !z.is_finite()
                || !half_width.is_finite()
                || !half_depth.is_finite()
                || half_width <= 0.0
                || half_depth <= 0.0
                || half_width > MAP_VERSION_MAX_COLLIDER_SIZE
                || half_depth > MAP_VERSION_MAX_COLLIDER_SIZE
                || x - half_width < bounds.min_x
                || x + half_width > bounds.max_x
                || z - half_depth < bounds.min_z
                || z + half_depth > bounds.max_z
            {
                return Err("collider de mapa inválido".to_string());
            }
        }
        if spawns.is_empty()
            || spawns.iter().any(|spawn| {
                !spawn.x.is_finite()
                    || !spawn.z.is_finite()
                    || !spawn.radius.is_finite()
                    || spawn.radius <= 0.0
                    || spawn.x - spawn.radius < bounds.min_x
                    || spawn.x + spawn.radius > bounds.max_x
                    || spawn.z - spawn.radius < bounds.min_z
                    || spawn.z + spawn.radius > bounds.max_z
                    || colliders
                        .iter()
                        .any(|collider| collider.intersects((spawn.x, spawn.z), spawn.radius))
            })
        {
            return Err("spawn de mapa inválido".to_string());
        }
        let spatial_index = RoomSpatialIndex::build(&colliders)?;
        Ok(Self {
            id,
            version,
            bounds,
            colliders: colliders.into(),
            spawns: spawns.into(),
            spatial_index,
        })
    }

    pub fn from_public(public: &GameMapVersionPublic) -> Result<Self, String> {
        let bytes = crate::models::game_map::document_json_bytes(&public.document)
            .ok_or_else(|| "documento de mapa no serializable".to_string())?;
        let map = MapVersion::from_json(&bytes)?;
        if crate::models::game_map::document_content_hash(&public.document).as_deref()
            != Some(public.content_hash.as_str())
        {
            return Err("hash de mapa inconsistente".to_string());
        }
        if map.id != public.map_id || i32::from(map.schema_version) != public.schema_version {
            return Err("metadata de mapa inconsistente".to_string());
        }
        Self::from_model(&map, public.version)
    }

    pub fn from_model(map: &MapVersion, version: i32) -> Result<Self, String> {
        map.validate()?;
        let bounds = RoomBounds {
            min_x: map.terrain.bounds.min_x,
            max_x: map.terrain.bounds.max_x,
            min_z: map.terrain.bounds.min_z,
            max_z: map.terrain.bounds.max_z,
        };
        let colliders = map
            .instances
            .iter()
            .filter_map(|instance| {
                let asset = map.asset_manifest.get(&instance.asset_version_id)?;
                let proxy = asset.collision_proxy.as_ref()?;
                Some(match proxy {
                    crate::models::game_map::ColliderShape::Circle { radius } => {
                        RoomCollider::Circle {
                            x: instance.position.x,
                            z: instance.position.z,
                            radius: radius * instance.scale,
                        }
                    }
                    crate::models::game_map::ColliderShape::Aabb {
                        half_width,
                        half_depth,
                    } => RoomCollider::Aabb {
                        x: instance.position.x,
                        z: instance.position.z,
                        half_width: half_width * instance.scale,
                        half_depth: half_depth * instance.scale,
                    },
                })
            })
            .collect::<Vec<_>>();
        let spawns = map
            .spawn_points
            .iter()
            .map(|spawn| RoomSpawn {
                x: spawn.position.x,
                z: spawn.position.z,
                radius: spawn.radius,
            })
            .collect::<Vec<_>>();
        Self::from_parts(map.id.clone(), version, bounds, colliders, spawns)
    }

    #[must_use]
    pub fn map_version(&self) -> String {
        format!("{}@{}", self.id, self.version)
    }

    #[must_use]
    pub fn spawn_position(&self, player_index: usize) -> (f64, f64) {
        let spawn = &self.spawns[player_index % self.spawns.len()];
        (spawn.x, spawn.z)
    }

    #[must_use]
    pub fn move_circle(
        &self,
        start: (f64, f64),
        direction: (f64, f64),
        radius: f64,
        delta_seconds: f64,
    ) -> ((f64, f64), (f64, f64)) {
        const SPEED: f64 = 4.0;
        let length = direction.0.hypot(direction.1);
        let normalized = if length > 0.0 && length.is_finite() {
            (direction.0 / length, direction.1 / length)
        } else {
            (0.0, 0.0)
        };
        let velocity = (normalized.0 * SPEED, normalized.1 * SPEED);
        let delta = (velocity.0 * delta_seconds, velocity.1 * delta_seconds);
        let (steps, step_count) = bounded_substeps(delta.0.hypot(delta.1));
        let step = (delta.0 / step_count, delta.1 / step_count);
        let mut position = start;
        for _ in 0..steps {
            let x_candidate = (position.0 + step.0, position.1);
            if self.valid_position(x_candidate, radius) {
                position = x_candidate;
            }
            let z_candidate = (position.0, position.1 + step.1);
            if self.valid_position(z_candidate, radius) {
                position = z_candidate;
            }
        }
        (position, velocity)
    }

    fn valid_position(&self, position: (f64, f64), radius: f64) -> bool {
        if position.0 - radius < self.bounds.min_x
            || position.0 + radius > self.bounds.max_x
            || position.1 - radius < self.bounds.min_z
            || position.1 + radius > self.bounds.max_z
        {
            return false;
        }
        !self
            .spatial_index
            .query(position, radius)
            .any(|index| self.colliders[index].intersects(position, radius))
    }

    #[must_use]
    pub fn point(position: &MapPosition) -> (f64, f64) {
        (position.x, position.z)
    }
}

impl RoomCollider {
    fn extents(self) -> (f64, f64, f64, f64) {
        match self {
            Self::Circle { x, z, radius } => (x, z, radius, radius),
            Self::Aabb {
                x,
                z,
                half_width,
                half_depth,
            } => (x, z, half_width, half_depth),
        }
    }

    fn intersects(self, position: (f64, f64), radius: f64) -> bool {
        match self {
            Self::Circle {
                x,
                z,
                radius: other,
            } => (position.0 - x).hypot(position.1 - z) < radius + other,
            Self::Aabb {
                x,
                z,
                half_width,
                half_depth,
            } => {
                let nearest_x = position.0.clamp(x - half_width, x + half_width);
                let nearest_z = position.1.clamp(z - half_depth, z + half_depth);
                (position.0 - nearest_x).hypot(position.1 - nearest_z) < radius
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{GameRoomMap, RoomBounds, RoomCollider, RoomSpawn};

    #[test]
    fn movement_stops_at_static_circle_collider() {
        let map = GameRoomMap::from_parts(
            "forest".to_string(),
            1,
            RoomBounds {
                min_x: 0.0,
                max_x: 32.0,
                min_z: 0.0,
                max_z: 32.0,
            },
            vec![RoomCollider::Circle {
                x: 2.8,
                z: 2.0,
                radius: 0.3,
            }],
            vec![RoomSpawn {
                x: 8.0,
                z: 2.0,
                radius: 0.5,
            }],
        )
        .expect("mapa con collider válido");

        let (position, velocity) = map.move_circle((2.0, 2.0), (1.0, 0.0), 0.5, 0.1);

        assert_eq!(position, (2.0, 2.0));
        assert!(velocity.0 > 0.0);
    }

    #[test]
    fn rejects_spawn_inside_static_collider() {
        let result = GameRoomMap::from_parts(
            "forest".to_string(),
            1,
            RoomBounds {
                min_x: 0.0,
                max_x: 32.0,
                min_z: 0.0,
                max_z: 32.0,
            },
            vec![RoomCollider::Circle {
                x: 4.0,
                z: 4.0,
                radius: 1.0,
            }],
            vec![RoomSpawn {
                x: 4.0,
                z: 4.0,
                radius: 0.5,
            }],
        );

        assert!(result.is_err());
    }
}
