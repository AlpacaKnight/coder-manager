import { useDragReorder } from '../hooks/useDragReorder';
import type { CliTool } from '../types';

interface ToolListProps {
  tools: CliTool[];
  selectedTool: CliTool | null;
  onSelectTool: (tool: CliTool) => void;
  onReorder?: (order: string[]) => void;
  isChecking?: boolean;
}

const statusIcons: Record<string, string> = {
  UpToDate: '✅',
  UpdateAvailable: '🔄',
  ManualUpdate: '⚠️',
  NotInstalled: '❌',
  Ignored: '⏸️',
  Error: '❗',
  Checking: '⏳',
};

export function ToolList({ tools, selectedTool, onSelectTool, onReorder, isChecking }: ToolListProps) {
  const {
    dragIndex,
    dragOverIndex,
    containerRef,
    handlePointerDown,
    handleContainerClick,
  } = useDragReorder({
    items: tools,
    onReorder: (reordered) => onReorder?.(reordered.map(t => t.name)),
  });

  const handleClick = (tool: CliTool) => {
    if (!handleContainerClick()) {
      onSelectTool(tool);
    }
  };

  return (
    <div className="tool-list">
      <h2>
        CLI 工具列表
        {isChecking && <span className="checking-indicator"> 检查更新中...</span>}
      </h2>
      <div className="tools-container" ref={containerRef}>
        {tools.map((tool, index) => (
          <div
            key={tool.name}
            data-index={index}
            className={`tool-item drag-item ${
              selectedTool?.name === tool.name ? 'selected' : ''
            } ${
              dragIndex === index ? 'dragging' : ''
            } ${
              dragOverIndex !== null && dragOverIndex === index && dragIndex !== index ? 'drag-over' : ''
            }`}
            onPointerDown={(e) => { e.stopPropagation(); handlePointerDown(e, index); }}
            onClick={() => handleClick(tool)}
          >
            <span className="drag-handle" title="拖拽排序">⠿</span>
            <span className="status-icon">{statusIcons[tool.status]}</span>
            <span className="tool-name">{tool.display_name}</span>
            <span className="tool-version">{tool.current_version || 'N/A'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
