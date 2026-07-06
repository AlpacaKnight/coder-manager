# Multi-platform Build Guide

## Prerequisites

### All Platforms
- [Node.js](https://nodejs.org/) (LTS version recommended)
- [Rust](https://www.rust-lang.org/tools/install)

### Linux (Ubuntu/Debian)
```bash
sudo apt-get update
sudo apt-get install -y libgtk-3-dev libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
```

### macOS
```bash
xcode-select --install
```

### Windows
- Install [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
- [WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) is included in Windows 10+

## Local Build

### Using npm scripts

```bash
# Install dependencies
npm install

# Build current platform (includes installer + portable)
npm run build:current

# Build specific platform (must run on target platform)
npm run build:windows
npm run build:macos
npm run build:linux
```

### Using Build Scripts

#### Windows (PowerShell)
```powershell
.\scripts\build.ps1           # Build current platform
.\scripts\build.ps1 current   # Build current platform
.\scripts\build.ps1 all       # Show multi-platform build instructions
.\scripts\build.ps1 help      # Show help
```

#### Linux/macOS (Bash)
```bash
chmod +x scripts/build.sh
./scripts/build.sh            # Build current platform
./scripts/build.sh current    # Build current platform
./scripts/build.sh all        # Show multi-platform build instructions
./scripts/build.sh help       # Show help
```

## GitHub Actions Auto Build

### Setup

1. Push code to GitHub repository
2. GitHub Actions will automatically trigger builds when:
   - Push to `main` or `master` branch
   - Create Pull Request
   - Manual trigger

### Create Release

1. Create and push tag:
```bash
git tag v0.1.0
git push origin v0.1.0
```

2. GitHub Actions will automatically:
   - Build all platforms (Windows, macOS, Linux)
   - Create Draft Release
   - Upload installers

3. Go to GitHub Releases page to edit and publish

### Manual Trigger

On GitHub repository page:
1. Go to Actions tab
2. Select "Build & Release" workflow
3. Click "Run workflow"

## Build Output

After build, artifacts are automatically collected to:

```
release/
├── windows/
│   ├── *.msi                    # Windows Installer
│   └── *_setup.exe              # NSIS Installer
├── macos/
│   ├── *.dmg                    # macOS disk image
│   └── *.app                    # macOS application
├── linux/
│   ├── *.AppImage               # Linux AppImage
│   ├── *.deb                    # Debian/Ubuntu package
│   └── *.rpm                    # Fedora/RHEL package
└── portable/                    # 绿色免安装版本
    ├── windows/
    │   └── app.exe              # Windows portable exe
    ├── macos/
    │   └── *.app                # macOS portable app
    └── linux/
        └── *.AppImage           # Linux portable AppImage
```

### 安装版 vs 绿色版

| 类型 | 目录 | 说明 |
|------|------|------|
| 安装版 | `release/<platform>/` | 包含安装程序（MSI、DMG、DEB 等） |
| 绿色版 | `release/portable/<platform>/` | 可直接运行，无需安装 |

- **Windows**: 绿色版为单个 `app.exe`，可直接运行
- **macOS**: 绿色版为 `.app` 目录，可直接拖入 Applications
- **Linux**: 绿色版为 `AppImage`，可直接运行（需添加执行权限）

原始构建产物位于 `src-tauri/target/release/`，构建脚本会自动整理到 `release/` 目录。

## FAQ

### Q: How to build macOS/Linux on Windows?
A: Cross-compilation is not supported directly. Use GitHub Actions or build on the target platform.

### Q: Build failed?
A: Check the following:
1. Node.js and Rust are correctly installed
2. Dependencies are installed (`npm install`)
3. Check build logs for specific errors

### Q: How to customize app icon?
A: Replace icon files in `src-tauri/icons/` directory, then rebuild.
