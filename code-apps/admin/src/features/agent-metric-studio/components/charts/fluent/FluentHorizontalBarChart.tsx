import { useMemo } from 'react';
import { HorizontalBarChart } from '@fluentui/react-charting';
import type { IChartProps, IChartDataPoint } from '@fluentui/react-charting';
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

export interface FluentHorizontalBarChartProps {
  data: Array<{ label: string; value: number; color?: string }>;
  tenantPrimary?: string;
  ariaLabel?: string;
}

export function FluentHorizontalBarChart({ data, tenantPrimary, ariaLabel }: FluentHorizontalBarChartProps) {
  const s = useStyles();
  const { containerRef, dimensions } = useChartResize({ minWidth: 200, minHeight: 150 });
  const palette = getCategoricalPalette(tenantPrimary);

  const maxValue = useMemo(() => Math.max(...data.map(d => d.value), 1), [data]);

  const chartData: IChartProps[] = useMemo(
    () =>
      data.map((item, idx) => ({
        chartTitle: item.label,
        chartData: [
          {
            legend: item.label,
            horizontalBarChartdata: { x: item.value, y: maxValue },
            color: item.color ?? palette[idx % palette.length],
          },
        ] as IChartDataPoint[],
      })),
    [data, palette, maxValue]
  );

  return (
    <div ref={containerRef} className={s.wrapper} aria-label={ariaLabel}>
      <HorizontalBarChart
        data={chartData}
        width={dimensions.width}
        styles={{ root: { overflow: 'hidden' } }}
      />
    </div>
  );
}
