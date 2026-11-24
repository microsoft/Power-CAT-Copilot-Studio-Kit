import { useMemo } from 'react';
import { AreaChart } from '@fluentui/react-charting';
import type { IChartProps } from '@fluentui/react-charting';
import { makeStyles } from '@fluentui/react-components';
import { useChartResize } from './useChartResize';

const useStyles = makeStyles({
  wrapper: {
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
    height: '100%',
    minHeight: '200px',
  },
});

export interface AreaSeriesData {
  legend: string;
  data: Array<{ x: Date; y: number; yAxisCalloutData?: string }>;
  color: string;
}

export interface FluentAreaChartProps {
  series: AreaSeriesData[];
  chartTitle?: string;
  minHeight?: string;
  ariaLabel?: string;
}

export function FluentAreaChart({ series, chartTitle, minHeight, ariaLabel }: FluentAreaChartProps) {
  const s = useStyles();
  const { containerRef, dimensions } = useChartResize({ minWidth: 200, minHeight: 200 });

  const chartData: IChartProps = useMemo(
    () => ({
      chartTitle: ariaLabel ?? chartTitle ?? '',
      lineChartData: series.map((ser) => ({
        legend: ser.legend,
        data: ser.data,
        color: ser.color,
      })),
    }),
    [series, ariaLabel, chartTitle]
  );

  return (
    <div
      ref={containerRef}
      className={s.wrapper}
      style={minHeight ? { minHeight } : undefined}
      aria-label={ariaLabel}
    >
      <AreaChart
        data={chartData}
        width={dimensions.width}
        height={dimensions.height}
        enablePerfOptimization={true}
        hideLegend={false}
        styles={{ root: { overflow: 'hidden' } }}
      />
    </div>
  );
}
