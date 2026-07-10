mod cli_tools;
mod config;
mod detection;
mod updater;
mod version_check;

use cli_tools::{CliTool, EnvCheck};
use config::{AppConfig, Provider, QwenModelEntry, KimiModelEntry};
use std::process::Command;
use std::sync::Mutex;
use std::thread;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

const GITHUB_HOMEPAGE: &str = "https://github.com/AlpacaKnight/coder-manager";

/// 全局配置锁，串行化所有 load-改-save 操作，避免并发写入导致 lost-update
static CONFIG_LOCK: Mutex<()> = Mutex::new(());

/// 启动子进程后立即返回，同时在后台线程 wait 以 reap 僵尸进程。
/// 避免了 spawn 丢弃 Child 产生的僵尸进程，也避免了 output 阻塞等待子进程（如 xdg-open 可能等待浏览器关闭）。
fn spawn_and_reap(cmd: &mut Command) -> Result<(), String> {
    let child = cmd.spawn().map_err(|e| e.to_string())?;
    // 在后台线程中 wait，确保子进程被 reap
    thread::spawn(move || {
        let _ = child.wait_with_output();
    });
    Ok(())
}

/// 在锁保护下读取、修改并保存配置，避免并发写入导致 lost-update
fn with_config_mut<F: FnOnce(&mut AppConfig) -> Result<(), String>>(
    f: F,
) -> Result<(), String> {
    let _guard = CONFIG_LOCK.lock().map_err(|e| e.to_string())?;
    let mut config = AppConfig::load()?;
    f(&mut config)?;
    config.save()
}

