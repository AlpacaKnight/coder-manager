use super::cli_tools::{CliTool, LatestVersionSource, ToolStatus};
use regex::Regex;
use std::process::Command;

pub fn check_for_updates(tools: &mut [CliTool]) {
    for tool in tools.iter_mut() {
        if tool.ignored {
            tool.status = ToolStatus::Ignored;
            continue;
        }
        
        if tool.current_version.is_empty() {
            tool.status = ToolStatus::NotInstalled;
            continue;
        }
        
        match get_latest_version(&tool.name) {
            Ok(latest) => {
                tool.latest_version = Some(latest.clone());
                tool.update_available = latest != tool.current_version;
                tool.status = if tool.update_available {
                    ToolStatus::UpdateAvailable
                } else {
                    ToolStatus::UpToDate
                };
            }
            Err(_) => {
                // 无法获取最新版本，但工具已安装，就显示为已是最新版本
                tool.status = ToolStatus::UpToDate;
            }
        }
    }
}

fn get_latest_version(tool_name: &str) -> Result<String, String> {
    match tool_name {
        "node" => get_npm_latest_version("node"),
        "npm" => get_npm_latest_version("npm"),
        "abtop" => get_crates_latest_version("abtop"),
        "codex" => get_npm_latest_version("@openai/codex"),
        "claude" => get_npm_latest_version("@anthropic-ai/claude-code"),
        "gemini" => get_npm_latest_version("@google/gemini-cli"),
        "opencode" => get_npm_latest_version("opencode-ai"),
        "qwen" => get_npm_latest_version("@qwen-code/qwen-code"),
        "deepcode" => get_npm_latest_version("@vegamo/deepcode-cli"),
        "codebuddy" => get_npm_latest_version("@tencent-ai/codebuddy-code"),
        "kilo" => get_npm_latest_version("@kilocode/cli"),
        "bailian" => get_npm_latest_version("bailian-cli"),
        "reasonix" => get_npm_latest_version("reasonix"),
        "cargo" | "rustc" => get_rust_latest_version(),
        _ => Err("No version source available".to_string()),
    }
}

fn get_npm_latest_version(package: &str) -> Result<String, String> {
    let output = Command::new("npm")
        .args(["view", package, "version"])
        .output()
        .map_err(|e| format!("Failed to query npm: {}", e))?;
    
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

fn get_crates_latest_version(package: &str) -> Result<String, String> {
    let output = Command::new("cargo")
        .args(["search", package, "--limit", "1"])
        .output()
        .map_err(|e| format!("Failed to query crates.io: {}", e))?;
    
    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        let regex = Regex::new(r#"version" = "([^"]+)""#).map_err(|e| e.to_string())?;
        regex
            .captures(&stdout)
            .and_then(|cap| cap.get(1))
            .map(|m| m.as_str().to_string())
            .ok_or_else(|| "Could not parse version".to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

fn get_rust_latest_version() -> Result<String, String> {
    let output = Command::new("rustup")
        .args(["show"])
        .output()
        .map_err(|e| format!("Failed to query rustup: {}", e))?;
    
    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        let regex = Regex::new(r"rustc (\d+\.\d+\.\d+)").map_err(|e| e.to_string())?;
        regex
            .captures(&stdout)
            .and_then(|cap| cap.get(1))
            .map(|m| m.as_str().to_string())
            .ok_or_else(|| "Could not parse rust version".to_string())
    } else {
        Err("rustup not available".to_string())
    }
}
