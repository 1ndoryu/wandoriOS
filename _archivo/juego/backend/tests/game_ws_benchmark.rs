//! GAME-01 — Medición manual del realtime de una sala.
//!
//! No pertenece a la suite normal: se ejecuta con `--ignored --nocapture`.
//! Mide transporte y latencia dentro de un proceso local; CPU/memoria del
//! proceso deben capturarse externamente para no introducir una dependencia
//! específica del sistema operativo en el backend.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use axum::serve;
use futures_util::{SinkExt, StreamExt};
use glory_backend::handlers::create_router_with_state;
use glory_backend::services::game_room_map::{GameRoomMap, RoomBounds, RoomSpawn};
use glory_backend::services::game_ticket::GameTicketStore;
use glory_backend::services::game_ws::GameWsState;
use glory_backend::AppState;
use serde_json::Value;
use sqlx::postgres::PgPoolOptions;
use tokio::sync::oneshot;
use tokio::task::JoinHandle;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message;
use uuid::Uuid;

const TEST_SECRET: &str = "game-ws-benchmark-secret";
const BENCHMARK_WINDOW: Duration = Duration::from_secs(2);
const BENCHMARK_TIMEOUT: Duration = Duration::from_secs(10);
const MOVE_INTERVAL: Duration = Duration::from_millis(100);
const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(1);

fn benchmark_state(max_connections: usize) -> AppState {
    let pool = PgPoolOptions::new()
        .connect_lazy("postgres://test:test@127.0.0.1:5432/game_ws_benchmark")
        .expect("DATABASE_URL de benchmark sintácticamente válido");
    AppState {
        pool,
        upload_dir: "target/game-ws-benchmark-uploads".to_string(),
        resend_api_key: None,
        email_from: "benchmark@example.invalid".to_string(),
        stripe_secret_key: None,
        stripe_webhook_secret: None,
        game_ticket_secret: Some(TEST_SECRET.to_string()),
        game_ticket_store: GameTicketStore::default(),
        game_ws_state: GameWsState::with_max_connections_and_room_ttl(max_connections, 0),
        site_url: "http://localhost:3000".to_string(),
        login_rate_limit: Arc::new(Mutex::new(
            HashMap::<String, (u8, std::time::Instant)>::new(),
        )),
        auth_action_rate_limit: Arc::new(Mutex::new(
            HashMap::<String, (u8, std::time::Instant)>::new(),
        )),
    }
}

