use crate::models::SongInfo;

/// Platform-agnostic trait for reading currently playing media info.
pub trait MediaReader {
    fn new() -> Self;
    fn get_current_song(&self) -> Option<SongInfo>;
}

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "linux")]
pub use linux::LinuxMediaReader as PlatformMediaReader;

#[cfg(target_os = "windows")]
mod windows;
#[cfg(target_os = "windows")]
pub use windows::WindowsMediaReader as PlatformMediaReader;

#[cfg(test)]
mod tests;
