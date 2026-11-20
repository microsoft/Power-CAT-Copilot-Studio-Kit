import { useRef, useState } from 'react';
import type { DragEvent } from 'react';

/** Where a dragged column should be dropped relative to the target column. */
export type ColumnDropPosition = 'before' | 'after';

/** Currently highlighted drop location during a column drag, or null when idle. */
export interface ColumnDropTarget {
  columnId: string;
  position: ColumnDropPosition;
}

interface DragSourceProps {
  draggable: true;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
}

interface DropTargetProps {
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDragLeave: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
}

export interface ColumnDragReorder {
  /** Column id currently being dragged, or null when no drag is active. */
  draggingColumnId: string | null;
  /** Column and side currently highlighted as the drop location, or null. */
  dropTarget: ColumnDropTarget | null;
  /** Native drag props for the element that initiates a column drag. */
  getDragSourceProps: (columnId: string) => DragSourceProps;
  /** Native drop props for the header cell that can receive a dropped column. */
  getDropTargetProps: (columnId: string) => DropTargetProps;
}

function resolvePosition(event: DragEvent<HTMLElement>): ColumnDropPosition {
  const rect = event.currentTarget.getBoundingClientRect();
  return event.clientX < rect.left + rect.width / 2 ? 'before' : 'after';
}

/**
 * Provides HTML5 drag-and-drop handlers for reordering grid columns left/right.
 * Logic is shared so both the standard and grouped grid headers behave identically.
 * @param moveColumn - reorders the source column relative to the target column.
 */
export function useColumnDragReorder(
  moveColumn: (sourceColumnId: string, targetColumnId: string, position: ColumnDropPosition) => void,
): ColumnDragReorder {
  const draggingColumnIdRef = useRef<string | null>(null);
  const [draggingColumnId, setDraggingColumnId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<ColumnDropTarget | null>(null);

  const reset = () => {
    draggingColumnIdRef.current = null;
    setDraggingColumnId(null);
    setDropTarget(null);
  };

  return {
    draggingColumnId,
    dropTarget,
    getDragSourceProps: (columnId) => ({
      draggable: true,
      onDragStart: (event) => {
        draggingColumnIdRef.current = columnId;
        setDraggingColumnId(columnId);
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', columnId);
      },
      onDragEnd: reset,
    }),
    getDropTargetProps: (columnId) => ({
      onDragOver: (event) => {
        const source = draggingColumnIdRef.current;
        if (!source) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        if (source === columnId) {
          if (dropTarget) setDropTarget(null);
          return;
        }
        const position = resolvePosition(event);
        if (dropTarget?.columnId !== columnId || dropTarget.position !== position) {
          setDropTarget({ columnId, position });
        }
      },
      onDragLeave: (event) => {
        const nextTarget = event.relatedTarget as Node | null;
        if (nextTarget && event.currentTarget.contains(nextTarget)) return;
        if (dropTarget?.columnId === columnId) setDropTarget(null);
      },
      onDrop: (event) => {
        event.preventDefault();
        const source = draggingColumnIdRef.current ?? event.dataTransfer.getData('text/plain');
        if (source && source !== columnId) {
          moveColumn(source, columnId, resolvePosition(event));
        }
        reset();
      },
    }),
  };
}
