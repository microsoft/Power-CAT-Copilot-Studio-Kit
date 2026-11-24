/**
 * FluentGroupedBarChart - Wrapper for @fluentui/react-charting GroupedVerticalBarChart.
 *
 * Responsive sizing via ResizeObserver. Three-layer overflow control.
 * Colors from CHART_COLORS_ARRAY.
 */

import React, { useRef, useState, useEffect } from "react";
import { makeStyles } from "@fluentui/react-components";
import { GroupedVerticalBarChart } from "@fluentui/react-charting";
import { CHART_COLORS_ARRAY } from "../../contracts/types";

export interface GroupedBarSeries {
  key: string;
  data: number;
  color?: string;
  legend: string;
}

export interface GroupedBarDataItem {
  name: string;
  series: GroupedBarSeries[];
}

export interface FluentGroupedBarChartProps {
  chartTitle?: string;
  items: GroupedBarDataItem[];
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

/** Responsive GroupedVerticalBarChart wrapper. */
const FluentGroupedBarChart: React.FC<FluentGroupedBarChartProps> = ({
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
          height: Math.max(height, 200),
        });
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (items.length === 0) return null;

  const chartData = items.map((item) => ({
    name: item.name,
    series: item.series.map((s, idx) => ({
      key: s.key,
      data: s.data,
      color: s.color ?? CHART_COLORS_ARRAY[idx % CHART_COLORS_ARRAY.length],
      legend: s.legend,
    })),
  }));

  return (
    <div ref={containerRef} className={styles.wrapper}>
      <GroupedVerticalBarChart
        data={chartData}
        width={dimensions.width}
        height={dimensions.height}
        rotateXAxisLables={chartData.length > 20}
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

export default React.memo(FluentGroupedBarChart);
