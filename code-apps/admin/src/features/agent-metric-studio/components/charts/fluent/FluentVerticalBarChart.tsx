import { useMemo } from 'react';
import { VerticalBarChart } from '@fluentui/react-charting';
import type { IVerticalBarChartDataPoint } from '@fluentui/react-charting';
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

export interface FluentVerticalBarChartProps {
  data: Array<{ label: string; value: number; color?: string }>;
  tenantPrimary?: string;
  hideLegend?: boolean;
  ariaLabel?: string;
}

export function FluentVerticalBarChart({ data, tenantPrimary, hideLegend, ariaLabel }: FluentVerticalBarChartProps) {
  const s = useStyles();
  const { containerRef, dimensions } = useChartResize({ minWidth: 200, minHeight: 200 });
  const palette = getCategoricalPalette(tenantPrimary);

  const chartData: IVerticalBarChartDataPoint[] = useMemo(
    () =>
      data.map((item, idx) => ({
        x: item.label,
        y: item.value,
        color: item.color ?? palette[idx % palette.length],
        legend: item.label,
      })),
    [data, palette]
  );

  const rotateLabels = data.length > 10;

  return (
    <div ref={containerRef} className={s.wrapper} aria-label={ariaLabel}>
      <VerticalBarChart
        data={chartData}
        width={dimensions.width}
        height={dimensions.height}
        rotateXAxisLables={rotateLabels}
        hideLegend={hideLegend}
        styles={{ root: { overflow: 'hidden' } }}
      />
    </div>
  );
}
