use super::cli_tools::{CliToolDefinition, LatestVersionSource};
#[cfg(not(target_os = "windows"))]
use crate::detection;
use std::io::Read;
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// 安装/更新/卸载命令的超时时间（5 分钟），避免网络慢或交互式命令永久阻塞
const COMMAND_TIMEOUT: Duration = Duration::from_secs(300);

fn execute_command(cmd: &str, tool_name: &str, operation: &str) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    let mut cmd_obj = {
        let mut c = Command::new("cmd");
        c.arg("/c").arg(cmd);
        c.creation_flags(CREATE_NO_WINDOW);
        c
    };

    #[cfg(not(target_os = "windows"))]
    let mut cmd_obj = {
        // 对于包含特殊字符（管道、重定向等）的命令，需要通过 shell 执行
        if cmd.contains('|')
            || cmd.contains('>')
            || cmd.contains('<')
            || cmd.contains(';')
            || cmd.contains('&')
        {
            let mut c = Command::new("bash");
            c.arg("-c")
                .arg(cmd)
                .env("PATH", detection::enriched_path());
            c
        } else {
            // 使用 shlex 拆分命令，正确处理带空格的引号参数
            let parts = shlex::split(cmd).unwrap_or_default();
            if parts.is_empty() {
                // 退化为直接执行整个字符串（让系统报错）
                let mut c = Command::new(cmd);
                c.env("PATH", detection::enriched_path());
                c
            } else {
                let mut c = Command::new(&parts[0]);
                c.args(&parts[1..])
                    .env("PATH", detection::enriched_path());
                c
            }
        }
    };

    cmd_obj
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = cmd_obj
        .spawn()
        .map_err(|e| format!("Failed to execute {}: {}", operation, e))?;

    // 在单独线程读取 stdout/stderr，避免管道缓冲写满后子进程阻塞导致死锁
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let stdout_handle = thread::spawn(move || -> Vec<u8> {
        let mut buf = Vec::new();
        if let Some(mut s) = stdout {
            let _ = s.read_to_end(&mut buf);
        }
        buf
    });
    let stderr_handle = thread::spawn(move || -> Vec<u8> {
        let mut buf = Vec::new();
        if let Some(mut s) = stderr {
            let _ = s.read_to_end(&mut buf);
        }
        buf
    });

    let started = Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if started.elapsed() >= COMMAND_TIMEOUT => {
                let _ = child.kill();
                let _ = child.wait();
                let _ = stdout_handle.join();
                let _ = stderr_handle.join();
                return Err(format!(
                    "{} timed out after {}s for '{}'",
                    operation,
                    COMMAND_TIMEOUT.as_secs(),
                    tool_name
                ));
            }
            Ok(None) => thread::sleep(Duration::from_millis(100)),
            Err(e) => {
                let _ = stdout_handle.join();
                let _ = stderr_handle.join();
                return Err(format!("Failed to wait for {}: {}", operation, e));
            }
        }
    };

    let stdout_output = stdout_handle.join().unwrap_or_default();
    let stderr_output = stderr_handle.join().unwrap_or_default();

    if status.success() {
        Ok(String::from_utf8_lossy(&stdout_output).to_string())
    } else {
        let stderr = String::from_utf8_lossy(&stderr_output).to_string();
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
