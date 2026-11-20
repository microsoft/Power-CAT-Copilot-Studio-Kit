/** Prompt insights tab (PI-1…PI-10): KPIs, top prompts, latest insights and the prompt library. */

import { makeStyles, tokens } from '@fluentui/react-components';
import { usePromptInsightsData } from '../../hooks/usePromptInsightsData';
import { RetryMessageBar } from '../shared/RetryMessageBar';
import { LatestInsightsCard } from './LatestInsightsCard';
import { PromptInsightsKpis } from './PromptInsightsKpis';
import { PromptLibraryCard } from './PromptLibraryCard';
import { TopPromptsCard } from './TopPromptsCard';

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalL },
  row: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)',
    gap: tokens.spacingHorizontalL,
    '@media (max-width: 1024px)': { gridTemplateColumns: 'minmax(0, 1fr)' },
  },
});

export default function PromptInsightsTab() {
  const styles = useStyles();
  const { error, refetch, isFetching } = usePromptInsightsData();

  return (
    <div className={styles.root}>
      {error && (
        <RetryMessageBar
          title="Couldn't load prompt insights"
          message={error.message}
          onRetry={() => void refetch()}
          retryDisabled={isFetching}
        />
      )}
      <PromptInsightsKpis />
      <div className={styles.row}>
        <TopPromptsCard />
        <LatestInsightsCard />
      </div>
      <PromptLibraryCard />
    </div>
  );
}
