mod config;
mod media_reader;
mod models;
mod server;

use crate::config::ConfigManager;
use crate::media_reader::{MediaReader, PlatformMediaReader};
use crate::server::AppState;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::sync::broadcast;

#[tokio::main]
async fn main() {
    let config_manager = ConfigManager::new();
    let song_info = Arc::new(Mutex::new(None));
    let (tx, _rx) = broadcast::channel(100);

    let state = Arc::new(AppState {
        config_manager,
        song_info: song_info.clone(),
        tx: tx.clone(),
    });


    let tx_clone = tx.clone();
    let song_info_clone = song_info.clone();
    std::thread::spawn(move || {
        let reader = PlatformMediaReader::new();
        loop {
            if let Some(info) = reader.get_current_song() {
                {
                    let mut lock = song_info_clone.lock().unwrap();
                    *lock = Some(info.clone());
                }
                // ws
                let _ = tx_clone.send(info);
            }
            std::thread::sleep(Duration::from_secs(1));
        }
    });

    // start
    server::run_server(state).await;
}
