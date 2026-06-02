mod cli_tools;
mod config;
mod detection;
mod updater;
mod version_check;

use cli_tools::{CliTool, EnvCheck};
use config::AppConfig;
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
    let ignored: Vec<String> = config.ignored_tools.iter().map(|s| s.to_lowercase()).collect();

    let tools: Vec<CliTool> = definitions.into_iter().map(|def| {
        CliTool {
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
        }
    }).collect();

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
        updater::update_tool(&tool)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn update_tool(name: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let config = AppConfig::load();
        let tools = detection::detect_installed_tools(&config.ignored_tools);
        let tool = tools.into_iter().find(|t| t.name == name);

        if let Some(tool) = tool {
            updater::update_tool(&tool)
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
            Err(format!("Tool '{}' not found or cannot be auto-installed", name))
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
    tauri::async_runtime::spawn_blocking(move || {
        updater::batch_update_tools(tools)
    })
    .await
    .unwrap_or_else(|_| vec![])
}

#[tauri::command]
async fn batch_update_tools(names: Vec<String>) -> Vec<(String, Result<String, String>)> {
    tauri::async_runtime::spawn_blocking(move || {
        let config = AppConfig::load();
        let tools = detection::detect_installed_tools(&config.ignored_tools);
        let selected_tools = tools.into_iter().filter(|t| names.contains(&t.name)).collect();
        updater::batch_update_tools(selected_tools)
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
            save_tool_order
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
