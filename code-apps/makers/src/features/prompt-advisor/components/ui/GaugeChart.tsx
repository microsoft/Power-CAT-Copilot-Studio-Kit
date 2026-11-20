import { GaugeChart as FluentGaugeChart, GaugeChartVariant, GaugeValueFormat } from '@fluentui/react-charting';
import { makeStyles } from '@fluentui/react-components';

export interface GaugeChartProps {
  /** Confidence score 0-100 */
  score: number;
}

/** Chart colors must be raw hex — @fluentui/react-charting doesn't resolve CSS vars */
const GAUGE_COLORS = {
  green: '#107c10',
  brand: '#0f6cbd',
  orange: '#ca5010',
  neutral: '#d1d1d1',
};

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
});

export function GaugeChart({ score }: GaugeChartProps) {
  const styles = useStyles();
  const clampedScore = Math.max(0, Math.min(100, score));

  const fillColor = clampedScore >= 90
    ? GAUGE_COLORS.green
    : clampedScore >= 70
      ? GAUGE_COLORS.brand
      : clampedScore > 0
        ? GAUGE_COLORS.orange
        : GAUGE_COLORS.neutral;

  return (
    <div className={styles.root}>
      <FluentGaugeChart
        width={300}
        height={200}
        segments={[
          {
            size: clampedScore,
            color: fillColor,
            legend: 'Confidence',
          },
        ]}
        chartValue={clampedScore}
        maxValue={100}
        sublabel="Confidence"
        chartValueFormat={GaugeValueFormat.Percentage}
        hideLegend
        hideTooltip
        variant={GaugeChartVariant.SingleSegment}
      />
    </div>
  );
}
