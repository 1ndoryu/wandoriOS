//! GAME-01 — Contrato puro de realtime v1.
//! No abre sockets ni conoce Axum: valida el boundary que usará la futura sala.

use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

pub const GAME_REALTIME_PROTOCOL_VERSION: u8 = 1;
pub const GAME_REALTIME_MAX_CLIENT_MESSAGE_BYTES: usize = 512;
pub const GAME_REALTIME_MAX_SERVER_MESSAGE_BYTES: usize = 4 * 1024;
pub const GAME_REALTIME_MAX_PLAYERS_PER_ROOM: usize = 8;
pub const GAME_REALTIME_MAX_CLIENT_MESSAGES_PER_SECOND: usize = 20;
pub const GAME_REALTIME_MAX_SEQUENCE_JUMP: u64 = 1_024;
pub const GAME_REALTIME_MAX_TICKET_LENGTH: usize = 256;
pub const GAME_REALTIME_MAX_CLIENT_VERSION_LENGTH: usize = 32;
pub const GAME_REALTIME_MAX_MAP_VERSION_LENGTH: usize = 128;
pub const GAME_REALTIME_MAX_ENTITY_ID_LENGTH: usize = 128;
pub const GAME_REALTIME_MAX_CHARACTER_ID_LENGTH: usize = 64;
pub const GAME_REALTIME_MAX_ERROR_MESSAGE_LENGTH: usize = 160;
/* Decisión 8 (05-ago): aviso de reinicio coordinado. El motivo va bounded y
 * la cuenta atrás nunca supera 1 hora (el flujo oficial usa 300 s). */
