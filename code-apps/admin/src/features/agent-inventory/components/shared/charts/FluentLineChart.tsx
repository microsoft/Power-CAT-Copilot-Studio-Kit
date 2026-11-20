import { memo, useEffect, useRef, useState } from 'react';
import { LineChart } from '@fluentui/react-charting';
import { makeStyles } from '@fluentui/react-components';

export interface LineChartSeries {
  legend: string;
  color: string;
  useSecondaryYScale?: boolean;
  data: {
    x: Date;
    y: number;
    xAxisCalloutData?: string;
    yAxisCalloutData?: string;
  }[];
}

export interface FluentLineChartProps {
  chartTitle: string;
  series: LineChartSeries[];
  minHeight?: number;
  customDateTimeFormatter?: (date: Date) => string;
}

const useStyles = makeStyles({
  wrapper: {
    width: '100%',
    height: '100%',
    minWidth: 0,
    overflow: 'hidden',
    position: 'relative',
    // The secondary Y axis paints its own full-width horizontal gridlines on top
    // of the primary axis, so every line is drawn twice and reads darker/heavier
    // than the single-axis dashboard chart. Hide the secondary gridlines (the
    // right-side cumulative labels are unaffected) so each line is drawn once.
    '& g[id^="yAxisGElementSecondary"] line': {
      stroke: 'transparent',
    },
  },
});

/** Responsive dual-axis line chart owned by Agent Inventory. */
function FluentLineChart({
  chartTitle,
  series,
  minHeight = 240,
  customDateTimeFormatter,
}: FluentLineChartProps) {
  const styles = useStyles();
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height: minHeight });
  const secondaryMaximum = Math.max(
    1,
    ...series
      .filter((item) => item.useSecondaryYScale)
      .flatMap((item) => item.data.map((point) => point.y)),
  );

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setDimensions({
        width: Math.max(entry.contentRect.width - 8, 260),
        height: Math.max(entry.contentRect.height, minHeight),
      });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [minHeight]);

  if (series.length === 0) return null;

  return (
    <div ref={containerRef} className={styles.wrapper} style={{ minHeight }}>
      <LineChart
        data={{
          chartTitle,
          lineChartData: series.map((item) => ({
            legend: item.legend,
            color: item.color,
            data: item.data,
            useSecondaryYScale: item.useSecondaryYScale,
          })),
        }}
        width={dimensions.width}
        height={dimensions.height}
        strokeWidth={2}
        yAxisTitle="Weekly credits"
        secondaryYAxistitle="Cumulative credits"
        secondaryYScaleOptions={{ yMinValue: 0, yMaxValue: secondaryMaximum }}
        hideLegend={false}
        enablePerfOptimization
        useUTC={false}
        customDateTimeFormatter={customDateTimeFormatter}
        styles={{ root: { width: '100%', overflow: 'hidden' } }}
      />
    </div>
  );
}

export default memo(FluentLineChart);
