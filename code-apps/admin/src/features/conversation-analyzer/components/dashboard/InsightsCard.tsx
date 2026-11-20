import type { ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  makeStyles,
  mergeClasses,
  tokens,
  Card,
  CardHeader,
  Subtitle2,
  Caption1,
  Body1Strong,
  Link,
  Divider,
  Spinner,
} from '@fluentui/react-components';
import {
  Warning20Filled,
  ShieldError20Filled,
  ShieldCheckmark20Filled,
  CheckmarkCircle20Filled,
  ArrowTrendingLines20Filled,
  Info20Filled,
} from '@fluentui/react-icons';
import { useConversationAnalyzerSummary } from '../../hooks/useConversationAnalyzerSummary';

type InsightTone = 'warning' | 'danger' | 'success' | 'info';

interface Insight {
  id: string;
  tone: InsightTone;
  icon: ReactElement;
  title: string;
  description: string;
  action?: { label: string; status: string };
}

const useStyles = makeStyles({
  card: { width: '100%', height: '100%' },
  meta: { color: tokens.colorNeutralForeground3 },
  list: {
    listStyleType: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
  },
  item: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: tokens.spacingHorizontalM,
    paddingTop: tokens.spacingVerticalS,
    paddingBottom: tokens.spacingVerticalS,
  },
  icon: {
    width: '32px',
    height: '32px',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: tokens.borderRadiusLarge,
  },
  warning: { backgroundColor: tokens.colorStatusWarningBackground1, color: tokens.colorStatusWarningForeground1 },
  danger: { backgroundColor: tokens.colorStatusDangerBackground1, color: tokens.colorStatusDangerForeground1 },
  success: { backgroundColor: tokens.colorStatusSuccessBackground1, color: tokens.colorStatusSuccessForeground1 },
  info: { backgroundColor: tokens.colorBrandBackground2, color: tokens.colorBrandForeground1 },
  body: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXXS, minWidth: 0 },
  description: { color: tokens.colorNeutralForeground2 },
  action: { alignSelf: 'flex-start', fontSize: tokens.fontSizeBase200 },
  spinner: { display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '160px' },
});

/** Insights card in the Activity row: coverage, PII and sentiment, each with an action link (OV-1). */
export function InsightsCard() {
  const styles = useStyles();
  const navigate = useNavigate();
  const { data, isLoading } = useConversationAnalyzerSummary();

  const insights: Insight[] = [];
  if (data) {
    const { totalAgents, agentsAnalyzed, piiConversations, sentiment } = data;
    const coverageLow = totalAgents > 0 && agentsAnalyzed / totalAgents < 0.5;
    insights.push({
      id: 'coverage',
      tone: coverageLow ? 'warning' : 'success',
      icon: coverageLow ? <Warning20Filled /> : <CheckmarkCircle20Filled />,
      title: coverageLow ? 'Low analysis coverage' : 'Good analysis coverage',
      description: coverageLow
        ? `Only ${agentsAnalyzed} of ${totalAgents} agents analyzed. Increase coverage to surface trends.`
        : `${agentsAnalyzed} of ${totalAgents} agents analyzed.`,
      action: agentsAnalyzed < totalAgents ? { label: 'Analyze agents', status: 'unknown' } : undefined,
    });
    insights.push(
      piiConversations > 0
        ? {
            id: 'pii',
            tone: 'danger',
            icon: <ShieldError20Filled />,
            title: `${piiConversations.toLocaleString()} PII ${piiConversations === 1 ? 'risk' : 'risks'} detected`,
            description: 'Sensitive data found in analyzed conversations.',
            action: { label: 'Review agents', status: 'critical' },
          }
        : {
            id: 'pii',
            tone: 'success',
            icon: <ShieldCheckmark20Filled />,
            title: 'No PII risks detected',
            description: 'No sensitive data found in analyzed conversations.',
          },
    );
    if (sentiment.total > 0) {
      const positive = sentiment.netScore >= 0;
      insights.push({
        id: 'sentiment',
        tone: positive ? 'success' : 'danger',
        icon: <ArrowTrendingLines20Filled />,
        title: `Sentiment trending ${positive ? 'positive' : 'negative'}`,
        description: `Net score ${positive && sentiment.netScore > 0 ? '+' : ''}${sentiment.netScore.toFixed(2)} · ${sentiment.positivePct}% positive across ${sentiment.total.toLocaleString()} conversations.`,
      });
    } else {
      insights.push({
        id: 'sentiment',
        tone: 'info',
        icon: <Info20Filled />,
        title: 'No sentiment data yet',
        description: 'Run sentiment analysis to see how conversations are trending.',
      });
    }
  }

  const attention = insights.filter((i) => i.tone === 'warning' || i.tone === 'danger').length;
  const positive = insights.filter((i) => i.tone === 'success').length;

  return (
    <Card className={styles.card} aria-labelledby="ca-insights-title">
      <CardHeader
        header={<Subtitle2 as="h3" id="ca-insights-title">Insights</Subtitle2>}
        action={
          isLoading ? undefined : (
            <Caption1 className={styles.meta}>{`${attention} need attention · ${positive} positive`}</Caption1>
          )
        }
      />
      {isLoading ? (
        <div className={styles.spinner}><Spinner size="small" label="Loading…" /></div>
      ) : (
        <ul className={styles.list}>
          {insights.map((insight, index) => (
            <li key={insight.id}>
              {index > 0 && <Divider />}
              <div className={styles.item}>
                <span className={mergeClasses(styles.icon, styles[insight.tone])} aria-hidden>{insight.icon}</span>
                <div className={styles.body}>
                  <Body1Strong>{insight.title}</Body1Strong>
                  <Caption1 className={styles.description}>{insight.description}</Caption1>
                  {insight.action && (
                    <Link
                      className={styles.action}
                      onClick={() => navigate(`/conversation-analyzer?tab=agents&status=${insight.action?.status}`)}
                    >
                      {insight.action.label}
                    </Link>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
