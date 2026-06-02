---
name: integrate-external-config
description: Read/merge/write external CLI tool config files (e.g., ~/.qwen/settings.json) from Tauri backend
source: auto-skill
extracted_at: '2026-06-02T16:07:15.714Z'
---

## Integrating External Tool Configuration Files

This pattern allows Coder Manager to read and modify configuration files belonging to other CLI tools (e.g., `~/.qwen/settings.json`), merging only model/provider-related fields while preserving everything else.

### Backend: Config File Access (`config.rs`)

Define path helper, reader, writer, and merge logic as **public free functions** (not on `AppConfig`):

```rust
pub fn get_tool_settings_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".tool-name")
        .join("settings.json")
}

pub fn read_tool_settings() -> Result<serde_json::Value, String> {
    let path = get_tool_settings_path();
    if !path.exists() {
        return Ok(serde_json::json!({}));
    }
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

pub fn write_tool_settings(settings: &serde_json::Value) -> Result<(), String> {
    let path = get_tool_settings_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}
```

### Backend: Merge Strategy

The merge function takes `&mut serde_json::Value` and modifies only target fields. Key principles:

1. **Clone before merge** for preview (don't mutate the original)
2. **Create missing parent objects** with `.entry().or_insert_with(|| json!({}))`
3. **Only touch fields you own** — never delete or overwrite unrelated keys
4. **Use `serde_json::Value`** for the external file (not typed structs) since you don't control its schema

```rust
pub fn merge_providers(settings: &mut serde_json::Value, providers: &[Provider]) {
    let obj = settings.as_object_mut().unwrap();
    
    // 1. Create/update nested structures
    let model_providers = obj.entry("modelProviders")
        .or_insert_with(|| json!({}));
    // ... set fields ...

    // 2. Merge env keys (additive, don't remove existing)
    let env = obj.entry("env").or_insert_with(|| json!({}));
    for provider in providers {
        env[format!("{}_API_KEY", provider.id)] = json!(provider.api_key);
    }
}
```

### Backend: Tauri Commands

Three commands are typical:

| Command | Returns | Purpose |
|---------|---------|---------|
| `load_external_settings` | `serde_json::Value` | Read current external config for preview |
| `register_to_external` | `serde_json::Value` | Merge + write + return result |
| CRUD on internal entities | `Vec<T>` / `()` | Manage the provider list in AppConfig |

```rust
#[tauri::command]
fn load_external_settings() -> Result<serde_json::Value, String> {
    config::read_tool_settings()
}

#[tauri::command]
fn register_to_external(entity_ids: Vec<String>) -> Result<serde_json::Value, String> {
    let app_config = AppConfig::load();
    let selected: Vec<_> = app_config.entities.iter()
        .filter(|e| entity_ids.contains(&e.id))
        .cloned()
        .collect();
    
    let mut settings = config::read_tool_settings()?;
    config::merge_entities(&mut settings, &selected);
    config::write_tool_settings(&settings)?;
    Ok(settings)
}
```

### Frontend: Real-Time Preview Pattern

Load both the internal entities and external settings on mount. Compute preview with `useMemo`:

```tsx
const [entities, setEntities] = useState<Entity[]>([]);
const [externalSettings, setExternalSettings] = useState<Record<string, unknown>>({});
const [selectedIds, setSelectedIds] = useState<string[]>([]);

// Load both on mount
useEffect(() => {
    const init = async () => {
        const [e, s] = await Promise.all([
            invoke<Entity[]>('get_entities'),
            invoke<Record<string, unknown>>('load_external_settings'),
        ]);
        setEntities(e);
        setExternalSettings(s);
    };
    void init();
}, []);

// Real-time preview (useMemo, NOT useEffect + setState)
const preview = useMemo(
    () => {
        const selected = entities.filter(e => selectedIds.includes(e.id));
        if (selected.length === 0) return JSON.stringify(externalSettings, null, 2);
        const merged = JSON.parse(JSON.stringify(externalSettings));
        // ... merge logic (mirror backend) ...
        return JSON.stringify(merged, null, 2);
    },
    [selectedIds, entities, externalSettings],
);
```

After successful registration, update `externalSettings` state with the returned value so the preview stays in sync.

### Backend: Two-Source Merge (Existing External + New Internal)

When the UI shows both existing entries from the external config AND new entries from app-managed entities, the backend needs an "apply" command that takes **both** sources:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExternalEntry {
    pub id: String,
    pub name: String,
    #[serde(rename = "baseUrl")]
    pub base_url: String,
    #[serde(rename = "envKey")]
    pub env_key: String,
    // Optional metadata for the app's use
    #[serde(rename = "providerType")]
    pub provider_type: Option<String>,
}

#[tauri::command]
fn apply_config(
    keep_entries: Vec<ExternalEntry>,   // existing entries the user chose to keep
    new_entity_ids: Vec<String>,        // app-managed entities to add
) -> Result<serde_json::Value, String> {
    let app_config = AppConfig::load();
    let new_entities: Vec<_> = app_config.entities.iter()
        .filter(|e| new_entity_ids.contains(&e.id))
        .cloned()
        .collect();

    let mut settings = config::read_external_settings()?;
    config::apply_merged(&mut settings, &keep_entries, &new_entities);
    config::write_external_settings(&settings)?;
    Ok(settings)
}
```

The merge function combines both sources into the output arrays:

```rust
pub fn apply_merged(
    settings: &mut serde_json::Value,
    keep_entries: &[ExternalEntry],
    new_entities: &[Entity],
) {
    // 1. Build output arrays from both sources
    let mut all_group_a: Vec<Value> = keep_entries.iter()
        .filter(|e| e.provider_type.as_deref() != Some("b"))
        .map(|e| entry_to_json(e))
        .collect();
    let mut all_group_b: Vec<Value> = keep_entries.iter()
        .filter(|e| e.provider_type.as_deref() == Some("b"))
        .map(|e| entry_to_json(e))
        .collect();

    // 2. Append new entities
    for entity in new_entities {
        let entry = entity_to_json_entry(entity);
        match entity.entity_type.as_str() {
            "b" => all_group_b.push(entry),
            _ => all_group_a.push(entry),
        }
    }

    // 3. Write merged arrays
    // 4. Merge env keys (additive — keep existing, add new)
    // 5. Update active selection if invalid
}
```

### Frontend: Showing Both Sources with Unified Selection

Load both the app-managed entities and the external config on mount. Parse existing entries from the external config, then build a unified list:

```tsx
const [existingEntries, setExistingEntries] = useState<ExternalEntry[]>([]);
const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

// On mount: load both, pre-check existing entries
useEffect(() => {
  const [entities, settings] = await Promise.all([
    invoke<Entity[]>('get_entities'),
    invoke<Record<string, unknown>>('load_external_settings'),
  ]);
  const existing = (settings.entries ?? []) as ExternalEntry[];
  setExistingEntries(existing);
  // Pre-check all existing entries
  const keys = new Set(existing.map(e => `existing:${e.id}`));
  setSelectedKeys(keys);
}, []);

// Unified list: existing entries + dropdown-added providers
const modelList = useMemo(() => {
  const result = [];
  for (const e of existingEntries) {
    result.push({ key: `existing:${e.id}`, source: 'existing', ...e });
  }
  for (const key of dropdownAddedKeys) {
    const entity = entities.find(e => `entity:${e.id}` === key);
    if (entity) result.push({ key, source: 'entity', ...entity });
  }
  return result;
}, [existingEntries, entities, dropdownAddedKeys]);
```

**Behavior**:
- Existing entries are **pre-checked** — unchecking marks them for removal
- New entities added via dropdown are checked by default
- The preview shows the merged result in real-time
- "Apply" sends `keepEntries` (checked existing) + `newEntityIds` (checked new) to the backend

### Key Constraints

- **Merge logic must be duplicated** in both Rust (for actual write) and TypeScript (for preview). Keep them in sync.
- **Never delete fields** from the external config — only add/update model-related keys.
- **Use `dirs::home_dir()`** for user-level config files (e.g., `~/.qwen/`), not `dirs::config_dir()` which is for app-specific config.
- **Handle missing files gracefully** — return empty `{}` if the external config doesn't exist yet.
- **`serde_json::Value`** for external files because you can't guarantee their schema won't change upstream.

### Checklist

- [ ] `config.rs`: Path helper, read/write/merge functions as public free functions
- [ ] `lib.rs`: `load_external_settings`, `register_to_external` commands + CRUD commands
- [ ] Frontend loads both entities and external settings on mount
- [ ] Preview uses `useMemo` (not `useEffect` + `setState`)
- [ ] After registration, update external settings state from returned value
- [ ] Merge logic is consistent between Rust and TypeScript
- [ ] `npm run lint` and `npm run build` pass
