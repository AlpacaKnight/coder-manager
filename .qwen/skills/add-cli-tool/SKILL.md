---
name: add-cli-tool
description: Add support for a new CLI tool to the Coder Manager Tauri app
source: auto-skill
extracted_at: '2026-05-31T07:10:00.000Z'
---

## Adding a New CLI Tool to Coder Manager

### Step 1 — Research the tool

Find the tool's npm/crates.io package name, CLI command, and version flag:

```bash
# npm package lookup
# Query: https://registry.npmjs.org/-/v1/search?text=<tool-name>

# Or check the package directly
npm info <package-name> version
```

Determine:
- **CLI command name** (e.g., `reasonix`, `codex`)
- **Version command** (e.g., `reasonix --version`)
- **Version regex** (e.g., `r"(\d+\.\d+\.\d+)"`)
- **NPM/crates.io package name** (e.g., `reasonix`, `@openai/codex`)
- **Install/update command** (e.g., `npm install -g reasonix`)

### Step 2 — Add to `cli_tools.rs`

Edit `src-tauri/src/cli_tools.rs` → `CliToolsRegistry::get_supported_tools()`:

```rust
CliToolDefinition {
    name: "<cli-command>".to_string(),            // binary name on PATH
    display_name: "<Display Name>".to_string(),    // shown in UI
    version_command: "<cli-command> --version".to_string(),
    version_regex: r"(\d+\.\d+\.\d+)".to_string(),
    latest_version_source: LatestVersionSource::Npm("<npm-package>".to_string()),
    // or LatestVersionSource::CratesIo("<crate-name>".to_string())
    can_auto_update: true,
    update_command: "npm install -g <npm-package>".to_string(),
    install_command: "npm install -g <npm-package>".to_string(),
},
```

### Step 3 — Add to `version_check.rs`

Edit `src-tauri/src/version_check.rs` → `get_latest_version()`:

```rust
"<cli-command>" => get_npm_latest_version("<npm-package>"),
// or get_crates_latest_version("<crate-name>")
```

**⚠️ Critical**: Without this, the tool will be detected but version checks will always return "No version source available" → the tool will always show as "UpToDate" even when outdated.

### Step 4 — Verify

- Run `npm run build` to ensure frontend TypeScript still passes (no changes needed there)
- Run `npm run tauri dev` to verify the tool appears in the list and detection works

### Notes

- Each tool definition is independent — no changes needed in `detection.rs` or `updater.rs`
- **But** `version_check.rs` MUST be updated to add the tool's version source mapping, otherwise version checks will silently fail
- The `LatestVersionSource` enum supports: `Npm(String)`, `CratesIo(String)`, `Rust`, `Manual`
- If the tool uses a custom version format, adjust the regex accordingly
