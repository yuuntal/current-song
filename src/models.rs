use serde::{Deserialize, Serialize};
use std::sync::Arc;

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct SongInfo {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub album_art_base64: Option<Arc<String>>,
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

    #[serde(default = "default_layout")]
    pub layout: String,
    #[serde(default = "default_alignment")]
    pub alignment: String,
    #[serde(default = "default_animation")]
    pub animation: String,
    #[serde(default = "default_color_mode")]
    pub color_mode: String,
    #[serde(default = "default_collapse_delay")]
    pub collapse_delay_secs: f64,

    #[serde(default = "default_text_transition")]
    pub text_transition: String,
    #[serde(default = "default_text_transition_settings")]
    pub text_transition_settings: serde_json::Value,
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
            layout: default_layout(),
            alignment: default_alignment(),
            animation: default_animation(),
            color_mode: default_color_mode(),
            collapse_delay_secs: default_collapse_delay(),
            text_transition: default_text_transition(),
            text_transition_settings: default_text_transition_settings(),
        }
    }
}

fn default_layout() -> String {
    "dynamic".to_string()
}

fn default_alignment() -> String {
    "bottom-right".to_string()
}

fn default_animation() -> String {
    "swipe".to_string()
}

fn default_color_mode() -> String {
    "auto".to_string()
}

fn default_collapse_delay() -> f64 {
    3.0
}

fn default_text_transition() -> String {
    "rotating".to_string()
}

fn default_text_transition_settings() -> serde_json::Value {
    serde_json::json!({
        "staggerFrom": "last",
        "staggerDuration": 25
    })
}

