//! GAME-01 — Presupuesto de conexiones del transporte realtime.
//!
//! Este módulo limita handshakes/sockets activos y conserva el estado de la sala
//! realtime en la primera instancia. El actor de sala posee jugadores, mapa y
//! fanout; este wrapper expone sus límites al handler.

use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Duration;

use super::game_room::{GameRoomState, RoomJoinError};
use super::game_room_map::GameRoomMap;

pub const GAME_WS_DEFAULT_MAX_CONNECTIONS: usize = 64;
const GAME_WS_DEFAULT_ROOM_TTL_SECS: u64 = 300;
/* [Decisión 8] Cuenta atrás fija de la migración coordinada: el cliente ve
 * este aviso y el servidor drena las salas al expirar. */
pub const GAME_RESTART_GRACE_SECONDS: u64 = 300;

#[derive(Clone)]
pub struct GameWsState {
    active_connections: Arc<AtomicUsize>,
    max_connections: usize,
    room_state: GameRoomState,
    /* [Decisión 8] Reinicio en curso: la primera publicación gana y las
     * concurrentes durante la cuenta atrás son no-op (no se acumulan tasks). */
    restart_pending: Arc<AtomicBool>,
}

impl Default for GameWsState {
    fn default() -> Self {
        Self::with_max_connections(GAME_WS_DEFAULT_MAX_CONNECTIONS)
    }
}

impl GameWsState {
    #[must_use]
    pub fn with_max_connections(max_connections: usize) -> Self {
        Self::with_max_connections_and_room_ttl(max_connections, GAME_WS_DEFAULT_ROOM_TTL_SECS)
    }

    /// Crea el estado con un TTL de sala explícito. El constructor productivo
    /// anterior conserva 300 segundos; los benchmarks pueden usar `0`.
    #[must_use]
    pub fn with_max_connections_and_room_ttl(max_connections: usize, room_ttl_secs: u64) -> Self {
        Self {
            active_connections: Arc::new(AtomicUsize::new(0)),
            max_connections,
            room_state: GameRoomState::empty_with_ttl(room_ttl_secs),
            restart_pending: Arc::new(AtomicBool::new(false)),
        }
    }

    /// Reserva una conexión sin superar el límite global.
    #[must_use]
    pub fn try_acquire(&self) -> Option<GameWsConnectionGuard> {
        loop {
            let current = self.active_connections.load(Ordering::Acquire);
            if current >= self.max_connections {
                return None;
            }
            if self
                .active_connections
                .compare_exchange(current, current + 1, Ordering::AcqRel, Ordering::Acquire)
                .is_ok()
            {
                return Some(GameWsConnectionGuard {
                    active_connections: Arc::clone(&self.active_connections),
                });
            }
        }
    }

    #[must_use]
    pub fn active_connections(&self) -> usize {
        self.active_connections.load(Ordering::Acquire)
    }

    #[must_use]
    pub fn room_state(&self) -> GameRoomState {
        self.room_state.clone()
    }

    pub fn set_room_map(&self, map: Option<GameRoomMap>) {
        self.room_state.set_map(map);
    }

    #[must_use]
    pub fn has_room_map(&self) -> bool {
        self.room_state.has_map()
    }

    /// [Decisión 8] Passthrough del aviso de reinicio coordinado: difunde
    /// `server_restart` con la cuenta atrás a todas las salas activas.
    pub async fn announce_restart(&self, reason: &str, restart_in_seconds: u64) {
        self.room_state
            .announce_restart(reason, restart_in_seconds)
            .await;
    }

    /// [Decisión 8] Programa la migración coordinada tras una publicación
    /// exitosa: difunde el aviso, espera la cuenta atrás y drena las salas
    /// (los sockets se cierran y el cliente reintenta recargando la versión
    /// nueva). Publicaciones concurrentes durante la cuenta atrás son no-op:
    /// la primera gana y no se acumulan tasks.
    ///
    /// Orden de la migración: primero se invalida el mapa cacheado y luego se
    /// drenan las salas. Así, un join en la ventana entre ambos carga la
    /// versión nueva de la BD (el publish ya hizo commit) y crea una sala
    /// correcta que no necesita drenaje; si fuera al revés, crearía una sala
    /// con el mapa viejo en memoria. El flag se libera con un guard `Drop`:
    /// si el task se cancela o paniquea, las futuras publicaciones no quedan
    /// bloqueadas (el crash del proceso también lo resetea).
    pub fn schedule_restart(&self, reason: &str, restart_in_seconds: u64) {
        if self.restart_pending.swap(true, Ordering::AcqRel) {
            return;
        }
        let ws = self.clone();
        let reason = reason.to_string();
        tokio::spawn(async move {
            let _guard = RestartPendingGuard {
                flag: Arc::clone(&ws.restart_pending),
            };
            ws.announce_restart(&reason, restart_in_seconds).await;
            tokio::time::sleep(Duration::from_secs(restart_in_seconds)).await;
            ws.set_room_map(None);
            ws.room_state.shutdown_all_rooms().await;
        });
    }

    #[must_use]
    pub fn room_join_error_code(
        error: RoomJoinError,
    ) -> crate::models::game_realtime::GameRealtimeErrorCode {
        error.code()
    }
}

pub struct GameWsConnectionGuard {
    active_connections: Arc<AtomicUsize>,
}

impl Drop for GameWsConnectionGuard {
    fn drop(&mut self) {
        self.active_connections.fetch_sub(1, Ordering::AcqRel);
    }
}

/// [Decisión 8] Libera `restart_pending` al salir del task de migración (por
/// éxito, cancelación o panic): las publicaciones siguientes no se bloquean.
struct RestartPendingGuard {
    flag: Arc<AtomicBool>,
}

