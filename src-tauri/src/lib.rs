mod cli_tools;
mod config;
mod detection;
mod updater;
mod version_check;

use cli_tools::{CliTool, EnvCheck};
use config::{AppConfig, Provider, QwenModelEntry, KimiModelEntry, KimiSettings};
use std::process::Command;

const GITHUB_HOMEPAGE: &str = "https://github.com/AlpacaKnight/coder-manager";

#[tauri::command]
fn open_github_homepage() -> Result<(), String> {
    let mut command = if cfg!(target_os = "windows") {
        let mut command = Command::new("cmd");
        command.args(["/C", "start", "", GITHUB_HOMEPAGE]);
        command
    } else if cfg!(target_os = "macos") {
        let mut command = Command::new("open");
        command.arg(GITHUB_HOMEPAGE);
        command
    } else {
        let mut command = Command::new("xdg-open");
        command.arg(GITHUB_HOMEPAGE);
        command
    };

    command.spawn().map(|_| ()).map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_environment_check() -> Result<EnvCheck, String> {
    tauri::async_runtime::spawn_blocking(detection::check_environment)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_env_check() -> Result<EnvCheck, String> {
    tauri::async_runtime::spawn_blocking(detection::check_environment)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_env_path(name: String) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || detection::find_tool_path(&name))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_installed_tools() -> Result<Vec<CliTool>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let config = AppConfig::load();
        let mut tools = detection::detect_installed_tools(&config.ignored_tools);
        version_check::check_for_updates(&mut tools);
        sort_tools_by_config(&mut tools, &config.tool_order);
        tools
    })
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_tools_quick() -> Result<Vec<CliTool>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let config = AppConfig::load();
        let mut tools = detection::detect_installed_tools(&config.ignored_tools);
        // 不执行版本检查，直接使用检测状态（快速返回）
        sort_tools_by_config(&mut tools, &config.tool_order);
        tools
    })
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn get_tool_names() -> Vec<CliTool> {
    // 仅返回工具定义（不检测系统），用于秒开界面
    let config = AppConfig::load();
    let definitions = cli_tools::CliToolsRegistry::get_supported_tools();
    let ignored: Vec<String> = config
        .ignored_tools
        .iter()
        .map(|s| s.to_lowercase())
        .collect();

    let tools: Vec<CliTool> = definitions
        .into_iter()
        .map(|def| CliTool {
            name: def.name.clone(),
            display_name: def.display_name,
            current_version: String::new(),
            latest_version: None,
            path: None,
            update_available: false,
            can_auto_update: def.can_auto_update,
            install_command: def.install_command,
            update_command: if def.update_command.is_empty() {
                None
            } else {
                Some(def.update_command)
            },
            ignored: ignored.contains(&def.name.to_lowercase()),
            status: cli_tools::ToolStatus::Checking,
        })
        .collect();

    // 排序
    let mut tools = tools;
    sort_tools_by_config(&mut tools, &config.tool_order);
    tools
}

#[tauri::command]
async fn refresh_tools() -> Result<Vec<CliTool>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let config = AppConfig::load();
        let mut tools = detection::detect_installed_tools(&config.ignored_tools);
        version_check::check_for_updates(&mut tools);
        sort_tools_by_config(&mut tools, &config.tool_order);
        tools
    })
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
async fn check_for_updates() -> Result<Vec<CliTool>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let config = AppConfig::load();
        let mut tools = detection::detect_installed_tools(&config.ignored_tools);
        version_check::check_for_updates(&mut tools);

        let mut config_update = config.clone();
        config_update.update_last_check();
        let _ = config_update.save();

        sort_tools_by_config(&mut tools, &config.tool_order);
        tools
    })
    .await
    .map_err(|e| e.to_string())
}

fn sort_tools_by_config(tools: &mut Vec<CliTool>, tool_order: &[String]) {
    if tool_order.is_empty() {
        return;
    }
    tools.sort_by_key(|t| {
        let idx = tool_order.iter().position(|name| name == &t.name);
        idx.unwrap_or(usize::MAX)
    });
}

