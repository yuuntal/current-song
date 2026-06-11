use crate::models::OverlayConfig;
use std::fs;
use std::path::Path;
use std::sync::{Arc, RwLock};

fn get_config_path() -> std::path::PathBuf {
    let base_dir = std::env::var("XDG_CONFIG_HOME")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| {
            let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
            std::path::PathBuf::from(home).join(".config")
        });
    let config_dir = base_dir.join("currentsong");
    let _ = std::fs::create_dir_all(&config_dir);
    config_dir.join("config.json")
}

#[derive(Clone)]
pub struct ConfigManager {
    config: Arc<RwLock<OverlayConfig>>,
}

impl ConfigManager {
    pub fn new() -> Self {
        let config_path = get_config_path();
        let config = if config_path.exists() {
            match fs::read_to_string(&config_path) {
                Ok(content) => {
                    serde_json::from_str(&content).unwrap_or_else(|_| OverlayConfig::default())
                }
                Err(_) => OverlayConfig::default(),
            }
        } else {
            OverlayConfig::default()
        };

        Self {
            config: Arc::new(RwLock::new(config)),
        }
    }

    pub fn get_config(&self) -> OverlayConfig {
        self.config.read().unwrap().clone()
    }

    pub fn update_config(&self, new_config: OverlayConfig) -> Result<(), std::io::Error> {
        let mut config_guard = self.config.write().unwrap();
        *config_guard = new_config.clone();

        let json = serde_json::to_string_pretty(&new_config)?;
        fs::write(get_config_path(), json)?;
        Ok(())
    }
}
