use crate::models::OverlayConfig;
use std::fs;
use std::path::Path;
use std::sync::{Arc, RwLock};

const CONFIG_FILE: &str = "config.json";

#[derive(Clone)]
pub struct ConfigManager {
    config: Arc<RwLock<OverlayConfig>>,
}

impl ConfigManager {
    pub fn new() -> Self {
        let config = if Path::new(CONFIG_FILE).exists() {
            match fs::read_to_string(CONFIG_FILE) {
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
        fs::write(CONFIG_FILE, json)?;
        Ok(())
    }
}
