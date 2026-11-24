/**
 * ValueSpreadChart — Card with a VerticalBarChart showing the distribution
 * of value benefits across classified agents.
 *
 * 3-layer overflow control per Chart.md to prevent scrollbars.
 * Uses plain <div> wrapper — NOT CardPreview per Cards.md.
 * Filters out null/blank/undefined entries to prevent "Undefined" legend.
 * Custom legend built from valueBenefitCategories with colored dots.
 */
import { useRef, useState, useEffect, memo } from 'react';
import {
  makeStyles,
  tokens,
  Card,
  CardHeader,
  Subtitle2,
  Caption1,
  Link,
} from '@fluentui/react-components';
import { VerticalBarChart } from '@fluentui/react-charting';
import type { DrillthroughFilter, ValueBenefitCount } from '../../contracts/types';
import type { DashboardKpis } from '../../contracts/types';
import { valueBenefitColorMap } from '../../data/valueBenefitCategories';

interface ValueSpreadChartProps {
  valueBenefitCounts: ValueBenefitCount[];
  kpis: DashboardKpis;
  onDrillthrough: (filter: DrillthroughFilter) => void;
}

const CHART_HEIGHT = 220;

const useStyles = makeStyles({
  card: {
    borderRadius: tokens.borderRadiusLarge,
    display: 'flex',
    flexDirection: 'column',
    flex: '1',
  },
  chartAndLegend: {
    display: 'flex',
    flexDirection: 'row',
    gap: tokens.spacingHorizontalM,
    paddingLeft: tokens.spacingHorizontalM,
    paddingRight: tokens.spacingHorizontalM,
    flex: '1',
    overflow: 'hidden',
  },
  chartWrapper: {
    flex: '1',
    overflow: 'hidden', // Layer 1
    minHeight: `${CHART_HEIGHT}px`,
    minWidth: 0,
  },
  chartContainer: {
    width: '100%',
    height: '100%',
    overflow: 'hidden', // Layer 2
    position: 'relative',
    minHeight: `${CHART_HEIGHT}px`,
  },
  legend: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    flexShrink: 0,
    width: '170px',
    paddingTop: tokens.spacingVerticalS,
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    textAlign: 'left',
  },
  legendLink: {
    color: tokens.colorNeutralForeground1,
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase200,
  },
  insightLink: {
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase200,
  },
  legendDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  insightsRow: {
    display: 'flex',
    gap: tokens.spacingHorizontalXXL,
    paddingLeft: tokens.spacingHorizontalL,
    paddingRight: tokens.spacingHorizontalL,
    paddingTop: tokens.spacingVerticalS,
    paddingBottom: tokens.spacingVerticalM,
    flexWrap: 'wrap',
  },
  insightItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    flex: '1 1 200px',
  },
  insightLabel: {
    color: tokens.colorNeutralForeground1,
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase200,
  },
  insightValue: {
    color: tokens.colorNeutralForeground2,
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase200,
  },
});

/** Card with VerticalBarChart showing value benefit distribution + insight text. Bars/legend drill through. */
export const ValueSpreadChart = memo(function ValueSpreadChart({ valueBenefitCounts, kpis, onDrillthrough }: ValueSpreadChartProps) {
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

  // Filter out blank, null, undefined, or "Undefined" value benefits
  const filteredCounts = valueBenefitCounts.filter(
    (vb) =>
      vb.valueBenefit != null &&
      vb.valueBenefit.trim() !== '' &&
      vb.valueBenefit.toLowerCase() !== 'undefined',
  );

  const showBenefit = (valueBenefit: string) =>
    onDrillthrough({ kind: 'value-benefit', value: valueBenefit });

  const chartData = filteredCounts.map((vb) => ({
    x: vb.valueBenefit,
    y: vb.count,
    color: valueBenefitColorMap[vb.valueBenefit] ?? '#637CEF',
    onClick: () => showBenefit(vb.valueBenefit),
  }));

  // Build custom legend from only the categories present in data
  const legendEntries = filteredCounts.map((vb) => ({
    name: vb.valueBenefit,
    count: vb.count,
    color: valueBenefitColorMap[vb.valueBenefit] ?? '#637CEF',
  }));

  return (
    <Card className={styles.card} appearance="filled" aria-label="Value spread chart showing distribution of value benefits">
      <CardHeader header={<Subtitle2>Value spread</Subtitle2>} />

      {/* Chart (left) + Legend (right) side by side */}
      <div className={styles.chartAndLegend}>
        <div className={styles.chartWrapper}>
          <div className={styles.chartContainer} ref={containerRef}>
            <VerticalBarChart
              data={chartData}
              width={chartWidth}
              height={CHART_HEIGHT}
              hideLegend
              hideLabels={false}
              yAxisTickCount={4}
              styles={{
                root: {
                  width: '100%',
                  overflow: 'hidden', // Layer 3
                },
                xAxis: {
                  display: 'none', // Hide x-axis labels — legend on right suffices
                },
              }}
            />
          </div>
        </div>

        {/* Legend on right — each entry drills through (keyboard path for the bars) */}
        <div className={styles.legend} role="list" aria-label="Value benefits">
          {legendEntries.map((entry) => (
            <div key={entry.name} className={styles.legendItem} role="listitem">
              <div className={styles.legendDot} style={{ backgroundColor: entry.color }} />
              <Link
                as="button"
                appearance="subtle"
                className={styles.legendLink}
                onClick={() => showBenefit(entry.name)}
                aria-label={`${entry.name}: ${entry.count} ${entry.count === 1 ? 'agent' : 'agents'}. View agents`}
              >
                {entry.name}
              </Link>
            </div>
          ))}
        </div>
      </div>

      {/* Common + Rare value benefit insights below */}
      <div className={styles.insightsRow}>
        <div className={styles.insightItem}>
          <span className={styles.insightLabel}>Common value benefit</span>
          <Caption1 className={styles.insightValue}>
            FYI: {kpis.commonValueBenefit.count} {filteredCounts.length > 2 ? 'agents are' : 'agent is'} delivering &lsquo;
            {kpis.commonValueBenefit.name && (
              <Link
                as="button"
                inline
                className={styles.insightLink}
                onClick={() => showBenefit(kpis.commonValueBenefit.name)}
              >
                {kpis.commonValueBenefit.name}
              </Link>
            )}
            &rsquo; – unlocking efficiency and empowering progress.
          </Caption1>
        </div>
        <div className={styles.insightItem}>
          <span className={styles.insightLabel}>Rare value benefits</span>
          <Caption1 className={styles.insightValue}>
            Only {kpis.rareValueBenefit.count} agents are delivering &lsquo;
            {kpis.rareValueBenefit.name && (
              <Link
                as="button"
                inline
                className={styles.insightLink}
                onClick={() => showBenefit(kpis.rareValueBenefit.name)}
              >
                {kpis.rareValueBenefit.name}
              </Link>
            )}
            &rsquo; – an opportunity for growth?
          </Caption1>
        </div>
      </div>
    </Card>
  );
});

export default ValueSpreadChart;
