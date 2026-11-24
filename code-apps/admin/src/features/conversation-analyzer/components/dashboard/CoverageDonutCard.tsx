import { makeStyles, tokens, Card, CardHeader, Subtitle2, Caption1, Caption2, Title2, Spinner } from '@fluentui/react-components';
import { FluentDonutChart } from '../charts/FluentDonutChart';
import { useAnalysisCoverage } from '../../hooks/useAnalysisCoverage';
import { BRAND_CHART_COLORS } from '../../contracts/constants';

const useStyles = makeStyles({
  card: { width: '100%', height: '100%' },
  headerCaption: { color: tokens.colorNeutralForeground3 },
  body: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: tokens.spacingVerticalL,
    paddingBottom: tokens.spacingVerticalS,
  },
  donutWrap: {
    alignSelf: 'center',
    width: '150px',
    height: '150px',
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  donutCenter: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    pointerEvents: 'none',
  },
  donutSubtext: { color: tokens.colorNeutralForeground3 },
  legend: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS },
  legendRow: {
    display: 'grid',
    gridTemplateColumns: '10px 1fr auto 40px',
    alignItems: 'center',
    columnGap: tokens.spacingHorizontalS,
  },
  legendDot: { width: '10px', height: '10px', borderRadius: tokens.borderRadiusSmall },
  legendValue: { fontWeight: tokens.fontWeightSemibold, textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
  legendPct: { color: tokens.colorNeutralForeground3, textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
  spinner: { display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '180px' },
});

const COLORS = {
  analyzed: BRAND_CHART_COLORS.primary,
  notAnalyzed: tokens.colorNeutralStroke2,
};

/** Analysis coverage donut: analyzed vs not-analyzed agents for the active period. */
export function CoverageDonutCard() {
  const styles = useStyles();
  const { data, isLoading } = useAnalysisCoverage();
  const analyzed = data?.analyzed ?? 0;
  const notAnalyzed = data?.notAnalyzed ?? 0;
  const totalAgents = data?.totalAgents ?? 0;
  const coveragePct = data?.coveragePct ?? 0;
  const pctOf = (n: number) => (totalAgents > 0 ? Math.round((n / totalAgents) * 100) : 0);

  const legend = [
    { key: 'analyzed', label: 'Analyzed', value: analyzed, color: COLORS.analyzed },
    { key: 'not-analyzed', label: 'Not analyzed', value: notAnalyzed, color: COLORS.notAnalyzed },
  ];

  return (
    <Card className={styles.card}>
      <CardHeader
        header={<Subtitle2 as="h3">Analysis coverage</Subtitle2>}
        description={
          isLoading ? undefined : (
            <Caption1 className={styles.headerCaption}>{`${analyzed} of ${totalAgents} agents analyzed`}</Caption1>
          )
        }
      />
      {isLoading ? (
        <div className={styles.spinner}><Spinner size="small" label="Loading…" /></div>
      ) : (
        <div className={styles.body}>
          <div className={styles.donutWrap}>
            <FluentDonutChart
              chartTitle="Analysis coverage"
              hideLegend
              ariaLabel={`Analysis coverage ${coveragePct}%: ${analyzed} analyzed, ${notAnalyzed} not analyzed`}
              items={legend.map((l) => ({ legend: l.label, data: l.value, color: l.color }))}
            />
            <div className={styles.donutCenter} aria-hidden>
              <Title2 as="span">{`${coveragePct}%`}</Title2>
              <Caption2 as="span" className={styles.donutSubtext}>Coverage</Caption2>
            </div>
          </div>
          <div className={styles.legend}>
            {legend.map((l) => (
              <div key={l.key} className={styles.legendRow}>
                <span className={styles.legendDot} style={{ backgroundColor: l.color }} aria-hidden />
                <Caption1>{l.label}</Caption1>
                <Caption1 className={styles.legendValue}>{l.value.toLocaleString()}</Caption1>
                <Caption1 className={styles.legendPct}>{`${pctOf(l.value)}%`}</Caption1>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
