---
name: reorderable-tool-list
description: Implement drag-and-drop reordering of tools with persisted order in Coder Manager
source: auto-skill
extracted_at: '2026-05-31T07:10:00.000Z'
---

## Adding Drag-and-Drop Reordering with Persistence

### Architecture

The tool list order is persisted in `AppConfig.tool_order` (Rust `Vec<String>`) and applied on every tool list query.

### Backend Changes

**1. `config.rs`** — Add `tool_order` field to `AppConfig`:

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AppConfig {
    pub ignored_tools: Vec<String>,
    pub last_check_time: Option<String>,
    #[serde(default)]
    pub tool_order: Vec<String>,
}

impl AppConfig {
    pub fn set_tool_order(&mut self, order: Vec<String>) {
        self.tool_order = order;
    }
}
```

**2. `lib.rs`** — Add sorting helper + save command:

```rust
fn sort_tools_by_config(tools: &mut Vec<CliTool>, tool_order: &[String]) {
    if tool_order.is_empty() {
        return;
    }
    tools.sort_by_key(|t| {
        let idx = tool_order.iter().position(|name| name == &t.name);
        idx.unwrap_or(usize::MAX)
    });
}
```

Apply `sort_tools_by_config(&mut tools, &config.tool_order)` in `get_tools_quick`, `get_tool_names`, and `check_for_updates`.

Add `save_tool_order` command:

```rust
#[tauri::command]
fn save_tool_order(order: Vec<String>) -> Result<(), String> {
    let mut config = AppConfig::load();
    config.set_tool_order(order);
    config.save()
}
```

Register it in `invoke_handler`.

### Frontend Changes

**1. `types/index.ts`** — Extend `AppConfig`:

```typescript
export interface AppConfig {
  ignored_tools: string[];
  last_check_time: string | null;
  tool_order: string[];
}
```

**2. `ToolList.tsx`** — HTML5 Drag & Drop:

- Add `draggable` to each `.tool-item`
- Track `dragIndex` and `dragOverIndex` state
- On drop: splice the moved item, call `onReorder(reordered.map(t => t.name))`
- Add drag handle `⠿` icon

**⚠️ Critical DnD requirements for Tauri WebView:**

1. `onDragStart` MUST call `e.dataTransfer.setData('text/plain', ...)` — without this, the WebView will not fire `onDrop`
2. `onDragStart` should also set `e.dataTransfer.effectAllowed = 'move'`
3. Use a `useRef` to track whether a drag actually happened, then skip `onClick` after a drag to prevent the tool being selected mid-drag:

```typescript
const dragHappened = useRef(false);

const handleDragOver = (e: React.DragEvent) => {
  dragHappened.current = true;
};

const handleClick = (tool: CliTool) => {
  if (!dragHappened.current) {
    onSelectTool(tool);
  }
};
```

4. Wrap all handlers in `useCallback` to avoid re-rendering during drag

**3. `App.tsx`** — Handle reorder callback:

```typescript
const handleReorder = async (order: string[]) => {
  await invoke('save_tool_order', { order });
  // 重排现有 tools，避免丢失已查到的网络版本信息
  const orderMap = new Map(order.map((name, idx) => [name, idx]));
  setTools((prev) =>
    [...prev].sort((a, b) => {
      const idxA = orderMap.get(a.name) ?? Number.MAX_SAFE_INTEGER;
      const idxB = orderMap.get(b.name) ?? Number.MAX_SAFE_INTEGER;
      return idxA - idxB;
    }),
  );
};
```

**Note**: Reorder applies sorting to the existing `tools` array in-place rather than re-fetching from backend — this preserves already-fetched `latest_version` / `update_available` fields that would be lost by re-calling `get_tools_quick`.

**4. `App.css`** — Drag styles:

```css
.tool-item { cursor: grab; user-select: none; }
.tool-item.dragging { opacity: 0.5; cursor: grabbing; }
.tool-item.drag-over { box-shadow: inset 0 2px 0 0 #e94560; }
.drag-handle { cursor: grab; color: #555; }
.tool-item:hover .drag-handle { color: #e94560; }
```

### Key Design Decisions

- **Server-side sorting**: Order is applied in Rust on every `get_tools_quick` call, so new/uninstalled tools (not in `tool_order`) appear at the end via `usize::MAX` fallback
- **Immediate refresh**: After saving order, the existing `tools` array is re-sorted in-place on the frontend (no backend re-fetch needed)
- **No external drag library**: Uses native HTML5 DnD API (no `react-beautiful-dnd` or `@dnd-kit` dependency)
