use std::collections::HashMap;
use std::sync::{Arc, Mutex};

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

const TEST_SECRET: &str = "game-ws-tcp-test-secret";

fn test_state() -> AppState {
    test_state_with_capacity(8)
}

fn test_state_with_capacity(max_connections: usize) -> AppState {
    let pool = PgPoolOptions::new()
        .connect_lazy("postgres://test:test@127.0.0.1:5432/game_ws_tcp")
        .expect("DATABASE_URL de prueba sintácticamente válido");
    AppState {
        pool,
        upload_dir: "target/game-ws-tcp-test-uploads".to_string(),
        resend_api_key: None,
        email_from: "test@example.invalid".to_string(),
        stripe_secret_key: None,
        stripe_webhook_secret: None,
        game_ticket_secret: Some(TEST_SECRET.to_string()),
        game_ticket_store: GameTicketStore::default(),
        game_ws_state: GameWsState::with_max_connections(max_connections),
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
            .expect("servidor WebSocket debe finalizar limpiamente");
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
        .to_string(),
    )
}

async fn read_message_type<S>(
    socket: &mut tokio_tungstenite::WebSocketStream<S>,
    expected_type: &str,
) -> Value
where
    S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin,
{
    while let Some(message) = socket.next().await {
        match message.expect("frame WebSocket válido") {
            Message::Text(text) => {
                let value = serde_json::from_str::<Value>(&text).expect("JSON realtime");
                if value["type"] == expected_type {
                    return value;
                }
            }
            Message::Close(_) => break,
            Message::Ping(_) | Message::Pong(_) | Message::Binary(_) | Message::Frame(_) => {}
        }
    }
    panic!("el servidor debe enviar el tipo {expected_type}");
}

async fn read_snapshot_after<S>(
    socket: &mut tokio_tungstenite::WebSocketStream<S>,
    previous_sequence: u64,
) -> Value
where
    S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin,
{
    while let Some(message) = socket.next().await {
        match message.expect("frame WebSocket válido") {
            Message::Text(text) => {
                let value = serde_json::from_str::<Value>(&text).expect("JSON realtime");
                if value["type"] == "snapshot"
                    && value["payload"]["snapshotSequence"].as_u64().unwrap_or(0)
                        > previous_sequence
                {
                    return value;
                }
            }
            Message::Close(_) => break,
            Message::Ping(_) | Message::Pong(_) | Message::Binary(_) | Message::Frame(_) => {}
        }
    }
    panic!("el servidor debe enviar un snapshot posterior a la secuencia {previous_sequence}");
}

/* [Decisión 8] Drena frames (snapshots del tick en vuelo) hasta el cierre
 * del socket; devuelve el CloseFrame recibido o falla con timeout. */
async fn read_close_frame<S>(
    socket: &mut tokio_tungstenite::WebSocketStream<S>,
) -> tokio_tungstenite::tungstenite::protocol::frame::coding::CloseCode
where
    S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin,
{
    loop {
        let frame = tokio::time::timeout(std::time::Duration::from_secs(3), socket.next())
            .await
            .expect("timeout esperando cierre")
            .expect("cierre esperado")
            .expect("frame de cierre");
        if let Message::Close(Some(close)) = frame {
            return close.code;
        }
    }
}

async fn read_error<S>(socket: &mut tokio_tungstenite::WebSocketStream<S>) -> Value
where
    S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin,
{
    while let Some(message) = socket.next().await {
        match message.expect("frame WebSocket válido") {
            Message::Text(text) => return serde_json::from_str(&text).expect("error JSON"),
            Message::Close(_) => break,
            Message::Ping(_) | Message::Pong(_) | Message::Binary(_) | Message::Frame(_) => {}
        }
    }
    panic!("el servidor debe enviar un error antes de cerrar");
}

#[tokio::test]
async fn valid_join_over_tcp_returns_map_unavailable_and_closes() {
    let state = test_state();
    let ticket = state
        .game_ticket_store
        .issue(Uuid::new_v4(), None, 30, TEST_SECRET)
        .expect("ticket válido");
    let (url, shutdown, server_handle) = spawn_server(state).await;
    let (mut socket, _) = connect_async(url).await.expect("upgrade WebSocket válido");

    socket
        .send(join_message(&ticket))
        .await
        .expect("join debe enviarse");
    let error = read_error(&mut socket).await;
    assert_eq!(error["type"], "error");
    assert_eq!(error["v"], 1);
    assert_eq!(error["payload"]["code"], "map_unavailable");
    assert_eq!(error["payload"]["fatal"], true);
    assert!(matches!(
        socket.next().await,
        Some(Ok(Message::Close(_))) | None
    ));

    let _ = shutdown.send(());
    server_handle.await.expect("server shutdown");
}