impl Drop for RestartPendingGuard {
    fn drop(&mut self) {
        self.flag.store(false, Ordering::Release);
    }
}

#[cfg(test)]
mod tests {
    use super::GameWsState;

    #[test]
    fn enforces_capacity_and_releases_on_guard_drop() {
        let state = GameWsState::with_max_connections(1);
        let guard = state.try_acquire().expect("first connection");
        assert_eq!(state.active_connections(), 1);
        assert!(state.try_acquire().is_none());
        drop(guard);
        assert_eq!(state.active_connections(), 0);
        assert!(state.try_acquire().is_some());
    }

    #[test]
    fn zero_capacity_fails_closed() {
        let state = GameWsState::with_max_connections(0);
        assert!(state.try_acquire().is_none());
        assert_eq!(state.active_connections(), 0);
    }

    #[tokio::test]
    async fn announce_restart_passthrough_reaches_room_players() {
        use super::GameRoomMap;
        use crate::services::game_room_map::RoomSpawn;
        use tokio::sync::mpsc;
        use uuid::Uuid;

        let state = GameWsState::with_max_connections_and_room_ttl(8, 60);
        let map = GameRoomMap::from_parts(
            "forest".to_string(),
            1,
            crate::services::game_room_map::RoomBounds {
                min_x: 0.0,
                max_x: 32.0,
                min_z: 0.0,
                max_z: 32.0,
            },
            Vec::new(),
            vec![RoomSpawn {
                x: 2.0,
                z: 2.0,
                radius: 1.0,
            }],
        )
        .expect("map fixture");
        state.set_room_map(Some(map));
        let (output, mut messages) = mpsc::channel(32);
        let joined = state
            .room_state()
            .join(Uuid::new_v4(), output)
            .await
            .expect("join");

        state.announce_restart("migración coordinada", 120).await;

        /* Los snapshots del tick pueden llegar antes; drena hasta el aviso. */
        let restart = loop {
            let message = tokio::time::timeout(std::time::Duration::from_secs(1), messages.recv())
                .await
                .expect("timeout server_restart")
                .expect("canal cerrado");
            if matches!(
                message,
                crate::models::game_realtime::GameRealtimeServerMessage::ServerRestart { .. }
            ) {
                break message;
            }
        };
        match restart {
            crate::models::game_realtime::GameRealtimeServerMessage::ServerRestart {
                payload,
                ..
            } => {
                assert_eq!(payload.reason, "migración coordinada");
                assert_eq!(payload.restart_in_seconds, 120);
            }
            other => panic!("server_restart esperado, llegó {other:?}"),
        }
        joined.disconnect().await;
    }

    #[tokio::test]
    async fn schedule_restart_announces_then_drains_and_invalidates_map() {
        /* [Decisión 8] El flujo completo de la migración coordinada con cuenta
         * corta (1 s): el aviso llega a los players, al expirar se drena la
         * sala (canal cerrado) y el mapa cacheado queda invalidado para que
         * el próximo join recargue la versión nueva. */
        use super::GameRoomMap;
        use crate::services::game_room_map::RoomSpawn;
        use tokio::sync::mpsc;
        use uuid::Uuid;

        let state = GameWsState::with_max_connections_and_room_ttl(8, 60);
        let map = GameRoomMap::from_parts(
            "forest".to_string(),
            1,
            crate::services::game_room_map::RoomBounds {
                min_x: 0.0,
                max_x: 32.0,
                min_z: 0.0,
                max_z: 32.0,
            },
            Vec::new(),
            vec![RoomSpawn {
                x: 2.0,
                z: 2.0,
                radius: 1.0,
            }],
        )
        .expect("map fixture");
        state.set_room_map(Some(map));
        let (output, mut messages) = mpsc::channel(32);
        let joined = state
            .room_state()
            .join(Uuid::new_v4(), output)
            .await
            .expect("join");

        state.schedule_restart("publicación de versión nueva", 1);

        /* El aviso llega de inmediato (los snapshots pueden ir antes). */
        let restart = loop {
            let message = tokio::time::timeout(std::time::Duration::from_secs(2), messages.recv())
                .await
                .expect("timeout server_restart")
                .expect("canal cerrado antes del aviso");
            if matches!(
                message,
                crate::models::game_realtime::GameRealtimeServerMessage::ServerRestart { .. }
            ) {
                break message;
            }
        };
        match restart {
            crate::models::game_realtime::GameRealtimeServerMessage::ServerRestart {
                payload,
                ..
            } => {
                assert_eq!(payload.reason, "publicación de versión nueva");
                assert_eq!(payload.restart_in_seconds, 1);
            }
            other => panic!("server_restart esperado, llegó {other:?}"),
        }

        /* Tras la cuenta corta + margen, la sala se drena y el mapa se invalida. */
        tokio::time::timeout(std::time::Duration::from_secs(3), async {
            loop {
                if !state.has_room_map() {
                    break;
                }
                tokio::time::sleep(std::time::Duration::from_millis(50)).await;
            }
        })
        .await
        .expect("el mapa debió invalidarse tras la cuenta atrás");
        /* Drena los snapshots en vuelo hasta el cierre del canal (Ok(None));
         * el actor cerró y el transporte verá el fin de sesión. */
        let closed = tokio::time::timeout(std::time::Duration::from_secs(2), async {
            loop {
                match messages.recv().await {
                    None => break true,
                    Some(_) => continue,
                }
            }
        })
        .await
        .unwrap_or_else(|_| panic!("el output debió cerrarse tras el drenaje"));
        assert!(closed);
        joined.disconnect().await;
    }
}
