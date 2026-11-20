import { useMemo } from 'react';
import { LineChart } from '@fluentui/react-charting';
import type { IChartProps } from '@fluentui/react-charting';
import { makeStyles } from '@fluentui/react-components';
import { useChartResize } from './useChartResize';
import { getCategoricalPalette } from '../../../utils/chartColors';

const useStyles = makeStyles({
  wrapper: {
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
    height: '100%',
    minHeight: '220px',
  },
});

export interface LineSeriesData {
  legend: string;
  data: Array<{ x: Date; y: number }>;
  color?: string;
}

export interface FluentLineChartProps {
  series: LineSeriesData[];
  chartTitle?: string;
  tenantPrimary?: string;
  strokeWidth?: number;
  ariaLabel?: string;
}

export function FluentLineChart({ series, chartTitle, tenantPrimary, strokeWidth = 2, ariaLabel }: FluentLineChartProps) {
  const s = useStyles();
  const { containerRef, dimensions } = useChartResize({ minWidth: 200, minHeight: 200 });
  const palette = getCategoricalPalette(tenantPrimary);

  const chartData: IChartProps = useMemo(
    () => ({
      chartTitle: ariaLabel ?? chartTitle ?? '',
      lineChartData: series.map((ser, idx) => ({
        legend: ser.legend,
        data: ser.data,
        color: ser.color ?? palette[idx % palette.length],
        lineOptions: { strokeWidth },
      })),
    }),
    [series, palette, ariaLabel, chartTitle, strokeWidth]
  );

  return (
    <div ref={containerRef} className={s.wrapper} aria-label={ariaLabel}>
      <LineChart
        data={chartData}
        width={dimensions.width}
        height={dimensions.height}
        styles={{ root: { overflow: 'hidden' } }}
      />
    </div>
  );
}
