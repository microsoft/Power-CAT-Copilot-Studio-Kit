import { makeStyles, tokens, Card, CardHeader, Subtitle2, Badge, Title2, Caption1, Spinner } from '@fluentui/react-components';
import { HorizontalBarRow } from '../shared/HorizontalBarRow';
import { useConversationAnalyzerSummary } from '../../hooks/useConversationAnalyzerSummary';
import { SENTIMENT_CHART_COLORS } from '../../contracts/constants';

const useStyles = makeStyles({
  card: {
    width: '100%',
    height: '100%',
  },
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  scoreRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: tokens.spacingHorizontalM,
  },
  score: {
    color: tokens.colorNeutralForeground1,
  },
  scoreLabel: {
    color: tokens.colorNeutralForeground2,
  },
  footnote: {
    color: tokens.colorNeutralForeground3,
  },
  centered: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flex: '1 1 auto',
    minHeight: '180px',
  },
});

export function SentimentCard() {
  const styles = useStyles();
  const { data, isLoading } = useConversationAnalyzerSummary();
  const s = data?.sentiment ?? { netScore: 0, positive: 0, neutral: 0, negative: 0, coveragePct: 0 };
  const scoreText = `${s.netScore > 0 ? '+' : ''}${s.netScore.toFixed(2)}`;
  const total = Math.max(s.positive + s.neutral + s.negative, 1);
  const conversationsAnalyzed = data?.conversationsAnalyzed ?? 0;
  const analyzedForSentiment = s.positive + s.neutral + s.negative;

  return (
    <Card className={styles.card}>
      <CardHeader
        header={<Subtitle2 as="h3">Sentiment</Subtitle2>}
        action={isLoading ? undefined : <Badge shape="rounded" appearance="tint" color="brand">{`${s.coveragePct}% coverage`}</Badge>}
      />
      {isLoading ? (
        <div className={styles.centered}>
          <Spinner size="small" label="Loading…" />
        </div>
      ) : (
        <div className={styles.body}>
          <div className={styles.scoreRow}>
            <Title2 className={styles.score}>{scoreText}</Title2>
            <Caption1 className={styles.scoreLabel}>Net sentiment score</Caption1>
          </div>
          <HorizontalBarRow label="Positive" value={s.positive} total={total} color={SENTIMENT_CHART_COLORS.positive} />
          <HorizontalBarRow label="Neutral" value={s.neutral} total={total} color={SENTIMENT_CHART_COLORS.neutral} />
          <HorizontalBarRow label="Negative" value={s.negative} total={total} color={SENTIMENT_CHART_COLORS.negative} />
          <Caption1 className={styles.footnote}>
            {`Based on ${analyzedForSentiment} of ${conversationsAnalyzed} analyzed conversations.`}
          </Caption1>
        </div>
      )}
    </Card>
  );
}