fn fixture_map() -> GameRoomMap {
    GameRoomMap::from_parts(
        "forest".to_string(),
        1,
        RoomBounds {
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
    .expect("mapa fixture válido")
}

async fn spawn_server(state: AppState) -> (String, oneshot::Sender<()>, JoinHandle<()>) {
    state.game_ws_state.set_room_map(Some(fixture_map()));
    let app = create_router_with_state(state);
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("listener TCP efímero");
    let address = listener.local_addr().expect("dirección del listener");
    let (shutdown_tx, shutdown_rx) = oneshot::channel();
    let server_handle = tokio::spawn(async move {
        serve(listener, app)
            .with_graceful_shutdown(async {
                let _ = shutdown_rx.await;
            })
            .await
            .expect("servidor benchmark debe finalizar limpiamente");
    });
    (
        format!("ws://{address}/api/game/ws"),
        shutdown_tx,
        server_handle,
    )
}

fn join_message(ticket: &str) -> Message {
    Message::Text(
        serde_json::json!({
            "type": "join",
            "v": 1,
            "payload": {
                "ticket": ticket,
                "clientVersion": "game-01"
            }
        })
        .to_string()
        .into(),
    )
}

fn move_message(sequence: u64) -> Message {
    Message::Text(
        serde_json::json!({
            "type": "move",
            "v": 1,
            "payload": { "sequence": sequence, "direction": { "x": 1, "z": 0 } }
        })
        .to_string()
        .into(),
    )
}

fn heartbeat_message(last_snapshot_sequence: u64) -> Message {
    Message::Text(
        serde_json::json!({
            "type": "heartbeat",
            "v": 1,
            "payload": { "lastSnapshotSequence": last_snapshot_sequence }
        })
        .to_string()
        .into(),
    )
}

#[derive(Debug, Default)]
struct ClientMetrics {
    join_latency: Option<Duration>,
    first_snapshot_latency: Option<Duration>,
    snapshots: u64,
    server_messages: u64,
    server_payload_bytes: u64,
    client_messages: u64,
    client_payload_bytes: u64,
}

async fn run_client(url: String, ticket: String) -> ClientMetrics {
    let (mut socket, _) = connect_async(url).await.expect("upgrade benchmark");
    let started = Instant::now();
    let join = join_message(&ticket);
    let join_bytes = message_bytes(&join);
    socket.send(join).await.expect("join benchmark");

    let mut metrics = ClientMetrics {
        client_messages: 1,
        client_payload_bytes: join_bytes,
        ..ClientMetrics::default()
    };
    let mut joined = false;
    let mut first_snapshot = false;
    let mut last_snapshot_sequence = 0_u64;
    let mut sequence = 1_u64;
    let mut next_move = tokio::time::interval(MOVE_INTERVAL);
    let mut next_heartbeat = tokio::time::interval(HEARTBEAT_INTERVAL);
    next_move.tick().await;
    next_heartbeat.tick().await;

    let measurement = tokio::time::timeout(BENCHMARK_TIMEOUT, async {
        while !first_snapshot || started.elapsed() < BENCHMARK_WINDOW {
            tokio::select! {
                incoming = socket.next() => {
                    let Some(Ok(message)) = incoming else { break; };
                    metrics.server_messages = metrics.server_messages.saturating_add(1);
                    metrics.server_payload_bytes = metrics
                        .server_payload_bytes
                        .saturating_add(message_bytes(&message));
                    if let Message::Text(text) = message {
                        let value = serde_json::from_str::<Value>(&text).expect("JSON benchmark");
                        match value["type"].as_str() {
                            Some("joined") if !joined => {
                                joined = true;
                                metrics.join_latency = Some(started.elapsed());
                            }
                            Some("snapshot") => {
                                let snapshot_sequence = value["payload"]["snapshotSequence"]
                                    .as_u64()
                                    .unwrap_or(last_snapshot_sequence);
                                last_snapshot_sequence = last_snapshot_sequence.max(snapshot_sequence);
                                metrics.snapshots = metrics.snapshots.saturating_add(1);
                                if !first_snapshot {
                                    first_snapshot = true;
                                    metrics.first_snapshot_latency = Some(started.elapsed());
                                }
                            }
                            _ => {}
                        }
                    }
                }
                _ = next_move.tick(), if first_snapshot => {
                    let message = move_message(sequence);
                    sequence = sequence.saturating_add(1);
                    metrics.client_messages = metrics.client_messages.saturating_add(1);
                    metrics.client_payload_bytes = metrics
                        .client_payload_bytes
                        .saturating_add(message_bytes(&message));
                    if socket.send(message).await.is_err() { break; }
                }
                _ = next_heartbeat.tick(), if first_snapshot => {
                    let message = heartbeat_message(last_snapshot_sequence);
                    metrics.client_messages = metrics.client_messages.saturating_add(1);
                    metrics.client_payload_bytes = metrics
                        .client_payload_bytes
                        .saturating_add(message_bytes(&message));
                    if socket.send(message).await.is_err() { break; }
                }
            }
        }
    }).await;
    measurement.expect("benchmark realtime excedió el timeout");
    let _ = socket.close(None).await;
    metrics
}

fn message_bytes(message: &Message) -> u64 {
    match message {
        Message::Text(text) => u64::try_from(text.len()).unwrap_or(u64::MAX),
        Message::Binary(bytes) => u64::try_from(bytes.len()).unwrap_or(u64::MAX),
        Message::Ping(bytes) | Message::Pong(bytes) => {
            u64::try_from(bytes.len()).unwrap_or(u64::MAX)
        }
        Message::Close(Some(frame)) => u64::try_from(frame.reason.len()).unwrap_or(u64::MAX),
        Message::Close(None) | Message::Frame(_) => 0,
    }
}

fn percentile_millis(
    metrics: &[ClientMetrics],
    percentile: f64,
    selector: fn(&ClientMetrics) -> Option<Duration>,
) -> f64 {
    let mut values = metrics
        .iter()
        .filter_map(selector)
        .map(|duration| duration.as_secs_f64() * 1_000.0)
        .collect::<Vec<_>>();
    if values.is_empty() {
        return 0.0;
    }
    values.sort_by(f64::total_cmp);
    let index = ((values.len() - 1) as f64 * percentile).round() as usize;
    values[index.min(values.len() - 1)]
}

async fn run_scenario(client_count: usize) {
    let state = benchmark_state(client_count);
    let ticket_store = state.game_ticket_store.clone();
    let (url, shutdown, server_handle) = spawn_server(state).await;
    let mut tasks = Vec::with_capacity(client_count);
    for _ in 0..client_count {
        let ticket = ticket_store
            .issue(Uuid::new_v4(), None, 30, TEST_SECRET)
            .expect("ticket de benchmark");
        tasks.push(tokio::spawn(run_client(url.clone(), ticket)));
    }
    let mut metrics = Vec::with_capacity(client_count);
    for task in tasks {
        metrics.push(task.await.expect("cliente benchmark"));
    }
    let total_server_messages = metrics.iter().map(|item| item.server_messages).sum::<u64>();
    let total_server_payload_bytes = metrics
        .iter()
        .map(|item| item.server_payload_bytes)
        .sum::<u64>();
    let total_client_messages = metrics.iter().map(|item| item.client_messages).sum::<u64>();
    let total_client_payload_bytes = metrics
        .iter()
        .map(|item| item.client_payload_bytes)
        .sum::<u64>();
    let total_snapshots = metrics.iter().map(|item| item.snapshots).sum::<u64>();
    println!(
        "GAME-01 benchmark clients={client_count} join_p50_ms={:.2} join_p95_ms={:.2} first_snapshot_p50_ms={:.2} first_snapshot_p95_ms={:.2} snapshots={total_snapshots} server_messages={total_server_messages} server_payload_bytes={total_server_payload_bytes} client_messages={total_client_messages} client_payload_bytes={total_client_payload_bytes}",
        percentile_millis(&metrics, 0.50, |item| item.join_latency),
        percentile_millis(&metrics, 0.95, |item| item.join_latency),
        percentile_millis(&metrics, 0.50, |item| item.first_snapshot_latency),
        percentile_millis(&metrics, 0.95, |item| item.first_snapshot_latency),
    );
    assert!(metrics.iter().all(|item| item.join_latency.is_some()));
    assert!(metrics
        .iter()
        .all(|item| item.first_snapshot_latency.is_some()));
    assert!(metrics.iter().all(|item| item.snapshots > 0));

    // El actor usa TTL=0 en este harness; espera un tick para que el cierre
    // del último socket retire la sala antes de apagar el servidor.
    tokio::time::sleep(Duration::from_millis(150)).await;
    let _ = shutdown.send(());
    server_handle.await.expect("shutdown benchmark");
}

#[tokio::test]
#[ignore = "benchmark manual: requiere --ignored --nocapture y no forma parte de la suite normal"]
async fn realtime_room_benchmark_1_4_8_clients() {
    for client_count in [1, 4, 8] {
        run_scenario(client_count).await;
    }
}
