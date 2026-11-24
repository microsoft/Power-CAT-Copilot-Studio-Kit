/**
 * FluentDonutChart - Wrapper for @fluentui/react-charting DonutChart.
 *
 * innerRadius MUST be Math.round((height / 2) * 0.45) -- never hardcoded.
 * Responsive sizing via ResizeObserver. Three-layer overflow control.
 * Supports valueInsideDonut to show total count in center.
 */

import React, { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { makeStyles } from "@fluentui/react-components";
import { DonutChart } from "@fluentui/react-charting";
import { CHART_COLORS_ARRAY } from "../../contracts/types";
import { formatCompact } from "../../utils/metricCalculations";

export interface DonutDataItem {
  legend: string;
  data: number;
  color?: string;
}

export interface FluentDonutChartProps {
  chartTitle: string;
  items: DonutDataItem[];
  hideLabels?: boolean;
  showCenterTotal?: boolean;
}

const useStyles = makeStyles({
  wrapper: {
    width: "100%",
    height: "100%",
    overflow: "hidden",
    position: "relative",
    minHeight: "220px",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  },
});

/** Responsive DonutChart wrapper with computed innerRadius. */
const FluentDonutChart: React.FC<FluentDonutChartProps> = ({
  chartTitle,
  items,
  hideLabels = false,
  showCenterTotal = true,
}) => {
  const styles = useStyles();
  const observerRef = useRef<ResizeObserver | null>(null);
  const [size, setSize] = useState({ width: 250, height: 250 });

  const containerRef = useCallback((el: HTMLDivElement | null) => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
    if (el) {
      const observer = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (entry) {
          const { width, height } = entry.contentRect;
          const dim = Math.min(width, height, 300);
          setSize({ width: Math.max(dim, 150), height: Math.max(dim, 150) });
        }
      });
      observer.observe(el);
      observerRef.current = observer;
    }
  }, []);

  useEffect(() => {
    return () => observerRef.current?.disconnect();
  }, []);

  const chartData = useMemo(
    () =>
      items.map((item, idx) => ({
        legend: item.legend,
        data: item.data,
        color: item.color ?? CHART_COLORS_ARRAY[idx % CHART_COLORS_ARRAY.length],
      })),
    [items]
  );

  const total = useMemo(() => items.reduce((sum, i) => sum + i.data, 0), [items]);
  const innerRadius = Math.round((size.height / 2) * 0.45);

  // Stable key that changes when the set of legends changes, forcing a fresh SVG render.
  const chartKey = useMemo(
    () => chartData.map((d) => d.legend).join("|"),
    [chartData],
  );

  if (items.length === 0) return null;

  return (
    <div ref={containerRef} className={styles.wrapper}>
      <DonutChart
        key={chartKey}
        data={{ chartTitle, chartData }}
        innerRadius={innerRadius}
        height={size.height}
        width={size.width}
        hideLabels={hideLabels}
        valueInsideDonut={showCenterTotal ? formatCompact(total) : undefined}
        styles={{
          root: {
            overflow: "hidden",
          },
        }}
      />
    </div>
  );
};

export default React.memo(FluentDonutChart);
