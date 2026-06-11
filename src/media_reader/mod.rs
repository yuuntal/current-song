use crate::models::SongInfo;

pub trait MediaReader {
    fn new() -> Self;
    fn get_current_song(&self) -> Option<SongInfo>;
}

mod linux;
pub use linux::LinuxMediaReader as PlatformMediaReader;

#[cfg(test)]
mod tests;
