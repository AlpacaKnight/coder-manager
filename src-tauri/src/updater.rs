use super::cli_tools::{CliTool, CliToolDefinition, LatestVersionSource};
use crate::cli_tools::CliToolsRegistry;
use std::process::Command;

fn execute_command(cmd: &str, tool_name: &str, operation: &str) -> Result<String, String> {
    let output = if cfg!(target_os = "windows") {
        Command::new("cmd").arg("/c").arg(cmd).output()
    } else {
        // 对于包含特殊字符（管道、重定向等）的命令，需要通过 shell 执行
        if cmd.contains('|') || cmd.contains('>') || cmd.contains('<') || cmd.contains(';') || cmd.contains('&') {
            Command::new("bash").arg("-c").arg(cmd).output()
        } else {
            let (program, args) = split_command(cmd);
            Command::new(program).args(&args).output()
        }
    }
    .map_err(|e| format!("Failed to execute {}: {}", operation, e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        if stderr.is_empty() {
            Err(format!("{} failed for '{}'", operation, tool_name))
        } else {
            Err(stderr)
        }
    }
}

pub fn update_tool_by_definition(tool: &CliToolDefinition) -> Result<String, String> {
    let update_cmd = get_update_command(tool)?;
    execute_command(&update_cmd, &tool.name, "Update")
}

fn get_update_command(tool: &CliToolDefinition) -> Result<String, String> {
    #[cfg(not(target_os = "windows"))]
    {
        if let Some(cmd) = &tool.update_command_unix {
            return Ok(cmd.clone());
        }
    }
    Ok(tool.update_command.clone())
}

pub fn install_tool(tool: &CliToolDefinition) -> Result<String, String> {
    let install_cmd = get_install_command(tool)?;
    execute_command(&install_cmd, &tool.name, "Installation")
}

fn get_install_command(tool: &CliToolDefinition) -> Result<String, String> {
    #[cfg(not(target_os = "windows"))]
    {
        if let Some(cmd) = &tool.install_command_unix {
            return Ok(cmd.clone());
        }
    }
    Ok(tool.install_command.clone())
}

pub fn get_update_command_for_display(tool: &CliToolDefinition) -> String {
    #[cfg(not(target_os = "windows"))]
    {
        if let Some(cmd) = &tool.update_command_unix {
            return cmd.clone();
        }
    }
    tool.update_command.clone()
}

pub fn uninstall_tool(tool: &CliToolDefinition) -> Result<String, String> {
    let uninstall_cmd = get_uninstall_command(tool)?;
    execute_command(&uninstall_cmd, &tool.name, "Uninstall")
}

fn get_uninstall_command(tool: &CliToolDefinition) -> Result<String, String> {
    match &tool.latest_version_source {
        LatestVersionSource::Npm(package) => Ok(format!("npm uninstall -g {}", package)),
        LatestVersionSource::CratesIo(crate_name) => Ok(format!("cargo uninstall {}", crate_name)),
        _ => Err(format!("Tool '{}' cannot be auto-uninstalled", tool.name)),
    }
}

pub fn batch_update_tools(tools: Vec<CliTool>) -> Vec<(String, Result<String, String>)> {
    tools
        .into_iter()
        .filter(|t| {
            t.can_auto_update
                && !t
                    .update_command
                    .as_ref()
                    .map(|c| c.is_empty())
                    .unwrap_or(true)
        })
        .map(|tool| {
            let result = update_tool_by_name(&tool.name);
            (tool.name, result)
        })
        .collect()
}

fn update_tool_by_name(name: &str) -> Result<String, String> {
    let definitions = CliToolsRegistry::get_supported_tools();
    let def = definitions.into_iter().find(|d| d.name == name);
    if let Some(def) = def {
        update_tool_by_definition(&def)
    } else {
        Err(format!("Tool '{}' not found", name))
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
