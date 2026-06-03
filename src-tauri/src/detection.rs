use super::cli_tools::{CliTool, CliToolDefinition, CliToolsRegistry, EnvCheck, ToolStatus};
use regex::Regex;
use std::collections::HashSet;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};
use std::thread;
use std::time::{Duration, Instant};

const SHELL_COMMAND_TIMEOUT: Duration = Duration::from_secs(5);

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
        let output = run_login_shell_command(&format!("command -v -- {}", shell_escape(cmd)));

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
    stdout.lines().filter_map(non_empty_line).last()
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
            update_command: command_option(&definition.update_command),
            ignored: is_ignored,
            status: if is_ignored {
                ToolStatus::Ignored
            } else {
                ToolStatus::UpToDate
            },
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
            update_command: command_option(&definition.update_command),
            ignored: is_ignored,
            status: if is_ignored {
                ToolStatus::Ignored
            } else {
                ToolStatus::NotInstalled
            },
        }
    }
}

fn get_tool_version(definition: &CliToolDefinition) -> Option<String> {
    let output = run_command(&definition.version_command)?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let output_text = if !stdout.is_empty() { &stdout } else { &stderr };
    let regex = Regex::new(&definition.version_regex).ok();
    let mut fallback = None;

    for line in output_text.lines().filter_map(non_empty_line) {
        if let Some(regex) = &regex {
            if let Some(version) = regex
                .captures(&line)
                .and_then(|captures| captures.get(1))
                .map(|match_| match_.as_str().to_string())
            {
                return Some(version);
            }
        }
        fallback = Some(line);
    }

    fallback
}

fn command_option(command: &str) -> Option<String> {
    if command.is_empty() {
        None
    } else {
        Some(command.to_string())
    }
}

fn non_empty_line(line: &str) -> Option<String> {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn run_command(cmd_str: &str) -> Option<std::process::Output> {
    #[cfg(target_os = "windows")]
    {
        Command::new("cmd").args(&["/C", cmd_str]).output().ok()
    }

    #[cfg(not(target_os = "windows"))]
    {
        run_login_shell_command(cmd_str).ok()
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
        let output =
            run_login_shell_command(&format!("command -v -- {}", shell_escape(name))).ok()?;

        if output.status.success() {
            String::from_utf8_lossy(&output.stdout)
                .lines()
                .filter_map(non_empty_line)
                .last()
        } else {
            None
        }
    }
}

#[cfg(not(target_os = "windows"))]
fn run_login_shell_command(cmd: &str) -> std::io::Result<Output> {
    let path = enriched_path();
    let shell_cmd = format!(
        "if [ -f ~/.bashrc ]; then source ~/.bashrc >/dev/null 2>/dev/null; fi; export PATH={}:$PATH; {}",
        shell_escape(&path),
        cmd
    );
    let mut child = Command::new("bash")
        .args(["-lc", &shell_cmd])
        .env("PATH", &path)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;

    let started = Instant::now();
    loop {
        match child.try_wait()? {
            Some(_) => return child.wait_with_output(),
            None if started.elapsed() >= SHELL_COMMAND_TIMEOUT => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(std::io::Error::new(
                    std::io::ErrorKind::TimedOut,
                    format!(
                        "shell command timed out after {}s",
                        SHELL_COMMAND_TIMEOUT.as_secs()
                    ),
                ));
            }
            None => thread::sleep(Duration::from_millis(50)),
        }
    }
}

#[cfg(not(target_os = "windows"))]
fn enriched_path() -> String {
    let mut paths = Vec::new();
    let mut seen = HashSet::new();

    if let Ok(path) = env::var("PATH") {
        for entry in env::split_paths(&path) {
            push_existing_path(&mut paths, &mut seen, entry);
        }
    }

    if let Some(home) = env::var_os("HOME").map(PathBuf::from) {
        push_existing_path(&mut paths, &mut seen, home.join(".local/bin"));
        push_existing_path(&mut paths, &mut seen, home.join(".cargo/bin"));
        push_existing_path(&mut paths, &mut seen, home.join(".npm-global/bin"));
        push_existing_path(&mut paths, &mut seen, home.join(".volta/bin"));
        push_existing_path(&mut paths, &mut seen, home.join(".asdf/shims"));
        push_existing_path(&mut paths, &mut seen, home.join(".fnm/aliases/default/bin"));

        push_node_version_bins(&mut paths, &mut seen, &home.join(".nvm/versions/node"));
        push_node_version_bins(
            &mut paths,
            &mut seen,
            &home.join(".local/share/fnm/node-versions"),
        );
    }

    env::join_paths(paths)
        .unwrap_or_default()
        .to_string_lossy()
        .to_string()
}

#[cfg(not(target_os = "windows"))]
fn push_existing_path(paths: &mut Vec<PathBuf>, seen: &mut HashSet<PathBuf>, path: PathBuf) {
    if !path.is_dir() {
        return;
    }

    let canonical = path.canonicalize().unwrap_or(path);
    if seen.insert(canonical.clone()) {
        paths.push(canonical);
    }
}

#[cfg(not(target_os = "windows"))]
fn push_node_version_bins(paths: &mut Vec<PathBuf>, seen: &mut HashSet<PathBuf>, root: &Path) {
    let Ok(entries) = fs::read_dir(root) else {
        return;
    };

    let mut bins: Vec<PathBuf> = entries
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .flat_map(|path| [path.join("bin"), path.join("installation/bin")])
        .filter(|path| path.is_dir())
        .collect();

    bins.sort();
    bins.reverse();

    for bin in bins {
        push_existing_path(paths, seen, bin);
    }
}

#[cfg(not(target_os = "windows"))]
fn shell_escape(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}
