import {
  makeStyles, tokens, typographyStyles, Card, Subtitle2, Body1, Caption1,
} from '@fluentui/react-components';
import { formatDuration } from '../../utils/format';

interface CustomResultCardProps {
  summary: string;
  result?: string;
  duration?: number;
  messages?: number;
}

const useStyles = makeStyles({
  card: { width: '100%', height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' as const, overflow: 'hidden', padding: 0, border: `1px solid ${tokens.colorNeutralStroke2}` },
  body: {
    paddingTop: tokens.spacingVerticalL,
    paddingRight: tokens.spacingHorizontalL,
    paddingBottom: tokens.spacingVerticalL,
    paddingLeft: tokens.spacingHorizontalL,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    flex: 1,
    minHeight: 0,
    overflowY: 'auto' as const,
  },
  summaryText: {
    color: tokens.colorNeutralForeground1,
  },
  kpiRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: tokens.spacingHorizontalM,
  },
  kpiBox: {
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    borderLeft: `3px solid ${tokens.colorBrandStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalM}`,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  kpiValue: {
    ...typographyStyles.subtitle1,
  },
  kpiLabel: {
    color: tokens.colorNeutralForeground3,
  },
});

export function CustomResultCard({ summary, result, duration, messages }: CustomResultCardProps) {
  const styles = useStyles();

  return (
    <Card className={styles.card} appearance="filled">
      <div className={styles.body}>
        <Subtitle2>Summary</Subtitle2>
        <Body1 className={styles.summaryText}>{summary}</Body1>

        <div className={styles.kpiRow}>
          <div className={styles.kpiBox}>
            <span className={styles.kpiValue}>{formatDuration(duration)}</span>
            <Caption1 className={styles.kpiLabel}>Conversation Duration</Caption1>
          </div>
          <div className={styles.kpiBox}>
            <span className={styles.kpiValue}>{messages?.toLocaleString() ?? ''}</span>
            <Caption1 className={styles.kpiLabel}>Messages Analyzed</Caption1>
          </div>
        </div>

        {result && (
          <>
            <Subtitle2>Result</Subtitle2>
            <Body1 className={styles.summaryText}>{result}</Body1>
          </>
        )}
      </div>
    </Card>
  );
}
