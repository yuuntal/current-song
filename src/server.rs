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
    routing::get,
};
use futures::{sink::SinkExt, stream::StreamExt};
use std::sync::{Arc, Mutex};
use tokio::sync::broadcast;
use tower_http::cors::CorsLayer;

pub struct AppState {
    pub config_manager: ConfigManager,
    pub song_info: Arc<Mutex<Option<SongInfo>>>,
    pub tx: broadcast::Sender<SongInfo>,
}

#[derive(rust_embed::RustEmbed)]
#[folder = "static/"]
struct Asset;

async fn serve_asset(path: &str) -> Response {
    match Asset::get(path) {
        Some(content) => {
            let mime = mime_guess::from_path(path).first_or_octet_stream();
            (
                [
                    (axum::http::header::CONTENT_TYPE, mime.as_ref()),
                    (axum::http::header::CACHE_CONTROL, "public, max-age=31536000"),
                ],
                content.data,
            ).into_response()
        }
        None => StatusCode::NOT_FOUND.into_response(),
    }
}

async fn serve_overlay() -> Response {
    serve_asset("overlay.html").await
}

async fn serve_customize() -> Response {
    serve_asset("customize.html").await
}

async fn serve_static_file(
    axum::extract::Path(path): axum::extract::Path<String>,
) -> Response {
    serve_asset(&path).await
}

pub async fn run_server(state: Arc<AppState>, shutdown_rx: tokio::sync::oneshot::Receiver<()>) {
    let app = Router::new()
        .route("/ws", get(ws_handler))
        .route("/api/config", get(get_config).post(update_config))
        .route("/", get(serve_overlay))
        .route("/customize", get(serve_customize))
        .route("/*path", get(serve_static_file))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let listener = if let Ok(l) = tokio::net::TcpListener::bind("[::]:3333").await {
        l
    } else if let Ok(l) = tokio::net::TcpListener::bind("0.0.0.0:3333").await {
        l
    } else {
        tokio::net::TcpListener::bind("127.0.0.1:3333").await.unwrap()
    };

    axum::serve(listener, app)
        .with_graceful_shutdown(async {
            let _ = shutdown_rx.await;
        })
        .await
        .unwrap();
}

async fn ws_handler(ws: WebSocketUpgrade, State(state): State<Arc<AppState>>) -> Response {
    ws.on_upgrade(|socket| handle_socket(socket, state))
}

async fn handle_socket(socket: WebSocket, state: Arc<AppState>) {
    let (mut sender, mut receiver) = socket.split();
    let mut rx = state.tx.subscribe();

    // init state
    let initial_info = state.song_info.lock().unwrap().clone();
    if let Some(info) = initial_info
        && let Ok(msg) = serde_json::to_string(&info)
    {
        let _ = sender.send(Message::Text(msg)).await;
    }

    let mut send_task = tokio::spawn(async move {
        while let Ok(info) = rx.recv().await {
            if let Ok(msg) = serde_json::to_string(&info)
                && sender.send(Message::Text(msg)).await.is_err()
            {
                break;
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
