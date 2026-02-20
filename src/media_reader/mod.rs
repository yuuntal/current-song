use crate::models::SongInfo;
use tokio::sync::mpsc::UnboundedSender;

pub trait MediaReader {
    fn new() -> Self;
    fn start_listening(self, sender: UnboundedSender<SongInfo>);
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
