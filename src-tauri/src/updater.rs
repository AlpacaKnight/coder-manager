use super::cli_tools::{CliTool, CliToolDefinition};
use std::process::Command;

pub fn update_tool(tool: &CliTool) -> Result<String, String> {
    let update_cmd = tool.update_command.as_ref()
        .and_then(|c| if c.is_empty() { None } else { Some(c) })
        .ok_or_else(|| "This tool cannot be auto-updated".to_string())?;

    let (program, args) = split_command(update_cmd);

    let mut command = if cfg!(target_os = "windows") {
        let mut cmd = Command::new("cmd");
        cmd.arg("/c");
        cmd.arg(update_cmd);
        cmd
    } else {
        let mut cmd = Command::new(program);
        cmd.args(&args);
        cmd
    };

    let output = command
        .output()
        .map_err(|e| format!("Failed to execute update: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

pub fn install_tool(tool: &CliToolDefinition) -> Result<String, String> {
    let install_cmd = &tool.install_command;

    let output = if cfg!(target_os = "windows") {
        Command::new("cmd")
            .arg("/c")
            .arg(install_cmd)
            .output()
    } else {
        let (program, args) = split_command(install_cmd);
        Command::new(program)
            .args(&args)
            .output()
    }.map_err(|e| format!("Failed to execute install: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        if stderr.is_empty() {
            Err(format!("Installation failed for '{}'", tool.name))
        } else {
            Err(stderr)
        }
    }
}

pub fn batch_update_tools(tools: Vec<CliTool>) -> Vec<(String, Result<String, String>)> {
    tools
        .into_iter()
        .filter(|t| t.can_auto_update && !t.update_command.as_ref().map(|c| c.is_empty()).unwrap_or(true))
        .map(|tool| {
            let result = update_tool(&tool);
            (tool.name, result)
        })
        .collect()
}

fn split_command(cmd: &str) -> (&str, Vec<&str>) {
    let parts: Vec<&str> = cmd.trim().split_whitespace().collect();
    if parts.is_empty() {
        ("", vec![])
    } else {
        (parts[0], parts[1..].to_vec())
    }
}
