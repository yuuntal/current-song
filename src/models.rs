use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct SongInfo {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub album_art_base64: Option<String>,
    pub position_secs: u64,
    pub length_secs: u64,
    pub is_playing: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OverlayConfig {
    pub theme: String,
    pub show_thumbnail: bool,
    pub show_artist: bool,
    pub show_progress: bool,
    pub show_time: bool,

    // 0 for primary
    // 1 for secondary
    pub monitor_index: usize,
    pub position: OverlayPosition,
    pub accent_color: String,
    pub background_color: String,
    pub text_color: String,
    pub font_size_px: u32,
    pub border_radius_px: u32,
    pub blur_px: u32,
    pub custom_css: String,

    pub transition_animation: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum OverlayPosition {
    TopLeft,
    TopRight,
    BottomLeft,
    BottomRight,
    Custom(i32, i32),
}

impl Default for OverlayConfig {
    fn default() -> Self {
        Self {
            theme: "frosted_glass".to_string(),
            show_thumbnail: true,
            show_artist: true,
            show_progress: true,
            show_time: true,
            monitor_index: 0,
            position: OverlayPosition::BottomRight,
            accent_color: "#3498db".to_string(),
            background_color: "#1a1a2e".to_string(),
            text_color: "#ffffff".to_string(),
            font_size_px: 14,
            border_radius_px: 14,
            blur_px: 18,
            custom_css: String::new(),
            transition_animation: "slide_up".to_string(),
        }
    }
}
