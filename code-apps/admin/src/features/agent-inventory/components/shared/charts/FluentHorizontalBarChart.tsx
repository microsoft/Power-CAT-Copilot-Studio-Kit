import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { HorizontalBarChart } from '@fluentui/react-charting';
import { makeStyles } from '@fluentui/react-components';

const CHART_COLORS = [
  '#637CEF',
  '#E3008C',
  '#2AA0A4',
  '#9373C0',
  '#13A10E',
  '#3A96DD',
  '#CA5010',
  '#57811B',
  '#B146C2',
  '#AE8C00',
] as const;

export interface HorizontalBarDataItem {
  label: string;
  value: number;
  total?: number;
  color?: string;
}

export interface FluentHorizontalBarChartProps {
  items: HorizontalBarDataItem[];
  mode?: 'default' | 'fraction' | 'percentage';
}

const useStyles = makeStyles({
  wrapper: {
    width: '100%',
    height: '100%',
    minHeight: '220px',
    overflow: 'hidden',
    position: 'relative',
  },
});

/** Responsive horizontal bar chart owned by the Agent Inventory feature. */
function FluentHorizontalBarChart({ items, mode = 'default' }: FluentHorizontalBarChartProps) {
  const styles = useStyles();
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 500, height: 220 });

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setDimensions({
        width: Math.max(width - 16, 200),
        height: Math.max(height, 150),
      });
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const chartData = useMemo(() => {
    if (items.length === 0) return [];
    const maximumValue = Math.max(...items.map((item) => item.total ?? item.value), 1);

    return items.map((item, index) => ({
      chartTitle: item.label,
      chartData: [{
        legend: item.label,
        horizontalBarChartdata: { x: item.value, y: item.total ?? maximumValue },
        color: item.color ?? CHART_COLORS[index % CHART_COLORS.length],
      }],
    }));
  }, [items]);

  if (items.length === 0) return null;

  return (
    <div ref={containerRef} className={styles.wrapper}>
      <HorizontalBarChart
        data={chartData}
        chartDataMode={mode}
        width={dimensions.width}
        styles={{
          root: {
            width: '100%',
            overflow: 'hidden',
          },
        }}
      />
    </div>
  );
}

export default memo(FluentHorizontalBarChart);
