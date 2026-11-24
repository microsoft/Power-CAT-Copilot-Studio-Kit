import { useRef, useState, useEffect, useCallback } from 'react';

export interface ChartDimensions {
  width: number;
  height: number;
}

interface UseChartResizeOptions {
  minWidth?: number;
  minHeight?: number;
  widthOffset?: number;
}

/**
 * Hook providing responsive chart dimensions via ResizeObserver.
 * Implements the three-layer overflow control pattern:
 * 1. Wrapper div — overflow: hidden, position: relative, constrained minHeight
 * 2. Chart root styles — overflow: hidden passed to library
 * 3. Container dimension — calculated via ResizeObserver with safe minimums
 */
export function useChartResize(options: UseChartResizeOptions = {}) {
  const { minWidth = 200, minHeight = 150, widthOffset = 16 } = options;
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState<ChartDimensions>({ width: minWidth, height: minHeight });

  const updateDimensions = useCallback(() => {
    if (!containerRef.current) return;
    const { clientWidth, clientHeight } = containerRef.current;
    setDimensions({
      width: Math.max(clientWidth - widthOffset, minWidth),
      height: Math.max(clientHeight, minHeight),
    });
  }, [minWidth, minHeight, widthOffset]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    updateDimensions();

    const observer = new ResizeObserver(() => {
      updateDimensions();
    });
    observer.observe(el);

    return () => observer.disconnect();
  }, [updateDimensions]);

  return { containerRef, dimensions };
}
