import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { makeStyles } from '@fluentui/react-components';
import { DonutChart } from '@fluentui/react-charting';

export interface DonutDataItem {
  legend: string;
  data: number;
  color?: string;
}

interface FluentDonutChartProps {
  chartTitle: string;
  items: DonutDataItem[];
  centerLabel?: string;
  hideLegend?: boolean;
  /** Accessible description summarizing the data; falls back to chartTitle + each slice. */
  ariaLabel?: string;
}

const useStyles = makeStyles({
  wrapper: {
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    position: 'relative',
    minHeight: '140px',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

/** Responsive donut chart wrapper. innerRadius is computed from container height. */
function FluentDonutChartImpl({ chartTitle, items, centerLabel, hideLegend, ariaLabel }: FluentDonutChartProps) {
  const styles = useStyles();
  const observerRef = useRef<ResizeObserver | null>(null);
  const [size, setSize] = useState({ width: 200, height: 200 });

  const containerRef = useCallback((el: HTMLDivElement | null) => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
    if (el) {
      const observer = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (entry) {
          const { width, height } = entry.contentRect;
          const dim = Math.min(width, height, 240);
          setSize({ width: Math.max(dim, 140), height: Math.max(dim, 140) });
        }
      });
      observer.observe(el);
      observerRef.current = observer;
    }
  }, []);

  useEffect(() => {
    return () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
    };
  }, []);

  const chartData = useMemo(() => items.map((i) => ({ legend: i.legend, data: i.data, color: i.color })), [items]);
  const innerRadius = Math.round((size.height / 2) * 0.58);
  const chartKey = useMemo(() => chartData.map((d) => d.legend).join('|'), [chartData]);

  if (items.length === 0) return null;

  const computedLabel =
    ariaLabel ??
    `${chartTitle}: ${items.map((i) => `${i.legend} ${i.data}`).join(', ')}`;

  return (
    <div ref={containerRef} className={styles.wrapper} role="img" aria-label={computedLabel}>
      <DonutChart
        key={chartKey}
        data={{ chartTitle, chartData }}
        innerRadius={innerRadius}
        height={size.height}
        width={size.width}
        hideLabels
        hideLegend={hideLegend}
        valueInsideDonut={centerLabel}
        styles={{ root: { overflow: 'hidden' } }}
      />
    </div>
  );
}

export const FluentDonutChart = React.memo(FluentDonutChartImpl);
