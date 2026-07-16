# Repository Guidelines

## 通用规则

- 与用户的所有对话必须使用中文。

## 项目结构与模块组织

本仓库是一个 Tauri 2.x 桌面应用，前端使用 React/Vite/TypeScript，后端使用 Rust。

- `src/` 存放前端代码。`components/` 放可复用组件（Header、ToolList、ToolDetail、EnvDetail、StatusBar），`pages/` 放页面级组件（Settings、ModelConfig、ProviderManagement），`api/` 放 Tauri 命令调用封装，`types/` 放共享类型，`assets/` 放前端图片资源。
- `src-tauri/` 存放 Rust 后端与 Tauri 壳。核心代码位于 `src-tauri/src/`，例如 `cli_tools.rs` 定义 CLI 工具，`detection.rs` 负责检测逻辑，`config.rs` 负责配置持久化，`updater.rs` 负责更新流程，`lib.rs` 注册 Tauri 命令。
- `public/` 存放静态资源。`dist/` 是构建产物，不要手动修改。

## 构建、测试与开发命令

- `npm install`：根据 `package-lock.json` 安装依赖。
- `npm run dev`：仅启动 Vite 前端开发服务（端口 5173，地址固定为 127.0.0.1）。
- `npm run tauri dev`：启动完整桌面应用开发模式（会自动先执行 `npm run dev` 启动 Vite）。
- `npm run build`：执行 `tsc -b && vite build`，包含类型检查和前端构建。
- `npm run tauri build`：构建生产环境桌面安装包（会自动先执行 `npm run build`）。
- `npm run lint`：使用 ESLint 检查 TypeScript/React 代码。
- `npm run preview`：预览前端构建结果。

- **Linux 下 conda 环境干扰**：若终端激活了 anaconda/miniconda，其 `cc`/`gcc` 会被重定向到 conda 自带工具链，导致 Rust 链接报 `undefined symbol: __libc_csu_fini / __libc_csu_init`。项目通过 `src-tauri/.cargo/scripts/rust-linker.sh` 优先使用系统 `gcc`，并在系统 gcc 不存在时回退到可用编译器；如仍报错，先 `conda deactivate` 再构建。

当前未配置测试脚本。提交前至少运行 `npm run lint` 和 `npm run build`；涉及 Rust 后端或 Tauri 命令的改动，还应运行 `npm run tauri dev` 做手动验证。

## 前端代码架构要点

- 所有 Tauri 命令通过 `@tauri-apps/api/core` 的 `invoke()` 调用；`src/api/index.ts` 封装了部分常用命令，但 `App.tsx` 中也直接使用 `invoke`。
- TypeScript 类型定义在 `src/types/index.ts`，需要与 Rust 端 `cli_tools.rs` 中的结构体保持一致（Rust serde 序列化 → JSON → TypeScript 接口）。
- 应用启动采用三阶段渐进式加载：P1 仅获取工具名称和配置（毫秒级秒开），P2 本地版本检测，P3 异步并发网络版本查询。修改启动流程时注意保持这个顺序。
- 版本检查使用 `VERSION_CHECK_CONCURRENCY = 3` 的批量并发控制。

## 后端代码架构要点

- Rust 代码遵循 `rustfmt` 默认风格（4 空格缩进），MSRV 1.77.2。
- 所有耗时操作（CLI 安装、更新、版本检测）使用 `tauri::async_runtime::spawn_blocking` 包装，避免阻塞 UI 线程。
- 新增 CLI 工具支持：编辑 `src-tauri/src/cli_tools.rs` 中的 `CliToolsRegistry::get_supported_tools()`，添加 `CliToolDefinition`。
- 新增 Tauri 命令：在 `src-tauri/src/lib.rs` 中用 `#[tauri::command]` 定义，并在 `tauri::generate_handler![]` 中注册。
- 应用配置通过 `config.rs` 持久化到本地 JSON 文件（存储路径为系统应用数据目录）。

## 代码风格与命名约定

前端使用 TypeScript 与 React 函数组件，保持单引号导入、分号结尾和两个空格缩进。React 组件使用 `PascalCase`，例如 `ToolDetail.tsx`；变量、状态和函数使用 `camelCase`。共享接口优先放在 `src/types/`，仅单文件使用的类型可留在组件内部。

Rust 代码遵循 `rustfmt` 默认风格，使用四个空格缩进。函数和模块使用 `snake_case`，结构体与枚举使用 `PascalCase`。涉及 CLI 安装、更新和版本检测的耗时逻辑应保持异步，避免阻塞 UI。

## 提交与 Pull Request 规范

当前提交历史以简短摘要为主，包含中文说明和 `feat: initial commit ...` 这类 Conventional Commit。建议继续使用简洁、祈使式提交信息，例如 `feat: add tool version cache` 或 `fix: handle missing CLI path`。

PR 应包含变更说明、关联 issue、已执行的验证命令。涉及 UI 的改动需附截图或录屏；涉及 Tauri 或平台差异的改动需说明已在哪些系统上验证，例如 Windows、macOS 或 Linux。

## 安全与配置提示

不要提交本地密钥、生成产物或机器相关配置。修改 `src-tauri/src/cli_tools.rs` 中的安装和更新命令时要谨慎，因为这些命令会在用户机器上执行外部 CLI 操作。
