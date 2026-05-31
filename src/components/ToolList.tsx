import { useState, useCallback, useRef, useEffect } from 'react';
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
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragStartPos = useRef<{ x: number; y: number } | null>(null);
  const hasMoved = useRef(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (dragIndex === null || dragStartPos.current === null) return;
    const startPos = dragStartPos.current;

    const onPointerMove = (e: PointerEvent) => {
      const dx = e.clientX - startPos.x;
      const dy = e.clientY - startPos.y;
      if (!hasMoved.current && Math.sqrt(dx * dx + dy * dy) > 5) {
        hasMoved.current = true;
      }
      if (hasMoved.current) {
        const els = document.elementsFromPoint(e.clientX, e.clientY);
        const toolItem = els.find(el => el.classList?.contains('tool-item'));
        if (toolItem && containerRef.current) {
          const children = containerRef.current.children;
          for (let i = 0; i < children.length; i++) {
            if (children[i] === toolItem) {
              setDragOverIndex(i);
              return;
            }
          }
        }
      }
    };

    const onPointerUp = () => {
      if (hasMoved.current && dragIndex !== null && dragOverIndex !== null && dragIndex !== dragOverIndex && onReorder) {
        const reordered = [...tools];
        const [moved] = reordered.splice(dragIndex, 1);
        reordered.splice(dragOverIndex, 0, moved);
        onReorder(reordered.map(t => t.name));
      }
      setDragIndex(null);
      setDragOverIndex(null);
      dragStartPos.current = null;
      hasMoved.current = false;
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
    };

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    return () => {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
    };
  }, [dragIndex, tools, dragOverIndex, onReorder]);

  const handlePointerDown = useCallback((e: React.PointerEvent, index: number) => {
    e.preventDefault();
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    hasMoved.current = false;
    setDragIndex(index);
  }, []);

  const handleClick = useCallback((tool: CliTool) => {
    if (!hasMoved.current) {
      onSelectTool(tool);
    }
  }, [onSelectTool]);

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
            className={`tool-item ${
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
