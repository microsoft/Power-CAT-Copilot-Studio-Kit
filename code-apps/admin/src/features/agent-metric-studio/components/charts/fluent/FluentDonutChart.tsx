import { useMemo } from 'react';
import { DonutChart } from '@fluentui/react-charting';
import type { IChartProps, IChartDataPoint } from '@fluentui/react-charting';
import { makeStyles } from '@fluentui/react-components';
import { useChartResize } from './useChartResize';
import { getCategoricalPalette } from '../../../utils/chartColors';
import { formatCompact } from './formatCompact';

const useStyles = makeStyles({
  wrapper: {
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
    height: '100%',
    minHeight: '250px',
  },
});

export interface FluentDonutChartProps {
  data: Array<{ label: string; value: number; color?: string }>;
  tenantPrimary?: string;
  hideLabels?: boolean;
  minHeight?: string;
  ariaLabel?: string;
}

export function FluentDonutChart({ data, tenantPrimary, hideLabels, minHeight, ariaLabel }: FluentDonutChartProps) {
  const s = useStyles();
  const { containerRef, dimensions } = useChartResize({ minWidth: 150, minHeight: 150 });
  const palette = getCategoricalPalette(tenantPrimary);

  const total = useMemo(() => data.reduce((sum, d) => sum + d.value, 0), [data]);

  const chartData: IChartProps = useMemo(() => {
    const points: IChartDataPoint[] = data.map((item, idx) => ({
      legend: item.label,
      data: item.value,
      color: item.color ?? palette[idx % palette.length],
    }));
    return { chartTitle: ariaLabel ?? '', chartData: points };
  }, [ariaLabel, data, palette]);

  const size = Math.min(dimensions.width, dimensions.height, 300);
  const innerRadius = Math.round((size / 2) * 0.45);

  return (
    <div
      ref={containerRef}
      className={s.wrapper}
      style={minHeight ? { minHeight } : undefined}
      aria-label={ariaLabel}
    >
      <DonutChart
        data={chartData}
        innerRadius={innerRadius}
        valueInsideDonut={formatCompact(total)}
        width={size}
        height={size}
        hideLabels={hideLabels}
        styles={{ root: { overflow: 'hidden' } }}
      />
    </div>
  );
}
