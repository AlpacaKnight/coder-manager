import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';

interface UseDragReorderOptions<T> {
  items: T[];
  onReorder: (items: T[]) => void;
}

interface UseDragReorderResult {
  dragIndex: number | null;
  dragOverIndex: number | null;
  containerRef: RefObject<HTMLDivElement | null>;
  handlePointerDown: (event: ReactPointerEvent, index: number) => void;
  handleContainerClick: () => boolean;
}

export function useDragReorder<T extends object>({ items, onReorder }: UseDragReorderOptions<T>): UseDragReorderResult {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragIndexRef = useRef<number | null>(null);
  const dragOverIndexRef = useRef<number | null>(null);
  const itemsRef = useRef<T[]>(items);
  const onReorderRef = useRef(onReorder);
  const clickSuppressedRef = useRef(false);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    onReorderRef.current = onReorder;
  }, [onReorder]);

  const findIndexFromPointer = useCallback((event: PointerEvent): number | null => {
    const container = containerRef.current;
    if (!container) return null;

    const children = Array.from(container.children) as HTMLElement[];
    const y = event.clientY;

    for (let i = 0; i < children.length; i += 1) {
      const rect = children[i].getBoundingClientRect();
      if (y >= rect.top && y <= rect.bottom) {
        return i;
      }
    }

    // 指针位于最后一项底部之下时，返回末尾位置（允许拖到列表最后）
    if (children.length > 0) {
      const lastRect = children[children.length - 1].getBoundingClientRect();
      if (y > lastRect.bottom) {
        return children.length - 1;
      }
    }

    return null;
  }, []);

  const updateDragOver = useCallback((event: PointerEvent) => {
    if (!isDraggingRef.current) return;
    const overIndex = findIndexFromPointer(event);
    if (overIndex !== null && overIndex !== dragOverIndexRef.current) {
      dragOverIndexRef.current = overIndex;
      setDragOverIndex(overIndex);
    }
  }, [findIndexFromPointer]);

  const endDrag = useCallback(() => {
    if (!isDraggingRef.current) return;

    const sourceIndex = dragIndexRef.current;
    const targetIndex = dragOverIndexRef.current;

    isDraggingRef.current = false;
    dragIndexRef.current = null;
    dragOverIndexRef.current = null;
    setDragIndex(null);
    setDragOverIndex(null);

    if (sourceIndex !== null && targetIndex !== null && sourceIndex !== targetIndex) {
      const nextItems = [...itemsRef.current];
      const [movedItem] = nextItems.splice(sourceIndex, 1);
      nextItems.splice(targetIndex, 0, movedItem);
      onReorderRef.current(nextItems);
    }
  }, []);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (!isDraggingRef.current) return;
      clickSuppressedRef.current = true;
      updateDragOver(event);
    };

    const handlePointerUp = () => {
      if (!isDraggingRef.current) return;
      endDrag();
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [endDrag, updateDragOver]);

  const handlePointerDown = useCallback((event: ReactPointerEvent, index: number) => {
    event.preventDefault();
    isDraggingRef.current = true;
    clickSuppressedRef.current = false;
    dragIndexRef.current = index;
    dragOverIndexRef.current = index;
    setDragIndex(index);
    setDragOverIndex(index);
    // setPointerCapture 在 pointerId 无效或元素已释放指针时可能抛异常
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // 退化为依赖 window 监听（已在上方 addEventListener）
    }
  }, []);

  const handleContainerClick = useCallback(() => {
    const shouldSuppress = clickSuppressedRef.current;
    clickSuppressedRef.current = false;
    return shouldSuppress;
  }, []);

  return {
    dragIndex,
    dragOverIndex,
    containerRef,
    handlePointerDown,
    handleContainerClick,
  };
}
