import { useEffect, useRef, useState } from 'react';
import { LineChart } from '@fluentui/react-charting';
import type { ILineChartPoints } from '@fluentui/react-charting';
import { Body1, makeStyles, tokens } from '@fluentui/react-components';

const useStyles = makeStyles({
  root: {
    width: '100%',
    height: '100%',
    minHeight: '180px',
    overflow: 'hidden',
    position: 'relative',
  },
  empty: {
    color: tokens.colorNeutralForeground3,
  },
});

interface InventoryLineChartProps {
  title: string;
  series: ILineChartPoints[];
  height?: number;
}

export function InventoryLineChart({ title, series, height = 220 }: InventoryLineChartProps) {
  const styles = useStyles();
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const yValues = series.flatMap((item) => item.data.map((point) => point.y));
  const yMinimum = Math.min(...yValues);
  const yMaximum = Math.max(...yValues);
  const yRange = yMaximum - yMinimum;
  const yPadding = yRange > 0 ? yRange * 0.25 : Math.max(yMinimum * 0.1, 1);
  const roundingUnit = 10 ** Math.max(0, Math.floor(Math.log10(Math.max(yRange, 1))) - 1);
  const yMinValue = Math.max(0, Math.round((yMinimum - yPadding) / roundingUnit) * roundingUnit);
  const dates = series[0]?.data.reduce<Date[]>((values, point) => {
    if (point.x instanceof Date) values.push(point.x);
    return values;
  }, []);
  const tickValues = dates && dates.length > 7
    ? dates.filter((_, index) => index % Math.ceil(dates.length / 7) === 0)
    : dates;

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(Math.floor(entry.contentRect.width), 260));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  if (series.every((item) => item.data.length === 0)) {
    return <Body1 className={styles.empty} role="status">No usage data is available for this period.</Body1>;
  }

  return (
    <div ref={ref} className={styles.root}>
      <LineChart
        data={{ chartTitle: title, lineChartData: series }}
        width={width}
        height={height}
        strokeWidth={2}
        enableReflow={false}
        tickValues={tickValues}
        tickFormat="%b"
        xAxisTickCount={tickValues?.length}
        yMinValue={yMinValue}
        margins={{ top: 10, right: 10, bottom: 35, left: 40 }}
        styles={{
          root: { width: '100%', height: '100%', overflow: 'hidden' },
          chartWrapper: { overflow: 'hidden' },
          plotContainer: { overflow: 'hidden' },
        }}
      />
    </div>
  );
}
