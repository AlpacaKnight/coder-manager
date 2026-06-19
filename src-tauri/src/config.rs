use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelEntry {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Provider {
    pub id: String,
    pub name: String,
    pub api_base_url: String,
    pub api_key: String,
    #[serde(default = "default_provider_type")]
    pub provider_type: String,
    #[serde(default)]
    pub models: Vec<ModelEntry>,
    #[serde(default)]
    pub model_name: Option<String>,
}

fn default_provider_type() -> String {
    "openai".to_string()
}

impl Provider {
    /// 向后兼容：若 `models` 为空但旧字段 `model_name` 有值，则回填到 `models`。
    pub fn migrate_model_name(&mut self) {
        if self.models.is_empty() {
            if let Some(mn) = self.model_name.take() {
                let trimmed = mn.trim();
                if !trimmed.is_empty() {
                    self.models = vec![ModelEntry {
                        id: trimmed.to_string(),
                        name: trimmed.to_string(),
                    }];
                }
            }
        }
    }
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
        let mut config = if config_path.exists() {
            fs::read_to_string(&config_path)
                .ok()
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or_default()
        } else {
            Self::default()
        };
        // 向后兼容：把旧的 model_name 单字段迁移到 models 数组
        for p in &mut config.providers {
            p.migrate_model_name();
        }
        config
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

/// 将一个 Provider 展开为多个模型条目。
/// 每个 `ModelEntry` 生成一个独立的 entry，共用同一个 `baseUrl` 和 `envKey`。
fn provider_to_entries(p: &Provider) -> Vec<serde_json::Value> {
    p.models
        .iter()
        .map(|m| {
            serde_json::json!({
                "id": m.id,
                "name": m.name,
                "baseUrl": p.api_base_url,
                "envKey": format!("{}_API_KEY", p.id.to_uppercase()),
                "providerType": p.provider_type
            })
        })
        .collect()
}

fn model_entry_to_json(m: &QwenModelEntry) -> serde_json::Value {
    let mut entry = serde_json::json!({
        "id": m.id,
        "name": m.name,
        "baseUrl": m.base_url,
        "envKey": m.env_key
    });
    if let Some(ref pt) = m.provider_type {
        entry.as_object_mut().unwrap().insert("providerType".to_string(), serde_json::json!(pt));
    }
    entry
}

fn set_model_providers(
    obj: &mut serde_json::Map<String, serde_json::Value>,
    openai: &[serde_json::Value],
    anthropic: &[serde_json::Value],
) {
    let mp = obj.entry("modelProviders").or_insert_with(|| serde_json::json!({}));
    if let Some(mp_obj) = mp.as_object_mut() {
        mp_obj.insert("openai".to_string(), serde_json::json!(openai));
        if !anthropic.is_empty() {
            mp_obj.insert("anthropic".to_string(), serde_json::json!(anthropic));
        }
    }
}

fn set_security_auth(
    obj: &mut serde_json::Map<String, serde_json::Value>,
    providers: &[Provider],
) {
    let has_anthropic = providers.iter().any(|p| p.provider_type == "anthropic");
    let selected_type = if has_anthropic { "anthropic" } else { "openai" };
    let security = obj.entry("security").or_insert_with(|| serde_json::json!({}));
    if let Some(sec_obj) = security.as_object_mut() {
        let auth = sec_obj.entry("auth").or_insert_with(|| serde_json::json!({}));
        if let Some(auth_obj) = auth.as_object_mut() {
            auth_obj.insert("selectedType".to_string(), serde_json::json!(selected_type));
        }
    }
}

fn set_env_keys(
    obj: &mut serde_json::Map<String, serde_json::Value>,
    providers: &[Provider],
) {
    let env = obj.entry("env").or_insert_with(|| serde_json::json!({}));
    if let Some(env_obj) = env.as_object_mut() {
        for p in providers {
            let env_key = format!("{}_API_KEY", p.id.to_uppercase());
            env_obj.insert(env_key, serde_json::json!(p.api_key));
        }
    }
}

fn set_model_name(
    obj: &mut serde_json::Map<String, serde_json::Value>,
    openai: &[serde_json::Value],
    anthropic: &[serde_json::Value],
) {
    let model = obj.entry("model").or_insert_with(|| serde_json::json!({}));
    if let Some(model_obj) = model.as_object_mut() {
        let current_name = model_obj.get("name").and_then(|v| v.as_str()).unwrap_or("");
        let all_model_ids: Vec<&str> = openai.iter()
            .chain(anthropic.iter())
            .filter_map(|v| v.get("id").and_then(|v| v.as_str()))
            .collect();
        if current_name.is_empty() || !all_model_ids.contains(&current_name) {
            if let Some(first) = all_model_ids.first() {
                model_obj.insert("name".to_string(), serde_json::json!(first));
            }
        }
    }
}

pub fn merge_providers_to_settings(settings: &mut serde_json::Value, providers: &[Provider]) {
    if !settings.is_object() {
        *settings = serde_json::json!({});
    }
    let obj = settings.as_object_mut().unwrap();
    obj.insert("$version".to_string(), serde_json::json!(4));

    let mut openai_providers: Vec<serde_json::Value> = Vec::new();
    let mut anthropic_providers: Vec<serde_json::Value> = Vec::new();

    for p in providers {
        let entries = provider_to_entries(p);
        match p.provider_type.as_str() {
            "anthropic" => anthropic_providers.extend(entries),
            _ => openai_providers.extend(entries),
        }
    }

    set_model_providers(obj, &openai_providers, &anthropic_providers);
    set_security_auth(obj, providers);
    set_env_keys(obj, providers);
    set_model_name(obj, &openai_providers, &anthropic_providers);
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

    let mut all_openai: Vec<serde_json::Value> = openai_models
        .iter()
        .map(model_entry_to_json)
        .collect();

    let mut all_anthropic: Vec<serde_json::Value> = anthropic_models
        .iter()
        .map(model_entry_to_json)
        .collect();

    for p in providers {
        let entries = provider_to_entries(p);
        match p.provider_type.as_str() {
            "anthropic" => all_anthropic.extend(entries),
            _ => all_openai.extend(entries),
        }
    }

    set_model_providers(obj, &all_openai, &all_anthropic);
    set_security_auth(obj, providers);
    set_env_keys(obj, providers);
    set_model_name(obj, &all_openai, &all_anthropic);
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

// Kimi Code 配置相关
pub fn get_kimi_config_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".kimi-code")
        .join("config.toml")
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KimiProviderEntry {
    #[serde(rename = "type")]
    pub provider_type: String,
    pub base_url: Option<String>,
    pub api_key: Option<String>,
    #[serde(default)]
    pub env: Option<std::collections::HashMap<String, String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KimiModelEntry {
    pub provider: String,
    pub model: String,
    #[serde(rename = "max_context_size")]
    pub max_context_size: u64,
    #[serde(rename = "max_output_size", skip_serializing_if = "Option::is_none")]
    pub max_output_size: Option<u64>,
    #[serde(rename = "display_name", skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub capabilities: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct KimiSettings {
    #[serde(rename = "default_model", skip_serializing_if = "Option::is_none")]
    pub default_model: Option<String>,
    #[serde(default)]
    pub providers: std::collections::HashMap<String, KimiProviderEntry>,
    #[serde(default)]
    pub models: std::collections::HashMap<String, KimiModelEntry>,
}

pub fn read_kimi_settings() -> Result<KimiSettings, String> {
    let path = get_kimi_config_path();
    if !path.exists() {
        return Ok(KimiSettings::default());
    }
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    toml::from_str(&content).map_err(|e| format!("解析 TOML 失败: {}", e))
}

pub fn write_kimi_settings(settings: &KimiSettings) -> Result<(), String> {
    let path = get_kimi_config_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let content = toml::to_string_pretty(settings).map_err(|e| format!("序列化 TOML 失败: {}", e))?;
    fs::write(&path, content).map_err(|e| e.to_string())
}

pub fn open_kimi_config_file() -> Result<(), String> {
    let path = get_kimi_config_path();
    if !path.exists() {
        return Err(format!("配置文件不存在: {}", path.display()));
    }
    let path_str = path.to_string_lossy().to_string();
    let mut command = if cfg!(target_os = "windows") {
        let mut c = Command::new("cmd");
        c.args(["/C", "start", "", &path_str]);
        c
    } else if cfg!(target_os = "macos") {
        let mut c = Command::new("open");
        c.arg(&path_str);
        c
    } else {
        let mut c = Command::new("xdg-open");
        c.arg(&path_str);
        c
    };
    command.spawn().map_err(|e| e.to_string())?;
    Ok(())
}

// OpenCode 配置相关
pub fn get_opencode_config_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".config")
        .join("opencode")
        .join("opencode.json")
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct OpenCodeProviderOptions {
    #[serde(rename = "apiKey", skip_serializing_if = "Option::is_none")]
    pub api_key: Option<String>,
    #[serde(rename = "baseURL", skip_serializing_if = "Option::is_none")]
    pub base_url: Option<String>,
    #[serde(rename = "setCacheKey", skip_serializing_if = "Option::is_none")]
    pub set_cache_key: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct OpenCodeProviderEntry {
    #[serde(rename = "npm", skip_serializing_if = "Option::is_none")]
    pub npm: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub options: Option<OpenCodeProviderOptions>,
    #[serde(default, skip_serializing_if = "std::collections::HashMap::is_empty")]
    pub models: std::collections::HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct OpenCodeSettings {
    #[serde(default, rename = "provider", skip_serializing_if = "std::collections::HashMap::is_empty")]
    pub provider: std::collections::HashMap<String, OpenCodeProviderEntry>,
}

pub fn read_opencode_settings() -> Result<OpenCodeSettings, String> {
    let path = get_opencode_config_path();
    if !path.exists() {
        return Ok(OpenCodeSettings::default());
    }
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| format!("解析 JSON 失败: {}", e))
}

pub fn write_opencode_settings(settings: &OpenCodeSettings) -> Result<(), String> {
    let path = get_opencode_config_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let content = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(&path, content).map_err(|e| e.to_string())
}

pub fn open_opencode_config_file() -> Result<(), String> {
    let path = get_opencode_config_path();
    if !path.exists() {
        return Err(format!("配置文件不存在: {}", path.display()));
    }
    let path_str = path.to_string_lossy().to_string();
    let mut command = if cfg!(target_os = "windows") {
        let mut c = Command::new("cmd");
        c.args(["/C", "start", "", &path_str]);
        c
    } else if cfg!(target_os = "macos") {
        let mut c = Command::new("open");
        c.arg(&path_str);
        c
    } else {
        let mut c = Command::new("xdg-open");
        c.arg(&path_str);
        c
    };
    command.spawn().map_err(|e| e.to_string())?;
    Ok(())
}

pub fn apply_opencode_model_config(
    settings: &mut OpenCodeSettings,
    providers: &[Provider],
) {
    for p in providers {
        let npm = match p.provider_type.as_str() {
            "anthropic" => "@ai-sdk/anthropic",
            "openai-responses" | "openai" => "@ai-sdk/openai",
            _ => "@ai-sdk/openai-compatible",
        };

        let mut models = std::collections::HashMap::new();
        for m in &p.models {
            let mut model_obj = serde_json::Map::new();
            model_obj.insert("name".to_string(), serde_json::Value::String(m.name.clone()));
            models.insert(m.id.clone(), serde_json::Value::Object(model_obj));
        }

        let opencode_provider = OpenCodeProviderEntry {
            npm: Some(npm.to_string()),
            options: Some(OpenCodeProviderOptions {
                api_key: Some(p.api_key.clone()),
                base_url: None,
                set_cache_key: None,
            }),
            models,
        };
        settings.provider.insert(p.id.clone(), opencode_provider);
    }
}

pub fn apply_kimi_model_config(
    settings: &mut KimiSettings,
    custom_models: Vec<KimiModelEntry>,
    providers: &[Provider],
) {
    // 添加自定义模型
    for m in custom_models {
        let key = m.model.clone();
        settings.models.insert(key, m);
    }

    // 将 Provider 转换为 Kimi 配置格式并添加
    for p in providers {
        let provider_key = format!("managed:{}", p.id);
        let provider_type = match p.provider_type.as_str() {
            "anthropic" => "anthropic",
            "openai-responses" => "openai_responses",
            _ => "openai",
        };

        let kimi_provider = KimiProviderEntry {
            provider_type: provider_type.to_string(),
            base_url: Some(p.api_base_url.clone()),
            api_key: Some(p.api_key.clone()),
            env: None,
        };
        settings.providers.insert(provider_key.clone(), kimi_provider);

        // 为 Provider 的每个模型创建条目
        for m in &p.models {
            let model_key = m.id.clone();
            let kimi_model = KimiModelEntry {
                provider: provider_key.clone(),
                model: m.id.clone(),
                max_context_size: 128000,
                max_output_size: None,
                display_name: Some(m.name.clone()),
                capabilities: None,
            };
            settings.models.insert(model_key, kimi_model);
        }
    }

    // 设置默认模型（如果尚未设置）
    if settings.default_model.is_none() || !settings.models.contains_key(settings.default_model.as_deref().unwrap_or("")) {
        if let Some(first_key) = settings.models.keys().next() {
            settings.default_model = Some(first_key.clone());
        }
    }
}
