# Coder Manager - QWEN.md

## 项目概述

Coder Manager 是一个桌面应用程序，用于管理和更新开发相关的 CLI 工具。采用 **Tauri 2.x** 框架构建，前端使用 **React 19 + TypeScript**，后端使用 **Rust**。

### 核心功能
- 自动检测系统已安装的 CLI 工具（Node.js、Rust、Git、Docker、OpenAI Codex、Claude Code、Gemini CLI、Qwen Code、MiMo Code 等 15 种工具）
- 检查工具更新
- 支持单个/批量更新工具
- 忽略特定工具的更新提醒
- 深色主题界面

### 技术栈
| 层 | 技术 |
|---|---|
| 前端 | React 19, TypeScript, Vite 8 |
| 后端 | Rust (Tauri 2.x) |
| 打包 | Tauri bundle (MSI/macOS/Linux) |

### 项目结构
```
coder-manager/
├── src/                      # 前端源代码
│   ├── components/           # React 组件 (Header, ToolList, ToolDetail, EnvDetail, StatusBar)
│   ├── pages/                # 页面组件
│   ├── api/                  # Tauri invoke 调用封装
│   ├── types/                # TypeScript 类型定义
│   ├── App.tsx               # 应用根组件
│   └── main.tsx              # 入口
├── src-tauri/                # Rust 后端
│   ├── src/
│   │   ├── main.rs           # Tauri 入口
│   │   ├── lib.rs            # Tauri commands 注册 + 模块声明
│   │   ├── cli_tools.rs      # CLI 工具定义
│   │   ├── detection.rs      # 工具检测逻辑
│   │   ├── version_check.rs  # 版本检查
│   │   ├── updater.rs        # 更新逻辑
│   │   └── config.rs         # 应用配置 (忽略列表等)
│   ├── tauri.conf.json       # Tauri 配置
│   └── Cargo.toml            # Rust 依赖
├── dist/                     # 前端构建输出
├── package.json              # npm 脚本 + 依赖
└── vite.config.ts            # Vite 配置
```

## 构建和运行

### 前置要求
- **Node.js** (LTS 推荐) + npm
- **Rust** (通过 rustup 安装)
- **Visual Studio Build Tools** (Windows，需 C++ 构建工具)

### 常用命令

| 命令 | 说明 |
|------|------|
| `npm install` | 安装前端依赖 |
| `npm run tauri dev` | 启动开发模式 (Vite + Tauri 窗口) |
| `npm run tauri build` | 构建生产版本 |
| `npm run dev` | 仅启动 Vite 开发服务器 (http://localhost:5173) |
| `npm run build` | 仅构建前端 (`tsc -b && vite build`) |
| `npm run lint` | ESLint 检查 |
| `npm run preview` | 预览构建后的前端 |

### 构建输出
- Windows: `src-tauri/target/release/bundle/msi/`
- macOS: `src-tauri/target/release/bundle/macos/`
- Linux: `src-tauri/target/release/bundle/`

## 开发约定

### 前端
- React 19 + TypeScript，使用函数组件 + Hooks
- 组件放在 `src/components/`，页面放在 `src/pages/`
- 通过 `@tauri-apps/api` 的 `invoke()` 调用后端命令
- ESLint 配置: `@eslint/js`, `typescript-eslint`, `react-hooks`, `react-refresh`

### 后端
- Rust 2021 edition, MSRV 1.77.2
- Tauri commands 在 `src-tauri/src/lib.rs` 中用 `#[tauri::command]` 定义并注册
- 添加新工具支持: 编辑 `src-tauri/src/cli_tools.rs`
- 依赖: serde, regex, dirs, chrono, tauri-plugin-log

### TypeScript 配置
- 使用项目引用: `tsconfig.json` → `tsconfig.app.json` + `tsconfig.node.json`
- 构建命令 `npm run build` 会先运行 `tsc -b` 做类型检查

## Tauri Commands 清单

| Command | 参数 | 返回值 | 说明 |
|---------|------|--------|------|
| `get_env_check` | 无 | `EnvCheck` | 检查环境依赖 |
| `get_env_path` | `name: String` | `Option<String>` | 查找工具路径 |
| `get_installed_tools` | 无 | `Vec<CliTool>` | 获取已安装工具列表 |
| `refresh_tools` | 无 | `Vec<CliTool>` | 刷新工具列表 |
| `check_for_updates` | 无 | `Vec<CliTool>` | 检查更新 |
| `update_single_tool` | `tool: CliTool` | `Result<String, String>` | 更新单个工具 |
| `update_tool` | `name: String` | `Result<String, String>` | 按名称更新工具 |
| `update_all_tools` | `tools: Vec<CliTool>` | `Vec<(String, Result<String, String>)>` | 批量更新 |
| `batch_update_tools` | `names: Vec<String>` | `Vec<(String, Result<String, String>)>` | 按名称批量更新 |
| `get_config` | 无 | `AppConfig` | 获取配置 |
| `save_config` | `config: AppConfig` | `Result<(), String>` | 保存配置 |
| `ignore_tool` | `tool_name: String` | `Result<(), String>` | 忽略工具 |
| `unignore_tool` | `tool_name: String` | `Result<(), String>` | 取消忽略 |
