use crate::media_reader::MediaReader;
use crate::models::SongInfo;
use base64::{Engine as _, engine::general_purpose};
use mpris::{Metadata, PlayerFinder};
use std::fs::File;
use std::io::Read;
use std::path::Path;

use std::cell::RefCell;

pub struct LinuxMediaReader {
    player_finder: PlayerFinder,
    last_url: RefCell<Option<String>>,
    last_art: RefCell<Option<String>>,

    last_id: RefCell<Option<String>>,
    tracked_pos: RefCell<f64>,
    last_tick: RefCell<Option<std::time::Instant>>,
    last_reported_pos: RefCell<f64>,
}

impl MediaReader for LinuxMediaReader {
    fn new() -> Self {
        Self {
            player_finder: PlayerFinder::new().expect("Could not connect to D-Bus"),
            last_url: RefCell::new(None),
            last_art: RefCell::new(None),
            last_id: RefCell::new(None),
            tracked_pos: RefCell::new(0.0),
            last_tick: RefCell::new(None),
            last_reported_pos: RefCell::new(0.0),
        }
    }

    fn get_current_song(&self) -> Option<SongInfo> {
        if let Ok(player) = self.player_finder.find_active()
            && let Ok(metadata) = player.get_metadata()
        {
            let title = metadata.title().unwrap_or("Unknown Title").to_string();
            let artist = metadata
                .artists()
                .map(|a| a.join(", "))
                .unwrap_or_else(|| "Unknown Artist".to_string());
            let album = metadata.album_name().unwrap_or("").to_string();
            let length_secs = metadata.length().map(|d| d.as_secs()).unwrap_or(0);

            let reported_pos = player
                .get_position()
                .map(|d| d.as_secs_f64())
                .unwrap_or(0.0);
            let is_playing = player
                .get_playback_status()
                .map(|s| s == mpris::PlaybackStatus::Playing)
                .unwrap_or(false);

            let current_id = Some(format!("{}|{}", title, artist));

            let mut last_id = self.last_id.borrow_mut();
            let mut tracked_pos = self.tracked_pos.borrow_mut();
            let mut last_tick = self.last_tick.borrow_mut();
            let mut last_reported = self.last_reported_pos.borrow_mut();

            let now = std::time::Instant::now();

            if *last_id != current_id {
                *last_id = current_id.clone();
                *tracked_pos = 0.0;
                *last_reported = reported_pos;
                *last_tick = Some(now);
            } else {
                let dt = last_tick
                    .map(|t| now.duration_since(t).as_secs_f64())
                    .unwrap_or(0.0);
                *last_tick = Some(now);

                let diff = reported_pos - *last_reported;
                *last_reported = reported_pos;

                // if reported_pos skips unexpectedly, sync
                if (diff - dt).abs() > 3.0 {
                    *tracked_pos = reported_pos;
                } else if is_playing {
                    *tracked_pos += dt;
                }
            }

            let mut position_secs = *tracked_pos as u64;
            if length_secs > 0 && position_secs > length_secs {
                position_secs = length_secs;
            }

            let current_art_url = metadata.art_url().map(|s| s.to_string());
            let mut last_url_ref = self.last_url.borrow_mut();
            let mut last_art_ref = self.last_art.borrow_mut();

            if *last_url_ref != current_art_url || current_art_url.is_none() {
                *last_art_ref = get_album_art_base64(&metadata);
                *last_url_ref = current_art_url;
            }

            let album_art_base64 = last_art_ref.clone();

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
        None
    }
}

fn get_album_art_base64(metadata: &Metadata) -> Option<String> {
    if let Some(art_url) = metadata.art_url() {
        let path_str = art_url.strip_prefix("file://")?;

        let path = Path::new(path_str);
        if path.exists()
            && let Ok(mut file) = File::open(path)
        {
            let mut buffer = Vec::new();
            if file.read_to_end(&mut buffer).is_ok() {
                return Some(general_purpose::STANDARD.encode(&buffer));
            }
        }
    }
    None
}
