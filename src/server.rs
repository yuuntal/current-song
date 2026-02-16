use crate::config::ConfigManager;
use crate::models::{OverlayConfig, SongInfo};
use axum::{
    Json, Router,
    extract::{
        State,
        ws::{Message, WebSocket, WebSocketUpgrade},
    },
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, get_service},
};
use futures::{sink::SinkExt, stream::StreamExt};
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use tokio::sync::broadcast;
use tower_http::cors::CorsLayer;
use tower_http::services::{ServeDir, ServeFile};

pub struct AppState {
    pub config_manager: ConfigManager,
    pub song_info: Arc<Mutex<Option<SongInfo>>>,
    pub tx: broadcast::Sender<SongInfo>,
}

pub async fn run_server(state: Arc<AppState>) {
    let app = Router::new()
        .route("/ws", get(ws_handler))
        .route("/api/config", get(get_config).post(update_config))
        .route("/", get_service(ServeFile::new("static/overlay.html")))
        .route(
            "/customize",
            get_service(ServeFile::new("static/customize.html")),
        )
        .fallback_service(ServeDir::new("static"))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let addr = SocketAddr::from(([127, 0, 0, 1], 3333));
    println!("Server running at http://{}", addr);
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn ws_handler(ws: WebSocketUpgrade, State(state): State<Arc<AppState>>) -> Response {
    ws.on_upgrade(|socket| handle_socket(socket, state))
}

async fn handle_socket(socket: WebSocket, state: Arc<AppState>) {
    let (mut sender, mut receiver) = socket.split();
    let mut rx = state.tx.subscribe();

    // init state
    let initial_info = state.song_info.lock().unwrap().clone();
    if let Some(info) = initial_info {
        if let Ok(msg) = serde_json::to_string(&info) {
            let _ = sender.send(Message::Text(msg)).await;
        }
    }

    let mut send_task = tokio::spawn(async move {
        while let Ok(info) = rx.recv().await {
            if let Ok(msg) = serde_json::to_string(&info) {
                if sender.send(Message::Text(msg)).await.is_err() {
                    break;
                }
            }
        }
    });
    // keep alive
    let mut recv_task =
        tokio::spawn(async move { while let Some(Ok(_)) = receiver.next().await {} });

    tokio::select! {
        _ = (&mut send_task) => recv_task.abort(),
        _ = (&mut recv_task) => send_task.abort(),
    };
}

async fn get_config(State(state): State<Arc<AppState>>) -> Json<OverlayConfig> {
    Json(state.config_manager.get_config())
}

async fn update_config(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<OverlayConfig>,
) -> impl IntoResponse {
    match state.config_manager.update_config(payload) {
        Ok(_) => StatusCode::OK,
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR,
    }
}
