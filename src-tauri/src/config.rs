use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AppConfig {
    pub ignored_tools: Vec<String>,
    pub last_check_time: Option<String>,
    #[serde(default)]
    pub tool_order: Vec<String>,
}

impl AppConfig {
    pub fn load() -> Self {
        let config_path = get_config_path();
        if config_path.exists() {
            fs::read_to_string(&config_path)
                .ok()
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or_default()
        } else {
            Self::default()
        }
    }
    
    pub fn save(&self) -> Result<(), String> {
        let config_path = get_config_path();
        if let Some(parent) = config_path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let json = serde_json::to_string_pretty(self).map_err(|e| e.to_string())?;
        fs::write(&config_path, json).map_err(|e| e.to_string())
    }
    
    pub fn add_ignored(&mut self, tool_name: &str) {
        if !self.ignored_tools.contains(&tool_name.to_string()) {
            self.ignored_tools.push(tool_name.to_string());
        }
    }
    
    pub fn remove_ignored(&mut self, tool_name: &str) {
        self.ignored_tools.retain(|t| t != tool_name);
    }
    
    pub fn update_last_check(&mut self) {
        self.last_check_time = Some(chrono_lite_now());
    }

    pub fn set_tool_order(&mut self, order: Vec<String>) {
        self.tool_order = order;
    }

    pub fn update_tool_order(&mut self, new_order: Vec<String>) {
        self.tool_order = new_order;
    }
}

fn get_config_path() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("cli-tool-manager")
        .join("config.json")
}

fn chrono_lite_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    format!("{}", duration.as_secs())
}