#[tokio::test]
async fn replayed_ticket_over_tcp_is_rejected_without_reopening_identity() {
    let state = test_state();
    let ticket = state
        .game_ticket_store
        .issue(Uuid::new_v4(), None, 30, TEST_SECRET)
        .expect("ticket válido");
    let (url, shutdown, server_handle) = spawn_server(state).await;

    let (mut first, _) = connect_async(&url).await.expect("primer upgrade");
    first
        .send(join_message(&ticket))
        .await
        .expect("primer join");
    let first_error = read_error(&mut first).await;
    assert_eq!(first_error["payload"]["code"], "map_unavailable");
    assert!(matches!(
        first.next().await,
        Some(Ok(Message::Close(_))) | None
    ));

    let (mut replay, _) = connect_async(url).await.expect("segundo upgrade");
    replay
        .send(join_message(&ticket))
        .await
        .expect("join replay");
    let replay_error = read_error(&mut replay).await;
    assert_eq!(replay_error["payload"]["code"], "unauthorized");
    assert!(matches!(
        replay.next().await,
        Some(Ok(Message::Close(_))) | None
    ));

    let _ = shutdown.send(());
    server_handle.await.expect("server shutdown");
}

#[tokio::test]
async fn malformed_first_message_over_tcp_is_rejected() {
    let (url, shutdown, server_handle) = spawn_server(test_state()).await;
    let (mut socket, _) = connect_async(url).await.expect("upgrade WebSocket válido");

    socket
        .send(Message::Text(
            serde_json::json!({
                "type": "move",
                "v": 1,
                "payload": { "sequence": 1, "direction": { "x": 0, "z": 0 } }
            })
            .to_string(),
        ))
        .await
        .expect("mensaje inválido debe enviarse");
    let error = read_error(&mut socket).await;
    assert_eq!(error["payload"]["code"], "invalid_message");
    assert!(matches!(
        socket.next().await,
        Some(Ok(Message::Close(_))) | None
    ));

    let _ = shutdown.send(());
    server_handle.await.expect("server shutdown");
}

#[tokio::test]
async fn binary_first_message_over_tcp_is_rejected() {
    let (url, shutdown, server_handle) = spawn_server(test_state()).await;
    let (mut socket, _) = connect_async(url).await.expect("upgrade WebSocket válido");

    socket
        .send(Message::Binary(vec![0, 1, 2, 3]))
        .await
        .expect("frame binario debe enviarse");
    let error = read_error(&mut socket).await;
    assert_eq!(error["payload"]["code"], "invalid_message");
    assert_eq!(error["payload"]["fatal"], true);
    assert!(matches!(
        socket.next().await,
        Some(Ok(Message::Close(_))) | None
    ));

    let _ = shutdown.send(());
    server_handle.await.expect("server shutdown");
}

#[tokio::test]
async fn ninth_tcp_player_is_rejected_with_room_full() {
    let state = test_state_with_capacity(9);
    state.game_ws_state.set_room_map(Some(fixture_map()));
    let ticket_store = state.game_ticket_store.clone();
    let (url, shutdown, server_handle) = spawn_server(state).await;
    let mut sockets = Vec::new();

    for _ in 0..8 {
        let (mut socket, _) = connect_async(&url).await.expect("upgrade de jugador");
        let ticket = ticket_store
            .issue(Uuid::new_v4(), None, 30, TEST_SECRET)
            .expect("ticket válido");
        socket
            .send(join_message(&ticket))
            .await
            .expect("join jugador");
        let joined = read_message_type(&mut socket, "joined").await;
        assert_eq!(joined["type"], "joined");
        sockets.push(socket);
    }

    let (mut extra, _) = connect_async(url)
        .await
        .expect("upgrade del noveno jugador");
    let extra_ticket = ticket_store
        .issue(Uuid::new_v4(), None, 30, TEST_SECRET)
        .expect("ticket válido");
    extra
        .send(join_message(&extra_ticket))
        .await
        .expect("join del noveno jugador");
    let error = read_error(&mut extra).await;
    assert_eq!(error["payload"]["code"], "room_full");
    assert_eq!(error["payload"]["fatal"], true);
    assert!(matches!(
        extra.next().await,
        Some(Ok(Message::Close(_))) | None
    ));

    drop(sockets);
    let _ = shutdown.send(());
    server_handle.await.expect("server shutdown");
}

