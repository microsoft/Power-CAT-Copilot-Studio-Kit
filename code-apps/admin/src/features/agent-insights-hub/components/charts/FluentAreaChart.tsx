/**
 * FluentAreaChart - Wrapper for @fluentui/react-charting AreaChart.
 *
 * Responsive sizing via ResizeObserver. Three-layer overflow control.
 * Used for stacked area charts (e.g., session trend outcomes).
 * Supports yAxisCalloutData per data point for custom hover labels.
 */

import React, { useRef, useState, useEffect } from "react";
import { makeStyles } from "@fluentui/react-components";
import { AreaChart } from "@fluentui/react-charting";

export interface AreaChartSeries {
  legend: string;
  data: { x: Date; y: number; yAxisCalloutData?: string }[];
  color: string;
}

export interface FluentAreaChartProps {
  chartTitle?: string;
  series: AreaChartSeries[];
  minHeight?: number;
  mode?: "tozeroy" | "tonexty";
}

const useStyles = makeStyles({
  wrapper: {
    width: "100%",
    height: "100%",
    overflow: "hidden",
    position: "relative",
  },
});

/** Responsive AreaChart wrapper for stacked area charts. */
const FluentAreaChart: React.FC<FluentAreaChartProps> = ({
  chartTitle,
  series,
  minHeight = 200,
  mode,
}) => {
  const styles = useStyles();
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 500, height: Math.max(minHeight, 200) });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        const { width, height } = entry.contentRect;
        setDimensions({
          width: Math.max(width - 16, 200),
          height: Math.max(height, minHeight),
        });
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [minHeight]);

  if (series.length === 0) return null;

  const chartData = {
    chartTitle: chartTitle ?? "",
    lineChartData: series.map((s) => ({
      legend: s.legend,
      data: s.data,
      color: s.color,
    })),
  };

  return (
    <div ref={containerRef} className={styles.wrapper} style={{ minHeight: `${minHeight}px` }}>
      <AreaChart
        data={chartData}
        width={dimensions.width}
        height={dimensions.height}
        hideLegend={false}
        enablePerfOptimization={true}
        mode={mode}
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

export default React.memo(FluentAreaChart);
