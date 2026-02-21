#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

mod config;
mod media_reader;
mod models;
mod server;
mod tray;

use crate::config::ConfigManager;
use crate::media_reader::{MediaReader, PlatformMediaReader};
use crate::models::SongInfo;
use crate::server::AppState;
use crate::tray::TrayCommand;
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

    let tray_rx = tray::spawn_tray();

    let tx_clone = tx.clone();
    let song_info_clone = song_info.clone();
    std::thread::spawn(move || {
        let reader = PlatformMediaReader::new();
        let mut last_info: Option<SongInfo> = None;
        loop {
            let current = reader.get_current_song();
            if current != last_info {
                if let Some(ref info) = current {
                    {
                        let mut lock = song_info_clone.lock().unwrap();
                        *lock = Some(info.clone());
                    }
                    // ws
                    let _ = tx_clone.send(info.clone());
                }
                last_info = current;
            }
            std::thread::sleep(Duration::from_secs(1));
        }
    });

    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();

    std::thread::spawn(move || {
        while let Ok(cmd) = tray_rx.recv() {
            match cmd {
                TrayCommand::Preview => {
                    let _ = open::that("http://127.0.0.1:3333/");
                }
                TrayCommand::OpenCustomize => {
                    let _ = open::that("http://127.0.0.1:3333/customize");
                }
                TrayCommand::Quit => {
                    let _ = shutdown_tx.send(());
                    std::thread::sleep(Duration::from_millis(500));
                    std::process::exit(0);
                }
            }
        }
    });

    server::run_server(state, shutdown_rx).await;
}
