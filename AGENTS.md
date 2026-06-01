# Repository Guidelines

## 项目结构与模块组织

本仓库是一个 Tauri 桌面应用，前端使用 React/Vite/TypeScript，后端使用 Rust。

- `src/` 存放前端代码。`components/` 放可复用组件，`pages/` 放页面级组件，`api/` 放 Tauri 命令调用封装，`types/` 放共享类型，`assets/` 放前端图片资源。
- `src-tauri/` 存放 Rust 后端与 Tauri 壳。核心代码位于 `src-tauri/src/`，例如 `cli_tools.rs` 定义 CLI 工具，`detection.rs` 负责检测逻辑，`config.rs` 负责配置持久化，`updater.rs` 负责更新流程，`lib.rs` 注册 Tauri 命令。
- `public/` 存放静态资源。`dist/` 是构建产物，不要手动修改。

## 构建、测试与开发命令

- `npm install`：根据 `package-lock.json` 安装依赖。
- `npm run dev`：仅启动 Vite 前端开发服务。
- `npm run tauri dev`：启动完整桌面应用开发模式。
- `npm run build`：执行 `tsc -b` 类型检查并构建前端。
- `npm run tauri build`：构建生产环境桌面安装包。
- `npm run lint`：使用 ESLint 检查 TypeScript/React 代码。
- `npm run preview`：预览前端构建结果。

## 代码风格与命名约定

前端使用 TypeScript 与 React 函数组件，保持单引号导入、分号结尾和两个空格缩进。React 组件使用 `PascalCase`，例如 `ToolDetail.tsx`；变量、状态和函数使用 `camelCase`。共享接口优先放在 `src/types/`，仅单文件使用的类型可留在组件内部。

Rust 代码遵循 `rustfmt` 默认风格，使用四个空格缩进。函数和模块使用 `snake_case`，结构体与枚举使用 `PascalCase`。涉及 CLI 安装、更新和版本检测的耗时逻辑应保持异步，避免阻塞 UI。

## 测试指南

当前未配置专用测试脚本。提交前至少运行 `npm run lint` 和 `npm run build`；涉及 Rust 后端或 Tauri 命令的改动，还应运行 `npm run tauri dev` 做手动验证。若新增测试，前端建议使用 `ComponentName.test.tsx` 命名并就近放置，Rust 单元测试放在对应 `src-tauri/src/*.rs` 模块内。

## 提交与 Pull Request 规范

当前提交历史以简短摘要为主，包含中文说明和 `feat: initial commit ...` 这类 Conventional Commit。建议继续使用简洁、祈使式提交信息，例如 `feat: add tool version cache` 或 `fix: handle missing CLI path`。

PR 应包含变更说明、关联 issue、已执行的验证命令。涉及 UI 的改动需附截图或录屏；涉及 Tauri 或平台差异的改动需说明已在哪些系统上验证，例如 Windows、macOS 或 Linux。

## 安全与配置提示

不要提交本地密钥、生成产物或机器相关配置。修改 `src-tauri/src/cli_tools.rs` 中的安装和更新命令时要谨慎，因为这些命令会在用户机器上执行外部 CLI 操作。
