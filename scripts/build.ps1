# Tauri Multi-platform Build Script (Windows PowerShell)
# Usage: .\scripts\build.ps1 [platform]
# Platform options: windows, current (default: current platform)

param(
    [Parameter(Position = 0)]
    [ValidateSet("current", "windows", "all", "help")]
    [string]$Platform = "current"
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Split-Path -Parent $ScriptDir

Set-Location $ProjectDir

# Color output functions
function Write-Info {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Green
}

function Write-Warn {
    param([string]$Message)
    Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function Write-Err {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
    exit 1
}

# Check dependencies
function Test-Dependencies {
    Write-Info "Checking dependencies..."
    
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        Write-Err "Node.js not found, please install Node.js first"
    }
    
    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
        Write-Err "npm not found, please install npm first"
    }
    
    if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
        Write-Err "Rust/Cargo not found, please install Rust first"
    }
    
    Write-Info "Dependencies check passed"
}

# Install npm dependencies
function Install-Dependencies {
    Write-Info "Installing npm dependencies..."
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Err "npm install failed"
    }
}

# Build current platform
function Build-Current {
    Write-Info "Building current platform (Windows)..."
    npm run tauri build
    if ($LASTEXITCODE -ne 0) {
        Write-Err "Build failed"
    }
}

# Collect build artifacts to release folder
function Collect-Artifacts {
    Write-Info "Collecting build artifacts..."

    $BundleDir = "src-tauri\target\release\bundle"
    $ReleaseDir = "release"
    $InstallerDir = "$ReleaseDir\windows"
    $PortableDir = "$ReleaseDir\portable\windows"

    # Create directories
    foreach ($Dir in @($InstallerDir, $PortableDir)) {
        if (Test-Path $Dir) {
            Remove-Item -Path "$Dir\*" -Force
        } else {
            New-Item -ItemType Directory -Path $Dir -Force | Out-Null
        }
    }

    # Copy MSI files
    $MsiFiles = Get-ChildItem -Path "$BundleDir\msi" -Filter "*.msi" -ErrorAction SilentlyContinue
    if ($MsiFiles) {
        Copy-Item -Path "$BundleDir\msi\*.msi" -Destination $InstallerDir
        Write-Info "Copied MSI files to $InstallerDir"
    }

    # Copy NSIS installer files
    $NsisFiles = Get-ChildItem -Path "$BundleDir\nsis" -Filter "*.exe" -ErrorAction SilentlyContinue
    if ($NsisFiles) {
        Copy-Item -Path "$BundleDir\nsis\*.exe" -Destination $InstallerDir
        Write-Info "Copied NSIS installer to $InstallerDir"
    }

    # Copy portable exe
    $PortableExe = Join-Path $ProjectDir "src-tauri\target\release\app.exe"
    if (Test-Path $PortableExe) {
        Copy-Item -Path $PortableExe -Destination $PortableDir
        Write-Info "Copied portable exe to $PortableDir"
    }

    # Show summary
    Write-Host ""
    Write-Host "Installer artifacts:" -ForegroundColor Cyan
    Write-Host "  $((Resolve-Path $InstallerDir).Path)" -ForegroundColor Green
    Get-ChildItem -Path $InstallerDir -File | ForEach-Object {
        $SizeMB = [math]::Round($_.Length / 1MB, 2)
        Write-Host "    $($_.Name)  ($SizeMB MB)"
    }

    Write-Host ""
    Write-Host "Portable version:" -ForegroundColor Cyan
    Write-Host "  $((Resolve-Path $PortableDir).Path)" -ForegroundColor Green
    Get-ChildItem -Path $PortableDir -File | ForEach-Object {
        $SizeMB = [math]::Round($_.Length / 1MB, 2)
        Write-Host "    $($_.Name)  ($SizeMB MB)"
    }
}

# Show help
function Show-Help {
    Write-Host "Tauri Multi-platform Build Script (Windows)" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Usage:"
    Write-Host "  .\scripts\build.ps1 [platform]"
    Write-Host ""
    Write-Host "Platform options:"
    Write-Host "  current  - Build current platform (default)"
    Write-Host "  windows  - Build Windows platform"
    Write-Host "  all      - Show multi-platform build instructions"
    Write-Host "  help     - Show this help message"
    Write-Host ""
    Write-Host "Examples:"
    Write-Host "  .\scripts\build.ps1           # Build current platform"
    Write-Host "  .\scripts\build.ps1 current   # Build current platform"
    Write-Host "  .\scripts\build.ps1 all       # Show multi-platform build instructions"
}

# Show multi-platform build instructions
function Show-AllPlatformsInfo {
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host "   Tauri Multi-platform Build Guide" -ForegroundColor Cyan
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Since Tauri needs to build on the target platform,"
    Write-Host "there are several ways to build for all platforms:"
    Write-Host ""
    Write-Host "1. Using GitHub Actions (Recommended)" -ForegroundColor Yellow
    Write-Host "   - Auto-build after pushing code to GitHub"
    Write-Host "   - Config file: .github\workflows\build.yml"
    Write-Host ""
    Write-Host "2. Build locally on each platform" -ForegroundColor Yellow
    Write-Host "   - Windows: npm run tauri build"
    Write-Host "   - macOS:   npm run tauri build (on macOS)"
    Write-Host "   - Linux:   npm run tauri build (on Linux)"
    Write-Host ""
    Write-Host "3. Using Docker (Linux only)" -ForegroundColor Yellow
    Write-Host "   - Use Tauri official Docker image to build"
    Write-Host ""
    Write-Host "==========================================" -ForegroundColor Cyan
}

# Main function
function Main {
    Test-Dependencies
    
    switch ($Platform) {
        "current" {
            Install-Dependencies
            Build-Current
            Collect-Artifacts
        }
        "windows" {
            Install-Dependencies
            Build-Current
            Collect-Artifacts
        }
        "all" {
            Show-AllPlatformsInfo
        }
        "help" {
            Show-Help
        }
    }
}

Main
