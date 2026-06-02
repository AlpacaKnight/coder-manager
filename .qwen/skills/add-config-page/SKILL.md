---
name: add-config-page
description: Add a standalone configuration page (not modal) with save/exit to Coder Manager
source: auto-skill
extracted_at: '2026-06-02T16:07:15.714Z'
---

## Adding a Standalone Configuration Page

This pattern replaces the main content area (ToolList + ToolDetail) with a full-page configuration view, triggered from a specific tool's detail panel. Unlike Settings/EnvDetail which are modal overlays, this is a **page-level switch**.

### Step 1 — Backend: Extend `AppConfig` in `config.rs`

Add new fields with `#[serde(default)]` for backward compatibility:

```rust
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AppConfig {
    // ... existing fields ...
    #[serde(default)]
    pub new_field: Option<String>,
}
```

For grouped config (e.g., multiple related fields), create a dedicated struct:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeatureConfig {
    pub field_a: Option<String>,
    pub field_b: Option<String>,
}
```

Add get/set helpers on `AppConfig`:

```rust
impl AppConfig {
    pub fn get_feature_config(&self) -> FeatureConfig { /* ... */ }
    pub fn set_feature_config(&mut self, config: &FeatureConfig) { /* ... */ }
}
```

### Step 2 — Backend: Add Tauri commands in `lib.rs`

Create a get/save command pair. The get command returns the dedicated struct; the save command loads config, applies changes, and persists:

```rust
use config::{AppConfig, FeatureConfig};

#[tauri::command]
fn get_feature_config() -> FeatureConfig {
    let config = AppConfig::load();
    config.get_feature_config()
}

#[tauri::command]
fn save_feature_config(feature_config: FeatureConfig) -> Result<(), String> {
    let mut config = AppConfig::load();
    config.set_feature_config(&feature_config);
    config.save()
}
```

Register both in `invoke_handler`:

```rust
.invoke_handler(tauri::generate_handler![
    // ... existing commands ...
    get_feature_config,
    save_feature_config
])
```

### Step 3 — Frontend: Update `types/index.ts`

Mirror the Rust structs:

```typescript
export interface AppConfig {
  // ... existing fields ...
  new_field?: string;  // optional for backward compat
}

export interface FeatureConfig {
  field_a: string | null;
  field_b: string | null;
}
```

### Step 4 — Frontend: Create page component in `src/pages/`

The page component manages its own form state, loads initial data via `invoke` on mount, and provides save/exit callbacks:

```tsx
import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { FeatureConfig } from '../types';

interface ConfigPageProps {
  onSave: () => void;
  onClose: () => void;
}

