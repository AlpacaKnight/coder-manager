# CLI 工具管理器 (CLI Tool Manager) 规格说明

## 为什么需要
开发和运维人员经常需要管理多个编程相关的 CLI 工具（如 npm, yarn, git, docker, kubectl 等），手动检查每个工具的版本和更新非常繁琐。需要一个统一的桌面应用程序来自动化这个过程。

## 什么变化
- 新建桌面应用程序，用于检测和管理系统已安装的编程 CLI 工具
- 支持查看当前安装的工具列表及其版本信息
- 自动检测 CLI 工具是否有可用更新
- 提供一键更新功能，支持选择性更新
- 支持忽略特定工具的更新提醒

## 影响范围
- 新增应用：CLI Tool Manager 桌面应用
- 技术栈：Tauri + React + TypeScript
- 目标平台：Windows（主要），支持 macOS/Linux

## 新增需求
### 需求：CLI 工具检测
系统 SHALL 能够自动扫描并检测系统中已安装的常用编程 CLI 工具。

#### 场景：检测已安装的工具
- **WHEN** 用户启动应用程序
- **THEN** 系统自动扫描 PATH 中的已知 CLI 工具
- **AND** 显示工具名称、当前版本、安装来源

### 需求：版本检测
系统 SHALL 能够获取每个已安装 CLI 工具的最新版本信息。

#### 场景：检查更新
- **WHEN** 用户点击"检查更新"按钮
- **THEN** 系统查询每个工具的最新版本
- **AND** 与当前版本对比
- **AND** 显示是否有可用更新

### 需求：更新 CLI 工具
系统 SHALL 能够更新用户选择的 CLI 工具到最新版本。

#### 场景：更新单个工具
- **WHEN** 用户选择某个工具并点击"更新"
- **THEN** 系统使用对应的包管理器执行更新命令
- **AND** 显示更新进度
- **AND** 更新完成后显示新版本号

#### 场景：批量更新
- **WHEN** 用户选择多个工具并点击"批量更新"
- **THEN** 系统按顺序更新选中的工具
- **AND** 显示每个工具的更新状态

### 需求：忽略更新
系统 SHALL 能够让用户忽略特定工具的更新提醒。

#### 场景：忽略工具更新
- **WHEN** 用户点击某个工具的"忽略"按钮
- **THEN** 系统将该工具添加到忽略列表
- **AND** 后续检查更新时不再提醒该工具

### 需求：设置管理
系统 SHALL 提供设置页面管理忽略列表和扫描配置。

#### 场景：管理忽略列表
- **WHEN** 用户打开设置页面
- **THEN** 显示当前忽略的工具列表
- **AND** 允许用户取消忽略

## 技术设计
### 支持的 CLI 工具列表
| 工具名 | 检测命令 | 更新命令 | 
|--------|----------|----------|
| Node.js | node -v | npm install -g node |
| npm | npm -v | npm install -g npm |
| yarn | yarn -v | npm install -g yarn |
| pnpm | pnpm -v | npm install -g pnpm |
| git | git --version | 需手动更新 |
| docker | docker --version | 需手动更新 |
| kubectl | kubectl version --client | 需手动更新 |
| python | python --version | 需手动更新 |
| pip | pip --version | pip install --upgrade pip |
| rustc | rustc --version | rustup update |
| cargo | cargo --version | rustup update |
| go | go version | 需手动更新 |
| terraform | terraform --version | 需手动更新 |
| etc. | | |

### 数据存储
- 使用本地 JSON 文件存储配置和忽略列表
- 存储路径：应用数据目录

### 界面布局
- 左侧：工具列表（带图标、名称、版本信息）
- 右侧：选中工具的详细信息面板
- 顶部：操作按钮（检查更新、刷新、设置）
- 底部：状态栏（最后检查时间）

### 状态定义
- ✅ 最新版本
- 🔄 有可用更新
- ⚠️ 手动更新（无法自动更新）
- ⏸️ 已忽略
