#!/bin/bash

# Tauri Multi-platform Build Script (Linux/macOS)
# Usage: ./scripts/build.sh [platform]
# Platform options: windows, macos, linux, all (default: current platform)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PLATFORM="${1:-current}"

cd "$PROJECT_DIR"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

# Check dependencies
check_dependencies() {
    info "Checking dependencies..."
    
    if ! command -v node &> /dev/null; then
        error "Node.js not found, please install Node.js first"
    fi
    
    if ! command -v npm &> /dev/null; then
        error "npm not found, please install npm first"
    fi
    
    if ! command -v cargo &> /dev/null; then
        error "Rust/Cargo not found, please install Rust first"
    fi
    
    info "Dependencies check passed"
}

# Install npm dependencies
install_deps() {
    if [ -f "package-lock.json" ]; then
        info "Installing npm dependencies from lockfile..."
        npm ci
    else
        info "Installing npm dependencies..."
        npm install
    fi
}

# Build current platform
build_current() {
    info "Cleaning previous bundle artifacts..."
    rm -rf src-tauri/target/release/bundle

    info "Building current platform..."
    npm run tauri build
}

# Collect build artifacts to release folder
collect_artifacts() {
    info "Collecting build artifacts..."

    local bundle_dir="src-tauri/target/release/bundle"
    local release_dir="release"
    local installer_dir=""
    local portable_dir=""

    # Detect platform
    case "$(uname -s)" in
        Linux*)
            installer_dir="$release_dir/linux"
            portable_dir="$release_dir/portable/linux"
            ;;
        Darwin*)
            installer_dir="$release_dir/macos"
            portable_dir="$release_dir/portable/macos"
            ;;
        MINGW*|MSYS*|CYGWIN*)
            installer_dir="$release_dir/windows"
            portable_dir="$release_dir/portable/windows"
            ;;
        *)          error "Unknown platform" ;;
    esac

    # Create directories
    mkdir -p "$installer_dir" "$portable_dir"
    rm -f "$installer_dir"/* "$portable_dir"/* 2>/dev/null || true

    # Collect files based on platform
    case "$(uname -s)" in
        Linux*)
            # Installer artifacts
            if [ -d "$bundle_dir/appimage" ]; then
                cp "$bundle_dir/appimage/"*.AppImage "$installer_dir/" 2>/dev/null || true
            fi
            if [ -d "$bundle_dir/deb" ]; then
                cp "$bundle_dir/deb/"*.deb "$installer_dir/" 2>/dev/null || true
            fi
            if [ -d "$bundle_dir/rpm" ]; then
                cp "$bundle_dir/rpm/"*.rpm "$installer_dir/" 2>/dev/null || true
            fi
            # Portable: AppImage is self-contained
            if [ -d "$bundle_dir/appimage" ]; then
                cp "$bundle_dir/appimage/"*.AppImage "$portable_dir/" 2>/dev/null || true
            fi
            ;;
        Darwin*)
            # Installer artifacts
            if [ -d "$bundle_dir/dmg" ]; then
                cp "$bundle_dir/dmg/"*.dmg "$installer_dir/" 2>/dev/null || true
            fi
            if [ -d "$bundle_dir/macos" ]; then
                cp -r "$bundle_dir/macos/"*.app "$installer_dir/" 2>/dev/null || true
            fi
            # Portable: .app bundle is self-contained
            if [ -d "$bundle_dir/macos" ]; then
                cp -r "$bundle_dir/macos/"*.app "$portable_dir/" 2>/dev/null || true
            fi
            ;;
        MINGW*|MSYS*|CYGWIN*)
            # Installer artifacts
            if [ -d "$bundle_dir/msi" ]; then
                cp "$bundle_dir/msi/"*.msi "$installer_dir/" 2>/dev/null || true
            fi
            if [ -d "$bundle_dir/nsis" ]; then
                cp "$bundle_dir/nsis/"*.exe "$installer_dir/" 2>/dev/null || true
            fi
            # Portable: standalone exe
            local portable_exe="src-tauri/target/release/app.exe"
            if [ -f "$portable_exe" ]; then
                cp "$portable_exe" "$portable_dir/" 2>/dev/null || true
            fi
            ;;
    esac

    # Show summary
    echo ""
    echo -e "${GREEN}Installer artifacts:${NC}"
    echo "  $(cd "$installer_dir" && pwd)"
    ls -lh "$installer_dir" 2>/dev/null | tail -n +2 | while read line; do
        echo "    $line"
    done

    echo ""
    echo -e "${GREEN}Portable version:${NC}"
    echo "  $(cd "$portable_dir" && pwd)"
    ls -lh "$portable_dir" 2>/dev/null | tail -n +2 | while read line; do
        echo "    $line"
    done
}

# Build specified platform (must run on target platform)
build_platform() {
    local platform=$1
    
    case "$platform" in
        windows)
            error "Windows build must run on Windows, or use GitHub Actions"
            ;;
        macos)
            if [[ "$(uname)" != "Darwin" ]]; then
                error "macOS build must run on macOS, or use GitHub Actions"
            fi
            ;;
        linux)
            if [[ "$(uname)" != "Linux" ]]; then
                error "Linux build must run on Linux, or use GitHub Actions"
            fi
            ;;
        *)
            error "Unknown platform: $platform"
            ;;
    esac
    
    build_current
}

# Show help
show_help() {
    echo "Tauri Multi-platform Build Script"
    echo ""
    echo "Usage:"
    echo "  ./scripts/build.sh [platform]"
    echo ""
    echo "Platform options:"
    echo "  current  - Build current platform (default)"
    echo "  windows  - Build Windows platform"
    echo "  macos    - Build macOS platform"
    echo "  linux    - Build Linux platform"
    echo "  all      - Show multi-platform build instructions"
    echo "  help     - Show this help message"
    echo ""
    echo "Examples:"
    echo "  ./scripts/build.sh           # Build current platform"
    echo "  ./scripts/build.sh current   # Build current platform"
    echo "  ./scripts/build.sh all       # Show multi-platform build instructions"
}

# Show multi-platform build instructions
show_all_platforms_info() {
    echo "=========================================="
    echo "   Tauri Multi-platform Build Guide"
    echo "=========================================="
    echo ""
    echo "Since Tauri needs to build on the target platform,"
    echo "there are several ways to build for all platforms:"
    echo ""
    echo "1. Using GitHub Actions (Recommended)"
    echo "   - Auto-build after pushing code to GitHub"
    echo "   - Config file: .github/workflows/build.yml"
    echo ""
    echo "2. Build locally on each platform"
    echo "   - Windows: npm run tauri build"
    echo "   - macOS:   npm run tauri build"
    echo "   - Linux:   npm run tauri build"
    echo ""
    echo "3. Using Docker (Linux only)"
    echo "   - Use Tauri official Docker image to build"
    echo ""
    echo "=========================================="
}

# Main function
main() {
    check_dependencies
    
    case "$PLATFORM" in
        current)
            install_deps
            build_current
            collect_artifacts
            ;;
        windows|macos|linux)
            install_deps
            build_platform "$PLATFORM"
            collect_artifacts
            ;;
        all)
            show_all_platforms_info
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            error "Unknown option: $PLATFORM (use --help for help)"
            ;;
    esac
}

main
