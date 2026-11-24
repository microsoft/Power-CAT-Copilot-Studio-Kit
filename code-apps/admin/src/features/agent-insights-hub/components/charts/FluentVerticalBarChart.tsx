/**
 * FluentVerticalBarChart - Wrapper for @fluentui/react-charting VerticalBarChart.
 *
 * Adds rotateXAxisLables={true} when data exceeds 10 items.
 * Responsive sizing via ResizeObserver. Three-layer overflow control.
 */

import React, { useRef, useState, useEffect, useMemo } from "react";
import { makeStyles } from "@fluentui/react-components";
import { VerticalBarChart } from "@fluentui/react-charting";
import { CHART_COLORS_ARRAY } from "../../contracts/types";

export interface VerticalBarDataItem {
  x: string | number;
  y: number;
  color?: string;
  legend?: string;
}

export interface FluentVerticalBarChartProps {
  chartTitle?: string;
  items: VerticalBarDataItem[];
  hideLegend?: boolean;
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

/** Responsive VerticalBarChart with automatic axis label rotation. */
const FluentVerticalBarChart: React.FC<FluentVerticalBarChartProps> = ({
  chartTitle,
  items,
  hideLegend = false,
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
          height: Math.max(height, 200),
        });
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const chartData = useMemo(
    () =>
      items.map((item, idx) => ({
        x: item.x,
        y: item.y,
        color: item.color ?? CHART_COLORS_ARRAY[idx % CHART_COLORS_ARRAY.length],
        legend: item.legend,
      })),
    [items]
  );

  if (items.length === 0) return null;

  const shouldRotate = items.length > 10;

  return (
    <div ref={containerRef} className={styles.wrapper}>
      <VerticalBarChart
        chartTitle={chartTitle}
        data={chartData}
        width={dimensions.width}
        height={dimensions.height}
        rotateXAxisLables={shouldRotate}
        hideLegend={hideLegend}
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

export default React.memo(FluentVerticalBarChart);
