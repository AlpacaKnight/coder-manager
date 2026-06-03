use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Provider {
    pub id: String,
    pub name: String,
    pub api_base_url: String,
    pub model_name: String,
    pub api_key: String,
    #[serde(default = "default_provider_type")]
    pub provider_type: String,
}

fn default_provider_type() -> String {
    "openai".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AppConfig {
    pub ignored_tools: Vec<String>,
    pub last_check_time: Option<String>,
    #[serde(default)]
    pub tool_order: Vec<String>,
    #[serde(default)]
    pub providers: Vec<Provider>,
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
}

pub fn get_qwen_settings_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".qwen")
        .join("settings.json")
}

pub fn read_qwen_settings() -> Result<serde_json::Value, String> {
    let path = get_qwen_settings_path();
    if !path.exists() {
        return Ok(serde_json::json!({}));
    }
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

pub fn write_qwen_settings(settings: &serde_json::Value) -> Result<(), String> {
    let path = get_qwen_settings_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}

pub fn merge_providers_to_settings(settings: &mut serde_json::Value, providers: &[Provider]) {
    if !settings.is_object() {
        *settings = serde_json::json!({});
    }
    let obj = settings.as_object_mut().unwrap();

    // Ensure $version = 4
    obj.insert("$version".to_string(), serde_json::json!(4));

    // Group providers by protocol type
    let mut openai_providers: Vec<serde_json::Value> = Vec::new();
    let mut anthropic_providers: Vec<serde_json::Value> = Vec::new();

    for p in providers {
        let entry = serde_json::json!({
            "id": p.model_name,
            "name": p.name,
            "baseUrl": p.api_base_url,
            "envKey": format!("{}_API_KEY", p.id.to_uppercase())
        });
        match p.provider_type.as_str() {
            "anthropic" => anthropic_providers.push(entry),
            _ => openai_providers.push(entry),
        }
    }

    let model_providers = obj
        .entry("modelProviders")
        .or_insert_with(|| serde_json::json!({}));
    if let Some(mp_obj) = model_providers.as_object_mut() {
        mp_obj.insert("openai".to_string(), serde_json::json!(openai_providers));
        if !anthropic_providers.is_empty() {
            mp_obj.insert(
                "anthropic".to_string(),
                serde_json::json!(anthropic_providers),
            );
        }
    }

    // Set security.auth.selectedType based on provider types present
    let has_anthropic = providers.iter().any(|p| p.provider_type == "anthropic");
    let selected_type = if has_anthropic { "anthropic" } else { "openai" };
    let security = obj
        .entry("security")
        .or_insert_with(|| serde_json::json!({}));
    if let Some(sec_obj) = security.as_object_mut() {
        let auth = sec_obj
            .entry("auth")
            .or_insert_with(|| serde_json::json!({}));
        if let Some(auth_obj) = auth.as_object_mut() {
            auth_obj.insert("selectedType".to_string(), serde_json::json!(selected_type));
        }
    }

    // Merge env keys
    let env = obj.entry("env").or_insert_with(|| serde_json::json!({}));
    if let Some(env_obj) = env.as_object_mut() {
        for provider in providers {
            let env_key = format!("{}_API_KEY", provider.id.to_uppercase());
            env_obj.insert(env_key, serde_json::json!(provider.api_key));
        }
    }

    // Set model.name to first provider if not already set to a valid one
    let model = obj.entry("model").or_insert_with(|| serde_json::json!({}));
    if let Some(model_obj) = model.as_object_mut() {
        let current_name = model_obj.get("name").and_then(|v| v.as_str()).unwrap_or("");
        let valid_ids: Vec<&str> = providers.iter().map(|p| p.model_name.as_str()).collect();
        if current_name.is_empty() || !valid_ids.contains(&current_name) {
            if let Some(first) = providers.first() {
                model_obj.insert("name".to_string(), serde_json::json!(first.model_name));
            }
        }
    }
}

pub fn apply_qwen_model_config(
    settings: &mut serde_json::Value,
    openai_models: &[QwenModelEntry],
    anthropic_models: &[QwenModelEntry],
    providers: &[Provider],
) {
    if !settings.is_object() {
        *settings = serde_json::json!({});
    }
    let obj = settings.as_object_mut().unwrap();

    obj.insert("$version".to_string(), serde_json::json!(4));

    // modelProviders — 合并现有保留 + 新注册
    let mut all_openai: Vec<serde_json::Value> = openai_models
        .iter()
        .map(|m| {
            let mut entry = serde_json::json!({
                "id": m.id,
                "name": m.name,
                "baseUrl": m.base_url,
                "envKey": m.env_key
            });
            if let Some(ref pt) = m.provider_type {
                entry
                    .as_object_mut()
                    .unwrap()
                    .insert("providerType".to_string(), serde_json::json!(pt));
            }
            entry
        })
        .collect();

    let mut all_anthropic: Vec<serde_json::Value> = anthropic_models
        .iter()
        .map(|m| {
            let mut entry = serde_json::json!({
                "id": m.id,
                "name": m.name,
                "baseUrl": m.base_url,
                "envKey": m.env_key
            });
            if let Some(ref pt) = m.provider_type {
                entry
                    .as_object_mut()
                    .unwrap()
                    .insert("providerType".to_string(), serde_json::json!(pt));
            }
            entry
        })
        .collect();

    for p in providers {
        let entry = serde_json::json!({
            "id": p.model_name,
            "name": p.name,
            "baseUrl": p.api_base_url,
            "envKey": format!("{}_API_KEY", p.id.to_uppercase()),
            "providerType": p.provider_type
        });
        match p.provider_type.as_str() {
            "anthropic" => all_anthropic.push(entry),
            _ => all_openai.push(entry),
        }
    }

    let mp = obj
        .entry("modelProviders")
        .or_insert_with(|| serde_json::json!({}));
    if let Some(mp_obj) = mp.as_object_mut() {
        mp_obj.insert("openai".to_string(), serde_json::json!(all_openai));
        mp_obj.insert("anthropic".to_string(), serde_json::json!(all_anthropic));
    }

    // security.auth.selectedType
    let has_anthropic = !all_anthropic.is_empty();
    let selected_type = if has_anthropic { "anthropic" } else { "openai" };
    let security = obj
        .entry("security")
        .or_insert_with(|| serde_json::json!({}));
    if let Some(sec_obj) = security.as_object_mut() {
        let auth = sec_obj
            .entry("auth")
            .or_insert_with(|| serde_json::json!({}));
        if let Some(auth_obj) = auth.as_object_mut() {
            auth_obj.insert("selectedType".to_string(), serde_json::json!(selected_type));
        }
    }

    // env — 保留已有的 + 新增 provider 的 key
    let env = obj.entry("env").or_insert_with(|| serde_json::json!({}));
    if let Some(env_obj) = env.as_object_mut() {
        for p in providers {
            let env_key = format!("{}_API_KEY", p.id.to_uppercase());
            env_obj.insert(env_key, serde_json::json!(p.api_key));
        }
    }

    // model.name — 当前活跃模型
    let model = obj.entry("model").or_insert_with(|| serde_json::json!({}));
    if let Some(model_obj) = model.as_object_mut() {
        let current_name = model_obj.get("name").and_then(|v| v.as_str()).unwrap_or("");
        let all_model_ids: Vec<&str> = all_openai
            .iter()
            .chain(all_anthropic.iter())
            .filter_map(|v| v.get("id").and_then(|v| v.as_str()))
            .collect();
        if current_name.is_empty() || !all_model_ids.contains(&current_name) {
            if let Some(first) = all_model_ids.first() {
                model_obj.insert("name".to_string(), serde_json::json!(first));
            }
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QwenModelEntry {
    pub id: String,
    pub name: String,
    #[serde(rename = "baseUrl")]
    pub base_url: String,
    #[serde(rename = "envKey")]
    pub env_key: String,
    #[serde(rename = "providerType")]
    pub provider_type: Option<String>,
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