#[tauri::command]
async fn update_single_tool(tool: CliTool) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let definitions = cli_tools::CliToolsRegistry::get_supported_tools();
        let def = definitions.into_iter().find(|d| d.name == tool.name);
        if let Some(def) = def {
            updater::update_tool_by_definition(&def)
        } else {
            Err(format!("Tool '{}' not found", tool.name))
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn update_tool(name: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let definitions = cli_tools::CliToolsRegistry::get_supported_tools();
        let def = definitions.into_iter().find(|d| d.name == name);

        if let Some(def) = def {
            updater::update_tool_by_definition(&def)
        } else {
            Err(format!("Tool '{}' not found", name))
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn install_tool(name: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let definitions = cli_tools::CliToolsRegistry::get_supported_tools();
        let def = definitions.into_iter().find(|d| d.name == name);

        if let Some(def) = def {
            updater::install_tool(&def)
        } else {
            Err(format!(
                "Tool '{}' not found or cannot be auto-installed",
                name
            ))
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn uninstall_tool(name: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let definitions = cli_tools::CliToolsRegistry::get_supported_tools();
        let def = definitions.into_iter().find(|d| d.name == name);

        if let Some(def) = def {
            updater::uninstall_tool(&def)
        } else {
            Err(format!("Tool '{}' not found", name))
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn update_all_tools(tools: Vec<CliTool>) -> Vec<(String, Result<String, String>)> {
    tauri::async_runtime::spawn_blocking(move || updater::batch_update_tools(tools))
        .await
        .unwrap_or_else(|_| vec![])
}

#[tauri::command]
async fn batch_update_tools(names: Vec<String>) -> Vec<(String, Result<String, String>)> {
    tauri::async_runtime::spawn_blocking(move || {
        let definitions = cli_tools::CliToolsRegistry::get_supported_tools();
        let selected: Vec<&cli_tools::CliToolDefinition> = definitions
            .iter()
            .filter(|d| names.contains(&d.name))
            .collect();

        selected
            .into_iter()
            .map(|def| {
                let result = updater::update_tool_by_definition(def);
                (def.name.clone(), result)
            })
            .collect()
    })
    .await
    .unwrap_or_else(|_| vec![])
}

#[tauri::command]
async fn get_tool_latest_version(name: String) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let definitions = cli_tools::CliToolsRegistry::get_supported_tools();
        let def = definitions.into_iter().find(|d| d.name == name);
        if let Some(def) = def {
            match &def.latest_version_source {
                cli_tools::LatestVersionSource::Manual => Ok(None),
                source => {
                    let version = version_check::get_latest_version(source)?;
                    Ok(Some(version))
                }
            }
        } else {
            Err(format!("Tool '{}' not found", name))
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn get_tool_update_command(name: String) -> Result<Option<String>, String> {
    let definitions = cli_tools::CliToolsRegistry::get_supported_tools();
    let def = definitions.into_iter().find(|d| d.name == name);
    if let Some(def) = def {
        let cmd = updater::get_update_command_for_display(&def);
        Ok(Some(cmd))
    } else {
        Err(format!("Tool '{}' not found", name))
    }
}

#[tauri::command]
fn get_config() -> AppConfig {
    AppConfig::load()
}

#[tauri::command]
fn save_config(new_config: AppConfig) -> Result<(), String> {
    new_config.save()
}

#[tauri::command]
fn ignore_tool(tool_name: String) -> Result<(), String> {
    let mut config = AppConfig::load();
    config.add_ignored(&tool_name);
    config.save()
}

#[tauri::command]
fn unignore_tool(tool_name: String) -> Result<(), String> {
    let mut config = AppConfig::load();
    config.remove_ignored(&tool_name);
    config.save()
}

#[tauri::command]
fn save_tool_order(order: Vec<String>) -> Result<(), String> {
    let mut config = AppConfig::load();
    config.set_tool_order(order);
    config.save()
}

#[tauri::command]
fn get_providers() -> Vec<Provider> {
    let config = AppConfig::load();
    config.providers
}

#[tauri::command]
fn save_providers(providers: Vec<Provider>) -> Result<(), String> {
    let mut config = AppConfig::load();
    config.providers = providers;
    config.save()
}

#[tauri::command]
fn create_provider(provider: Provider) -> Result<(), String> {
    let mut config = AppConfig::load();
    if config.providers.iter().any(|p| p.id == provider.id) {
        return Err(format!("Provider '{}' already exists", provider.id));
    }
    config.providers.push(provider);
    config.save()
}

#[tauri::command]
fn delete_provider(id: String) -> Result<(), String> {
    let mut config = AppConfig::load();
    config.providers.retain(|p| p.id != id);
    config.save()
}

#[tauri::command]
fn load_qwen_settings() -> Result<serde_json::Value, String> {
    config::read_qwen_settings()
}

#[tauri::command]
fn open_qwen_settings_file() -> Result<(), String> {
    let path = config::get_qwen_settings_path();
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

#[tauri::command]
fn register_providers_to_qwen(provider_ids: Vec<String>) -> Result<serde_json::Value, String> {
    let app_config = AppConfig::load();
    let selected: Vec<&Provider> = app_config
        .providers
        .iter()
        .filter(|p| provider_ids.contains(&p.id))
        .collect();

    if selected.is_empty() {
        return Err("No valid providers selected".to_string());
    }

    let mut settings = config::read_qwen_settings()?;
    config::merge_providers_to_settings(
        &mut settings,
        &selected.into_iter().cloned().collect::<Vec<_>>(),
    );
    config::write_qwen_settings(&settings)?;
    Ok(settings)
}

#[tauri::command]
fn apply_qwen_model_config(
    openai_models: Vec<QwenModelEntry>,
    anthropic_models: Vec<QwenModelEntry>,
    provider_ids: Vec<String>,
) -> Result<serde_json::Value, String> {
    let app_config = AppConfig::load();
    let providers: Vec<Provider> = app_config
        .providers
        .iter()
        .filter(|p| provider_ids.contains(&p.id))
        .cloned()
        .collect();

    let mut settings = config::read_qwen_settings()?;
    config::apply_qwen_model_config(&mut settings, &openai_models, &anthropic_models, &providers);
    config::write_qwen_settings(&settings)?;
    Ok(serde_json::to_value(&settings).unwrap_or_default())
}

#[tauri::command]
fn load_kimi_settings() -> Result<serde_json::Value, String> {
    let settings = config::read_kimi_settings()?;
    serde_json::to_value(&settings).map_err(|e| e.to_string())
}

#[tauri::command]
fn open_kimi_settings_file() -> Result<(), String> {
    config::open_kimi_config_file()
}

#[tauri::command]
fn apply_kimi_model_config(
    custom_models: Vec<KimiModelEntry>,
    provider_ids: Vec<String>,
) -> Result<serde_json::Value, String> {
    let app_config = AppConfig::load();
    let providers: Vec<Provider> = app_config
        .providers
        .iter()
        .filter(|p| provider_ids.contains(&p.id))
        .cloned()
        .collect();

    let mut settings = config::read_kimi_settings()?;
    config::apply_kimi_model_config(&mut settings, custom_models, &providers);
    config::write_kimi_settings(&settings)?;
    serde_json::to_value(&settings).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_environment_check,
            get_env_check,
            get_env_path,
            get_installed_tools,
            get_tools_quick,
            get_tool_names,
            get_tool_latest_version,
            get_tool_update_command,
            open_github_homepage,
            refresh_tools,
            check_for_updates,
            update_single_tool,
            update_tool,
            install_tool,
            uninstall_tool,
            update_all_tools,
            batch_update_tools,
            get_config,
            save_config,
            ignore_tool,
            unignore_tool,
            save_tool_order,
            get_providers,
            save_providers,
            create_provider,
            delete_provider,
            load_qwen_settings,
            open_qwen_settings_file,
            register_providers_to_qwen,
            apply_qwen_model_config,
            load_kimi_settings,
            open_kimi_settings_file,
            apply_kimi_model_config
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
