import { useEffect, useMemo, useRef, useState } from 'react';
import type { TableColumnSizingOptions } from '@fluentui/react-components';

type SizingValue = {
  minWidth?: number;
  defaultWidth?: number;
  idealWidth?: number;
  padding?: number;
};

/**
 * Tracks the parent container width via ResizeObserver and stretches the listed
 * flex columns so the combined column widths match the available parent width.
 * Falls back to the base sizing when the parent is narrower than the base sum.
 *
 * Fluent UI v9 DataGrid does not support fr-style flex columns natively, so we
 * compute fresh defaultWidth values whenever the container resizes.
 *
 * @param baseSizing - Default column sizing options (defaultWidth is the minimum stretched size).
 * @param flexColumnIds - Column IDs that absorb extra width when the container is wider than the base sum.
 */
export function useStretchedColumnSizing<T extends string>(
  baseSizing: Record<T, SizingValue>,
  flexColumnIds: readonly T[],
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      setContainerWidth(width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Bucket the width to ~50px granularity. Fluent UI v9 DataGrid only consumes
  // columnSizingOptions on mount, so we re-key the grid when the bucket changes
  // to force a fresh layout pass without thrashing on every pixel shift.
  const widthBucket = Math.floor(containerWidth / 50);

  const columnSizingOptions = useMemo<TableColumnSizingOptions>(() => {
    const baseSum = Object.values<SizingValue>(baseSizing).reduce(
      (s, v) => s + (v.defaultWidth ?? v.minWidth ?? 0),
      0,
    );
    if (containerWidth <= 0 || containerWidth <= baseSum || flexColumnIds.length === 0) {
      return baseSizing as TableColumnSizingOptions;
    }
    const extra = containerWidth - baseSum;
    const perCol = extra / flexColumnIds.length;
    const next: TableColumnSizingOptions = { ...(baseSizing as TableColumnSizingOptions) };
    for (const id of flexColumnIds) {
      const base = baseSizing[id];
      if (base) {
        next[id] = {
          ...base,
          defaultWidth: (base.defaultWidth ?? base.minWidth ?? 0) + perCol,
        };
      }
    }
    return next;
  }, [baseSizing, containerWidth, flexColumnIds]);

  return { containerRef, columnSizingOptions, gridKey: `g-${widthBucket}` };
}
