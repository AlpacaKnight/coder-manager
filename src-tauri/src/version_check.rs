use super::cli_tools::{CliTool, CliToolsRegistry, LatestVersionSource, ToolStatus};
use regex::Regex;
use std::collections::HashMap;
use std::process::{Command, Output, Stdio};
use std::thread;
use std::time::{Duration, Instant};

const VERSION_QUERY_TIMEOUT: Duration = Duration::from_secs(8);

pub fn check_for_updates(tools: &mut [CliTool]) {
    let version_sources: HashMap<String, LatestVersionSource> =
        CliToolsRegistry::get_supported_tools()
            .into_iter()
            .map(|tool| (tool.name, tool.latest_version_source))
            .collect();

    let mut tasks = Vec::new();
    for tool in tools.iter() {
        if tool.ignored {
            continue;
        }
        if tool.current_version.is_empty() {
            continue;
        }
        let Some(source) = version_sources.get(&tool.name) else {
            continue;
        };
        if matches!(source, LatestVersionSource::Manual) {
            continue;
        }
        tasks.push((tool.name.clone(), source.clone()));
    }

    let mut handles = Vec::new();
    for (name, source) in tasks {
        let handle = std::thread::spawn(move || {
            let res = get_latest_version(&source);
            (name, res)
        });
        handles.push(handle);
    }

    let mut results = HashMap::new();
    for handle in handles {
        if let Ok((name, res)) = handle.join() {
            results.insert(name, res);
        }
    }

    for tool in tools.iter_mut() {
        if tool.ignored {
            tool.status = ToolStatus::Ignored;
            continue;
        }

        if tool.current_version.is_empty() {
            tool.status = ToolStatus::NotInstalled;
            continue;
        }

        let Some(source) = version_sources.get(&tool.name) else {
            tool.status = ToolStatus::Error;
            continue;
        };

        if matches!(source, LatestVersionSource::Manual) {
            tool.status = ToolStatus::ManualUpdate;
            continue;
        }

        if let Some(res) = results.remove(&tool.name) {
            match res {
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
                    tool.status = ToolStatus::Error;
                }
            }
        } else {
            tool.status = ToolStatus::Error;
        }
    }
}

pub fn get_latest_version(source: &LatestVersionSource) -> Result<String, String> {
    match source {
        LatestVersionSource::Npm(package) => get_npm_latest_version(package),
        LatestVersionSource::CratesIo(package) => get_crates_latest_version(package),
        LatestVersionSource::Rust => get_rust_latest_version(),
        LatestVersionSource::Manual => Err("No automatic version source available".to_string()),
    }
}

fn get_npm_latest_version(package: &str) -> Result<String, String> {
    let output = run_command_with_timeout(
        "npm",
        &["view", package, "version"],

        VERSION_QUERY_TIMEOUT,
    )?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

fn get_crates_latest_version(package: &str) -> Result<String, String> {
    let output = run_command_with_timeout(
        "cargo",
        &["search", package, "--limit", "1", "--registry", "crates-io"],
        VERSION_QUERY_TIMEOUT,
    )?;

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        let pattern = format!(r#"(?m)^{}\s*=\s*"([^"]+)""#, regex::escape(package));
        let regex = Regex::new(&pattern).map_err(|e| e.to_string())?;
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
    let output = run_command_with_timeout("rustup", &["show"], VERSION_QUERY_TIMEOUT)?;

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

fn run_command_with_timeout(
    program: &str,
    args: &[&str],
    timeout: Duration,
) -> Result<Output, String> {
    #[cfg(target_os = "windows")]
    let executable = if program.eq_ignore_ascii_case("npm") {
        "npm.cmd"
    } else {
        program
    };
    #[cfg(not(target_os = "windows"))]
    let executable = program;

    let mut child = Command::new(executable)        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start {}: {}", program, e))?;

    let started = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(_)) => {
                return child
                    .wait_with_output()
                    .map_err(|e| format!("Failed to read {} output: {}", program, e));
            }
            Ok(None) if started.elapsed() >= timeout => {
                let _ = child.kill();
                let _ = child.wait_with_output();
                return Err(format!(
                    "{} timed out after {}s",
                    program,
                    timeout.as_secs()
                ));
            }
            Ok(None) => thread::sleep(Duration::from_millis(50)),
            Err(e) => return Err(format!("Failed to wait for {}: {}", program, e)),
        }
    }
}