#[tauri::command]
fn open_github_homepage() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let mut cmd = Command::new("cmd");
        cmd.args(["/C", "start", "", GITHUB_HOMEPAGE])
            .creation_flags(CREATE_NO_WINDOW);
        spawn_and_reap(&mut cmd)
    }

    #[cfg(target_os = "macos")]
    {
        let mut cmd = Command::new("open");
        cmd.arg(GITHUB_HOMEPAGE);
        spawn_and_reap(&mut cmd)
    }

    #[cfg(target_os = "linux")]
    {
        let mut cmd = Command::new("xdg-open");
        cmd.arg(GITHUB_HOMEPAGE);
        spawn_and_reap(&mut cmd)
    }
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
async fn get_tools_quick() -> Result<Vec<CliTool>, String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<CliTool>, String> {
        let config = AppConfig::load()?;
        let mut tools = detection::detect_installed_tools(&config.ignored_tools);
        // 不执行版本检查，直接使用检测状态（快速返回）
        sort_tools_by_config(&mut tools, &config.tool_order);
        Ok(tools)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn get_tool_names() -> Result<Vec<CliTool>, String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<CliTool>, String> {
        // 仅返回工具定义（不检测系统），用于秒开界面
        let config = AppConfig::load()?;
        let definitions = cli_tools::CliToolsRegistry::get_supported_tools();
        let ignored: Vec<String> = config
            .ignored_tools
            .iter()
            .map(|s| s.to_lowercase())
            .collect();

        let tools: Vec<CliTool> = definitions
            .into_iter()
            .map(|def| {
                let install_cmd = detection::platform_install_command(&def);
                let update_cmd = detection::platform_update_command(&def);
                CliTool {
                    name: def.name.clone(),
                    display_name: def.display_name,
                    current_version: String::new(),
                    latest_version: None,
                    path: None,
                    update_available: false,
                    can_auto_update: def.can_auto_update,
                    install_command: install_cmd,
                    update_command: update_cmd,
                    ignored: ignored.contains(&def.name.to_lowercase()),
                    status: cli_tools::ToolStatus::Checking,
                }
            })
            .collect();

        // 排序
        let mut tools = tools;
        sort_tools_by_config(&mut tools, &config.tool_order);
        Ok(tools)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn check_for_updates() -> Result<Vec<CliTool>, String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<CliTool>, String> {
        let config = AppConfig::load()?;
        let mut tools = detection::detect_installed_tools(&config.ignored_tools);
        version_check::check_for_updates(&mut tools);

        // 保存 last_check_time 时重新加载最新配置并加锁，避免覆盖期间主线程的修改
        with_config_mut(|config_update| {
            config_update.update_last_check();
            Ok(())
        })?;

        // 用最新配置的排序
        let latest_config = AppConfig::load()?;
        sort_tools_by_config(&mut tools, &latest_config.tool_order);
        Ok(tools)
    })
    .await
    .map_err(|e| e.to_string())?
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
async fn batch_update_tools(names: Vec<String>) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let definitions = cli_tools::CliToolsRegistry::get_supported_tools();
        let mut updated = Vec::new();
        let mut failures = Vec::new();

        for name in names {
            match definitions.iter().find(|definition| definition.name == name) {
                Some(definition) => match updater::update_tool_by_definition(definition) {
                    Ok(_) => updated.push(name),
                    Err(error) => failures.push(format!("{}: {}", name, error.trim())),
                },
                None => failures.push(format!("{}: tool not found", name)),
            }
        }

        if failures.is_empty() {
            Ok(updated)
        } else {
            Err(failures.join("\n"))
        }
    })
    .await
    .map_err(|e| e.to_string())?
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
async fn get_config() -> Result<AppConfig, String> {
    tauri::async_runtime::spawn_blocking(|| AppConfig::load())
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn save_config(new_config: AppConfig) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let _guard = CONFIG_LOCK.lock().map_err(|e| e.to_string())?;
        new_config.save()
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn ignore_tool(tool_name: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        with_config_mut(|config| {
            config.add_ignored(&tool_name);
            Ok(())
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn unignore_tool(tool_name: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        with_config_mut(|config| {
            config.remove_ignored(&tool_name);
            Ok(())
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn save_tool_order(order: Vec<String>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        with_config_mut(|config| {
            config.set_tool_order(order);
            Ok(())
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn update_last_check_time() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(|| {
        with_config_mut(|config| {
            config.update_last_check();
            Ok(())
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn get_providers() -> Result<Vec<Provider>, String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<Provider>, String> {
        let config = AppConfig::load()?;
        Ok(config.providers)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn save_providers(providers: Vec<Provider>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        with_config_mut(|config| {
            config.providers = providers;
            Ok(())
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn create_provider(provider: Provider) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        with_config_mut(|config| {
            if config.providers.iter().any(|p| p.id == provider.id) {
                return Err(format!("Provider '{}' already exists", provider.id));
            }
            config.providers.push(provider);
            Ok(())
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn delete_provider(id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        with_config_mut(|config| {
            config.providers.retain(|p| p.id != id);
            Ok(())
        })
    })
    .await
    .map_err(|e| e.to_string())?
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

    #[cfg(target_os = "windows")]
    {
        let mut cmd = Command::new("cmd");
        cmd.args(["/C", "start", "", &path_str])
            .creation_flags(CREATE_NO_WINDOW);
        spawn_and_reap(&mut cmd)?;
    }

    #[cfg(target_os = "macos")]
    {
        let mut cmd = Command::new("open");
        cmd.arg(&path_str);
        spawn_and_reap(&mut cmd)?;
    }

    #[cfg(target_os = "linux")]
    {
        let mut cmd = Command::new("xdg-open");
        cmd.arg(&path_str);
        spawn_and_reap(&mut cmd)?;
    }

    Ok(())
}

#[tauri::command]
fn apply_qwen_model_config(
    openai_models: Vec<QwenModelEntry>,
    anthropic_models: Vec<QwenModelEntry>,
    provider_ids: Vec<String>,
) -> Result<serde_json::Value, String> {
    let app_config = AppConfig::load()?;
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
    let app_config = AppConfig::load()?;
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

#[tauri::command]
fn load_opencode_settings() -> Result<serde_json::Value, String> {
    let settings = config::read_opencode_settings()?;
    serde_json::to_value(&settings).map_err(|e| e.to_string())
}

#[tauri::command]
fn open_opencode_settings_file() -> Result<(), String> {
    config::open_opencode_config_file()
}

#[tauri::command]
fn apply_opencode_model_config(
    kept_providers: std::collections::HashMap<String, config::OpenCodeProviderEntry>,
    provider_ids: Vec<String>,
) -> Result<serde_json::Value, String> {
    let app_config = AppConfig::load()?;
    let providers: Vec<Provider> = app_config
        .providers
        .iter()
        .filter(|p| provider_ids.contains(&p.id))
        .cloned()
        .collect();

    let mut settings = config::read_opencode_settings()?;
    config::apply_opencode_model_config(&mut settings, kept_providers, &providers);
    config::write_opencode_settings(&settings)?;
    serde_json::to_value(&settings).map_err(|e| e.to_string())
}

#[tauri::command]
fn load_codebuddy_models_config() -> Result<serde_json::Value, String> {
    let config = config::read_codebuddy_models_config()?;
    serde_json::to_value(&config).map_err(|e| e.to_string())
}

#[tauri::command]
fn open_codebuddy_models_config_file() -> Result<(), String> {
    config::open_codebuddy_models_config_file()
}

#[tauri::command]
fn apply_codebuddy_model_config(
    custom_models: Vec<config::CodeBuddyModelEntry>,
    provider_ids: Vec<String>,
) -> Result<serde_json::Value, String> {
    let app_config = AppConfig::load()?;
    let providers: Vec<config::Provider> = app_config
        .providers
        .iter()
        .filter(|p| provider_ids.contains(&p.id))
        .cloned()
        .collect();

    let mut settings = config::read_codebuddy_models_config()?;
    config::apply_codebuddy_model_config(&mut settings, custom_models, &provider_ids, &providers);
    config::write_codebuddy_models_config(&settings)?;
    serde_json::to_value(&settings).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_codebuddy_models_config() -> Result<(), String> {
    config::delete_codebuddy_models_config()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let level = if cfg!(debug_assertions) {
                log::LevelFilter::Info
            } else {
                // release 环境也加载日志（降级到 Warn），便于排查吞掉的错误
                log::LevelFilter::Warn
            };
            app.handle().plugin(
                tauri_plugin_log::Builder::default()
                    .level(level)
                    .build(),
            )?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_env_check,
            get_env_path,
            get_tools_quick,
            get_tool_names,
            get_tool_latest_version,
            get_tool_update_command,
            open_github_homepage,
            check_for_updates,
            update_tool,
            install_tool,
            uninstall_tool,
            batch_update_tools,
            get_config,
            save_config,
            ignore_tool,
            unignore_tool,
            save_tool_order,
            update_last_check_time,
            get_providers,
            save_providers,
            create_provider,
            delete_provider,
            load_qwen_settings,
            open_qwen_settings_file,
            apply_qwen_model_config,
            load_kimi_settings,
            open_kimi_settings_file,
            apply_kimi_model_config,
            load_opencode_settings,
            open_opencode_settings_file,
            apply_opencode_model_config,
            load_codebuddy_models_config,
            open_codebuddy_models_config_file,
            apply_codebuddy_model_config,
            delete_codebuddy_models_config
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
