# Coder Manager - CLI 工具管理器

一个极速、全异步、无阻塞的桌面应用程序，用于管理和更新开发相关的 AI 辅助与开发业务 CLI 工具。

## 功能特性

- **启动极速秒开（< 5ms）**：摒弃了启动时的阻塞等待遮罩，启动时瞬间渲染主界面架构，再通过后台分阶段（P1: 元信息、P2: 纯本地版本检测、P3: 异步并发网络请求）渲染数据，实现顶级流畅体验。
- **系统环境与业务工具剥离**：将 Node.js、npm、Cargo、Rustc 等底层平台开发环境从普通的业务 CLI 列表中剥离。在顶部状态栏以专属小图标的形式，对系统底座环境进行静默、独立的健康度及版本检测。
- **全异步无阻塞架构**：
  - 后端 Rust 端所有重型、耗时的 CLI 安装与更新指令（如 [src-tauri/src/lib.rs](src-tauri/src/lib.rs) 中的 `update_tool` 和 `install_tool`）均改写为 `async fn` 并使用 `tauri::async_runtime::spawn_blocking` 与主线程物理脱离。即使在后台更新大型工具，界面依然 100% 保持满帧率流畅响应。
  - 前端 React 摒弃一刀切的全局布尔值，基于 `updatingTools` 完成了精细化的“单工具级”锁定。更新单个工具时，仅使选中工具的相关按钮进入加载状态，不干扰全局界面的正常操作。
- **自动检测系统/项目内业务 CLI 版本**。
- **支持自动/手动一键更新升级**。
- **允许忽略/恢复特定工具的更新提醒**。
- **优雅的深色主题响应式主面板**。

## 支持的平台

- ✅ Windows
- ✅ macOS
- ✅ Linux

## 支持的项目/业务工具

目前我们精心聚焦于 AI 辅助和特定业务命令行工具（排除了 Node、Rust、Docker、Git 等系统底层运行环境），具体如下：

- abtop (Crates.io)
- OpenAI Codex
- Claude Code
- Gemini CLI
- OpenCode
- QwenCode
- Kimi Code
- deepcode-cli
- codebuddy-code
- kilo-cli
- 百炼 CLI
- Reasonix
- MiMo Code

具体的工具注册清单和可升级指令，可在 [src-tauri/src/cli_tools.rs](src-tauri/src/cli_tools.rs) 中获取与扩展。

## 项目核心系统组件

- **应用入口与主事件循环注册**：[src-tauri/src/lib.rs](src-tauri/src/lib.rs)
- **多平台 CLI 工具核心定义与元信息**：[src-tauri/src/cli_tools.rs](src-tauri/src/cli_tools.rs)
- **前端核心并发调度与精细化状态机**：[src/App.tsx](src/App.tsx)
- **无阻塞顶部系统环境面板**：[src/components/Header.tsx](src/components/Header.tsx)
- **高级拖拽与排序列表展示**：[src/components/ToolList.tsx](src/components/ToolList.tsx)
- **精细化工具更新详情控制器**：[src/components/ToolDetail.tsx](src/components/ToolDetail.tsx)

## 前置要求

### 1. Node.js & npm

确保已安装 Node.js 和 npm。推荐使用 LTS 版本。

```bash
# 检查 Node.js 版本
node -v

# 检查 npm 版本
npm -v
```

### 2. Rust (用于构建)

如果你想要构建整个应用，需要安装 Rust：

```bash
# Windows: 下载并运行 https://win.rustup.rs/
# macOS/Linux:
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

### 3. Visual Studio Build Tools (Windows 仅用于构建)

Windows 用户需要安装 Visual Studio Build Tools（包含 C++ 构建工具）。

## 快速开始

### 安装依赖

```bash
npm install
```

### 开发模式运行

```bash
npm run tauri dev
```

这将启动：
- Vite 开发服务器（http://127.0.0.1:5173）
- Tauri 桌面应用窗口

### 构建生产版本

```bash
npm run tauri build
```

构建后的文件位于：
- Windows: `src-tauri/target/release/bundle/msi/`
- macOS: `src-tauri/target/release/bundle/macos/`
- Linux: `src-tauri/target/release/bundle/`

### 仅构建前端

```bash
npm run build
```

## 详细说明

### 开发工作流

1. 首先确保所有依赖都已安装
2. 运行 `npm run tauri dev` 启动开发环境
3. 修改代码后，应用会自动热重载

### 项目结构

```
coder-manager/
├── src/                      # 前端源代码
│   ├── components/          # React 组件
│   ├── pages/              # 页面组件
│   ├── api/                # Tauri API 调用
│   └── types/              # TypeScript 类型
├── src-tauri/              # Rust 后端
│   ├── src/               # Rust 源代码
│   ├── icons/             # 应用图标
│   ├── build.rs           # 构建脚本
│   └── tauri.conf.json    # Tauri 配置
└── dist/                  # 构建输出
```

### 可用的 npm 脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 仅启动 Vite 开发服务器 |
| `npm run build` | 构建前端项目 |
| `npm run lint` | 运行 ESLint 检查 |
| `npm run preview` | 预览构建后的前端 |
| `npm run tauri dev` | 启动 Tauri 开发模式 |
| `npm run tauri build` | 构建生产版本的应用 |

## 故障排除

### Windows 常见问题

1. **Rust 编译错误**
   - 确保已安装 Visual Studio Build Tools
   - 检查是否有足够的磁盘空间

2. **Node.js 权限问题**
   - 以管理员身份运行终端

3. **npm 依赖安装失败**
   - 尝试删除 `node_modules` 和 `package-lock.json`，然后重新安装
   - 检查网络连接

### macOS 常见问题

1. **权限被拒绝**
   - 在系统设置中允许终端访问文件系统
   - 使用 `sudo` 运行 npm 命令（谨慎使用）

2. **Rust 安装问题**
   - 使用官方 rustup 脚本安装
   - 确保 `~/.cargo/bin` 在 PATH 中

### Linux 常见问题

1. **依赖缺失**
   - 安装 `webkit2gtk` 和 `openssl` 开发包
   - Ubuntu/Debian: `sudo apt install libwebkit2gtk-4.0-dev libssl-dev`

2. **权限问题**
   - 确保当前用户有权访问 `/tmp` 目录
   - 检查 Tauri 应用是否有足够权限

## 开发指南

### 添加新的 CLI 工具支持

在 `src-tauri/src/cli_tools.rs` 中添加新工具的定义。

### 前端开发

- 使用 React 19 和 TypeScript
- 组件位于 `src/components/` 目录
- 页面位于 `src/pages/` 目录

### 后端开发

- 使用 Rust 和 Tauri 框架
- 核心逻辑位于 `src-tauri/src/` 目录

## 许可证

本项目采用 MIT 许可证。
