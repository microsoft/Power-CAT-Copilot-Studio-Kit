/** Most recent result per prompt (PI-5): newest three, with a tone accent. */

import {
  Body1Strong, Caption1, Card, CardHeader, Link, Skeleton, SkeletonItem, Subtitle2, Text,
  makeStyles, tokens,
} from '@fluentui/react-components';
import { Clock12Regular, Lightbulb24Regular } from '@fluentui/react-icons';
import { useNavigate } from 'react-router-dom';
import {
  LATEST_INSIGHTS_COUNT, usePromptInsightsData, type InsightTone, type PromptInsightRow, type PromptInsightsData,
} from '../../hooks/usePromptInsightsData';
import { getPromptLabel } from '../../utils/format';
import { EmptyState } from '../shared/EmptyState';
import { formatRelativeTime, promptResultsPath } from './promptInsightsUtils';

const TONE_COLOR: Record<InsightTone, string> = {
  brand: tokens.colorBrandStroke1,
  success: tokens.colorPaletteGreenBorderActive,
  warning: tokens.colorPaletteMarigoldBorderActive,
  danger: tokens.colorPaletteRedBorderActive,
};

function selectLatest(data: PromptInsightsData): PromptInsightRow[] {
  return data.prompts
    .filter((p) => p.lastRunOn && p.latestSummary)
    .sort((a, b) => (b.lastRunOn ?? '').localeCompare(a.lastRunOn ?? ''))
    .slice(0, LATEST_INSIGHTS_COUNT);
}

const useStyles = makeStyles({
  card: { height: '100%' },
  meta: { color: tokens.colorNeutralForeground3 },
  list: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM, margin: 0, padding: 0, listStyle: 'none' },
  item: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
    paddingLeft: tokens.spacingHorizontalM,
    borderLeftWidth: tokens.strokeWidthThicker,
    borderLeftStyle: 'solid',
    minWidth: 0,
  },
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: tokens.spacingHorizontalS },
  name: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  time: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXXS,
    flexShrink: 0,
    color: tokens.colorNeutralForeground3,
  },
  summary: {
    color: tokens.colorNeutralForeground2,
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  link: { alignSelf: 'flex-start' },
});

export function LatestInsightsCard() {
  const styles = useStyles();
  const navigate = useNavigate();
  const { data, isLoading } = usePromptInsightsData(selectLatest);

  return (
    <Card className={styles.card} appearance="filled">
      <CardHeader
        header={<Subtitle2 as="h3">Latest insights</Subtitle2>}
        description={<Caption1 className={styles.meta}>Most recent result per prompt</Caption1>}
      />
      {isLoading ? (
        <Skeleton aria-label="Loading latest insights">
          {Array.from({ length: LATEST_INSIGHTS_COUNT }, (_, i) => <SkeletonItem key={i} size={48} style={{ marginBottom: 12 }} />)}
        </Skeleton>
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon={<Lightbulb24Regular />}
          title="No results yet"
          description="Results appear here after a prompt runs on conversations."
          minHeight="200px"
        />
      ) : (
        <ul className={styles.list}>
          {data.map((row) => {
            const name = getPromptLabel(row);
            return (
              <li key={row.id} className={styles.item} style={{ borderLeftColor: TONE_COLOR[row.latestTone ?? 'brand'] }}>
                <div className={styles.head}>
                  <Body1Strong className={styles.name}>{name}</Body1Strong>
                  <Caption1 className={styles.time}>
                    <Clock12Regular aria-hidden="true" />
                    {formatRelativeTime(row.lastRunOn)}
                  </Caption1>
                </div>
                <Text size={200} className={styles.summary} title={row.latestSummary}>{row.latestSummary}</Text>
                {row.latestAgentId && (
                  <Link
                    className={styles.link}
                    aria-label={`View results for ${name}`}
                    onClick={() => navigate(promptResultsPath(row.latestAgentId!, row.id, row.latestEnvironmentUrl))}
                  >
                    View results →
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