export function ConfigPage({ onSave, onClose }: ConfigPageProps) {
  const [fieldA, setFieldA] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const config = await invoke<FeatureConfig>('get_feature_config');
        setFieldA(config.field_a ?? '');
      } catch (err) {
        console.error('Failed to load config:', err);
      } finally {
        setLoading(false);
      }
    };
    void loadConfig();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const config: FeatureConfig = { field_a: fieldA.trim() || null };
      await invoke('save_feature_config', { featureConfig: config });
      onSave();
    } catch (err) {
      alert(`保存失败: ${err}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="config-page-loading">加载中...</div>;

  return (
    <div className="config-page">
      <div className="config-page-header">
        <h2>页面标题</h2>
        <button className="btn-close" onClick={onClose}>×</button>
      </div>
      <div className="config-page-content">
        {/* form fields */}
      </div>
      <div className="config-page-actions">
        <button className="btn-secondary" onClick={onClose}>退出</button>
        <button className="btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? '保存中...' : '保存'}
        </button>
      </div>
    </div>
  );
}
```

### Step 5 — Frontend: Wire up page switching in `App.tsx`

**Key pattern**: The config page replaces the `<main>` content, not a modal overlay. Add a boolean state and conditionally render:

```tsx
import { ConfigPage } from './pages/ConfigPage';

// state
const [showConfigPage, setShowConfigPage] = useState(false);

// in JSX, replace the <main> content:
<main className="app-main">
  {showConfigPage ? (
    <ConfigPage
      onSave={() => setShowConfigPage(false)}
      onClose={() => setShowConfigPage(false)}
    />
  ) : (
    <>
      <ToolList ... />
      <ToolDetail ... onOpenConfigPage={() => setShowConfigPage(true)} />
    </>
  )}
</main>
```

Both save and exit return to the normal view by setting state to false.

### Step 6 — Frontend: Add trigger button in `ToolDetail.tsx`

Add optional `onOpenConfigPage` prop and a conditionally rendered button:

```tsx
interface ToolDetailProps {
  // ... existing props ...
  onOpenConfigPage?: () => void;
}

// In the actions section, conditionally render for specific tool:
{tool.name === '<tool-name>' && (
  <button className="btn-config-page" onClick={() => onOpenConfigPage?.()}>
    配置
  </button>
)}
```

This button shows regardless of install state (user may want to configure before installing).

### Step 7 — Frontend: Add CSS styles in `App.css`

Use the project's existing dark theme tokens (`#1a1a2e`, `#16213e`, `#0f3460`, `#e94560`):

```css
/* Trigger button */
.btn-config-page {
  padding: 12px 24px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
  background: #6c5ce7;
  color: white;
}
.btn-config-page:hover { background: #5a4bd1; }

/* Full page layout */
.config-page { flex: 1; display: flex; flex-direction: column; background: #1a1a2e; overflow: hidden; }
.config-page-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 24px; background: #16213e; border-bottom: 1px solid #0f3460; }
.config-page-content { flex: 1; padding: 24px; overflow-y: auto; display: flex; flex-direction: column; gap: 24px; }
.config-page-actions { display: flex; justify-content: flex-end; gap: 12px; padding: 16px 24px; background: #16213e; border-top: 1px solid #0f3460; }
```

### Variant: Two-Column Layout with Real-Time Preview

For complex pages that manage a list of entities AND preview external config changes, use a two-column layout:

```tsx
<div className="config-page">
  <div className="config-page-header">...</div>
  <div className="config-page-body">      {/* flex: 1, display: flex */}
    <div className="config-page-left">     {/* width: 50%, overflow-y: auto */}
      {/* CRUD forms, lists, checkboxes */}
    </div>
    <div className="config-page-right">    {/* width: 50% */}
      <pre className="settings-preview">   {/* flex: 1, monospace, overflow: auto */}
        {preview}
      </pre>
    </div>
  </div>
  <div className="config-page-actions">...</div>
</div>
```

Use `useMemo` (not `useEffect` + `setState`) for real-time computed previews to avoid cascading renders:

```tsx
const preview = useMemo(
  () => computePreview(selectedIds, entities, baseSettings),
  [selectedIds, entities, baseSettings, computePreview],
);
```

The preview function clones the base settings, merges selected entities, and returns `JSON.stringify(merged, null, 2)`.

### Variant: CRUD Entity Management

When the page manages a list of entities (e.g., providers), each with create/delete:

- The page loads the entity list on mount via `invoke('get_entities')`
- "Add" form at the top of the left column, entity list below
- Each entity item has a delete button
- After create/delete, re-fetch the full list to stay in sync with backend
- Checkbox selection for batch operations (e.g., register multiple entities at once)

### Variant: Splitting Into Independent Pages (Preferred Over Section Navigation)

When a config area has **two fundamentally different purposes** (e.g., CRUD entity management vs. registering entities to an external system), create **two independent page components** instead of one page with sections. This is cleaner than the `initialSection` + scroll-to-section pattern described below.

**Why independent pages beat section navigation:**
- Each page has a single responsibility, simpler state, and no scroll-jump hacks
- Entry points map naturally: Header button → management page, ToolDetail button → registration/action page
- No need for `useRef` + `scrollIntoView` or `initialSection` props

**App.tsx pattern — separate boolean states:**

```tsx
import { ModelConfig } from './pages/ModelConfig';
import { ProviderManagement } from './pages/ProviderManagement';

const [showModelConfig, setShowModelConfig] = useState(false);
const [showProviderMgmt, setShowProviderMgmt] = useState(false);

// Header → management page
<Header onAddProvider={() => setShowProviderMgmt(true)} />

// ToolDetail → registration page
<ToolDetail onOpenModelConfig={() => setShowModelConfig(true)} />

// In JSX, chain the conditions:
<main className="app-main">
  {showProviderMgmt ? (
    <ProviderManagement onClose={() => setShowProviderMgmt(false)} />
  ) : showModelConfig ? (
    <ModelConfig onClose={() => setShowModelConfig(false)} />
  ) : (
    <>
      <ToolList ... />
      <ToolDetail ... />
    </>
  )}
</main>
```

The management page (`ProviderManagement`) has CRUD form + list, no preview. The registration page (`ModelConfig`) has checkbox selection + real-time JSON preview + register action.

### Variant: Managing Entities with a Type/Category Field

When entities have a type that affects how they're merged into external config (e.g., providers with different API protocol types):

**Backend (`config.rs`)**:
- Add a `provider_type` (or similar) field with `#[serde(default = "default_xxx")]` for backward compat
- In the merge function, group entities by type into separate arrays in the output config:

```rust
#[serde(default = "default_provider_type")]
pub provider_type: String,

// In merge function:
match p.provider_type.as_str() {
    "anthropic" => anthropic_providers.push(entry),
    _ => openai_providers.push(entry),
}
```

**Frontend (`types/index.ts`)**:
- Define a union type: `export type ProviderType = 'openai' | 'openai-responses' | 'anthropic';`
- Add the field to the interface

**Frontend (form UI)**:
- Use a `<select>` dropdown with labeled options:

```tsx
const TYPE_OPTIONS = [
  { value: 'openai', label: 'OpenAI 兼容接口' },
  { value: 'openai-responses', label: 'OpenAI Response 接口' },
  { value: 'anthropic', label: 'Anthropic Message 接口' },
];

<select
  className="model-config-input model-config-select"
  value={form.provider_type}
  onChange={(e) => setForm((f) => ({ ...f, provider_type: e.target.value }))}
>
  {TYPE_OPTIONS.map((opt) => (
    <option key={opt.value} value={opt.value}>{opt.label}</option>
  ))}
</select>
```

**Frontend (list display)** — show a type badge on each entity:

```tsx
<span className="provider-type-badge">{typeLabel(p.provider_type)}</span>
```

**Preview function** — when computing merged config, group by type just like the backend:

```typescript
for (const p of selected) {
  if (p.provider_type === 'anthropic') {
    anthropicProviders.push(entry);
  } else {
    openaiProviders.push(entry);
  }
}
```

### Variant: Dropdown-Based Entity Addition (Instead of Inline List)

When the entity list could be large or entities come from two sources (e.g., existing external config entries + app-managed providers), use a **dropdown selector** instead of showing all available entities inline:

```tsx
const [dropdownValue, setDropdownValue] = useState('');
const [dropdownAddedKeys, setDropdownAddedKeys] = useState<Set<string>>(new Set());

// Filter dropdown options: exclude already-existing and already-added
const dropdownOptions = useMemo(() => {
  return allEntities.filter(e => {
    if (existingOccupied.has(e.id)) return false;
    if (dropdownAddedKeys.has(`entity:${e.id}`)) return false;
    return true;
  });
}, [allEntities, existingOccupied, dropdownAddedKeys]);

// Add handler: add to both dropdownAddedKeys and selectedKeys
const handleDropdownAdd = () => {
  if (!dropdownValue) return;
  const key = `entity:${dropdownValue}`;
  setDropdownAddedKeys(prev => new Set(prev).add(key));
  setSelectedKeys(prev => new Set(prev).add(key));
  setDropdownValue('');
};

// UI: dropdown + "Add" button + link to management page
<div className="provider-add-row">
  <select className="model-config-input model-config-select" value={dropdownValue}
    onChange={(e) => setDropdownValue(e.target.value)}>
    <option value="">-- 从 Provider 添加模型 --</option>
    {dropdownOptions.map(p => (
      <option key={p.id} value={p.id}>{p.name} ({p.model_name})</option>
    ))}
  </select>
  <button className="btn-add-provider" onClick={handleDropdownAdd} disabled={!dropdownValue}>
    添加
  </button>
  <button className="btn-link-action" onClick={onOpenManagement} title="管理 Provider">
    + 新建 Provider
  </button>
</div>
```

The model list then shows both existing entries (from external config) and dropdown-added entries. Unchecking a dropdown-added entry removes it from the list; unchecking an existing entry marks it for deletion from the external config.

### Variant: Footer with Back Button + Save Button

For pages where "cancel" means navigating back (not just closing a modal), use a footer with a back arrow on the left and save button on the right:

```tsx
<div className="model-config-actions">
  <button className="btn-back" onClick={onClose} title="取消并返回">←</button>
  <div className="model-config-actions-spacer" />
  <button className="btn-primary" onClick={handleSave} disabled={saving}>
    {saving ? '应用中...' : '应用配置'}
  </button>
</div>
```

```css
.model-config-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 24px;
  background: #16213e;
  border-top: 1px solid #0f3460;
}
.model-config-actions-spacer { flex: 1; }
.btn-back {
  display: inline-flex; align-items: center; justify-content: center;
  width: 36px; height: 36px;
  border: 1px solid #0f3460; border-radius: 6px;
  background: #0f3460; color: #eaeaea; font-size: 18px;
  cursor: pointer; transition: all 0.2s; flex-shrink: 0;
}
.btn-back:hover { background: #1a4a7a; border-color: #1a4a7a; transform: translateY(-1px); }
```

### Variant: Page Navigation with `previousPage` Tracking

When users can navigate between sub-pages (e.g., Config Page → Management Page → back to Config Page), track the origin in `App.tsx` so the back button returns to the correct page:

```tsx
const [showModelConfig, setShowModelConfig] = useState(false);
const [showProviderMgmt, setShowProviderMgmt] = useState(false);
const [previousPage, setPreviousPage] = useState<'home' | 'model-config'>('home');

// Entry from home → management
<Header onAddProvider={() => { setPreviousPage('home'); setShowProviderMgmt(true); }} />

// Entry from config → management (for adding new entities)
<ModelConfig onOpenProviderMgmt={() => {
  setPreviousPage('model-config');
  setShowProviderMgmt(true);
  setShowModelConfig(false);
}} />

// ProviderManagement back: return to previousPage
<ProviderManagement onClose={() => {
  setShowProviderMgmt(false);
  if (previousPage === 'model-config') setShowModelConfig(true);
}} />
```

This ensures:
- Home → Provider Management → back → Home
- Model Config → Provider Management → back → Model Config

### Variant: Inline Editing for List Items

When a list displays items from multiple sources (e.g., existing external config entries + app-managed entries), only items from certain sources should be editable. Use a state-driven inline edit pattern.

**Critical: Use array-index-based keys, not item-ID-based keys.** If two items in the same array share the same ID (e.g., two models with `id: "model"`), ID-based keys cause React key collisions and `find` by ID returns the wrong item. Index-based keys are always unique and allow direct array access.

**Type — add `index` field to display item:**

```typescript
export interface ModelDisplay {
  key: string;           // "existing:openai:0", "existing:anthropic:2", "provider:xxx"
  model_name: string;
  display_name: string;
  protocol: 'openai' | 'anthropic';
  source: 'existing' | 'provider';
  provider_id?: string;
  index?: number;        // array index in existingOpenai/existingAnthropic
}
```

**State setup:**

```tsx
const [editingKey, setEditingKey] = useState<string | null>(null);
const [editForm, setEditForm] = useState({ name: '', id: '', baseUrl: '', envKey: '' });
```

**Key generation — use array index:**

```tsx
// In loadData — index-based selectedKeys
const keys = new Set<string>();
for (let i = 0; i < oai.length; i++) keys.add(`existing:openai:${i}`);
for (let i = 0; i < ant.length; i++) keys.add(`existing:anthropic:${i}`);
setSelectedKeys(keys);

// In modelList useMemo — index-based keys with index field
for (let i = 0; i < existingOpenai.length; i++) {
  const m = existingOpenai[i];
  result.push({
    key: `existing:openai:${i}`,
    model_name: m.id,
    display_name: m.name,
    protocol: 'openai',
    source: 'existing',
    index: i,
  });
}
```

**Handlers — use `item.index` for direct array access (no `find`):**

```tsx
const handleEditStart = (item: ModelDisplay) => {
  if (item.source !== 'existing' || item.index === undefined) return;
  const existingModels = item.protocol === 'openai' ? existingOpenai : existingAnthropic;
  const found = existingModels[item.index];
  if (!found) return;
  setEditingKey(item.key);
  setEditForm({ name: found.name, id: found.id, baseUrl: found.baseUrl, envKey: found.envKey });
};

const handleEditCancel = () => setEditingKey(null);

// Parse index from key, update by index — no selectedKeys migration needed
const handleEditSave = (protocol: 'openai' | 'anthropic') => {
  const idx = editingKey ? parseInt(editingKey.split(':').pop()!, 10) : -1;
  if (idx < 0) return;
  const updateModels = protocol === 'openai' ? setExistingOpenai : setExistingAnthropic;
  updateModels((prev) =>
    prev.map((m, i) => {
      if (i !== idx) return m;
      return { ...m, id: editForm.id, name: editForm.name, baseUrl: editForm.baseUrl, envKey: editForm.envKey };
    }),
  );
  setEditingKey(null);
};
```

**Preview and register — use `item.index` for lookup:**

```tsx
// In preview useMemo and handleRegister:
for (const item of modelList) {
  if (!selectedKeys.has(item.key)) continue;
  if (item.source === 'existing' && item.index !== undefined) {
    const existingModels = item.protocol === 'openai' ? existingOpenai : existingAnthropic;
    const found = existingModels[item.index];
    if (found) {
      if (item.protocol === 'openai') keepOpenai.push(found);
      else keepAnthropic.push(found);
    }
  } else if (item.provider_id) {
    newProviderIds.push(item.provider_id);
  }
}
```

**Rendering** — conditionally swap between edit form and normal row:

```tsx
{modelList.map((item) => {
  // Edit mode: inline form replaces the row
  if (editingKey === item.key && item.source === 'existing') {
    return (
      <div key={item.key} className="provider-edit-form">
        <div className="provider-edit-row">
          <input className="model-config-input" placeholder="显示名称"
            value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
          <input className="model-config-input" placeholder="模型 ID"
            value={editForm.id} onChange={(e) => setEditForm((f) => ({ ...f, id: e.target.value }))} />
        </div>
        <div className="provider-edit-row">
          <input className="model-config-input" placeholder="Base URL"
            value={editForm.baseUrl} onChange={(e) => setEditForm((f) => ({ ...f, baseUrl: e.target.value }))} />
          <input className="model-config-input" placeholder="环境变量 Key"
            value={editForm.envKey} onChange={(e) => setEditForm((f) => ({ ...f, envKey: e.target.value }))} />
        </div>
        <div className="provider-edit-actions">
          <button className="btn-add-provider" onClick={() => handleEditSave(item.protocol)}>保存</button>
          <button className="btn-link-action" onClick={handleEditCancel}>取消</button>
        </div>
      </div>
    );
  }

  // Normal mode: label row with optional edit button
  return (
    <label key={item.key} className="provider-select-item">
      {/* checkbox, info, protocol tag, source badge ... */}
      {item.source === 'existing' && !editingKey && (
        <button className="btn-provider-edit"
          onClick={(e) => { e.preventDefault(); handleEditStart(item); }} title="编辑">✎</button>
      )}
    </label>
  );
})}
```

**Key rules:**
- **Always use array index in the key** (`existing:openai:0`) — never use the item's ID (`existing:openai:gpt-4`) which can collide
- **Use `item.index` for direct array access** — never `find` by ID which returns wrong items when IDs are duplicated
- **No `selectedKeys` migration needed** when ID changes — index-based keys are stable regardless of content changes
- Edit button only appears when no other item is being edited (`!editingKey`) — prevents confusion
- `editForm` is populated on edit start; changes are local until "保存"
- Saving updates the parent state array by index, which triggers `useMemo` recomputation of the preview
- Use `e.preventDefault()` on the edit button since it's inside a `<label>` to avoid toggling the checkbox

**Error recovery in `loadData`:** When `invoke` fails, reset all dependent state in the `catch` block so the UI doesn't get stuck in loading state:

```tsx
catch (err) {
  console.error('Failed to load data:', err);
  setCurrentSettings({});
  setExistingOpenai([]);
  setExistingAnthropic([]);
  setSelectedKeys(new Set());
  setDropdownAddedKeys(new Set());
}
```

**CSS:**

```css
.provider-edit-form {
  display: flex; flex-direction: column; gap: 6px;
  padding: 10px 12px; background: #16213e;
  border: 1px solid #e94560; border-radius: 6px;
}
.provider-edit-row { display: flex; gap: 8px; }
.provider-edit-row .model-config-input { flex: 1; min-width: 0; padding: 6px 10px; font-size: 12px; }
.provider-edit-actions { display: flex; gap: 8px; justify-content: flex-end; }
.btn-provider-edit {
  background: none; border: 1px solid #0f3460; border-radius: 4px;
  color: #888; cursor: pointer; font-size: 13px; padding: 2px 6px;
  transition: all 0.2s; flex-shrink: 0;
}
.btn-provider-edit:hover { border-color: #e94560; color: #e94560; }
```

### Variant: Multi-Entry-Point Page with Section Navigation (Legacy)

> **Prefer splitting into independent pages** (see above) when sections have different purposes. This pattern is kept for reference when a single page with multiple sections is acceptable.

When a config page is accessible from **both** the Header (global action) and ToolDetail (tool-specific action), use an `initialSection` prop to control which section the user sees:

```typescript
interface ModelConfigProps {
  initialSection?: 'provider' | 'registration';
  onClose: () => void;
}
```

In `App.tsx`, track the target section alongside visibility:

```tsx
const [showModelConfig, setShowModelConfig] = useState(false);
const [modelConfigSection, setModelConfigSection] = useState<'provider' | 'registration'>('provider');

// Header → global entry, defaults to management section
<Header onAddProvider={() => { setModelConfigSection('provider'); setShowModelConfig(true); }} />

// ToolDetail → tool-specific entry, jumps to registration section
<ToolDetail onOpenModelConfig={() => { setModelConfigSection('registration'); setShowModelConfig(true); }} />
```

In the page component, attach `ref` to each section and scroll on mount:

```tsx
const registrationRef = useRef<HTMLDivElement>(null);
const providerRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  if (loading) return;
  const ref = initialSection === 'registration' ? registrationRef : providerRef;
  ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}, [loading, initialSection]);
```

### Design Decisions

- **Page switch, not modal**: Config pages replace the main content area entirely. This gives more space for complex forms and a clearer mental model (navigate to → configure → save → return). Use modal overlays (Settings, EnvDetail) only for simple quick actions.
- **Self-contained loading**: The page component loads its own data on mount via `useEffect` + `invoke`. This keeps App.tsx clean — it only manages the visibility boolean.
- **Both save and exit return**: `onSave` and `onClose` both set the state to false. The difference is `onSave` persists first. For pages without a save button (e.g., CRUD management), only `onClose` is needed.
- **Trigger in ToolDetail**: The primary entry point lives in the tool's detail panel, not in the header. This keeps the header clean and makes the config action contextually relevant to the selected tool.
- **Global entry via Header for cross-tool features**: When a feature (e.g., Provider management) is useful across multiple tools, add a dedicated button in the Header. Prefer **independent pages** over `initialSection` section navigation — each page has a single responsibility, simpler state, and natural entry-point mapping.
- **Use dedicated Tauri commands**: Don't reuse `get_config`/`save_config` for feature-specific configs. Dedicated commands keep the API clean and allow the page to load only what it needs.
- **`useMemo` for derived state**: When computing preview text or merged config from multiple state sources, use `useMemo` instead of `useEffect` + `setState` to avoid the `react-hooks/set-state-in-effect` lint error and unnecessary re-renders.

### Checklist

- [ ] `config.rs`: New fields with `#[serde(default)]`, dedicated config struct, get/set helpers
- [ ] `lib.rs`: New commands (get/save/create/delete as needed), registered in `invoke_handler`
- [ ] `types/index.ts`: Mirror Rust types
- [ ] `src/pages/ConfigPage.tsx`: Self-loading form with save/exit (or CRUD + preview)
- [ ] `App.tsx`: Boolean state, conditional render inside `<main>`, pass callback to ToolDetail
- [ ] `ToolDetail.tsx`: New optional prop, conditional button for specific tool
- [ ] `App.css`: Page layout + trigger button styles using project theme tokens
- [ ] `App.css`: Inline edit form styles (`.provider-edit-form`, `.provider-edit-row`, `.btn-provider-edit`) if list items are editable
- [ ] Run `npm run lint` and `npm run build` to verify

### Variant: Password Input with Toggle Button

When a form contains sensitive fields (API keys, tokens), add a show/hide toggle button inside the input wrapper:

**State:**

```tsx
const [showKey, setShowKey] = useState(false);
// Reset on edit start:
const handleEditStart = (item: Entity) => {
  setShowKey(false);
  // ... populate form ...
};
```

**JSX** — wrap the input in `.password-input-wrapper`:

```tsx
<div className="password-input-wrapper">
  <input
    className="model-config-input"
    type={showKey ? 'text' : 'password'}
    placeholder="API Key"
    value={editForm.api_key}
    onChange={(e) => setEditForm((f) => ({ ...f, api_key: e.target.value }))}
  />
  <button
    className="btn-toggle-password"
    type="button"
    onClick={() => setShowKey((v) => !v)}
    title={showKey ? '隐藏密码' : '显示密码'}
  >
    {showKey ? '🙈' : '👁'}
  </button>
</div>
```

**CSS:**

```css
.password-input-wrapper {
  position: relative;
  flex: 1;
  min-width: 0;
}
.password-input-wrapper .model-config-input {
  width: 100%;
  padding-right: 40px;   /* space for the toggle button */
}
.btn-toggle-password {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  padding: 2px 4px;
  line-height: 1;
  opacity: 0.6;
  transition: opacity 0.2s;
}
.btn-toggle-password:hover { opacity: 1; }
```

### Variant: Section Title with Action Button

When a section title needs a companion action (e.g., "open file", "refresh"), wrap them in a flex row:

```tsx
<div className="model-config-section-title-row">
  <h3 className="model-config-section-title">Qwen Code settings.json 预览</h3>
  <button className="btn-link-action" onClick={handleOpenFile} title="打开配置文件">
    打开配置文件
  </button>
</div>
```

```css
.model-config-section-title-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.model-config-section-title-row .model-config-section-title {
  margin: 0;
}
```

### Variant: Opening External Files from Tauri

To open a file with the system's default editor/viewer, add a Tauri command using platform-specific shell commands:

```rust
use std::process::Command;

#[tauri::command]
fn open_external_file(path: String) -> Result<(), String> {
    let mut command = if cfg!(target_os = "windows") {
        let mut c = Command::new("cmd");
        c.args(["/C", "start", "", &path]);
        c
    } else if cfg!(target_os = "macos") {
        let mut c = Command::new("open");
        c.arg(&path);
        c
    } else {
        let mut c = Command::new("xdg-open");
        c.arg(&path);
        c
    };
    command.spawn().map_err(|e| e.to_string())?;
    Ok(())
}
```

Frontend call:

```tsx
const handleOpenFile = async () => {
  try {
    await invoke('open_external_file', { path: settingsPath });
  } catch (err) {
    alert(`打开失败: ${err}`);
  }
};
```

For a known path (e.g., `~/.qwen/settings.json`), expose a dedicated command that constructs the path internally (using `config::get_tool_settings_path()`) so the frontend doesn't need to know the absolute path.
