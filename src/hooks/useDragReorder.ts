import { useState, useCallback, useRef, useEffect } from 'react';

interface UseDragReorderOptions<T> {
  items: T[];
  onReorder: (reordered: T[]) => void;
}

export function useDragReorder<T>({ items, onReorder }: UseDragReorderOptions<T>) {
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
        const item = els.find(el => el.classList?.contains('drag-item'));
        if (item && containerRef.current) {
          const children = containerRef.current.children;
          for (let i = 0; i < children.length; i++) {
            if (children[i] === item) {
              setDragOverIndex(i);
              return;
            }
          }
        }
      }
    };

    const onPointerUp = () => {
      if (hasMoved.current && dragIndex !== null && dragOverIndex !== null && dragIndex !== dragOverIndex) {
        const reordered = [...items];
        const [moved] = reordered.splice(dragIndex, 1);
        reordered.splice(dragOverIndex, 0, moved);
        onReorder(reordered);
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
  }, [dragIndex, items, dragOverIndex, onReorder]);

  const handlePointerDown = useCallback((e: React.PointerEvent, index: number) => {
    e.preventDefault();
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    hasMoved.current = false;
    setDragIndex(index);
  }, []);

  const handleContainerClick = useCallback(() => {
    return hasMoved.current;
  }, []);

  return {
    dragIndex,
    dragOverIndex,
    containerRef,
    handlePointerDown,
    handleContainerClick,
  };
}