pub const GAME_REALTIME_MAX_RESTART_REASON_LENGTH: usize = 200;
pub const GAME_REALTIME_MAX_RESTART_SECONDS: u64 = 3_600;

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GameRealtimeVector {
    pub x: f64,
    pub z: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GameRealtimeJoinPayload {
    pub ticket: String,
    pub client_version: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GameRealtimeMovePayload {
    pub sequence: u64,
    pub direction: GameRealtimeVector,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GameRealtimeHeartbeatPayload {
    pub last_snapshot_sequence: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GameRealtimeClientAckPayload {
    pub snapshot_sequence: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case", deny_unknown_fields)]
pub enum GameRealtimeClientMessage {
    Join {
        v: u8,
        payload: GameRealtimeJoinPayload,
    },
    Move {
        v: u8,
        payload: GameRealtimeMovePayload,
    },
    Heartbeat {
        v: u8,
        payload: GameRealtimeHeartbeatPayload,
    },
    ClientAck {
        v: u8,
        payload: GameRealtimeClientAckPayload,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GameRealtimeEntity {
    pub id: String,
    pub position: GameRealtimeVector,
    pub velocity: GameRealtimeVector,
    pub radius: f64,
    /// ID del personaje del catálogo (297A-50); el cliente lo mapea a su
    /// tono visual. Nunca es identidad de cuenta.
    pub character_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GameRealtimeJoinedPayload {
    /// ID efímero dentro de la sala; nunca es el UUID de cuenta.
    pub player_id: String,
    pub map_version: String,
    pub tick: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GameRealtimeSnapshotPayload {
    pub snapshot_sequence: u64,
    pub tick: u64,
    pub entities: Vec<GameRealtimeEntity>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GameRealtimeHeartbeatAckPayload {
    pub server_tick: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GameRealtimeErrorCode {
    InvalidMessage,
    Unauthorized,
    RateLimited,
    SequenceReplay,
    SequenceJump,
    RoomFull,
    MapUnavailable,
    ServerBusy,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GameRealtimeErrorPayload {
    pub code: GameRealtimeErrorCode,
    pub message: String,
    pub fatal: bool,
}

/// Aviso de reinicio coordinado (decisión 8, 05-ago): el servidor anuncia que
/// el mundo migrará a la versión nueva con cuenta atrás. `restart_in_seconds`
/// se valida en 1..=`GAME_REALTIME_MAX_RESTART_SECONDS`; el motivo es texto
/// bounded sin controles, igual que el resto del contrato.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GameRealtimeServerRestartPayload {
    pub reason: String,
    pub restart_in_seconds: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case", deny_unknown_fields)]
pub enum GameRealtimeServerMessage {
    Joined {
        v: u8,
        payload: GameRealtimeJoinedPayload,
    },
    Snapshot {
        v: u8,
        payload: GameRealtimeSnapshotPayload,
    },
    HeartbeatAck {
        v: u8,
        payload: GameRealtimeHeartbeatAckPayload,
    },
    Error {
        v: u8,
        payload: GameRealtimeErrorPayload,
    },
    ServerRestart {
        v: u8,
        payload: GameRealtimeServerRestartPayload,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SequenceDecision {
    Accept,
    Replay,
    Jump,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RealtimeContractError {
    MessageTooLarge,
    InvalidJson,
    InvalidEnvelope(String),
    InvalidPayload(String),
    ServerMessageTooLarge,
    RateLimited,
    InvalidClock,
}

fn bounded_text(value: &str, max_length: usize) -> bool {
    !value.trim().is_empty()
        && value.chars().count() <= max_length
        && !value.chars().any(char::is_control)
}

fn finite_vector(vector: GameRealtimeVector) -> bool {
    vector.x.is_finite() && vector.z.is_finite()
}

fn valid_direction(vector: GameRealtimeVector) -> bool {
    finite_vector(vector) && vector.x.abs() <= 1.0 && vector.z.abs() <= 1.0
}

fn valid_version(version: u8) -> bool {
    version == GAME_REALTIME_PROTOCOL_VERSION
}

fn validate_client_message(
    message: &GameRealtimeClientMessage,
) -> Result<(), RealtimeContractError> {
    match message {
        GameRealtimeClientMessage::Join { v, payload } => {
            if !valid_version(*v) {
                return Err(RealtimeContractError::InvalidEnvelope(
                    "versión no soportada".into(),
                ));
            }
            if !bounded_text(&payload.ticket, GAME_REALTIME_MAX_TICKET_LENGTH)
                || !bounded_text(
                    &payload.client_version,
                    GAME_REALTIME_MAX_CLIENT_VERSION_LENGTH,
                )
            {
                return Err(RealtimeContractError::InvalidPayload(
                    "join inválido".into(),
                ));
            }
        }
        GameRealtimeClientMessage::Move { v, payload } => {
            if !valid_version(*v) {
                return Err(RealtimeContractError::InvalidEnvelope(
                    "versión no soportada".into(),
                ));
            }
            if !valid_direction(payload.direction) {
                return Err(RealtimeContractError::InvalidPayload(
                    "direction inválida".into(),
                ));
            }
        }
        GameRealtimeClientMessage::Heartbeat { v, .. }
        | GameRealtimeClientMessage::ClientAck { v, .. } => {
            if !valid_version(*v) {
                return Err(RealtimeContractError::InvalidEnvelope(
                    "versión no soportada".into(),
                ));
            }
        }
    }
    Ok(())
}

fn validate_server_message(
    message: &GameRealtimeServerMessage,
) -> Result<(), RealtimeContractError> {
    match message {
        GameRealtimeServerMessage::Joined { v, payload } => {
            if !valid_version(*v)
                || !bounded_text(&payload.player_id, GAME_REALTIME_MAX_ENTITY_ID_LENGTH)
                || !bounded_text(&payload.map_version, GAME_REALTIME_MAX_MAP_VERSION_LENGTH)
            {
                return Err(RealtimeContractError::InvalidPayload(
                    "joined inválido".into(),
                ));
            }
        }
        GameRealtimeServerMessage::Snapshot { v, payload } => {
            if !valid_version(*v) || payload.entities.len() > GAME_REALTIME_MAX_PLAYERS_PER_ROOM {
                return Err(RealtimeContractError::InvalidPayload(
                    "snapshot inválido".into(),
                ));
            }
            let mut ids = BTreeSet::new();
            for entity in &payload.entities {
                if !bounded_text(&entity.id, GAME_REALTIME_MAX_ENTITY_ID_LENGTH)
                    || !bounded_text(&entity.character_id, GAME_REALTIME_MAX_CHARACTER_ID_LENGTH)
                    || !finite_vector(entity.position)
                    || !finite_vector(entity.velocity)
                    || !entity.radius.is_finite()
                    || entity.radius <= 0.0
                    || entity.radius > 16.0
                    || !ids.insert(entity.id.as_str())
                {
                    return Err(RealtimeContractError::InvalidPayload(
                        "entity inválida".into(),
                    ));
                }
            }
        }
        GameRealtimeServerMessage::HeartbeatAck { v, .. } => {
            if !valid_version(*v) {
                return Err(RealtimeContractError::InvalidEnvelope(
                    "versión no soportada".into(),
                ));
            }
        }
        GameRealtimeServerMessage::Error { v, payload } => {
            if !valid_version(*v)
                || payload.message.chars().count() > GAME_REALTIME_MAX_ERROR_MESSAGE_LENGTH
                || payload.message.chars().any(char::is_control)
            {
                return Err(RealtimeContractError::InvalidPayload(
                    "error inválido".into(),
                ));
            }
        }
        GameRealtimeServerMessage::ServerRestart { v, payload } => {
            if !valid_version(*v)
                || !bounded_text(&payload.reason, GAME_REALTIME_MAX_RESTART_REASON_LENGTH)
                || payload.restart_in_seconds < 1
                || payload.restart_in_seconds > GAME_REALTIME_MAX_RESTART_SECONDS
            {
                return Err(RealtimeContractError::InvalidPayload(
                    "server_restart inválido".into(),
                ));
            }
        }
    }
    Ok(())
}

pub fn parse_client_message(
    bytes: &[u8],
) -> Result<GameRealtimeClientMessage, RealtimeContractError> {
    if bytes.len() > GAME_REALTIME_MAX_CLIENT_MESSAGE_BYTES {
        return Err(RealtimeContractError::MessageTooLarge);
    }
    let message = serde_json::from_slice(bytes).map_err(|_| RealtimeContractError::InvalidJson)?;
    validate_client_message(&message)?;
    Ok(message)
}

pub fn serialize_server_message(
    message: &GameRealtimeServerMessage,
) -> Result<Vec<u8>, RealtimeContractError> {
    validate_server_message(message)?;
    let bytes = serde_json::to_vec(message).map_err(|_| RealtimeContractError::InvalidJson)?;
    if bytes.len() > GAME_REALTIME_MAX_SERVER_MESSAGE_BYTES {
        return Err(RealtimeContractError::ServerMessageTooLarge);
    }
    Ok(bytes)
}

#[must_use]
pub fn filter_snapshot(
    snapshot: &GameRealtimeSnapshotPayload,
    visible_entity_ids: &BTreeSet<String>,
) -> GameRealtimeSnapshotPayload {
    let mut entities = snapshot
        .entities
        .iter()
        .filter(|entity| visible_entity_ids.contains(&entity.id))
        .cloned()
        .collect::<Vec<_>>();
    entities.sort_by(|left, right| left.id.cmp(&right.id));
    GameRealtimeSnapshotPayload {
        snapshot_sequence: snapshot.snapshot_sequence,
        tick: snapshot.tick,
        entities,
    }
}

#[must_use]
pub fn assess_sequence(last_accepted: Option<u64>, incoming: u64) -> SequenceDecision {
    match last_accepted {
        Some(last) if incoming <= last => SequenceDecision::Replay,
        Some(last) if incoming - last > GAME_REALTIME_MAX_SEQUENCE_JUMP => SequenceDecision::Jump,
        None | Some(_) => SequenceDecision::Accept,
    }
}

pub fn consume_rate_budget(
    history: &[u64],
    now_ms: u64,
) -> Result<Vec<u64>, RealtimeContractError> {
    if history.iter().any(|value| *value > now_ms) {
        return Err(RealtimeContractError::InvalidClock);
    }
    let cutoff = now_ms.saturating_sub(1_000);
    let mut active = history
        .iter()
        .copied()
        .filter(|value| *value > cutoff)
        .collect::<Vec<_>>();
    if active.len() >= GAME_REALTIME_MAX_CLIENT_MESSAGES_PER_SECOND {
        return Err(RealtimeContractError::RateLimited);
    }
    active.push(now_ms);
    Ok(active)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn join_json() -> Vec<u8> {
        serde_json::to_vec(&json!({
            "type": "join",
            "v": 1,
            "payload": { "ticket": "opaque-ticket", "clientVersion": "game-01" }
        }))
        .expect("join json")
    }

    fn entity(id: &str) -> GameRealtimeEntity {
        GameRealtimeEntity {
            id: id.to_string(),
            position: GameRealtimeVector { x: 1.0, z: 2.0 },
            velocity: GameRealtimeVector { x: 0.0, z: 0.0 },
            radius: 0.5,
            character_id: "forest-scout".to_string(),
        }
    }

    #[test]
    fn parses_versioned_join_without_exposing_identity_subject() {
        let parsed = parse_client_message(&join_json()).expect("join");
        assert!(matches!(parsed, GameRealtimeClientMessage::Join { .. }));
        assert!(!String::from_utf8(join_json())
            .expect("utf8")
            .contains("user_id"));
    }

    #[test]
    fn rejects_oversized_invalid_and_unknown_client_messages() {
        assert_eq!(
            parse_client_message(&vec![b' '; GAME_REALTIME_MAX_CLIENT_MESSAGE_BYTES + 1]),
            Err(RealtimeContractError::MessageTooLarge)
        );
        assert_eq!(
            parse_client_message(b"{invalid"),
            Err(RealtimeContractError::InvalidJson)
        );
        let unknown =
            br#"{"type":"join","v":1,"payload":{"ticket":"x","clientVersion":"v"},"extra":true}"#;
        assert_eq!(
            parse_client_message(unknown),
            Err(RealtimeContractError::InvalidJson)
        );
    }

    #[test]
    fn rejects_wrong_version_bad_direction_and_long_ticket() {
        let wrong_version = br#"{"type":"heartbeat","v":2,"payload":{"lastSnapshotSequence":1}}"#;
        assert!(matches!(
            parse_client_message(wrong_version),
            Err(RealtimeContractError::InvalidEnvelope(_))
        ));
        let bad_direction =
            br#"{"type":"move","v":1,"payload":{"sequence":1,"direction":{"x":2,"z":0}}}"#;
        assert!(matches!(
            parse_client_message(bad_direction),
            Err(RealtimeContractError::InvalidPayload(_))
        ));
        let long_ticket = format!(
            "{{\"type\":\"join\",\"v\":1,\"payload\":{{\"ticket\":\"{}\",\"clientVersion\":\"v\"}}}}",
            "x".repeat(GAME_REALTIME_MAX_TICKET_LENGTH + 1)
        );
        assert!(matches!(
            parse_client_message(long_ticket.as_bytes()),
            Err(RealtimeContractError::InvalidPayload(_))
        ));
        let unicode_client_version = format!(
            "{{\"type\":\"join\",\"v\":1,\"payload\":{{\"ticket\":\"x\",\"clientVersion\":\"{}\"}}}}",
            "🚀".repeat(32)
        );
        assert!(parse_client_message(unicode_client_version.as_bytes()).is_ok());
        let control_ticket =
            br#"{"type":"join","v":1,"payload":{"ticket":"x\u007f","clientVersion":"v"}}"#;
        assert!(matches!(
            parse_client_message(control_ticket),
            Err(RealtimeContractError::InvalidPayload(_))
        ));
    }

    #[test]
    fn filters_snapshots_to_interest_set_and_sorts_entities() {
        let snapshot = GameRealtimeSnapshotPayload {
            snapshot_sequence: 4,
            tick: 10,
            entities: vec![entity("z"), entity("a")],
        };
        let visible = BTreeSet::from([String::from("a")]);
        let filtered = filter_snapshot(&snapshot, &visible);
        assert_eq!(
            filtered
                .entities
                .iter()
                .map(|item| item.id.as_str())
                .collect::<Vec<_>>(),
            vec!["a"]
        );
    }

    #[test]
    fn rejects_duplicate_entities_and_oversized_server_payloads() {
        let duplicate = GameRealtimeServerMessage::Snapshot {
            v: 1,
            payload: GameRealtimeSnapshotPayload {
                snapshot_sequence: 1,
                tick: 1,
                entities: vec![entity("same"), entity("same")],
            },
        };
        assert!(matches!(
            serialize_server_message(&duplicate),
            Err(RealtimeContractError::InvalidPayload(_))
        ));
        let huge = GameRealtimeServerMessage::Error {
            v: 1,
            payload: GameRealtimeErrorPayload {
                code: GameRealtimeErrorCode::ServerBusy,
                message: "x".repeat(GAME_REALTIME_MAX_ERROR_MESSAGE_LENGTH + 1),
                fatal: true,
            },
        };
        assert!(matches!(
            serialize_server_message(&huge),
            Err(RealtimeContractError::InvalidPayload(_))
        ));
    }

    #[test]
    fn rejects_entities_without_character_id_or_oversized_character() {
        let mut no_character = entity("a");
        no_character.character_id.clear();
        let invalid = GameRealtimeServerMessage::Snapshot {
            v: 1,
            payload: GameRealtimeSnapshotPayload {
                snapshot_sequence: 1,
                tick: 1,
                entities: vec![no_character],
            },
        };
        assert!(matches!(
            serialize_server_message(&invalid),
            Err(RealtimeContractError::InvalidPayload(_))
        ));
        let mut oversized_character = entity("a");
        oversized_character.character_id = "x".repeat(GAME_REALTIME_MAX_CHARACTER_ID_LENGTH + 1);
        let invalid = GameRealtimeServerMessage::Snapshot {
            v: 1,
            payload: GameRealtimeSnapshotPayload {
                snapshot_sequence: 1,
                tick: 1,
                entities: vec![oversized_character],
            },
        };
        assert!(matches!(
            serialize_server_message(&invalid),
            Err(RealtimeContractError::InvalidPayload(_))
        ));
        /* El campo se serializa camelCase en el wire: `characterId`. */
        let message = GameRealtimeServerMessage::Snapshot {
            v: 1,
            payload: GameRealtimeSnapshotPayload {
                snapshot_sequence: 1,
                tick: 1,
                entities: vec![entity("a")],
            },
        };
        let bytes = serialize_server_message(&message).expect("snapshot");
        assert!(String::from_utf8_lossy(&bytes).contains("characterId"));
    }

    #[test]
    fn accepts_and_serializes_server_message_with_version() {
        let message = GameRealtimeServerMessage::HeartbeatAck {
            v: GAME_REALTIME_PROTOCOL_VERSION,
            payload: GameRealtimeHeartbeatAckPayload { server_tick: 7 },
        };
        let bytes = serialize_server_message(&message).expect("server message");
        assert_eq!(
            serde_json::from_slice::<serde_json::Value>(&bytes).expect("json")["v"],
            1
        );
    }

    #[test]
    fn server_restart_announces_coordinated_migration_with_bounded_countdown() {
        /* Decisión 8: el contrato admite el aviso con motivo y cuenta atrás,
         * serializado camelCase en el wire (`restartInSeconds`). */
        let message = GameRealtimeServerMessage::ServerRestart {
            v: 1,
            payload: GameRealtimeServerRestartPayload {
                reason: "publicación de versión nueva".to_string(),
                restart_in_seconds: 300,
            },
        };
        let bytes = serialize_server_message(&message).expect("server_restart");
        let json = String::from_utf8_lossy(&bytes);
        assert!(json.contains("\"type\":\"server_restart\""));
        assert!(json.contains("restartInSeconds"));
        /* Cuenta atrás fuera de rango y motivo excesivo: fail-closed. */
        let zero = GameRealtimeServerMessage::ServerRestart {
            v: 1,
            payload: GameRealtimeServerRestartPayload {
                reason: "x".to_string(),
                restart_in_seconds: 0,
            },
        };
        assert!(matches!(
            serialize_server_message(&zero),
            Err(RealtimeContractError::InvalidPayload(_))
        ));
        let huge = GameRealtimeServerMessage::ServerRestart {
            v: 1,
            payload: GameRealtimeServerRestartPayload {
                reason: "x".to_string(),
                restart_in_seconds: GAME_REALTIME_MAX_RESTART_SECONDS + 1,
            },
        };
        assert!(matches!(
            serialize_server_message(&huge),
            Err(RealtimeContractError::InvalidPayload(_))
        ));
        let long_reason = GameRealtimeServerMessage::ServerRestart {
            v: 1,
            payload: GameRealtimeServerRestartPayload {
                reason: "x".repeat(GAME_REALTIME_MAX_RESTART_REASON_LENGTH + 1),
                restart_in_seconds: 300,
            },
        };
        assert!(matches!(
            serialize_server_message(&long_reason),
            Err(RealtimeContractError::InvalidPayload(_))
        ));
    }

    #[test]
    fn classifies_replay_and_jumps_before_transport() {
        assert_eq!(assess_sequence(None, 0), SequenceDecision::Accept);
        assert_eq!(assess_sequence(Some(4), 4), SequenceDecision::Replay);
        assert_eq!(assess_sequence(Some(4), 3), SequenceDecision::Replay);
        assert_eq!(
            assess_sequence(Some(4), 4 + GAME_REALTIME_MAX_SEQUENCE_JUMP + 1),
            SequenceDecision::Jump
        );
        assert_eq!(assess_sequence(Some(4), 5), SequenceDecision::Accept);
    }

    #[test]
    fn enforces_rate_budget_and_rejects_clock_reversal() {
        let history = vec![100; GAME_REALTIME_MAX_CLIENT_MESSAGES_PER_SECOND];
        assert_eq!(
            consume_rate_budget(&history, 100),
            Err(RealtimeContractError::RateLimited)
        );
        assert_eq!(
            consume_rate_budget(&[101], 100),
            Err(RealtimeContractError::InvalidClock)
        );
        assert_eq!(
            consume_rate_budget(&[0; 20], 2_000).expect("expired budget"),
            vec![2_000]
        );
        let negative_sequence =
            br#"{"type":"heartbeat","v":1,"payload":{"lastSnapshotSequence":-1}}"#;
        assert_eq!(
            parse_client_message(negative_sequence),
            Err(RealtimeContractError::InvalidJson)
        );
    }
}
