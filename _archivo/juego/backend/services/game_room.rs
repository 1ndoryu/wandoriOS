//! GAME-01 — Actor server-authoritative de una sala realtime.
//!
//! El actor es dueño exclusivo de jugadores, secuencias y posiciones. El
//! transporte solo entrega mensajes ya parseados y recibe envelopes bounded.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use std::sync::RwLock;

use tokio::sync::{mpsc, oneshot};
use uuid::Uuid;

use crate::models::game_profile::GAME_PROFILE_DEFAULT_CHARACTER_ID;
use crate::models::game_realtime::{
    assess_sequence, consume_rate_budget, GameRealtimeClientMessage, GameRealtimeEntity,
    GameRealtimeErrorCode, GameRealtimeErrorPayload, GameRealtimeHeartbeatAckPayload,
    GameRealtimeServerMessage, GameRealtimeServerRestartPayload, GameRealtimeSnapshotPayload,
    SequenceDecision, GAME_REALTIME_MAX_PLAYERS_PER_ROOM, GAME_REALTIME_PROTOCOL_VERSION,
};
use crate::services::game_room_map::GameRoomMap;

const ROOM_COMMAND_CAPACITY: usize = 64;
const ROOM_TICK_MILLIS: u64 = 100;
const ROOM_TICK_SECONDS: f64 = 0.1;
const ROOM_EMPTY_TTL_SECS: u64 = 300;
const ROOM_INTEREST_RADIUS: f64 = 32.0;
const PLAYER_RADIUS: f64 = 0.5;
const MAX_RATE_HISTORY: usize = 20;

#[must_use]
fn empty_room_expired(empty_since: u64, now: u64, ttl_secs: u64) -> bool {
    now.saturating_sub(empty_since) >= ttl_secs
}

/// Métricas agregadas del realtime: solo conteos, sin coordenadas precisas ni
/// identidad. Los contadores atómicos son la fuente de `GET /api/game/metrics`.
#[derive(Debug, Default, Clone)]
pub struct GameRoomMetrics {
    pub joins: Arc<AtomicU64>,
    pub joins_rejected: Arc<AtomicU64>,
    pub disconnects: Arc<AtomicU64>,
    pub rooms_created: Arc<AtomicU64>,
    pub snapshots_sent: Arc<AtomicU64>,
    pub backpressure_evictions: Arc<AtomicU64>,
    pub rate_limited: Arc<AtomicU64>,
    pub sequence_rejected: Arc<AtomicU64>,
    pub active_players: Arc<AtomicU64>,
}

