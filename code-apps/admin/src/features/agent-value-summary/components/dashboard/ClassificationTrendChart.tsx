/**
 * ClassificationTrendChart — Card with a LineChart showing agent classification
 * count over time.
 *
 * CRITICAL: LineChart requires data in `{ chartTitle, lineChartData: [...] }` format
 * where each x value is a Date object (per Chart.md).
 * 3-layer overflow control applied to prevent scrollbars.
 */
import { useRef, useState, useEffect, memo } from 'react';
import {
  makeStyles,
  tokens,
  Card,
  CardHeader,
  Subtitle2,
  Menu,
  MenuButton,
  MenuTrigger,
  MenuPopover,
  MenuList,
  MenuItem,
} from '@fluentui/react-components';
import { CalendarLtr16Regular } from '@fluentui/react-icons';
import { LineChart } from '@fluentui/react-charting';
import type { ClassificationTrendPoint, DrillthroughFilter } from '../../contracts/types';
import { formatMonthLabel } from '../../services/agentValueFilter';

interface ClassificationTrendChartProps {
  classificationTrend: ClassificationTrendPoint[];
  onDrillthrough: (filter: DrillthroughFilter) => void;
}

type MonthFilter = Extract<DrillthroughFilter, { kind: 'classification-month' }>;

/** Builds the drillthrough filter for one trend month. */
function toMonthFilter(point: ClassificationTrendPoint): MonthFilter {
  const year = point.sortDate.getFullYear();
  const month = point.sortDate.getMonth();
  return { kind: 'classification-month', year, month, monthLabel: formatMonthLabel(year, month) };
}

const CHART_HEIGHT = 200;
const TREND_LINE_COLOR = '#2AA0A4';

const useStyles = makeStyles({
  card: {
    borderRadius: tokens.borderRadiusLarge,
    display: 'flex',
    flexDirection: 'column',
    flex: '1',
    maxHeight: '320px',
  },
  chartWrapper: {
    flex: '1',
    padding: 0,
    overflow: 'hidden', // Layer 1
    minHeight: `${CHART_HEIGHT}px`,
  },
  chartContainer: {
    width: '100%',
    height: '100%',
    overflow: 'hidden', // Layer 2
    position: 'relative',
    minHeight: `${CHART_HEIGHT}px`,
  },
});

/** Card with a LineChart tracking classified agent count over time. Months drill through. */
export const ClassificationTrendChart = memo(function ClassificationTrendChart({ classificationTrend, onDrillthrough }: ClassificationTrendChartProps) {
  const styles = useStyles();
  const containerRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(500);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setChartWidth(Math.max(300, entry.contentRect.width - 32));
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // CRITICAL: LineChart requires Date objects for x values, wrapped in
  // { chartTitle, lineChartData: [{ legend, data, color }] } format.
  const lineChartData = {
    chartTitle: 'Agent classification over time',
    lineChartData: [
      {
        legend: 'Classified agents',
        data: classificationTrend.map((point) => ({
          x: point.sortDate,
          y: point.totalClassified,
          onDataPointClick: () => onDrillthrough(toMonthFilter(point)),
        })),
        color: TREND_LINE_COLOR,
      },
    ],
  };

  return (
    <Card className={styles.card} appearance="filled" aria-label="Agent classification over time line chart">
      <CardHeader
        header={<Subtitle2>Agent classification over time</Subtitle2>}
        action={
          classificationTrend.length > 0 ? (
            <Menu>
              <MenuTrigger disableButtonEnhancement>
                <MenuButton appearance="subtle" size="small" icon={<CalendarLtr16Regular />}>
                  View agents by month
                </MenuButton>
              </MenuTrigger>
              <MenuPopover>
                <MenuList>
                  {classificationTrend.map((point) => {
                    const filter = toMonthFilter(point);
                    return (
                      <MenuItem key={point.monthLabel} onClick={() => onDrillthrough(filter)}>
                        {filter.monthLabel} – {point.totalClassified} {point.totalClassified === 1 ? 'agent' : 'agents'}
                      </MenuItem>
                    );
                  })}
                </MenuList>
              </MenuPopover>
            </Menu>
          ) : undefined
        }
      />

      {/* Chart body — plain div, NOT CardPreview */}
      <div className={styles.chartWrapper}>
        <div className={styles.chartContainer} ref={containerRef}>
          <LineChart
            data={lineChartData}
            width={chartWidth}
            height={CHART_HEIGHT}
            strokeWidth={2}
            hideLegend={true}
            styles={{
              root: {
                width: '100%',
                overflow: 'hidden', // Layer 3
              },
            }}
          />
        </div>
      </div>
    </Card>
  );
});

export default ClassificationTrendChart;
