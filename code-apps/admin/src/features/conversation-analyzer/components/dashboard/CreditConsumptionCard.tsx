import { makeStyles, tokens, Card, CardHeader, Subtitle2, Title2, Caption1, Spinner, Body1 } from '@fluentui/react-components';
import { useAiConsumption, type AiModelLabel } from '../../hooks/useAiConsumption';
import { useConversationAnalyzerSummary } from '../../hooks/useConversationAnalyzerSummary';
import { useFilterContext } from '../../context/FilterContext';
import { CREDIT_CHART_COLORS, TIME_PERIOD_OPTIONS } from '../../contracts/constants';

const MODEL_DISPLAY: Record<AiModelLabel, { label: string; color: string }> = {
  'Sentiment Analysis': { label: 'Sentiment', color: CREDIT_CHART_COLORS.sentiment },
  'PII Analysis': { label: 'PII', color: CREDIT_CHART_COLORS.pii },
  'Custom Prompt Analysis': { label: 'Custom prompt', color: CREDIT_CHART_COLORS.custom },
};

const useStyles = makeStyles({
  card: { width: '100%', height: '100%' },
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    flex: '1 1 auto',
  },
  centered: { display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '1 1 auto', minHeight: '180px' },
  totalRow: { display: 'flex', alignItems: 'baseline', gap: tokens.spacingHorizontalM },
  muted: { color: tokens.colorNeutralForeground3 },
  secondary: { color: tokens.colorNeutralForeground2 },
  row: {
    display: 'grid',
    gridTemplateColumns: '120px 1fr auto',
    alignItems: 'center',
    columnGap: tokens.spacingHorizontalM,
  },
  track: {
    height: '10px',
    borderRadius: tokens.borderRadiusCircular,
    backgroundColor: tokens.colorNeutralBackground4,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: tokens.borderRadiusCircular },
  value: { textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' },
  strong: { color: tokens.colorNeutralForeground1, fontWeight: tokens.fontWeightSemibold },
});

/** AI credits consumed per analysis model in the active period (OV-8). */
export function CreditConsumptionCard() {
  const styles = useStyles();
  const { data, isLoading, isError } = useAiConsumption();
  const { data: summary } = useConversationAnalyzerSummary();
  const { timePeriod } = useFilterContext();

  const totalCredits = data?.totalCredits ?? 0;
  const byModel = data?.byModel ?? [];
  const subtitle = TIME_PERIOD_OPTIONS.find((o) => o.value === timePeriod)?.label ?? 'Last 7 days';
  const conversations = summary?.conversationsAnalyzed ?? 0;
  const avgPerConversation = conversations > 0 && totalCredits > 0 ? totalCredits / conversations : undefined;

  return (
    <Card className={styles.card}>
      <CardHeader
        header={<Subtitle2 as="h3">Credit consumption</Subtitle2>}
        action={<Caption1 className={styles.muted}>{subtitle}</Caption1>}
      />
      <div className={styles.body}>
        {isLoading ? (
          <div className={styles.centered}><Spinner size="small" label="Loading…" /></div>
        ) : isError ? (
          <div className={styles.centered}>
            <Body1>Unable to access AI Event or AI Model table. Check user permissions.</Body1>
          </div>
        ) : (
          <>
            <div className={styles.totalRow}>
              <Title2>{totalCredits.toLocaleString()}</Title2>
              <Caption1 className={styles.secondary}>credits consumed for analysis</Caption1>
            </div>
            {byModel.map((m) => {
              const display = MODEL_DISPLAY[m.label];
              const share = totalCredits > 0 ? Math.round((m.credits / totalCredits) * 100) : 0;
              return (
                <div
                  key={m.label}
                  className={styles.row}
                  role="group"
                  aria-label={`${display.label}: ${m.credits.toLocaleString()} credits, ${share}% of total`}
                >
                  <Body1>{display.label}</Body1>
                  <div className={styles.track} aria-hidden>
                    <div className={styles.fill} style={{ width: `${share}%`, backgroundColor: display.color }} />
                  </div>
                  <Body1 className={styles.value} aria-hidden>
                    {m.credits.toLocaleString()} <span className={styles.muted}>{`· ${share}%`}</span>
                  </Body1>
                </div>
              );
            })}
            {avgPerConversation !== undefined && (
              <Caption1 className={styles.muted}>
                Avg <span className={styles.strong}>{`${avgPerConversation.toFixed(1)} credits`}</span> per analyzed
                conversation.
              </Caption1>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
