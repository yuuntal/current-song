use crate::media_reader::MediaReader;
use crate::models::SongInfo;
use base64::{engine::general_purpose, Engine as _};
use std::cell::RefCell;
use windows::Media::Control::{
    GlobalSystemMediaTransportControlsSessionManager,
    GlobalSystemMediaTransportControlsSessionPlaybackStatus,
};
use windows::Storage::Streams::DataReader;

pub struct WindowsMediaReader {
    manager: Option<GlobalSystemMediaTransportControlsSessionManager>,
    last_title: RefCell<Option<String>>,
    last_art: RefCell<Option<String>>,
}

impl MediaReader for WindowsMediaReader {
    fn new() -> Self {
        let manager = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()
            .ok()
            .and_then(|op| op.get().ok());

        Self {
            manager,
            last_title: RefCell::new(None),
            last_art: RefCell::new(None),
        }
    }

    fn get_current_song(&self) -> Option<SongInfo> {
        let manager = self.manager.as_ref()?;
        let session = manager.GetCurrentSession().ok()?;

        let media_props = session.TryGetMediaPropertiesAsync().ok()?.get().ok()?;

        let title = media_props
            .Title()
            .map(|s| s.to_string())
            .unwrap_or_else(|_| "Unknown Title".to_string());

        let artist = media_props
            .Artist()
            .map(|s| s.to_string())
            .unwrap_or_else(|_| "Unknown Artist".to_string());

        let album = media_props
            .AlbumTitle()
            .map(|s| s.to_string())
            .unwrap_or_default();

        let playback_info = session.GetPlaybackInfo().ok()?;
        let is_playing = playback_info
            .PlaybackStatus()
            .map(|s| s == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing)
            .unwrap_or(false);

        let timeline = session.GetTimelineProperties().ok()?;

        let position_secs = timeline
            .Position()
            .map(|d| d.Duration as u64 / 10_000_000)
            .unwrap_or(0);

        let length_secs = timeline
            .EndTime()
            .map(|d| d.Duration as u64 / 10_000_000)
            .filter(|&v| v > 0)
            .unwrap_or(0);

        let mut last_title_ref = self.last_title.borrow_mut();
        let mut last_art_ref = self.last_art.borrow_mut();

        let source_app = session.SourceAppUserModelId().ok()?.to_string();
        let identity = format!("{}|{}", source_app, title);

        if last_title_ref.as_deref() != Some(identity.as_str()) {
            *last_art_ref = get_thumbnail_base64(&media_props);
            *last_title_ref = Some(identity);
        }

        let album_art_base64 = last_art_ref.clone();

        Some(SongInfo {
            title,
            artist,
            album,
            album_art_base64,
            position_secs: if length_secs > 0 {
                position_secs.min(length_secs)
            } else {
                position_secs
            },
            length_secs,
            is_playing,
        })
    }
}