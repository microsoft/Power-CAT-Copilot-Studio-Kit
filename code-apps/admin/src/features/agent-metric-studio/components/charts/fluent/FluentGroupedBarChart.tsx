import { useMemo } from 'react';
import { GroupedVerticalBarChart } from '@fluentui/react-charting';
import type { IGroupedVerticalBarChartData } from '@fluentui/react-charting';
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

export interface GroupedBarSeries {
  key: string;
  legend: string;
  color?: string;
}

export interface GroupedBarDataPoint {
  name: string;
  values: Record<string, number>;
}

export interface FluentGroupedBarChartProps {
  data: GroupedBarDataPoint[];
  series: GroupedBarSeries[];
  tenantPrimary?: string;
  ariaLabel?: string;
}

export function FluentGroupedBarChart({ data, series, tenantPrimary, ariaLabel }: FluentGroupedBarChartProps) {
  const s = useStyles();
  const { containerRef, dimensions } = useChartResize({ minWidth: 200, minHeight: 200 });
  const palette = getCategoricalPalette(tenantPrimary);

  const chartData: IGroupedVerticalBarChartData[] = useMemo(
    () =>
      data.map((point) => ({
        name: point.name,
        series: series.map((ser, serIdx) => ({
          key: ser.key,
          data: point.values[ser.key] ?? 0,
          color: ser.color ?? palette[serIdx % palette.length],
          legend: ser.legend,
        })),
      })),
    [data, series, palette]
  );

  const rotateLabels = data.length > 20;

  return (
    <div ref={containerRef} className={s.wrapper} aria-label={ariaLabel}>
      <GroupedVerticalBarChart
        data={chartData}
        width={dimensions.width}
        height={dimensions.height}
        rotateXAxisLables={rotateLabels}
        styles={{ root: { overflow: 'hidden' } }}
      />
    </div>
  );
}
