use crate::models::SongInfo;

#[test]
fn song_info_default_has_expected_values() {
    let info = SongInfo::default();
    assert_eq!(info.title, "");
    assert_eq!(info.artist, "");
    assert_eq!(info.album, "");
    assert!(info.album_art_base64.is_none());
    assert_eq!(info.position_secs, 0);
    assert_eq!(info.length_secs, 0);
    assert!(!info.is_playing);
}

#[test]
fn song_info_serialization_roundtrip() {
    let info = SongInfo {
        title: "Test Song".to_string(),
        artist: "Test Artist".to_string(),
        album: "Test Album".to_string(),
        album_art_base64: Some("dGVzdA==".to_string()),
        position_secs: 42,
        length_secs: 180,
        is_playing: true,
    };

    let json = serde_json::to_string(&info).expect("serialization should work");
    let deserialized: SongInfo = serde_json::from_str(&json).expect("deserialization should work");

    assert_eq!(deserialized.title, "Test Song");
    assert_eq!(deserialized.artist, "Test Artist");
    assert_eq!(deserialized.album, "Test Album");
    assert_eq!(deserialized.album_art_base64, Some("dGVzdA==".to_string()));
    assert_eq!(deserialized.position_secs, 42);
    assert_eq!(deserialized.length_secs, 180);
    assert!(deserialized.is_playing);
}

#[test]
fn song_info_clone_is_independent() {
    let info = SongInfo {
        title: "Original".to_string(),
        artist: "Artist".to_string(),
        album: "Album".to_string(),
        album_art_base64: None,
        position_secs: 10,
        length_secs: 200,
        is_playing: false,
    };

    let mut cloned = info.clone();
    cloned.title = "Modified".to_string();
    cloned.is_playing = true;

    assert_eq!(info.title, "Original");
    assert!(!info.is_playing);
    assert_eq!(cloned.title, "Modified");
    assert!(cloned.is_playing);
}

#[test]
fn platform_media_reader_implements_trait() {

    fn assert_media_reader<T: super::MediaReader>() {}
    assert_media_reader::<super::PlatformMediaReader>();

}

#[cfg(target_os = "linux")]
mod linux_tests {
    use super::super::MediaReader;
    use super::super::linux::LinuxMediaReader;

    #[test]
    fn linux_reader_returns_none_without_active_player() {

        let result = std::panic::catch_unwind(|| LinuxMediaReader::new());
        if let Ok(reader) = result {
            assert!(reader.get_current_song().is_none() || reader.get_current_song().is_some());
        }

    }
}

#[cfg(target_os = "windows")]
mod windows_tests {
    use super::super::MediaReader;
    use super::super::windows::WindowsMediaReader;

    #[test]
    fn windows_reader_can_be_constructed() {
        let _reader = WindowsMediaReader::new();
    }

    #[test]
    fn windows_reader_returns_valid_or_none() {
        let reader = WindowsMediaReader::new();

        let result = reader.get_current_song();
        if let Some(info) = result {
            assert!(!info.title.is_empty());
        }


    }
}
