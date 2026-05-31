use super::cli_tools::{CliTool, CliToolDefinition, CliToolsRegistry, EnvCheck, ToolStatus};
use std::process::Command;

pub fn check_environment() -> EnvCheck {
    EnvCheck {
        node_available: check_command_exists("node"),
        npm_available: check_command_exists("npm"),
        cargo_available: check_command_exists("cargo"),
        rustc_available: check_command_exists("rustc"),
        node_version: get_simple_version("node", "--version"),
        npm_version: get_simple_version("npm", "--version"),
        cargo_version: get_simple_version("cargo", "--version"),
        rustc_version: get_simple_version("rustc", "--version"),
    }
}

fn check_command_exists(cmd: &str) -> bool {
    #[cfg(target_os = "windows")]
    {
        let output = Command::new("cmd")
            .args(&["/C", &format!("where {}", cmd)])
            .output();
        
        match output {
            Ok(output) => {
                if output.status.success() {
                    // 检查输出是否为空
                    let stdout = String::from_utf8_lossy(&output.stdout);
                    !stdout.trim().is_empty()
                } else {
                    false
                }
            }
            Err(_) => false,
        }
    }
    
    #[cfg(not(target_os = "windows"))]
    {
        let output = Command::new("which")
            .arg(cmd)
            .output();
        
        if let Ok(output) = output {
            output.status.success()
        } else {
            false
        }
    }
}

fn get_simple_version(cmd: &str, arg: &str) -> Option<String> {
    let cmd_str = format!("{} {}", cmd, arg);
    let output = run_command(&cmd_str)?;
    
    if !output.status.success() {
        return None;
    }
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    Some(stdout.trim().to_string())
}

pub fn detect_installed_tools(ignored_list: &[String]) -> Vec<CliTool> {
    let definitions = CliToolsRegistry::get_supported_tools();
    let ignored: Vec<String> = ignored_list.iter().map(|s| s.to_lowercase()).collect();
    
    definitions
        .into_iter()
        .map(|def| detect_tool(&def, &ignored))
        .collect()
}

fn detect_tool(definition: &CliToolDefinition, ignored: &[String]) -> CliTool {
    let is_ignored = ignored.contains(&definition.name.to_lowercase());
    
    // 第一步：检查命令是否存在
    let is_installed = check_command_exists(&definition.name);
    
    if is_installed {
        // 命令存在，尝试获取版本和路径
        let version = get_tool_version(definition).unwrap_or_else(|| String::from("未知"));
        let path = find_tool_path(&definition.name);
        
        CliTool {
            name: definition.name.clone(),
            display_name: definition.display_name.clone(),
            current_version: version,
            latest_version: None,
            path,
            update_available: false,
            can_auto_update: definition.can_auto_update,
            install_command: definition.install_command.clone(),
            update_command: Some(definition.update_command.clone()),
            ignored: is_ignored,
            status: if is_ignored { ToolStatus::Ignored } else { ToolStatus::UpToDate },
        }
    } else {
        // 命令不存在
        CliTool {
            name: definition.name.clone(),
            display_name: definition.display_name.clone(),
            current_version: String::new(),
            latest_version: None,
            path: None,
            update_available: false,
            can_auto_update: definition.can_auto_update,
            install_command: definition.install_command.clone(),
            update_command: Some(definition.update_command.clone()),
            ignored: is_ignored,
            status: if is_ignored { ToolStatus::Ignored } else { ToolStatus::NotInstalled },
        }
    }
}

fn get_tool_version(definition: &CliToolDefinition) -> Option<String> {
    let output = run_command(&definition.version_command)?;
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let output_text = if !stdout.is_empty() { &stdout } else { &stderr };
    
    for line in output_text.lines() {
        let trimmed = line.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }
    
    None
}

fn run_command(cmd_str: &str) -> Option<std::process::Output> {
    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(&["/C", cmd_str])
            .output()
            .ok()
    }
    
    #[cfg(not(target_os = "windows"))]
    {
        let (program, args) = split_command(cmd_str);
        let mut command = Command::new(program);
        command.args(&args);
        command.output().ok()
    }
}

pub fn find_tool_path(name: &str) -> Option<String> {
    #[cfg(target_os = "windows")]
    {
        let output = Command::new("cmd")
            .args(&["/C", &format!("where {}", name)])
            .output()
            .ok()?;
        
        if output.status.success() {
            let result = String::from_utf8_lossy(&output.stdout);
            let first = result.lines().next();
            first.map(|s| s.trim().to_string())
        } else {
            None
        }
    }
    
    #[cfg(not(target_os = "windows"))]
    {
        let output = Command::new("which")
            .arg(name)
            .output()
            .ok()?;
        
        if output.status.success() {
            Some(String::from_utf8_lossy(&output.stdout).trim().to_string())
        } else {
            None
        }
    }
}

fn split_command(cmd: &str) -> (&str, Vec<&str>) {
    let parts: Vec<&str> = cmd.trim().split_whitespace().collect();
    if parts.is_empty() {
        ("", vec![])
    } else {
        (parts[0], parts[1..].to_vec())
    }
}
