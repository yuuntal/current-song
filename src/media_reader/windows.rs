use crate::media_reader::MediaReader;
use crate::models::SongInfo;
use base64::{Engine as _, engine::general_purpose};
use std::cell::RefCell;
use windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager;
use windows::Storage::Streams::DataReader;

pub struct WindowsMediaReader {
    last_title: RefCell<Option<String>>,
    last_art: RefCell<Option<String>>,
}

impl MediaReader for WindowsMediaReader {
    fn new() -> Self {
        Self {
            last_title: RefCell::new(None),
            last_art: RefCell::new(None),
        }
    }

    fn get_current_song(&self) -> Option<SongInfo> {
        let manager = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()
            .ok()?
            .get()
            .ok()?;
        let session = manager.GetCurrentSession().ok()?;

        // title, artist, album
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
            .unwrap_or_else(|_| String::new());

        // playback info
        let playback_info = session.GetPlaybackInfo().ok()?;
        let is_playing = playback_info
            .PlaybackStatus()
            .map(|s| {
                s == windows::Media::Control::GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing
            })
            .unwrap_or(false);

        // timeline (position & duration)
        let timeline = session.GetTimelineProperties().ok()?;
        let position_secs = timeline
            .Position()
            .map(|d| d.Duration as u64 / 10_000_000)
            .unwrap_or(0);
        let length_secs = timeline
            .EndTime()
            .map(|d| d.Duration as u64 / 10_000_000)
            .unwrap_or(0);

        let mut last_title_ref = self.last_title.borrow_mut();
        let mut last_art_ref = self.last_art.borrow_mut();

        if last_title_ref.as_deref() != Some(title.as_str()) {
            *last_art_ref = get_thumbnail_base64(&media_props);
            *last_title_ref = Some(title.clone());
        }

        let album_art_base64 = last_art_ref.clone();

        Some(SongInfo {
            title,
            artist,
            album,
            album_art_base64,
            position_secs,
            length_secs,
            is_playing,
        })
    }
}

fn get_thumbnail_base64(
    media_props: &windows::Media::Control::GlobalSystemMediaTransportControlsSessionMediaProperties,
) -> Option<String> {
    let thumbnail = media_props.Thumbnail().ok()?;
    let stream = thumbnail.OpenReadAsync().ok()?.get().ok()?;
    let size = stream.Size().ok()? as u32;
    if size == 0 {
        return None;
    }

    let reader = DataReader::CreateDataReader(&stream).ok()?;
    reader.LoadAsync(size).ok()?.get().ok()?;

    let mut buffer = vec![0u8; size as usize];
    reader.ReadBytes(&mut buffer).ok()?;

    Some(general_purpose::STANDARD.encode(&buffer))
}
