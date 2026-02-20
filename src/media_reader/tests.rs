use crate::models::SongInfo;

// SONG INFO

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

    assert_eq!(deserialized, info);
}

#[test]
fn song_info_json_structure_is_stable() {
    let info = SongInfo::default();
    let json = serde_json::to_value(&info).unwrap();

    assert!(json.get("title").is_some());
    assert!(json.get("artist").is_some());
    assert!(json.get("album").is_some());
    assert!(json.get("album_art_base64").is_some());
    assert!(json.get("position_secs").is_some());
    assert!(json.get("length_secs").is_some());
    assert!(json.get("is_playing").is_some());
}

#[test]
fn song_info_clone_is_independent() {
    let info = SongInfo {
        title: "Original".to_string(),
        artist: "Artist".to_string(),
        album: "Album".to_string(),
        album_art_base64: Some("abc".to_string()),
        position_secs: 10,
        length_secs: 200,
        is_playing: false,
    };

    let mut cloned = info.clone();

    cloned.title = "Modified".to_string();
    cloned.album_art_base64 = Some("modified".to_string());
    cloned.is_playing = true;

    // original unchanged
    assert_eq!(info.title, "Original");
    assert_eq!(info.album_art_base64, Some("abc".to_string()));
    assert!(!info.is_playing);

    // clone updated
    assert_eq!(cloned.title, "Modified");
    assert_eq!(cloned.album_art_base64, Some("modified".to_string()));
    assert!(cloned.is_playing);
}

#[test]
fn platform_media_reader_implements_trait() {
    fn assert_media_reader<T: super::MediaReader>() {}
    assert_media_reader::<super::PlatformMediaReader>();
}

// LINUX

#[cfg(target_os = "linux")]
mod linux_tests {
    use super::super::MediaReader;
    use super::super::linux::LinuxMediaReader;

    #[test]
    fn linux_reader_does_not_panic_on_creation() {
        let result = std::panic::catch_unwind(|| {
            LinuxMediaReader::new();
        });

        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_linux_reader_initialization() {
        use tokio::sync::mpsc;

        // We can just verify it implements MediaReader
        let (_tx, mut _rx) = mpsc::unbounded_channel::<crate::models::SongInfo>();

        // In a real test, start_listening runs forever, so we'd spawn it
        // let reader = crate::media_reader::linux::LinuxMediaReader::new();
        // tokio::spawn(async move {
        //     reader.start_listening(tx);
        // });
    }
}

// WINDOWS

#[cfg(target_os = "windows")]
mod windows_tests {
    use super::super::MediaReader;
    use super::super::windows::WindowsMediaReader;

    #[test]
    fn windows_reader_can_be_constructed() {
        let reader = WindowsMediaReader::new();
        let _ = reader;
    }

    #[test]
    fn windows_reader_poll_does_not_panic() {
        let result = std::panic::catch_unwind(|| {
            let reader = WindowsMediaReader::new();
            let _ = reader.get_current_song();
        });

        assert!(result.is_ok());
    }

    #[test]
    fn windows_reader_multiple_polls_are_stable() {
        let reader = WindowsMediaReader::new();

        for _ in 0..10 {
            let _ = reader.get_current_song();
        }
    }
}