#[tokio::test]
async fn joined_tcp_room_moves_authoritatively_and_rejects_sequence_replay() {
    let state = test_state();
    state.game_ws_state.set_room_map(Some(fixture_map()));
    let ticket = state
        .game_ticket_store
        .issue(Uuid::new_v4(), None, 30, TEST_SECRET)
        .expect("ticket válido");
    let (url, shutdown, server_handle) = spawn_server(state).await;
    let (mut socket, _) = connect_async(url).await.expect("upgrade WebSocket válido");

    socket.send(join_message(&ticket)).await.expect("join TCP");
    let joined = read_message_type(&mut socket, "joined").await;
    assert_eq!(joined["payload"]["mapVersion"], "forest@1");
    let initial = read_message_type(&mut socket, "snapshot").await;
    let initial_sequence = initial["payload"]["snapshotSequence"]
        .as_u64()
        .expect("secuencia inicial");
    let initial_x = initial["payload"]["entities"][0]["position"]["x"]
        .as_f64()
        .expect("posición inicial");

    socket
        .send(Message::Text(
            serde_json::json!({
                "type": "move",
                "v": 1,
                "payload": { "sequence": 1, "direction": { "x": 1, "z": 0 } }
            })
            .to_string(),
        ))
        .await
        .expect("move TCP");
    socket
        .send(Message::Text(
            serde_json::json!({
                "type": "heartbeat",
                "v": 1,
                "payload": { "lastSnapshotSequence": initial_sequence }
            })
            .to_string(),
        ))
        .await
        .expect("heartbeat TCP");
    let heartbeat_ack = read_message_type(&mut socket, "heartbeat_ack").await;
    assert!(heartbeat_ack["payload"]["serverTick"].as_u64().is_some());
    let moved = read_snapshot_after(&mut socket, initial_sequence).await;
    let moved_x = moved["payload"]["entities"][0]["position"]["x"]
        .as_f64()
        .expect("posición autoritativa");
    assert!(
        moved_x > initial_x,
        "el servidor debe aplicar la intención de movimiento"
    );

    socket
        .send(Message::Text(
            serde_json::json!({
                "type": "move",
                "v": 1,
                "payload": { "sequence": 1, "direction": { "x": 1, "z": 0 } }
            })
            .to_string(),
        ))
        .await
        .expect("replay TCP");
    let replay = read_message_type(&mut socket, "error").await;
    assert_eq!(replay["payload"]["code"], "sequence_replay");

    drop(socket);
    let _ = shutdown.send(());
    server_handle.await.expect("server shutdown");
}

#[tokio::test]
async fn second_tcp_upgrade_is_rejected_when_global_capacity_is_full() {
    let (url, shutdown, server_handle) = spawn_server(test_state_with_capacity(1)).await;
    let (first_socket, _) = connect_async(&url).await.expect("primer upgrade");

    let second_result = connect_async(url).await;
    match second_result {
        Err(tokio_tungstenite::tungstenite::Error::Http(response)) => {
            assert_eq!(response.status().as_u16(), 409);
        }
        other => panic!("el segundo upgrade debe recibir HTTP 409, recibió {other:?}"),
    }

    drop(first_socket);
    let _ = shutdown.send(());
    server_handle.await.expect("server shutdown");
}

