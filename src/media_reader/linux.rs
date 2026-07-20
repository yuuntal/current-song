use crate::media_reader::MediaReader;
use crate::models::SongInfo;
use base64::{Engine as _, engine::general_purpose};
use mpris::{Metadata, PlayerFinder};
use std::cell::RefCell;
use std::fs::File;
use std::io::Read;
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

            let title = metadata.title().unwrap_or("Unknown Title").to_string();
            let artist = metadata
                .artists()
                .map(|a| a.join(", "))
                .unwrap_or_else(|| "Unknown Artist".to_string());

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


            let is_new_song = cached
                .as_ref()
                .is_none_or(|c| c.id != current_id || c.title != title || c.artist != artist);

            if is_new_song {
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
                // UPDATE DURATION IF CHANGED OR UNSET
                let current_len = metadata.length().map(|d| d.as_secs()).unwrap_or(0);
                if let Some(ref mut c) = *cached && c.length_secs != current_len && current_len > 0
                {
                    c.length_secs = current_len;
                }

                // CHECK IF ARTWORK CHANGED
                let current_art_url = metadata.art_url().map(|s| s.to_string());
                if let Some(ref mut c) = *cached
                    && c.art_url != current_art_url
                {
                    c.album_art_base64 = get_album_art_base64(&metadata).map(Arc::new);
                    c.art_url = current_art_url;
                }

                let dt = last_tick
                    .map(|t| now.duration_since(t).as_secs_f64())
                    .unwrap_or(0.0);

                *last_tick = Some(now);

                let diff = reported_pos - *last_reported;
                *last_reported = reported_pos;

                if reported_pos < 1.0 || ((diff - dt).abs() > 3.0 && *tracked_pos > 2.0) {
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

            // println!("{} - {} [{}] pos: {}s", track.artist, track.title, track.album, position_secs);

            
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

pub(crate) fn fetch_and_convert_art(art_url: &str) -> Option<String> {
    let mut resolved_url = art_url.to_string();
    if resolved_url.contains("open.spotify.com/image") {
        resolved_url = resolved_url.replace("open.spotify.com/image", "i.scdn.co/image");
    } else if let Some(id) = resolved_url.strip_prefix("spotify:image:") {
        resolved_url = format!("https://i.scdn.co/image/{}", id);
    }
    let art_url = &resolved_url;

    if art_url.starts_with("file://") {
        if let Ok(parsed_url) = url::Url::parse(art_url)
            && let Ok(path) = parsed_url.to_file_path()
                && path.exists()
                    && let Ok(mut file) = File::open(&path)
                {
                    let mut buffer = Vec::new();
                    if file.read_to_end(&mut buffer).is_ok() {
                        return Some(general_purpose::STANDARD.encode(&buffer));
                    }
                }
    } else if art_url.starts_with("http://") || art_url.starts_with("https://") {
        let client = reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(3))
            .build()
            .ok()?;
        let resp = client.get(art_url).send().ok()?;
        if resp.status().is_success() {
            let bytes = resp.bytes().ok()?;

            if let Ok(img) = image::load_from_memory(&bytes) {
                let mut png_bytes = Vec::new();
                if img.write_to(&mut std::io::Cursor::new(&mut png_bytes), image::ImageFormat::Png).is_ok() {
                    return Some(general_purpose::STANDARD.encode(&png_bytes));
                }
            }
            return Some(general_purpose::STANDARD.encode(&bytes));
        }
    }
    None
}

pub(crate) fn extract_youtube_video_id(url: &str) -> Option<&str> {
    if let Some(pos) = url.find("youtu.be/") {
        let id_part = &url[pos + 9..];
        let end = id_part.find('?').unwrap_or(id_part.len());
        let end = id_part[..end].find('&').unwrap_or(end);
        let id = &id_part[..end];
        if !id.is_empty() {
            return Some(id);
        }
    }

    for pattern in &["watch?v=", "watch/v/", "embed/", "shorts/"] {
        if let Some(pos) = url.find(pattern) {
            let id_part = &url[pos + pattern.len()..];
            let end = id_part.find('?').unwrap_or(id_part.len());
            let end = id_part[..end].find('&').unwrap_or(end);
            let id = &id_part[..end];
            if !id.is_empty() {
                return Some(id);
            }
        }
    }

    None
}

pub(crate) fn fetch_spotify_oembed_thumbnail(track_url: &str) -> Option<String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
        .ok()?;
    let encoded_url = url::form_urlencoded::byte_serialize(track_url.as_bytes()).collect::<String>();
    let oembed_url = format!("https://open.spotify.com/oembed?url={}", encoded_url);
    let resp = client.get(&oembed_url).send().ok()?;
    if resp.status().is_success()
        && let Ok(text) = resp.text() {
            let json: serde_json::Value = serde_json::from_str(&text).ok()?;
            if let Some(thumb_url) = json.get("thumbnail_url").and_then(|v| v.as_str()) {
                return Some(thumb_url.to_string());
            }
        }
    None
}

pub(crate) fn fetch_itunes_artwork(title: &str, artist: &str) -> Option<String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
        .ok()?;
    let query = if artist.is_empty() {
        title.to_string()
    } else {
        format!("{} {}", artist, title)
    };
    let encoded_query = url::form_urlencoded::byte_serialize(query.as_bytes()).collect::<String>();
    let url = format!("https://itunes.apple.com/search?term={}&media=music&limit=1", encoded_query);
    
    let resp = client.get(&url).send().ok()?;
    if resp.status().is_success()
        && let Ok(text) = resp.text() {
            let json: serde_json::Value = serde_json::from_str(&text).ok()?;
            if let Some(results) = json.get("results").and_then(|r| r.as_array())
                && let Some(first_result) = results.first()
                    && let Some(artwork_url) = first_result.get("artworkUrl100").and_then(|v| v.as_str()) {
                        let upgraded = artwork_url.replace("/100x100bb.jpg", "/600x600bb.jpg");
                        return Some(upgraded);
                    }
        }
    None
}

fn get_album_art_base64(metadata: &Metadata) -> Option<String> {
    // try to extract
    if let Some(track_url) = metadata.url() {
        if let Some(video_id) = extract_youtube_video_id(track_url) {
            let yt_thumb_url = format!("https://img.youtube.com/vi/{}/hqdefault.jpg", video_id);
            if let Some(art) = fetch_and_convert_art(&yt_thumb_url) {
                return Some(art);
            }
        }

        // oEmbed
        if track_url.contains("open.spotify.com/track/")
            && let Some(spotify_thumb_url) = fetch_spotify_oembed_thumbnail(track_url)
                && let Some(art) = fetch_and_convert_art(&spotify_thumb_url) {
                    return Some(art);
                }
    }

    // standard artUrl
    if let Some(art) = metadata.art_url().and_then(fetch_and_convert_art) {
        return Some(art);
    }

    // itunes search
    let title = metadata.title().unwrap_or("");
    let artist = metadata.artists().map(|a| a.join(" ")).unwrap_or_default();
    if !title.is_empty()
        && let Some(itunes_thumb_url) = fetch_itunes_artwork(title, &artist)
            && let Some(art) = fetch_and_convert_art(&itunes_thumb_url) {
                return Some(art);
            }

    None
}

