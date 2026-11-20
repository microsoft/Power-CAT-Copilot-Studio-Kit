import React, { useRef, useState, useEffect } from 'react';
import { makeStyles } from '@fluentui/react-components';
import { LineChart } from '@fluentui/react-charting';

export interface LineChartSeries {
  legend: string;
  data: { x: Date; y: number }[];
  color: string;
}

interface FluentLineChartProps {
  chartTitle?: string;
  series: LineChartSeries[];
  minHeight?: number;
  /** Accessible description; defaults to chartTitle + series legend summary. */
  ariaLabel?: string;
  /** Custom formatter for date/time x-axis tick labels. */
  customDateTimeFormatter?: (date: Date) => string;
}

const useStyles = makeStyles({
  wrapper: {
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    position: 'relative',
  },
});

/** Responsive activity line chart matching the inventory dashboard styling. */
function FluentLineChartImpl({ chartTitle, series, minHeight = 220, ariaLabel, customDateTimeFormatter }: FluentLineChartProps) {
  const styles = useStyles();
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 500, height: minHeight });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        const { width, height } = entry.contentRect;
        setDimensions({ width: Math.max(width - 16, 200), height: Math.max(height, minHeight) });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [minHeight]);

  if (series.length === 0) return null;

  const chartData = {
    chartTitle: chartTitle ?? '',
    lineChartData: series.map((s) => ({ legend: s.legend, data: s.data, color: s.color })),
  };

  const computedLabel =
    ariaLabel ?? `${chartTitle ?? 'Activity'}: ${series.map((s) => s.legend).join(', ')}`;
  const dates = series[0]?.data.map((point) => point.x);
  const tickValues = dates && dates.length > 7
    ? dates.filter((_, index) => index % Math.ceil(dates.length / 7) === 0)
    : dates;

  return (
    <div
      ref={containerRef}
      className={styles.wrapper}
      style={{ minHeight: `${minHeight}px` }}
      role="img"
      aria-label={computedLabel}
    >
      <LineChart
        data={chartData}
        width={dimensions.width}
        height={dimensions.height}
        strokeWidth={2}
        enableReflow={false}
        tickValues={tickValues}
        xAxisTickCount={tickValues?.length}
        yMinValue={0}
        margins={{ top: 10, right: 10, bottom: 35, left: 40 }}
        hideLegend={false}
        enablePerfOptimization
        customDateTimeFormatter={customDateTimeFormatter}
        styles={{
          root: { width: '100%', overflow: 'hidden' },
          chartWrapper: { overflow: 'hidden' },
          plotContainer: { overflow: 'hidden' },
        }}
      />
    </div>
  );
}

export const FluentLineChart = React.memo(FluentLineChartImpl);
