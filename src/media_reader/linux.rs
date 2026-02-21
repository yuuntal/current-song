use crate::media_reader::MediaReader;
use crate::models::SongInfo;
use base64::{Engine as _, engine::general_purpose};
use mpris::{Metadata, PlayerFinder};
use std::cell::RefCell;
use std::fs::File;
use std::io::Read;
use std::path::Path;
use std::sync::Arc;

// CACHING
struct CachedTrack {
    id: Option<String>,
    title: String,
    artist: String,
    album: String,
    length_secs: u64,
    art_url: Option<String>,
    album_art_base64: Option<Arc<String>>,
}

pub struct LinuxMediaReader {
    player_finder: PlayerFinder,
    cached_track: RefCell<Option<CachedTrack>>,

    tracked_pos: RefCell<f64>,
    last_tick: RefCell<Option<std::time::Instant>>,
    last_reported_pos: RefCell<f64>,
}

impl MediaReader for LinuxMediaReader {
    fn new() -> Self {
        Self {
            player_finder: PlayerFinder::new().expect("Could not connect to D-Bus"),
            cached_track: RefCell::new(None),
            tracked_pos: RefCell::new(0.0),
            last_tick: RefCell::new(None),
            last_reported_pos: RefCell::new(0.0),
        }
    }

    fn get_current_song(&self) -> Option<SongInfo> {
        if let Ok(player) = self.player_finder.find_active()
            && let Ok(metadata) = player.get_metadata()
        {
            let current_id = metadata.track_id().map(|id| id.to_string());

            let reported_pos = player
                .get_position()
                .map(|d| d.as_secs_f64())
                .unwrap_or(0.0);

            let is_playing = player
                .get_playback_status()
                .map(|s| s == mpris::PlaybackStatus::Playing)
                .unwrap_or(false);

            let mut cached = self.cached_track.borrow_mut();
            let now = std::time::Instant::now();
            let mut tracked_pos = self.tracked_pos.borrow_mut();
            let mut last_tick = self.last_tick.borrow_mut();
            let mut last_reported = self.last_reported_pos.borrow_mut();

            // ON CHECK IF IT IS A NEW SONG
            let is_new_song = cached.as_ref().map_or(true, |c| c.id != current_id);

            if is_new_song {
                let title = metadata.title().unwrap_or("Unknown Title").to_string();
                let artist = metadata
                    .artists()
                    .map(|a| a.join(", "))
                    .unwrap_or_else(|| "Unknown Artist".to_string());
                let album = metadata.album_name().unwrap_or("").to_string();
                let length_secs = metadata.length().map(|d| d.as_secs()).unwrap_or(0);
                let art_url = metadata.art_url().map(|s| s.to_string());
                let album_art_base64 = get_album_art_base64(&metadata).map(Arc::new);

                *cached = Some(CachedTrack {
                    id: current_id,
                    title,
                    artist,
                    album,
                    length_secs,
                    art_url,
                    album_art_base64,
                });

                *tracked_pos = reported_pos.min(1.0);
                *last_reported = reported_pos;
                *last_tick = Some(now);
            } else {
                // CHECK IF ARTWORK CHANGED
                let current_art_url = metadata.art_url().map(|s| s.to_string());
                if let Some(ref mut c) = *cached {
                    if c.art_url != current_art_url {
                        c.album_art_base64 = get_album_art_base64(&metadata).map(Arc::new);
                        c.art_url = current_art_url;
                    }
                }

                let dt = last_tick
                    .map(|t| now.duration_since(t).as_secs_f64())
                    .unwrap_or(0.0);

                *last_tick = Some(now);

                let diff = reported_pos - *last_reported;
                *last_reported = reported_pos;

                if reported_pos < 1.0 {
                    *tracked_pos = reported_pos;
                } else if (diff - dt).abs() > 3.0 && *tracked_pos > 2.0 {
                    *tracked_pos = reported_pos;
                } else if is_playing {
                    *tracked_pos += dt;
                }
            }

            let track = cached.as_ref().unwrap();
            let mut position_secs = *tracked_pos as u64;
            if track.length_secs > 0 && position_secs > track.length_secs {
                position_secs = track.length_secs;
            }

            return Some(SongInfo {
                title: track.title.clone(),
                artist: track.artist.clone(),
                album: track.album.clone(),
                album_art_base64: track.album_art_base64.clone(),
                position_secs,
                length_secs: track.length_secs,
                is_playing,
            });
        }

        // CLEAR
        *self.cached_track.borrow_mut() = None;
        None
    }
}

fn get_album_art_base64(metadata: &Metadata) -> Option<String> {
    if let Some(art_url) = metadata.art_url() {
        let path_str = art_url.strip_prefix("file://")?;

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
