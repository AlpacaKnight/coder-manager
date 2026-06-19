---
name: add-cli-tool
description: Add a new CLI tool definition to the coder-manager project, including platform-specific commands, version detection, and build verification.
---

# 添加新 CLI 工具到 coder-manager

本技能覆盖向 coder-manager 项目添加新 CLI 工具的完整流程。所有步骤必须按顺序执行。

## 前置条件

- 确认新工具的：名称、npm/crates 包名、版本检测命令、版本号正则、安装方式
- 确认 Linux/macOS 是否需要与 Windows 不同的安装/更新命令（如 curl 脚本）

## 步骤

### 1. 在 `cli_tools.rs` 中添加工具定义

在 `CliToolsRegistry::get_supported_tools()` 的 `vec![]` 中添加新的 `CliToolDefinition`：

```rust
CliToolDefinition {
    name: "toolname".to_string(),           // 内部标识符，用于 config 持久化
    display_name: "Tool Name".to_string(),  // 前端显示名
    command_name: None,                      // 如果可执行文件名与 name 不同，设为 Some("实际命令名")
    version_command: "toolname --version".to_string(),
    version_regex: r"(\d+\.\d+\.\d+)".to_string(),
    latest_version_source: LatestVersionSource::Npm("@scope/package".to_string()),
    can_auto_update: true,
    update_command: "npm install -g @scope/package".to_string(),
    install_command: "npm install -g @scope/package".to_string(),
    #[cfg(not(target_os = "windows"))]
    install_command_unix: None,  // 如果 Linux/macOS 需要不同命令，设为 Some("curl ... | bash")
    #[cfg(not(target_os = "windows"))]
    update_command_unix: None,
}
```

**关键约定：**
- `command_name`: 仅当可执行文件名与 `name` 字段不同时设置（如 mimocode → mimo）。`detection.rs` 用它检测命令是否存在。
- `install_command_unix` / `update_command_unix`: 使用 `#[cfg(not(target_os = "windows"))]`，Linux 和 macOS 共用。
- 如果安装命令包含 `|`、`>`、`<`、`;`、`&` 等 shell 特殊字符，`updater.rs` 的 `execute_command()` 会自动用 `bash -c` 包装。

### 2. 更新 `README.md`

在 README 的支持工具列表中添加新工具名。

### 3. 更新 `QWEN.md`

更新工具数量（如 "15 种工具" → "16 种工具"）。

### 4. 验证构建

```bash
# 在 src-tauri 目录验证 Rust 编译
cd src-tauri && cargo check

# 在项目根目录验证前端构建
npm run build
```

两步都必须通过，不能有编译错误。

### 5. （可选）启动开发模式测试

```bash
npm run tauri dev
```

确认新工具在 UI 中正确显示、版本检测正常。

## 注意事项

- TypeScript 类型 `CliTool`（`src/types/index.ts`）与 Rust `CliTool` 结构体必须保持一致（serde → JSON → TS）。
- 新增的 `CliToolDefinition` 字段如果有 `#[cfg]` 属性，所有现有工具定义也需要加上对应的 `None` 值。
- 并行检测（`rayon`）会自动处理新工具，无需额外配置。
