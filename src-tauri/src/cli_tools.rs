use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CliTool {
    pub name: String,
    pub display_name: String,
    pub current_version: String,
    pub latest_version: Option<String>,
    pub path: Option<String>,
    pub update_available: bool,
    pub can_auto_update: bool,
    pub install_command: String,
    pub update_command: Option<String>,
    pub ignored: bool,
    pub status: ToolStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ToolStatus {
    UpToDate,
    UpdateAvailable,
    ManualUpdate,
    NotInstalled,
    Ignored,
    Error,
    Checking,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnvCheck {
    pub node_available: bool,
    pub npm_available: bool,
    pub cargo_available: bool,
    pub rustc_available: bool,
    pub node_version: Option<String>,
    pub npm_version: Option<String>,
    pub cargo_version: Option<String>,
    pub rustc_version: Option<String>,
}

pub struct CliToolsRegistry;

impl CliToolsRegistry {
    pub fn get_supported_tools() -> Vec<CliToolDefinition> {
        vec![
            CliToolDefinition {
                name: "abtop".to_string(),
                display_name: "abtop".to_string(),
                command_name: None,
                version_command: "abtop --version".to_string(),
                version_regex: r"(\d+\.\d+\.\d+)".to_string(),
                latest_version_source: LatestVersionSource::CratesIo("abtop".to_string()),
                can_auto_update: true,
                update_command: "cargo install abtop --force".to_string(),
                install_command: "cargo install abtop".to_string(),
                #[cfg(not(target_os = "windows"))]
                install_command_unix: None,
                #[cfg(not(target_os = "windows"))]
                update_command_unix: None,
            },
            CliToolDefinition {
                name: "codex".to_string(),
                display_name: "OpenAI Codex".to_string(),
                command_name: None,
                version_command: "npm list -g @openai/codex --depth=0".to_string(),
                version_regex: r"@openai/codex@(\d+\.\d+\.\d+)".to_string(),
                latest_version_source: LatestVersionSource::Npm("@openai/codex".to_string()),
                can_auto_update: true,
                update_command: "npm install -g @openai/codex".to_string(),
                install_command: "npm install -g @openai/codex".to_string(),
                #[cfg(not(target_os = "windows"))]
                install_command_unix: None,
                #[cfg(not(target_os = "windows"))]
                update_command_unix: None,
            },
            CliToolDefinition {
                name: "claude".to_string(),
                display_name: "Claude Code".to_string(),
                command_name: None,
                version_command: "claude --version".to_string(),
                version_regex: r"(\d+\.\d+\.\d+)".to_string(),
                latest_version_source: LatestVersionSource::Npm(
                    "@anthropic-ai/claude-code".to_string(),
                ),
                can_auto_update: true,
                update_command: "claude install".to_string(),
                install_command: "npm install -g @anthropic-ai/claude-code".to_string(),
                #[cfg(not(target_os = "windows"))]
                install_command_unix: None,
                #[cfg(not(target_os = "windows"))]
                update_command_unix: None,
            },
            CliToolDefinition {
                name: "opencode".to_string(),
                display_name: "OpenCode".to_string(),
                command_name: None,
                version_command: "opencode -v".to_string(),
                version_regex: r"(\d+\.\d+\.\d+)".to_string(),
                latest_version_source: LatestVersionSource::Npm("opencode-ai".to_string()),
                can_auto_update: true,
                update_command: "npm install -g opencode-ai".to_string(),
                install_command: "npm install -g opencode-ai".to_string(),
                #[cfg(not(target_os = "windows"))]
                install_command_unix: Some("curl -fsSL https://opencode.ai/install | bash".to_string()),
                #[cfg(not(target_os = "windows"))]
                update_command_unix: Some("curl -fsSL https://opencode.ai/install | bash".to_string()),
            },
            CliToolDefinition {
                name: "mimocode".to_string(),
                display_name: "MiMo Code".to_string(),
                command_name: Some("mimo".to_string()),
                version_command: "mimo --version".to_string(),
                version_regex: r"(\d+\.\d+\.\d+)".to_string(),
                latest_version_source: LatestVersionSource::Npm("@mimo-ai/cli".to_string()),
                can_auto_update: true,
                update_command: "npm install -g @mimo-ai/cli".to_string(),
                install_command: "npm install -g @mimo-ai/cli".to_string(),
                #[cfg(not(target_os = "windows"))]
                install_command_unix: Some("curl -fsSL https://mimo.xiaomi.com/install | bash".to_string()),
                #[cfg(not(target_os = "windows"))]
                update_command_unix: Some("curl -fsSL https://mimo.xiaomi.com/install | bash".to_string()),
            },
            CliToolDefinition {
                name: "kimi".to_string(),
                display_name: "Kimi Code".to_string(),
                command_name: None,
                version_command: "kimi --version".to_string(),
                version_regex: r"(\d+\.\d+\.\d+)".to_string(),
                latest_version_source: LatestVersionSource::Npm(
                    "@moonshot-ai/kimi-code".to_string(),
                ),
                can_auto_update: true,
                update_command: "npm install -g @moonshot-ai/kimi-code@latest".to_string(),
                install_command: "npm install -g @moonshot-ai/kimi-code@latest".to_string(),
                #[cfg(not(target_os = "windows"))]
                install_command_unix: Some("curl -fsSL https://code.kimi.com/kimi-code/install.sh | bash".to_string()),
                #[cfg(not(target_os = "windows"))]
                update_command_unix: Some("curl -fsSL https://code.kimi.com/kimi-code/install.sh | bash".to_string()),
            },
            CliToolDefinition {
                name: "qwen".to_string(),
                display_name: "QwenCode".to_string(),
                command_name: None,
                version_command: "qwen -v".to_string(),
                version_regex: r"(\d+\.\d+\.\d+)".to_string(),
                latest_version_source: LatestVersionSource::Npm("@qwen-code/qwen-code".to_string()),
                can_auto_update: true,
                update_command: "npm install -g @qwen-code/qwen-code@latest".to_string(),
                install_command: "npm install -g @qwen-code/qwen-code@latest".to_string(),
                #[cfg(not(target_os = "windows"))]
                install_command_unix: None,
                #[cfg(not(target_os = "windows"))]
                update_command_unix: None,
            },
            CliToolDefinition {
                name: "codebuddy".to_string(),
                display_name: "codebuddy-code".to_string(),
                command_name: None,
                version_command: "codebuddy --version".to_string(),
                version_regex: r"(\d+\.\d+\.\d+)".to_string(),
                latest_version_source: LatestVersionSource::Npm(
                    "@tencent-ai/codebuddy-code".to_string(),
                ),
                can_auto_update: true,
                update_command: "npm install -g @tencent-ai/codebuddy-code".to_string(),
                install_command: "npm install -g @tencent-ai/codebuddy-code".to_string(),
                #[cfg(not(target_os = "windows"))]
                install_command_unix: None,
                #[cfg(not(target_os = "windows"))]
                update_command_unix: None,
            },
            CliToolDefinition {
                name: "deepcode".to_string(),
                display_name: "deepcode-cli".to_string(),
                command_name: None,
                version_command: "deepcode --version".to_string(),
                version_regex: r"(\d+\.\d+\.\d+)".to_string(),
                latest_version_source: LatestVersionSource::Npm("@vegamo/deepcode-cli".to_string()),
                can_auto_update: true,
                update_command: "npm install -g @vegamo/deepcode-cli".to_string(),
                install_command: "npm install -g @vegamo/deepcode-cli".to_string(),
                #[cfg(not(target_os = "windows"))]
                install_command_unix: None,
                #[cfg(not(target_os = "windows"))]
                update_command_unix: None,
            },
            CliToolDefinition {
                name: "kilo".to_string(),
                display_name: "kilo-cli".to_string(),
                command_name: None,
                version_command: "kilo --version".to_string(),
                version_regex: r"(\d+\.\d+\.\d+)".to_string(),
                latest_version_source: LatestVersionSource::Npm("@kilocode/cli".to_string()),
                can_auto_update: true,
                update_command: "kilo upgrade".to_string(),
                install_command: "npm install -g @kilocode/cli".to_string(),
                #[cfg(not(target_os = "windows"))]
                install_command_unix: Some("curl -fsSL https://kilo.ai/cli/install | bash".to_string()),
                #[cfg(not(target_os = "windows"))]
                update_command_unix: None,
            },
            CliToolDefinition {
                name: "reasonix".to_string(),
                display_name: "Reasonix".to_string(),
                command_name: None,
                version_command: "reasonix --version".to_string(),
                version_regex: r"(\d+\.\d+\.\d+)".to_string(),
                latest_version_source: LatestVersionSource::Npm("reasonix".to_string()),
                can_auto_update: true,
                update_command: "npm install -g reasonix".to_string(),
                install_command: "npm install -g reasonix".to_string(),
                #[cfg(not(target_os = "windows"))]
                install_command_unix: None,
                #[cfg(not(target_os = "windows"))]
                update_command_unix: None,
            },
            CliToolDefinition {
                name: "gemini".to_string(),
                display_name: "Gemini CLI".to_string(),
                command_name: None,
                version_command: "gemini --version".to_string(),
                version_regex: r"(\d+\.\d+\.\d+)".to_string(),
                latest_version_source: LatestVersionSource::Npm("@google/gemini-cli".to_string()),
                can_auto_update: true,
                update_command: "npm install -g @google/gemini-cli".to_string(),
                install_command: "npm install -g @google/gemini-cli".to_string(),
                #[cfg(not(target_os = "windows"))]
                install_command_unix: None,
                #[cfg(not(target_os = "windows"))]
                update_command_unix: None,
            },
        ]
    }
}

#[derive(Debug, Clone)]
pub struct CliToolDefinition {
    pub name: String,
    pub display_name: String,
    pub command_name: Option<String>,
    pub version_command: String,
    pub version_regex: String,
    pub latest_version_source: LatestVersionSource,
    pub can_auto_update: bool,
    pub update_command: String,
    pub install_command: String,
    #[cfg(not(target_os = "windows"))]
    pub install_command_unix: Option<String>,
    #[cfg(not(target_os = "windows"))]
    pub update_command_unix: Option<String>,
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub enum LatestVersionSource {
    Npm(String),
    CratesIo(String),
    Rust,
    Manual,
}