impl GameRoomMetrics {
    #[must_use]
    pub fn snapshot(&self) -> GameRoomMetricsSnapshot {
        GameRoomMetricsSnapshot {
            joins: self.joins.load(Ordering::Acquire),
            joins_rejected: self.joins_rejected.load(Ordering::Acquire),
            disconnects: self.disconnects.load(Ordering::Acquire),
            rooms_created: self.rooms_created.load(Ordering::Acquire),
            snapshots_sent: self.snapshots_sent.load(Ordering::Acquire),
            backpressure_evictions: self.backpressure_evictions.load(Ordering::Acquire),
            rate_limited: self.rate_limited.load(Ordering::Acquire),
            sequence_rejected: self.sequence_rejected.load(Ordering::Acquire),
            active_players: self.active_players.load(Ordering::Acquire),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct GameRoomMetricsSnapshot {
    pub joins: u64,
    pub joins_rejected: u64,
    pub disconnects: u64,
    pub rooms_created: u64,
    pub snapshots_sent: u64,
    pub backpressure_evictions: u64,
    pub rate_limited: u64,
    pub sequence_rejected: u64,
    pub active_players: u64,
}

#[derive(Clone)]
pub struct GameRoomState {
    /// Salas activas claveadas por `map.map_version()`; cada mapa tiene su
    /// propio actor con cap de 8 y TTL independiente (Fase 8: dos salas
    /// concurrentes dentro del presupuesto). `std::sync::RwLock` porque los
    /// accesos son cortos y nunca se mantienen a través de un `.await`.
    maps: Arc<RwLock<HashMap<String, Arc<GameRoomMap>>>>,
    rooms: Arc<tokio::sync::Mutex<HashMap<String, RoomHandle>>>,
    empty_ttl_secs: u64,
    metrics: Arc<GameRoomMetrics>,
}

impl Default for GameRoomState {
    fn default() -> Self {
        Self::empty()
    }
}

impl GameRoomState {
    #[must_use]
    pub fn empty() -> Self {
        Self::empty_with_ttl(ROOM_EMPTY_TTL_SECS)
    }

    #[must_use]
    pub fn empty_with_ttl(empty_ttl_secs: u64) -> Self {
        Self {
            maps: Arc::new(RwLock::new(HashMap::new())),
            rooms: Arc::new(tokio::sync::Mutex::new(HashMap::new())),
            empty_ttl_secs,
            metrics: Arc::new(GameRoomMetrics::default()),
        }
    }

    #[must_use]
    pub fn with_map(map: GameRoomMap) -> Self {
        Self::with_map_and_ttl(map, ROOM_EMPTY_TTL_SECS)
    }

    #[must_use]
    pub fn with_map_and_ttl(map: GameRoomMap, empty_ttl_secs: u64) -> Self {
        let state = Self::empty_with_ttl(empty_ttl_secs);
        state.register_map(map);
        state
    }

    /* [SNT-11] Accesos síncronos (RwLock cortos, sin `.await`): clippy exige
     * quitar `async`; los llamadores ya no usan `.await`. */
    pub fn set_map(&self, map: Option<GameRoomMap>) {
        let mut maps = self.maps.write().expect("maps lock");
        maps.clear();
        if let Some(map) = map {
            maps.insert(map.map_version(), Arc::new(map));
        }
    }

    #[must_use]
    pub fn has_map(&self) -> bool {
        !self.maps.read().expect("maps lock").is_empty()
    }

    #[must_use]
    pub fn metrics(&self) -> GameRoomMetricsSnapshot {
        self.metrics.snapshot()
    }

    /// [Decisión 8] Anuncia el reinicio coordinado a todas las salas activas:
    /// cada actor reenvía `server_restart` a sus jugadores con la cuenta atrás.
    /// Las salas sin jugadores no fallan (broadcast no-op); el aviso queda
    /// pendiente de la expiración/drenaje que planifica el publicador.
    pub async fn announce_restart(&self, reason: &str, restart_in_seconds: u64) {
        let message = GameRealtimeServerMessage::ServerRestart {
            v: GAME_REALTIME_PROTOCOL_VERSION,
            payload: GameRealtimeServerRestartPayload {
                reason: reason.to_string(),
                restart_in_seconds,
            },
        };
        let rooms = self.rooms.lock().await;
        for handle in rooms.values() {
            let _ = handle.send(RoomCommand::Broadcast {
                message: message.clone(),
            });
        }
    }

    /// [Decisión 8] Drena todas las salas al expirar la cuenta atrás: cada
    /// actor cierra (break del loop) y los Senders de los players se dropean,
    /// lo que cierra los sockets del transporte; el cliente reintenta con
    /// backoff y el próximo join recarga la versión activa nueva de la BD.
    pub async fn shutdown_all_rooms(&self) {
        let rooms = self.rooms.lock().await;
        for handle in rooms.values() {
            if !handle.is_closed() {
                let _ = handle.send(RoomCommand::Shutdown);
            }
        }
    }

    /// Registra un mapa adicional para pruebas de salas concurrentes; los
    /// jugadores de cada mapa quedan aislados en su propio actor.
    pub fn register_map(&self, map: GameRoomMap) {
        let version = map.map_version();
        self.maps
            .write()
            .expect("maps lock")
            .insert(version, Arc::new(map));
    }

    pub async fn join(
        &self,
        subject: Uuid,
        output: mpsc::Sender<GameRealtimeServerMessage>,
    ) -> Result<JoinedRoom, RoomJoinError> {
        self.join_with_character(subject, GAME_PROFILE_DEFAULT_CHARACTER_ID, output)
            .await
    }

    /// Entra con el personaje resuelto del catálogo (297A-77): el snapshot
    /// lleva `character_id` para que cada jugador remoto se vea con su tono.
    pub async fn join_with_character(
        &self,
        subject: Uuid,
        character_id: &str,
        output: mpsc::Sender<GameRealtimeServerMessage>,
    ) -> Result<JoinedRoom, RoomJoinError> {
        let map = self
            .maps
            .read()
            .expect("maps lock")
            .values()
            .next()
            .cloned()
            .ok_or(RoomJoinError::MapUnavailable)?;
        self.join_with_map(&map.map_version(), map, character_id, subject, output)
            .await
    }

    /// Entra en la sala del mapa indicado. Fase 8: usado por pruebas de dos
    /// salas y disponible para el transporte cuando haya más de un mapa.
    pub async fn join_on(
        &self,
        map_key: &str,
        subject: Uuid,
        output: mpsc::Sender<GameRealtimeServerMessage>,
    ) -> Result<JoinedRoom, RoomJoinError> {
        let map = self
            .maps
            .read()
            .expect("maps lock")
            .get(map_key)
            .cloned()
            .ok_or(RoomJoinError::MapUnavailable)?;
        self.join_with_map(
            &map.map_version(),
            map,
            GAME_PROFILE_DEFAULT_CHARACTER_ID,
            subject,
            output,
        )
        .await
    }

    async fn join_with_map(
        &self,
        map_key: &str,
        map: Arc<GameRoomMap>,
        character_id: &str,
        subject: Uuid,
        output: mpsc::Sender<GameRealtimeServerMessage>,
    ) -> Result<JoinedRoom, RoomJoinError> {
        let mut rooms = self.rooms.lock().await;
        let handle = match rooms.get(map_key) {
            Some(handle) if !handle.is_closed() => handle.clone(),
            _ => {
                let handle =
                    RoomHandle::start(map.clone(), self.empty_ttl_secs, self.metrics.clone());
                self.metrics.rooms_created.fetch_add(1, Ordering::Release);
                rooms.insert(map_key.to_string(), handle.clone());
                handle
            }
        };
        drop(rooms);
        match handle
            .join(subject, character_id, output.clone(), self.metrics.clone())
            .await
        {
            Err(RoomJoinError::Busy) if handle.is_closed() => {
                let mut rooms = self.rooms.lock().await;
                let replacement = match rooms.get(map_key) {
                    Some(current) if !current.is_closed() => current.clone(),
                    _ => {
                        let replacement =
                            RoomHandle::start(map, self.empty_ttl_secs, self.metrics.clone());
                        self.metrics.rooms_created.fetch_add(1, Ordering::Release);
                        rooms.insert(map_key.to_string(), replacement.clone());
                        replacement
                    }
                };
                drop(rooms);
                replacement
                    .join(subject, character_id, output, self.metrics.clone())
                    .await
            }
            result => result,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RoomJoinError {
    MapUnavailable,
    Full,
    Busy,
}

impl RoomJoinError {
    #[must_use]
    pub fn code(self) -> GameRealtimeErrorCode {
        match self {
            Self::MapUnavailable => GameRealtimeErrorCode::MapUnavailable,
            Self::Full => GameRealtimeErrorCode::RoomFull,
            Self::Busy => GameRealtimeErrorCode::ServerBusy,
        }
    }
}

#[derive(Clone)]
pub struct JoinedRoom {
    pub player_id: String,
    pub map_version: String,
    pub tick: u64,
    pub initial_snapshot: GameRealtimeSnapshotPayload,
    handle: RoomHandle,
}

impl JoinedRoom {
    pub fn send(&self, message: GameRealtimeClientMessage) -> Result<(), RoomSendError> {
        self.handle.send(RoomCommand::Client {
            player_id: self.player_id.clone(),
            message,
        })
    }

    pub async fn disconnect(&self) {
        let _ = self.handle.disconnect(self.player_id.clone()).await;
    }

    /// [Decisión 8] True si la sala cerró por drenaje coordinado (migración):
    /// el transporte cierra el socket con un código que el cliente reintenta.
    #[must_use]
    pub fn was_shutdown(&self) -> bool {
        self.handle.was_shutdown()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RoomSendError {
    Closed,
    Backpressure,
}

#[derive(Clone)]
struct RoomHandle {
    commands: mpsc::Sender<RoomCommand>,
    closed: Arc<AtomicBool>,
    /* [Decisión 8] La sala cerró por drenaje coordinado (no por reemplazo de
     * identidad ni TTL): el transporte distingue el cierre para que el
     * cliente reintente la reconexión tras la migración. */
    shutdown: Arc<AtomicBool>,
}

impl RoomHandle {
    fn start(map: Arc<GameRoomMap>, empty_ttl_secs: u64, metrics: Arc<GameRoomMetrics>) -> Self {
        let (commands, receiver) = mpsc::channel(ROOM_COMMAND_CAPACITY);
        let handle = Self {
            commands,
            closed: Arc::new(AtomicBool::new(false)),
            shutdown: Arc::new(AtomicBool::new(false)),
        };
        tokio::spawn(run_room(
            map,
            receiver,
            handle.clone(),
            empty_ttl_secs,
            metrics,
        ));
        handle
    }

    fn is_closed(&self) -> bool {
        self.closed.load(Ordering::Acquire)
    }

    fn was_shutdown(&self) -> bool {
        self.shutdown.load(Ordering::Acquire)
    }

    async fn join(
        &self,
        subject: Uuid,
        character_id: &str,
        output: mpsc::Sender<GameRealtimeServerMessage>,
        metrics: Arc<GameRoomMetrics>,
    ) -> Result<JoinedRoom, RoomJoinError> {
        let (reply, response) = oneshot::channel();
        self.commands
            .try_send(RoomCommand::Join {
                subject,
                character_id: character_id.to_string(),
                output,
                reply,
                metrics,
            })
            .map_err(|error| match error {
                mpsc::error::TrySendError::Full(_) => RoomJoinError::Busy,
                mpsc::error::TrySendError::Closed(_) => {
                    self.closed.store(true, Ordering::Release);
                    RoomJoinError::Busy
                }
            })?;
        response.await.map_err(|_| RoomJoinError::Busy)?
    }
    fn send(&self, command: RoomCommand) -> Result<(), RoomSendError> {
        self.commands
            .try_send(command)
            .map_err(|error| match error {
                mpsc::error::TrySendError::Full(_) => RoomSendError::Backpressure,
                mpsc::error::TrySendError::Closed(_) => RoomSendError::Closed,
            })
    }

    async fn disconnect(&self, player_id: String) -> Result<(), RoomSendError> {
        self.commands
            .send(RoomCommand::Disconnect { player_id })
            .await
            .map_err(|_| RoomSendError::Closed)
    }
}

enum RoomCommand {
    Join {
        subject: Uuid,
        character_id: String,
        output: mpsc::Sender<GameRealtimeServerMessage>,
        reply: oneshot::Sender<Result<JoinedRoom, RoomJoinError>>,
        metrics: Arc<GameRoomMetrics>,
    },
    Client {
        player_id: String,
        message: GameRealtimeClientMessage,
    },
    Disconnect {
        player_id: String,
    },
    Broadcast {
        message: GameRealtimeServerMessage,
    },
    Shutdown,
}

struct RoomPlayer {
    subject: Uuid,
    character_id: String,
    output: mpsc::Sender<GameRealtimeServerMessage>,
    position: (f64, f64),
    velocity: (f64, f64),
    direction: (f64, f64),
    last_sequence: Option<u64>,
    rate_history: Vec<u64>,
}

async fn run_room(
    map: Arc<GameRoomMap>,
    mut commands: mpsc::Receiver<RoomCommand>,
    handle: RoomHandle,
    empty_ttl_secs: u64,
    metrics: Arc<GameRoomMetrics>,
) {
    let mut players = HashMap::<String, RoomPlayer>::new();
    let mut tick = 0_u64;
    let mut snapshot_sequence = 0_u64;
    let mut empty_since: Option<u64> = None;
    let mut interval = tokio::time::interval(std::time::Duration::from_millis(ROOM_TICK_MILLIS));
    interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

    loop {
        tokio::select! {
            Some(command) = commands.recv() => match command {
                RoomCommand::Join { subject, character_id, output, reply, metrics } => {
                    let result = join_player(
                        &map,
                        &mut players,
                        subject,
                        &character_id,
                        output,
                        handle.clone(),
                        &metrics,
                    );
                    if result.is_ok() {
                        empty_since = None;
                    } else {
                        metrics.joins_rejected.fetch_add(1, Ordering::Release);
                    }
                    let _ = reply.send(result);
                }
                RoomCommand::Client { player_id, message } => {
                    handle_client_message(&mut players, &player_id, message, tick, &metrics);
                }
                RoomCommand::Disconnect { player_id } => {
                    let removed = players.remove(&player_id);
                    if removed.is_some() {
                        metrics.disconnects.fetch_add(1, Ordering::Release);
                        metrics.active_players.fetch_sub(1, Ordering::AcqRel);
                    }
                    if players.is_empty() {
                        empty_since = Some(now_secs());
                    }
                }
                RoomCommand::Broadcast { message } => {
                    for player in players.values_mut() {
                        send_message(player, message.clone());
                    }
                }
                RoomCommand::Shutdown => {
                    handle.shutdown.store(true, Ordering::Release);
                    break;
                }
            },
            _ = interval.tick() => {
                tick = tick.saturating_add(1);
                update_players(&map, &mut players);
                snapshot_sequence = snapshot_sequence.saturating_add(1);
                broadcast_snapshot(&mut players, tick, snapshot_sequence, &metrics);
                if players.is_empty() {
                    let since = empty_since.get_or_insert_with(now_secs);
                    if empty_room_expired(*since, now_secs(), empty_ttl_secs) {
                        break;
                    }
                } else {
                    empty_since = None;
                }
            }
            else => break,
        }
    }
    handle.closed.store(true, Ordering::Release);
}

fn join_player(
    map: &GameRoomMap,
    players: &mut HashMap<String, RoomPlayer>,
    subject: Uuid,
    character_id: &str,
    output: mpsc::Sender<GameRealtimeServerMessage>,
    handle: RoomHandle,
    metrics: &Arc<GameRoomMetrics>,
) -> Result<JoinedRoom, RoomJoinError> {
    /* [297A-57] Reconexión persistente: el mismo subject reemplaza su conexión
     * previa en vez de ser rechazado. Al eliminar el RoomPlayer viejo, su
     * Sender se dropea y el handle_socket anterior se cierra solo (recv →
     * None), sin duplicar jugadores ni esperar el timeout del servidor. */
    let previous = players
        .iter()
        .find_map(|(id, player)| (player.subject == subject).then_some(id.clone()));
    if players.len() >= GAME_REALTIME_MAX_PLAYERS_PER_ROOM && previous.is_none() {
        return Err(RoomJoinError::Full);
    }
    if let Some(previous_id) = previous {
        players.remove(&previous_id);
    }
    let player_id = format!("p-{}", Uuid::new_v4().simple());
    let (x, z) = map.spawn_position(players.len());
    let initial = GameRealtimeSnapshotPayload {
        snapshot_sequence: 0,
        tick: 0,
        entities: vec![entity(&player_id, (x, z), (0.0, 0.0), character_id)],
    };
    players.insert(
        player_id.clone(),
        RoomPlayer {
            subject,
            character_id: character_id.to_string(),
            output,
            position: (x, z),
            velocity: (0.0, 0.0),
            direction: (0.0, 0.0),
            last_sequence: None,
            rate_history: Vec::new(),
        },
    );
    metrics.joins.fetch_add(1, Ordering::Release);
    metrics.active_players.fetch_add(1, Ordering::Release);
    Ok(JoinedRoom {
        player_id: player_id.clone(),
        map_version: map.map_version(),
        tick: 0,
        initial_snapshot: initial,
        handle,
    })
}

fn handle_client_message(
    players: &mut HashMap<String, RoomPlayer>,
    player_id: &str,
    message: GameRealtimeClientMessage,
    tick: u64,
    metrics: &Arc<GameRoomMetrics>,
) {
    let Some(player) = players.get_mut(player_id) else {
        return;
    };
    let now = now_millis();
    let Ok(history) = consume_rate_budget(&player.rate_history, now) else {
        metrics.rate_limited.fetch_add(1, Ordering::Release);
        send_error(
            player,
            GameRealtimeErrorCode::RateLimited,
            "rate limit realtime excedido",
            false,
        );
        return;
    };
    player.rate_history = history;
    if player.rate_history.len() > MAX_RATE_HISTORY {
        let keep_from = player.rate_history.len() - MAX_RATE_HISTORY;
        player.rate_history.drain(..keep_from);
    }
    match message {
        GameRealtimeClientMessage::Move { payload, .. } => {
            match assess_sequence(player.last_sequence, payload.sequence) {
                SequenceDecision::Accept => {
                    player.last_sequence = Some(payload.sequence);
                    player.direction = (payload.direction.x, payload.direction.z);
                }
                SequenceDecision::Replay => {
                    metrics.sequence_rejected.fetch_add(1, Ordering::Release);
                    send_error(
                        player,
                        GameRealtimeErrorCode::SequenceReplay,
                        "secuencia realtime repetida",
                        false,
                    );
                }
                SequenceDecision::Jump => {
                    metrics.sequence_rejected.fetch_add(1, Ordering::Release);
                    send_error(
                        player,
                        GameRealtimeErrorCode::SequenceJump,
                        "salto de secuencia realtime inválido",
                        false,
                    );
                }
            }
        }
        GameRealtimeClientMessage::Heartbeat { .. } => {
            send_message(
                player,
                GameRealtimeServerMessage::HeartbeatAck {
                    v: GAME_REALTIME_PROTOCOL_VERSION,
                    payload: GameRealtimeHeartbeatAckPayload { server_tick: tick },
                },
            );
        }
        GameRealtimeClientMessage::ClientAck { .. } => {}
        GameRealtimeClientMessage::Join { .. } => send_error(
            player,
            GameRealtimeErrorCode::InvalidMessage,
            "join solo puede ser el primer mensaje",
            true,
        ),
    }
}

fn update_players(map: &GameRoomMap, players: &mut HashMap<String, RoomPlayer>) {
    for player in players.values_mut() {
        let (position, velocity) = map.move_circle(
            player.position,
            player.direction,
            PLAYER_RADIUS,
            ROOM_TICK_SECONDS,
        );
        player.position = position;
        player.velocity = velocity;
    }
}

fn broadcast_snapshot(
    players: &mut HashMap<String, RoomPlayer>,
    tick: u64,
    snapshot_sequence: u64,
    metrics: &Arc<GameRoomMetrics>,
) {
    let mut entities = players
        .iter()
        .map(|(id, player)| entity(id, player.position, player.velocity, &player.character_id))
        .collect::<Vec<_>>();
    entities.sort_by(|left, right| left.id.cmp(&right.id));
    let positions = players
        .iter()
        .map(|(id, player)| (id.clone(), player.position))
        .collect::<HashMap<_, _>>();
    let mut slow_players = Vec::new();
    for (id, player) in players.iter_mut() {
        let Some(owner_position) = positions.get(id) else {
            continue;
        };
        let visible = entities
            .iter()
            .filter(|candidate| {
                let dx = candidate.position.x - owner_position.0;
                let dz = candidate.position.z - owner_position.1;
                dx * dx + dz * dz <= ROOM_INTEREST_RADIUS * ROOM_INTEREST_RADIUS
            })
            .cloned()
            .collect();
        let message = GameRealtimeServerMessage::Snapshot {
            v: GAME_REALTIME_PROTOCOL_VERSION,
            payload: GameRealtimeSnapshotPayload {
                snapshot_sequence,
                tick,
                entities: visible,
            },
        };
        match player.output.try_send(message) {
            Ok(()) => {
                metrics.snapshots_sent.fetch_add(1, Ordering::Release);
            }
            Err(mpsc::error::TrySendError::Full(_) | mpsc::error::TrySendError::Closed(_)) => {
                metrics
                    .backpressure_evictions
                    .fetch_add(1, Ordering::Release);
                metrics.active_players.fetch_sub(1, Ordering::AcqRel);
                slow_players.push(id.clone());
            }
        }
    }
    for id in slow_players {
        players.remove(&id);
    }
}

fn entity(
    id: &str,
    position: (f64, f64),
    velocity: (f64, f64),
    character_id: &str,
) -> GameRealtimeEntity {
    GameRealtimeEntity {
        id: id.to_string(),
        position: crate::models::game_realtime::GameRealtimeVector {
            x: position.0,
            z: position.1,
        },
        velocity: crate::models::game_realtime::GameRealtimeVector {
            x: velocity.0,
            z: velocity.1,
        },
        radius: PLAYER_RADIUS,
        character_id: character_id.to_string(),
    }
}

fn send_error(player: &mut RoomPlayer, code: GameRealtimeErrorCode, message: &str, fatal: bool) {
    send_message(
        player,
        GameRealtimeServerMessage::Error {
            v: GAME_REALTIME_PROTOCOL_VERSION,
            payload: GameRealtimeErrorPayload {
                code,
                message: message.to_string(),
                fatal,
            },
        },
    );
}

fn send_message(player: &mut RoomPlayer, message: GameRealtimeServerMessage) {
    let _ = player.output.try_send(message);
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| duration.as_secs())
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| {
            u64::try_from(duration.as_millis()).unwrap_or(u64::MAX)
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn map() -> GameRoomMap {
        GameRoomMap::from_parts(
            "forest".to_string(),
            1,
            super::super::game_room_map::RoomBounds {
                min_x: 0.0,
                max_x: 32.0,
                min_z: 0.0,
                max_z: 32.0,
            },
            Vec::new(),
            vec![super::super::game_room_map::RoomSpawn {
                x: 2.0,
                z: 2.0,
                radius: 1.0,
            }],
        )
        .expect("map fixture")
    }

    #[test]
    fn empty_room_ttl_is_bounded_and_saturating() {
        assert!(!empty_room_expired(100, 399, 300));
        assert!(empty_room_expired(100, 400, 300));
        assert!(empty_room_expired(0, u64::MAX, 300));
    }

    #[tokio::test]
    async fn room_accepts_join_and_moves_authoritatively() {
        let state = GameRoomState::with_map(map());
        let (output, mut messages) = mpsc::channel(32);
        let joined = state.join(Uuid::new_v4(), output).await.expect("join");
        assert!(joined.player_id.starts_with("p-"));
        assert_eq!(joined.map_version, "forest@1");
        joined
            .send(GameRealtimeClientMessage::Move {
                v: 1,
                payload: crate::models::game_realtime::GameRealtimeMovePayload {
                    sequence: 1,
                    direction: crate::models::game_realtime::GameRealtimeVector { x: 1.0, z: 0.0 },
                },
            })
            .expect("move");
        let snapshot = tokio::time::timeout(std::time::Duration::from_secs(1), messages.recv())
            .await
            .expect("snapshot timeout")
            .expect("snapshot");
        assert!(matches!(
            snapshot,
            GameRealtimeServerMessage::Snapshot { .. }
        ));
        joined.disconnect().await;
    }

    #[tokio::test]
    async fn joined_room_carries_character_id_for_remote_tones() {
        /* [297A-77] El snapshot del room lleva el personaje resuelto para que
         * cada jugador remoto se vea con su tono: el initial (secuencia 0)
         * debe incluirlo y el tick posterior también. */
        let state = GameRoomState::with_map(map());
        let (output, mut messages) = mpsc::channel(32);
        let joined = state
            .join_with_character(Uuid::new_v4(), "forest-runner", output)
            .await
            .expect("join");
        assert_eq!(joined.initial_snapshot.entities.len(), 1);
        assert_eq!(
            joined.initial_snapshot.entities[0].character_id,
            "forest-runner"
        );
        let snapshot = tokio::time::timeout(std::time::Duration::from_secs(1), messages.recv())
            .await
            .expect("snapshot timeout")
            .expect("snapshot");
        match snapshot {
            GameRealtimeServerMessage::Snapshot { payload, .. } => {
                assert_eq!(payload.entities.len(), 1);
                assert_eq!(payload.entities[0].character_id, "forest-runner");
            }
            _ => panic!("snapshot esperado"),
        }
        joined.disconnect().await;
    }

    #[tokio::test]
    async fn empty_room_ttl_recreates_actor_after_disconnect() {
        let state = GameRoomState::with_map_and_ttl(map(), 0);
        let (first_output, first_messages) = mpsc::channel(32);
        let first = state
            .join(Uuid::new_v4(), first_output)
            .await
            .expect("first");
        drop(first_messages);
        first.disconnect().await;
        tokio::time::sleep(std::time::Duration::from_millis(150)).await;

        let (second_output, _second_messages) = mpsc::channel(32);
        let second = state
            .join(Uuid::new_v4(), second_output)
            .await
            .expect("second");
        assert_ne!(first.player_id, second.player_id);
        second.disconnect().await;
    }

    #[tokio::test]
    async fn reconnect_replaces_previous_identity_without_duplication() {
        let state = GameRoomState::with_map(map());
        let subject = Uuid::new_v4();
        let (first_output, mut first_messages) = mpsc::channel(32);
        let first = state.join(subject, first_output).await.expect("first");

        /* [297A-57] La misma identidad reconecta: reemplaza la conexión previa
         * (id nuevo, sin duplicar jugadores). */
        let (second_output, mut second_messages) = mpsc::channel(32);
        let second = state.join(subject, second_output).await.expect("reconnect");
        assert_ne!(first.player_id, second.player_id);

        /* La conexión vieja dejó de recibir: al reemplazar, su Sender se
         * dropea y el canal se cierra (recv → Ok(None)). Se drena cualquier
         * snapshot en vuelo del primer tick y se verifica el cierre, no un
         * timeout (si el jugador viejo siguiera activo, llegaría un snapshot). */
        while first_messages.try_recv().is_ok() {}
        let outcome =
            tokio::time::timeout(std::time::Duration::from_millis(300), first_messages.recv())
                .await;
        assert!(
            matches!(outcome, Ok(None)),
            "la conexión vieja siguió recibiendo: {outcome:?}"
        );
        let snapshot =
            tokio::time::timeout(std::time::Duration::from_secs(1), second_messages.recv())
                .await
                .expect("snapshot")
                .expect("snapshot");
        assert!(matches!(
            snapshot,
            GameRealtimeServerMessage::Snapshot { .. }
        ));
        second.disconnect().await;
    }

    #[tokio::test]
    async fn room_rejects_ninth_player_and_keeps_reconnect_slots() {
        let state = GameRoomState::with_map(map());
        let subject = Uuid::new_v4();
        let mut receivers = Vec::new();
        /* [297A-57] El primer slot lo ocupa `subject` para poder probar su
         * reconexión después; el resto usa identidades frescas. */
        for index in 0..GAME_REALTIME_MAX_PLAYERS_PER_ROOM {
            let (output, messages) = mpsc::channel(32);
            receivers.push(messages);
            let id = if index == 0 { subject } else { Uuid::new_v4() };
            state.join(id, output).await.expect("capacity");
        }
        let (extra_output, extra_messages) = mpsc::channel(32);
        receivers.push(extra_messages);
        assert!(matches!(
            state.join(Uuid::new_v4(), extra_output).await,
            Err(RoomJoinError::Full)
        ));
        /* Una sala llena aún acepta la reconexión de un jugador presente. */
        let (reconnect_output, _reconnect_messages) = mpsc::channel(32);
        assert!(state.join(subject, reconnect_output).await.is_ok());
    }

    #[tokio::test]
    async fn two_concurrent_rooms_are_isolated_with_independent_capacity() {
        /* Fase 8: dos salas concurrentes dentro del presupuesto. Cada mapa
         * registrado tiene su propio actor con cap de 8 y TTL independiente;
         * los jugadores de una sala no aparecen en la otra. */
        let first_map = map();
        let mut second_bounds = first_map.bounds;
        second_bounds.max_x = 64.0;
        second_bounds.max_z = 64.0;
        let second_map = GameRoomMap::from_parts(
            "second-forest".to_string(),
            1,
            second_bounds,
            Vec::new(),
            vec![super::super::game_room_map::RoomSpawn {
                x: 10.0,
                z: 10.0,
                radius: 1.0,
            }],
        )
        .expect("segundo mapa");
        let state = GameRoomState::with_map_and_ttl(first_map, 60);
        state.register_map(second_map);

        let (first_output, mut first_messages) = mpsc::channel(32);
        let first_joined = state
            .join_on("forest@1", Uuid::new_v4(), first_output)
            .await
            .expect("sala forest");
        let (second_output, mut second_messages) = mpsc::channel(32);
        let second_joined = state
            .join_on("second-forest@1", Uuid::new_v4(), second_output)
            .await
            .expect("sala second");
        assert_ne!(first_joined.player_id, second_joined.player_id);
        assert_eq!(first_joined.map_version, "forest@1");
        assert_eq!(second_joined.map_version, "second-forest@1");

        /* Cada sala emite su propio snapshot con UNA sola entidad (aislamiento). */
        let first_snapshot =
            tokio::time::timeout(std::time::Duration::from_secs(1), first_messages.recv())
                .await
                .expect("snapshot primera sala")
                .expect("snapshot");
        let second_snapshot =
            tokio::time::timeout(std::time::Duration::from_secs(1), second_messages.recv())
                .await
                .expect("snapshot segunda sala")
                .expect("snapshot");
        let first_entities = match first_snapshot {
            GameRealtimeServerMessage::Snapshot { payload, .. } => payload.entities,
            _ => panic!("snapshot esperado"),
        };
        let second_entities = match second_snapshot {
            GameRealtimeServerMessage::Snapshot { payload, .. } => payload.entities,
            _ => panic!("snapshot esperado"),
        };
        assert_eq!(first_entities.len(), 1);
        assert_eq!(second_entities.len(), 1);
        assert_ne!(first_entities[0].id, second_entities[0].id);

        /* Capacidad independiente: llenar la primera sala no afecta a la segunda. */
        for _ in 0..GAME_REALTIME_MAX_PLAYERS_PER_ROOM - 1 {
            let (output, _messages) = mpsc::channel(32);
            state
                .join_on("forest@1", Uuid::new_v4(), output)
                .await
                .expect("capacidad sala forest");
        }
        let (extra_output, _extra_messages) = mpsc::channel(32);
        assert!(matches!(
            state
                .join_on("forest@1", Uuid::new_v4(), extra_output)
                .await,
            Err(RoomJoinError::Full)
        ));
        let (second_extra_output, mut second_extra_messages) = mpsc::channel(32);
        let extra = state
            .join_on("second-forest@1", Uuid::new_v4(), second_extra_output)
            .await
            .expect("segunda sala sigue aceptando");
        let _ = second_extra_messages.recv().await;
        extra.disconnect().await;

        first_joined.disconnect().await;
        second_joined.disconnect().await;
    }

    /* [Decisión 8] Drena mensajes hasta el `server_restart` (los snapshots
     * del tick pueden llegar antes) o falla con timeout. */
    async fn recv_until_restart(
        messages: &mut mpsc::Receiver<GameRealtimeServerMessage>,
    ) -> GameRealtimeServerMessage {
        loop {
            let message = tokio::time::timeout(std::time::Duration::from_secs(1), messages.recv())
                .await
                .expect("timeout esperando server_restart")
                .expect("canal cerrado");
            if matches!(message, GameRealtimeServerMessage::ServerRestart { .. }) {
                return message;
            }
        }
    }

    #[tokio::test]
    async fn announce_restart_broadcasts_to_all_players_of_active_rooms() {
        /* [Decisión 8] El aviso de reinicio coordinado llega a todos los
         * jugadores de cada sala activa con motivo y cuenta atrás. Se drena
         * hasta el `server_restart` porque entre medias pueden llegar
         * snapshots del tick. */
        let state = GameRoomState::with_map_and_ttl(map(), 60);
        let (first_output, mut first_messages) = mpsc::channel(32);
        let (second_output, mut second_messages) = mpsc::channel(32);
        let first = state
            .join(Uuid::new_v4(), first_output)
            .await
            .expect("first");
        let second = state
            .join(Uuid::new_v4(), second_output)
            .await
            .expect("second");

        state
            .announce_restart("publicación de versión nueva", 300)
            .await;

        let first_restart = recv_until_restart(&mut first_messages).await;
        let second_restart = recv_until_restart(&mut second_messages).await;
        for restart in [first_restart, second_restart] {
            match restart {
                GameRealtimeServerMessage::ServerRestart { v, payload } => {
                    assert_eq!(v, GAME_REALTIME_PROTOCOL_VERSION);
                    assert_eq!(payload.reason, "publicación de versión nueva");
                    assert_eq!(payload.restart_in_seconds, 300);
                }
                other => panic!("server_restart esperado, llegó {other:?}"),
            }
        }
        first.disconnect().await;
        second.disconnect().await;
    }

    #[tokio::test]
    async fn shutdown_all_rooms_closes_player_outputs() {
        /* [Decisión 8] Al expirar la cuenta atrás, drenar las salas cierra
         * los Senders de los players: el transporte ve `recv → None` y
         * cierra el socket; el cliente reintenta con backoff. */
        let state = GameRoomState::with_map_and_ttl(map(), 60);
        let (output, mut messages) = mpsc::channel(32);
        let joined = state.join(Uuid::new_v4(), output).await.expect("join");

        state.shutdown_all_rooms().await;

        let outcome =
            tokio::time::timeout(std::time::Duration::from_millis(300), messages.recv()).await;
        assert!(
            matches!(outcome, Ok(None)),
            "el output debió cerrarse tras el shutdown: {outcome:?}"
        );
        joined.disconnect().await;
    }

    #[tokio::test]
    async fn announce_restart_without_players_is_noop() {
        /* Sala vacía: el broadcast no falla y el actor sigue aceptando joins. */
        let state = GameRoomState::with_map_and_ttl(map(), 60);
        state.announce_restart("reinicio", 60).await;
        let (output, _messages) = mpsc::channel(32);
        let joined = state
            .join(Uuid::new_v4(), output)
            .await
            .expect("join tras noop");
        joined.disconnect().await;
    }

    #[tokio::test]
    async fn metrics_track_joins_rejections_and_active_players() {
        let state = GameRoomState::with_map_and_ttl(map(), 60);
        let (first_output, _first_messages) = mpsc::channel(32);
        let first = state
            .join(Uuid::new_v4(), first_output)
            .await
            .expect("first");
        let metrics = state.metrics();
        assert_eq!(metrics.joins, 1);
        assert_eq!(metrics.active_players, 1);
        assert_eq!(metrics.rooms_created, 1);
        first.disconnect().await;
        /* La desconexión se procesa de forma asíncrona en el actor. */
        tokio::time::sleep(std::time::Duration::from_millis(60)).await;
        let after = state.metrics();
        assert_eq!(after.disconnects, 1);
        assert_eq!(after.active_players, 0);
    }
}
