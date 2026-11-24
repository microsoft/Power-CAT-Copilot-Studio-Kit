import { makeStyles, tokens, Card, CardHeader, Subtitle2, Caption1, Spinner } from '@fluentui/react-components';
import { FluentLineChart } from '../charts/FluentLineChart';
import { useActivityTrends } from '../../hooks/useActivityTrends';
import { useFilterContext } from '../../context/FilterContext';
import { TIME_PERIOD_OPTIONS } from '../../contracts/constants';

const DATE_LABEL_FORMATTER = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const formatTrendDate = (d: Date) => DATE_LABEL_FORMATTER.format(d);

const useStyles = makeStyles({
  card: {
    width: '100%',
    height: '100%',
  },
  headerCaption: {
    color: tokens.colorNeutralForeground3,
  },
  body: {
    minHeight: '240px',
    overflow: 'hidden',
  },
  spinner: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '240px',
  },
});

/** Displays analyzed conversation volume for the selected time period. */
export function ActivityTrendsCard() {
  const styles = useStyles();
  const { timePeriod } = useFilterContext();
  const { data, isLoading } = useActivityTrends();

  const subtitle = TIME_PERIOD_OPTIONS.find((o) => o.value === timePeriod)?.label ?? 'Last 7 days';
  const series = data?.series ?? [];
  const total = data?.total ?? 0;
  const meta = [
    `${total.toLocaleString()} conversations analyzed`,
    subtitle,
  ].join(' · ');

  return (
    <Card className={styles.card}>
      <CardHeader
        header={<Subtitle2 as="h3">Activity trends</Subtitle2>}
        description={isLoading ? undefined : <Caption1 className={styles.headerCaption}>{meta}</Caption1>}
      />
      <div className={styles.body}>
        {isLoading ? (
          <div className={styles.spinner}><Spinner size="small" label="Loading…" /></div>
        ) : (
          <FluentLineChart
            chartTitle="Activity trends"
            series={[
              {
                legend: 'Conversations analyzed',
                color: '#637CEF',
                data: series.map((p) => ({ x: p.date, y: p.analyzed })),
              },
            ]}
            minHeight={220}
            customDateTimeFormatter={formatTrendDate}
          />
        )}
      </div>
    </Card>
  );
}
