use crate::models::SongInfo;
use base64::{Engine as _, engine::general_purpose};
use mpris::{Metadata, PlayerFinder};
use std::fs::File;
use std::io::Read;
use std::path::Path;

pub struct MprisReader {
    player_finder: PlayerFinder,
}

impl MprisReader {
    pub fn new() -> Self {
        Self {
            player_finder: PlayerFinder::new().expect("Could not connect to D-Bus"),
        }
    }
    // TODO: multiple players?
    pub fn get_current_song(&self) -> Option<SongInfo> {
        if let Ok(player) = self.player_finder.find_active() {
            if let Ok(metadata) = player.get_metadata() {
                let title = metadata.title().unwrap_or("Unknown Title").to_string();
                let artist = metadata
                    .artists()
                    .map(|a| a.join(", "))
                    .unwrap_or_else(|| "Unknown Artist".to_string());
                let album = metadata.album_name().unwrap_or("").to_string();
                let length_secs = metadata.length().map(|d| d.as_secs()).unwrap_or(0);

                let position_secs = player.get_position().map(|d| d.as_secs()).unwrap_or(0);
                let is_playing = player
                    .get_playback_status()
                    .map(|s| s == mpris::PlaybackStatus::Playing)
                    .unwrap_or(false);

                let album_art_base64 = self.get_album_art_base64(&metadata);

                return Some(SongInfo {
                    title,
                    artist,
                    album,
                    album_art_base64,
                    position_secs,
                    length_secs,
                    is_playing,
                });
            }
        }
        None
    }

    fn get_album_art_base64(&self, metadata: &Metadata) -> Option<String> {
        if let Some(art_url) = metadata.art_url() {
            // handle unix file://
            let path_str = if art_url.starts_with("file://") {
                &art_url[7..]
            } else {
                return None;
            };

            let path = Path::new(path_str);
            if path.exists() {
                if let Ok(mut file) = File::open(path) {
                    let mut buffer = Vec::new();
                    if file.read_to_end(&mut buffer).is_ok() {
                        return Some(general_purpose::STANDARD.encode(&buffer));
                    }
                }
            }
        }
        None
    }
}
