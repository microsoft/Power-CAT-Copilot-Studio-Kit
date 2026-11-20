import { memo, useEffect, useRef, useState } from 'react';
import { AreaChart } from '@fluentui/react-charting';
import { makeStyles } from '@fluentui/react-components';

export interface AreaChartSeries {
  legend: string;
  data: { x: Date; y: number; xAxisCalloutData?: string; yAxisCalloutData?: string }[];
  color: string;
}

export interface FluentAreaChartProps {
  chartTitle?: string;
  series: AreaChartSeries[];
  minHeight?: number;
  mode?: 'tozeroy' | 'tonexty';
  customDateTimeFormatter?: (dateTime: Date) => string;
}

const useStyles = makeStyles({
  wrapper: {
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    position: 'relative',
  },
});

/** Responsive area chart owned by the Agent Inventory feature. */
function FluentAreaChart({
  chartTitle,
  series,
  minHeight = 200,
  mode,
  customDateTimeFormatter,
}: FluentAreaChartProps) {
  const styles = useStyles();
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({
    width: 500,
    height: Math.max(minHeight, 200),
  });

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setDimensions({
        width: Math.max(width - 16, 200),
        height: Math.max(height, minHeight),
      });
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, [minHeight]);

  if (series.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className={styles.wrapper}
      style={{ minHeight: `${minHeight}px` }}
    >
      <AreaChart
        data={{
          chartTitle: chartTitle ?? '',
          lineChartData: series.map((item) => ({
            legend: item.legend,
            data: item.data,
            color: item.color,
          })),
        }}
        width={dimensions.width}
        height={dimensions.height}
        hideLegend={false}
        enablePerfOptimization
        mode={mode}
        customDateTimeFormatter={customDateTimeFormatter}
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

export default memo(FluentAreaChart);
