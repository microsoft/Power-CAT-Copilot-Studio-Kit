/**
 * FluentHorizontalBarChart - Wrapper for @fluentui/react-charting HorizontalBarChart.
 *
 * CRITICAL: `y` must be Math.max(...allItems.map(i => i.value)) across ALL items.
 * If x === y, every bar renders at 100% with no gray remainder.
 * Responsive sizing via ResizeObserver. Three-layer overflow control.
 */

import React, { useRef, useState, useEffect, useMemo } from "react";
import { makeStyles } from "@fluentui/react-components";
import { HorizontalBarChart } from "@fluentui/react-charting";
import { CHART_COLORS_ARRAY } from "../../contracts/types";

export interface HorizontalBarDataItem {
  label: string;
  value: number;
  color?: string;
}

export interface FluentHorizontalBarChartProps {
  items: HorizontalBarDataItem[];
}

const useStyles = makeStyles({
  wrapper: {
    width: "100%",
    height: "100%",
    overflow: "hidden",
    position: "relative",
    minHeight: "220px",
  },
});

/** Responsive HorizontalBarChart with proportional y scaling. */
const FluentHorizontalBarChart: React.FC<FluentHorizontalBarChartProps> = ({
  items,
}) => {
  const styles = useStyles();
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 500, height: 220 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        const { width, height } = entry.contentRect;
        setDimensions({
          width: Math.max(width - 16, 200),
          height: Math.max(height, 150),
        });
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const chartData = useMemo(() => {
    if (items.length === 0) return [];

    const maxValue = Math.max(...items.map((i) => i.value), 1);

    return items.map((item, idx) => ({
      chartTitle: item.label,
      chartData: [
        {
          legend: item.label,
          horizontalBarChartdata: { x: item.value, y: maxValue },
          color:
            item.color ?? CHART_COLORS_ARRAY[idx % CHART_COLORS_ARRAY.length],
        },
      ],
    }));
  }, [items]);

  if (items.length === 0) return null;

  return (
    <div ref={containerRef} className={styles.wrapper}>
      <HorizontalBarChart
        data={chartData}
        width={dimensions.width}
        styles={{
          root: {
            width: "100%",
            overflow: "hidden",
          },
        }}
      />
    </div>
  );
};

export default React.memo(FluentHorizontalBarChart);