#[tokio::test]
async fn metrics_endpoint_reports_aggregated_counts_without_identity() {
    /* Fase 8: métricas agregadas sin coordenadas ni identidad. El endpoint usa
     * el mismo estado del router real: tras un join + movimientos, los conteos
     * reflejan la actividad sin exponer player ids ni posiciones. */
    let state = test_state();
    state.game_ws_state.set_room_map(Some(fixture_map()));
    let ticket_store = state.game_ticket_store.clone();
    let (url, shutdown, server_handle) = spawn_server(state).await;
    let http_url = url
        .replace("ws://", "http://")
        .replace("/api/game/ws", "/api/game/metrics");

    let (mut socket, _) = connect_async(&url).await.expect("upgrade de jugador");
    let ticket = ticket_store
        .issue(Uuid::new_v4(), None, 30, TEST_SECRET)
        .expect("ticket válido");
    socket.send(join_message(&ticket)).await.expect("join");
    let joined = read_message_type(&mut socket, "joined").await;
    assert_eq!(joined["type"], "joined");
    let snapshot = read_message_type(&mut socket, "snapshot").await;
    let sequence = snapshot["payload"]["snapshotSequence"]
        .as_u64()
        .expect("secuencia");
    /* Esperar al menos un tick más para que el contador de snapshots suba. */
    read_snapshot_after(&mut socket, sequence).await;

    let response = reqwest::get(http_url).await.expect("GET métricas");
    assert_eq!(response.status().as_u16(), 200);
    let metrics: serde_json::Value = response.json().await.expect("JSON métricas");
    assert!(metrics["active_players"].as_u64().unwrap_or(0) >= 1);
    assert!(metrics["joins"].as_u64().unwrap_or(0) >= 1);
    /* El snapshot inicial del join no pasa por broadcast_snapshot; al menos el
     * del primer tick de la sala sí cuenta. */
    assert!(metrics["snapshots_sent"].as_u64().unwrap_or(0) >= 1);
    assert!(metrics["rooms_created"].as_u64().unwrap_or(0) >= 1);
    /* El DTO agregado no expone identidades ni coordenadas. */
    assert!(metrics.get("playerId").is_none());
    assert!(metrics.get("position").is_none());
    assert!(metrics.get("entities").is_none());

    drop(socket);
    let _ = shutdown.send(());
    server_handle.await.expect("server shutdown");
}

#[tokio::test]
async fn restart_announces_countdown_then_closes_with_restart_code_and_client_reconnects() {
    /* [Decisión 8] Flujo completo de la migración coordinada sobre TCP: el
     * jugador recibe `server_restart` con la cuenta atrás; al expirar, la
     * sala se drena y el socket cierra con 4002 (mundo reiniciado) — distinto
     * del 4001 de identidad reemplazada; el mapa vuelve a estar disponible y
     * un nuevo join funciona (el cliente reintenta con backoff). */
    let state = test_state();
    state.game_ws_state.set_room_map(Some(fixture_map()));
    let ticket_store = state.game_ticket_store.clone();
    let (url, shutdown, server_handle) = spawn_server(state.clone()).await;

    let (mut socket, _) = connect_async(&url).await.expect("upgrade WebSocket válido");
    let ticket = ticket_store
        .issue(Uuid::new_v4(), None, 30, TEST_SECRET)
        .expect("ticket válido");
    socket.send(join_message(&ticket)).await.expect("join TCP");
    /* El join es asíncrono: esperar `joined` garantiza que la sala ya está
     * registrada antes de programar la migración (si no, el aviso sería
     * no-op y el cierre llegaría sin él). */
    let joined = read_message_type(&mut socket, "joined").await;
    assert_eq!(joined["type"], "joined");

    state
        .game_ws_state
        .schedule_restart("publicación de versión nueva", 1);

    let restart = read_message_type(&mut socket, "server_restart").await;
    assert_eq!(restart["payload"]["reason"], "publicación de versión nueva");
    assert_eq!(restart["payload"]["restartInSeconds"], 1);

    /* La sala se drena tras la cuenta corta: el socket cierra con 4002. */
    let close_code = read_close_frame(&mut socket).await;
    assert_eq!(
        close_code,
        tokio_tungstenite::tungstenite::protocol::frame::coding::CloseCode::Library(4002)
    );

    /* El shutdown invalidó el mapa cacheado. En producción el publish ya
     * actualizó la BD y `ensure_room_map` recarga la versión nueva; en el
     * test (sin BD) se simula con el mapa de nuevo disponible. */
    state.game_ws_state.set_room_map(Some(fixture_map()));

    /* El join recarga el mapa (la versión nueva ya está activa). */
    let (mut reconnected, _) = connect_async(&url).await.expect("reconexión tras reinicio");
    let new_ticket = ticket_store
        .issue(Uuid::new_v4(), None, 30, TEST_SECRET)
        .expect("ticket nuevo");
    reconnected
        .send(join_message(&new_ticket))
        .await
        .expect("join tras reinicio");
    let rejoined = read_message_type(&mut reconnected, "joined").await;
    assert_eq!(rejoined["type"], "joined");

    drop(socket);
    drop(reconnected);
    let _ = shutdown.send(());
    server_handle.await.expect("server shutdown");
}
