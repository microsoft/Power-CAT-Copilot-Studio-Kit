import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { DonutChart } from '@fluentui/react-charting';
import { makeStyles, Text, tokens } from '@fluentui/react-components';

export interface DonutChartItem {
  legend: string;
  data: number;
}

export interface FluentDonutChartProps {
  chartTitle: string;
  items: DonutChartItem[];
  centerValue: string;
  centerLabel?: string;
  minHeight?: number;
}

const CHART_COLORS = [
  '#637CEF',
  '#E3008C',
  '#2AA0A4',
  '#CA5010',
  '#9373C0',
  '#13A10E',
  '#3A96DD',
  '#57811B',
  '#B146C2',
  '#AE8C00',
];

const useStyles = makeStyles({
  wrapper: {
    width: '100%',
    height: '100%',
    minWidth: 0,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: tokens.spacingVerticalM,
  },
  chartStage: {
    position: 'relative',
    flexShrink: 0,
  },
  center: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    transform: 'translate(-50%, -50%)',
    pointerEvents: 'none',
  },
  centerValue: {
    fontWeight: tokens.fontWeightSemibold,
    lineHeight: tokens.lineHeightBase500,
  },
  centerLabel: {
    color: tokens.colorNeutralForeground2,
    lineHeight: tokens.lineHeightBase200,
    whiteSpace: 'nowrap',
  },
  legend: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    columnGap: tokens.spacingHorizontalXXL,
    rowGap: tokens.spacingVerticalS,
    paddingInline: tokens.spacingHorizontalS,
  },
  legendItem: {
    minWidth: 0,
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
  },
  legendMarker: {
    width: '10px',
    height: '10px',
    flexShrink: 0,
    borderRadius: tokens.borderRadiusCircular,
  },
  legendText: {
    maxWidth: '260px',
    overflowWrap: 'anywhere',
  },
});

/** Responsive donut chart with ranked colors, visible values, and a centered legend. */
function FluentDonutChart({
  chartTitle,
  items,
  centerValue,
  centerLabel = 'Total credits',
  minHeight = 250,
}: FluentDonutChartProps) {
  const styles = useStyles();
  const containerRef = useRef<HTMLDivElement>(null);
  const [availableSize, setAvailableSize] = useState({ width: 320, height: minHeight });
  const chartData = useMemo(
    () => items.map((item, index) => ({
      ...item,
      color: CHART_COLORS[index % CHART_COLORS.length],
    })),
    [items],
  );

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setAvailableSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  if (items.length === 0) return null;

  const chartWidth = Math.max(220, Math.min(availableSize.width, 320));
  const chartHeight = Math.min(chartWidth + 20, Math.max(240, availableSize.height - 64));

  return (
    <div ref={containerRef} className={styles.wrapper} style={{ minHeight }}>
      <div
        className={styles.chartStage}
        style={{ width: chartWidth, height: chartHeight }}
      >
        <DonutChart
          key={items.map((item) => item.legend).join('|')}
          data={{ chartTitle, chartData }}
          width={chartWidth}
          height={chartHeight}
          innerRadius={Math.round(chartHeight / 2 * 0.45)}
          hideLegend
          hideLabels={false}
        />
        <div className={styles.center} aria-hidden="true">
          <Text size={500} className={styles.centerValue}>
            {centerValue}
          </Text>
          <Text size={200} className={styles.centerLabel}>
            {centerLabel}
          </Text>
        </div>
      </div>
      <div className={styles.legend} aria-label={`${chartTitle} legend`}>
        {chartData.map((item) => (
          <div className={styles.legendItem} key={item.legend}>
            <span
              className={styles.legendMarker}
              style={{ backgroundColor: item.color }}
              aria-hidden="true"
            />
            <Text size={200} className={styles.legendText} title={item.legend}>
              {item.legend}
            </Text>
          </div>
        ))}
      </div>
    </div>
  );
}

export default memo(FluentDonutChart);
