/**
 * FluentLineChart - Wrapper for @fluentui/react-charting LineChart.
 *
 * CRITICAL: Uses wrapper object format `{ chartTitle, lineChartData }`.
 * Direct array causes runtime crash (.some() undefined error).
 * x-axis values MUST be Date objects, not strings.
 * Three-layer overflow control applied.
 */

import React, { useRef, useState, useEffect } from "react";
import { makeStyles } from "@fluentui/react-components";
import { LineChart } from "@fluentui/react-charting";
import type { ILineChartPoints } from "@fluentui/react-charting";
import { CHART_COLORS_ARRAY } from "../../contracts/types";

export interface FluentLineChartProps {
  chartTitle: string;
  series: {
    legend: string;
    data: { x: Date; y: number }[];
    color?: string;
  }[];
  strokeWidth?: number;
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

/** Responsive LineChart wrapper with three-layer overflow control. */
const FluentLineChart: React.FC<FluentLineChartProps> = ({
  chartTitle,
  series,
  strokeWidth = 2,
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

  if (series.length === 0) return null;

  const lineChartData: ILineChartPoints[] = series.map((s, idx) => ({
    legend: s.legend,
    data: s.data,
    color: s.color ?? CHART_COLORS_ARRAY[idx % CHART_COLORS_ARRAY.length],
  }));

  const chartData = {
    chartTitle,
    lineChartData,
  };

  return (
    <div ref={containerRef} className={styles.wrapper}>
      <LineChart
        data={chartData}
        width={dimensions.width}
        height={dimensions.height}
        strokeWidth={strokeWidth}
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

export default React.memo(FluentLineChart);
