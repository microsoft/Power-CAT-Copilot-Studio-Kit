/** Top 5 prompts by runs in the selected period (PI-4). */

import {
  Body1, Button, Caption1, Card, CardHeader, Skeleton, SkeletonItem, Subtitle2, makeStyles, tokens,
} from '@fluentui/react-components';
import { DataBarHorizontal24Regular } from '@fluentui/react-icons';
import { useNavigate } from 'react-router-dom';
import { usePromptInsightsData, type PromptInsightsData } from '../../hooks/usePromptInsightsData';
import { getPromptLabel } from '../../utils/format';
import { EmptyState } from '../shared/EmptyState';
import { promptResultsPath } from './promptInsightsUtils';

const TOP_COUNT = 5;

interface TopPromptItem {
  id: string;
  name: string;
  runs: number;
  sharePct: number;
  agentId?: string;
  environmentUrl?: string;
}

interface TopPromptsSlice {
  items: TopPromptItem[];
  promptsInUse: number;
  totalRuns: number;
}

function selectTop(data: PromptInsightsData): TopPromptsSlice {
  const used = data.prompts.filter((p) => p.runsCount > 0).sort((a, b) => b.runsCount - a.runsCount);
  return {
    items: used.slice(0, TOP_COUNT).map((p) => ({
      id: p.id,
      name: getPromptLabel(p),
      runs: p.runsCount,
      sharePct: data.totalRuns > 0 ? Math.round((p.runsCount / data.totalRuns) * 100) : 0,
      agentId: p.topAgentId,
      environmentUrl: p.topAgentEnvironmentUrl,
    })),
    promptsInUse: used.length,
    totalRuns: data.totalRuns,
  };
}

const useStyles = makeStyles({
  card: { height: '100%' },
  meta: { color: tokens.colorNeutralForeground3 },
  list: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXXS },
  row: {
    display: 'grid',
    gridTemplateColumns: 'minmax(120px, 2fr) minmax(80px, 3fr) 56px 44px',
    alignItems: 'center',
    columnGap: tokens.spacingHorizontalM,
    width: '100%',
    minHeight: '40px',
    justifyContent: 'stretch',
    textAlign: 'left',
    fontWeight: tokens.fontWeightRegular,
  },
  name: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  track: {
    height: '8px',
    borderRadius: tokens.borderRadiusCircular,
    backgroundColor: tokens.colorNeutralBackground5,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: tokens.borderRadiusCircular, backgroundColor: tokens.colorBrandBackground },
  num: { textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
  pct: { textAlign: 'right', color: tokens.colorNeutralForeground3, fontVariantNumeric: 'tabular-nums' },
});

export function TopPromptsCard() {
  const styles = useStyles();
  const navigate = useNavigate();
  const { data, isLoading } = usePromptInsightsData(selectTop);
  const max = Math.max(1, ...(data?.items.map((i) => i.runs) ?? [0]));

  return (
    <Card className={styles.card} appearance="filled">
      <CardHeader
        header={<Subtitle2 as="h3">Top 5 prompts by runs</Subtitle2>}
        description={data && data.items.length > 0 ? (
          <Caption1 className={styles.meta}>
            {`Top ${data.items.length} of ${data.promptsInUse} · ${data.totalRuns.toLocaleString()} total runs`}
          </Caption1>
        ) : undefined}
      />
      {isLoading ? (
        <Skeleton aria-label="Loading top prompts">
          {Array.from({ length: TOP_COUNT }, (_, i) => <SkeletonItem key={i} size={24} style={{ marginBottom: 12 }} />)}
        </Skeleton>
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          icon={<DataBarHorizontal24Regular />}
          title="No prompt runs in this period"
          description="Run an analysis or choose a longer time period."
          minHeight="200px"
        />
      ) : (
        <ol className={styles.list} aria-label="Top prompts by runs" style={{ margin: 0, padding: 0, listStyle: 'none' }}>
          {data.items.map((item) => (
            <li key={item.id}>
              <Button
                appearance="subtle"
                className={styles.row}
                disabled={!item.agentId}
                aria-label={`${item.name}: ${item.runs.toLocaleString()} runs, ${item.sharePct}% of runs. View results`}
                onClick={() => item.agentId && navigate(promptResultsPath(item.agentId, item.id, item.environmentUrl))}
              >
                <Body1 className={styles.name}>{item.name}</Body1>
                <span className={styles.track} aria-hidden="true">
                  <span className={styles.fill} style={{ display: 'block', width: `${(item.runs / max) * 100}%` }} />
                </span>
                <Body1 className={styles.num}>{item.runs.toLocaleString()}</Body1>
                <Caption1 className={styles.pct}>{`${item.sharePct}%`}</Caption1>
              </Button>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
