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
        album_art_base64: Some(std::sync::Arc::new("dGVzdA==".to_string())),
        position_secs: 42,
        length_secs: 180,
        is_playing: true,
    };

    let json = serde_json::to_string(&info).expect("serialization should work");
    let deserialized: SongInfo =
        serde_json::from_str(&json).expect("deserialization should work");

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
        album_art_base64: Some(std::sync::Arc::new("abc".to_string())),
        position_secs: 10,
        length_secs: 200,
        is_playing: false,
    };

    let mut cloned = info.clone();

    cloned.title = "Modified".to_string();
    cloned.album_art_base64 = Some(std::sync::Arc::new("modified".to_string()));
    cloned.is_playing = true;

    // original unchanged
    assert_eq!(info.title, "Original");
    assert_eq!(info.album_art_base64, Some(std::sync::Arc::new("abc".to_string())));
    assert!(!info.is_playing);

    // clone updated
    assert_eq!(cloned.title, "Modified");
    assert_eq!(cloned.album_art_base64, Some(std::sync::Arc::new("modified".to_string())));
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
    use super::super::linux::LinuxMediaReader;
    use super::super::MediaReader;

    #[test]
    fn linux_reader_does_not_panic_on_creation() {
        let result = std::panic::catch_unwind(|| {
            LinuxMediaReader::new();
        });

        assert!(result.is_ok());
    }

    #[test]
    fn linux_reader_poll_does_not_panic() {
        let result = std::panic::catch_unwind(|| {
            let reader = LinuxMediaReader::new();
            let _ = reader.get_current_song();
        });

        assert!(result.is_ok());
    }

    #[test]
    fn linux_reader_multiple_polls_are_stable() {
        let reader = LinuxMediaReader::new();

        for _ in 0..10 {
            let _ = reader.get_current_song();
        }
    }

    #[test]
    fn test_fetch_and_convert_art_http() {
        use super::super::linux::fetch_and_convert_art;
        let url = "https://www.google.com/images/branding/googlelogo/1x/googlelogo_color_272x92dp.png";
        let res = fetch_and_convert_art(url);
        assert!(res.is_some());
        let base64_str = res.unwrap();
        assert!(!base64_str.is_empty());
    }

    #[test]
    fn test_fetch_and_convert_art_spotify() {
        use super::super::linux::fetch_and_convert_art;
        // i.scdn.co/image/
        let url = "https://open.spotify.com/image/ab67616d00001e02ff9ca10b55ce82ae553c8228";
        let res = fetch_and_convert_art(url);
        assert!(res.is_some());
        let base64_str = res.unwrap();
        assert!(!base64_str.is_empty());
    }

    #[test]
    fn test_fetch_and_convert_art_spotify_uri() {
        use super::super::linux::fetch_and_convert_art;
        // spotify:image:<id>
        let url = "spotify:image:ab67616d00001e02ff9ca10b55ce82ae553c8228";
        let res = fetch_and_convert_art(url);
        assert!(res.is_some());
        let base64_str = res.unwrap();
        assert!(!base64_str.is_empty());
    }

    #[test]
    fn test_fetch_and_convert_art_file_url_percent_encoded() {
        use super::super::linux::fetch_and_convert_art;
        use std::io::Write;
        
        let mut path = std::env::temp_dir();
        path.push("currentsong test space");
        let _ = std::fs::create_dir(&path);
        path.push("test.png");
        
        if let Ok(mut file) = std::fs::File::create(&path) {
            let _ = file.write_all(b"test data");
        }
        
        let path_str = path.to_str().unwrap();
        let url = format!("file://{}", path_str).replace(" ", "%20");
        
        let res = fetch_and_convert_art(&url);
        assert!(res.is_some());
        

        let _ = std::fs::remove_file(&path);
        path.pop();
        let _ = std::fs::remove_dir(&path);
    }

    #[test]
    fn test_fetch_itunes_artwork() {
        use super::super::linux::fetch_itunes_artwork;
        let res = fetch_itunes_artwork("Anti-Hero", "Taylor Swift");
        assert!(res.is_some());
        let url = res.unwrap();
        assert!(url.starts_with("https://"));
        assert!(url.contains("mzstatic.com"));
    }

    #[test]
    fn test_extract_youtube_video_id() {
        use super::super::linux::extract_youtube_video_id;
        
        assert_eq!(extract_youtube_video_id("https://www.youtube.com/watch?v=UQJpYFOeUsM&list=RD_IyiNNmD3bg"), Some("UQJpYFOeUsM"));
        assert_eq!(extract_youtube_video_id("https://music.youtube.com/watch?v=UQJpYFOeUsM"), Some("UQJpYFOeUsM"));
        assert_eq!(extract_youtube_video_id("https://youtu.be/UQJpYFOeUsM?t=42"), Some("UQJpYFOeUsM"));
        assert_eq!(extract_youtube_video_id("https://www.youtube.com/embed/UQJpYFOeUsM"), Some("UQJpYFOeUsM"));
        assert_eq!(extract_youtube_video_id("https://www.youtube.com/shorts/UQJpYFOeUsM?feature=share"), Some("UQJpYFOeUsM"));
        assert_eq!(extract_youtube_video_id("https://soundcloud.com/some-track"), None);
    }
}

