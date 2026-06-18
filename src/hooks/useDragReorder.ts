import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent, RefObject } from 'react';

interface UseDragReorderOptions<T> {
  items: T[];
  onReorder: (items: T[]) => void;
}

interface UseDragReorderResult {
  dragIndex: number | null;
  dragOverIndex: number | null;
  containerRef: RefObject<HTMLDivElement | null>;
  handlePointerDown: (event: PointerEvent, index: number) => void;
  handleContainerClick: () => boolean;
}

export function useDragReorder<T extends object>({ items, onReorder }: UseDragReorderOptions<T>): UseDragReorderResult {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragIndexRef = useRef<number | null>(null);
  const dragOverIndexRef = useRef<number | null>(null);
  const itemsRef = useRef<T[]>(items);
  const clickSuppressedRef = useRef(false);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

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
      onReorder(nextItems);
    }
  }, [onReorder]);

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

    if (isDraggingRef.current) {
      window.addEventListener('pointermove', handlePointerMove as any);
      window.addEventListener('pointerup', handlePointerUp as any);

      return () => {
        window.removeEventListener('pointermove', handlePointerMove as any);
        window.removeEventListener('pointerup', handlePointerUp as any);
      };
    }

    return undefined;
  }, [endDrag, updateDragOver]);

  const handlePointerDown = useCallback((event: PointerEvent, index: number) => {
    event.preventDefault();
    isDraggingRef.current = true;
    clickSuppressedRef.current = false;
    dragIndexRef.current = index;
    dragOverIndexRef.current = index;
    setDragIndex(index);
    setDragOverIndex(index);
    event.currentTarget.setPointerCapture(event.pointerId);
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
