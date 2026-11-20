import { makeStyles, tokens } from '@fluentui/react-components';
import { OverviewKpiStrip } from './OverviewKpiStrip';
import { ActivityTrendsCard } from './ActivityTrendsCard';
import { CoverageDonutCard } from './CoverageDonutCard';
import { InsightsCard } from './InsightsCard';
import { SentimentCard } from './SentimentCard';
import { CreditConsumptionCard } from './CreditConsumptionCard';
import { AgentSummaryPreview } from './AgentSummaryPreview';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
  },
  trioRow: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
    gap: tokens.spacingHorizontalL,
    alignItems: 'stretch',
    '@media (max-width: 1100px)': { gridTemplateColumns: 'minmax(0, 1fr)' },
  },
  trioRight: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 3fr)',
    gap: tokens.spacingHorizontalL,
    alignItems: 'stretch',
    '@media (max-width: 700px)': { gridTemplateColumns: 'minmax(0, 1fr)' },
  },
  twoColumn: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
    gap: tokens.spacingHorizontalL,
    alignItems: 'stretch',
    '@media (max-width: 900px)': { gridTemplateColumns: 'minmax(0, 1fr)' },
  },
});

/** Overview tab: KPI strip · Activity | Coverage + Insights · Sentiment | Credits · Agent summary. */
export default function DashboardTab() {
  const styles = useStyles();
  return (
    <div className={styles.root}>
      <OverviewKpiStrip />
      <div className={styles.trioRow}>
        <ActivityTrendsCard />
        <div className={styles.trioRight}>
          <CoverageDonutCard />
          <InsightsCard />
        </div>
      </div>
      <div className={styles.twoColumn}>
        <SentimentCard />
        <CreditConsumptionCard />
      </div>
      <AgentSummaryPreview />
    </div>
  );
}
