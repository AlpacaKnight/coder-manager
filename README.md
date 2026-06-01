# Coder Manager - CLI 工具管理器

一个桌面应用程序，用于管理和更新开发相关的 CLI 工具。

## 功能特性

- 自动检测系统已安装的 CLI 工具
- 检查工具更新
- 支持自动更新工具
- 忽略特定工具的更新提醒
- 美观的深色主题界面

## 支持的平台

- ✅ Windows
- ✅ macOS
- ✅ Linux

## 支持的工具

- Node.js & npm
- Rust & Cargo
- abtop
- OpenAI Codex
- Claude Code
- Gemini CLI
- OpenCode
- QwenCode
- deepcode-cli
- codebuddy-code
- kilo-cli
- 百炼 CLI
- Git
- Docker

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
