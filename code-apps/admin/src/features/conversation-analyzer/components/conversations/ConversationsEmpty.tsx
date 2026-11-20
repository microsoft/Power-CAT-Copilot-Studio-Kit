import { Button, makeStyles, tokens } from '@fluentui/react-components';
import { ChatMultipleRegular, FilterDismissRegular } from '@fluentui/react-icons';
import { EmptyState } from '../shared/EmptyState';

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: tokens.spacingVerticalM },
});

/** Empty grid message: filters vs. period/agent with no transcripts (CV-11). */
export function ConversationsEmpty({ filtersActive, onClearFilters }: { filtersActive: boolean; onClearFilters: () => void }) {
  const styles = useStyles();
  if (!filtersActive) {
    return (
      <EmptyState
        icon={<ChatMultipleRegular />}
        title="No conversations in this period"
        description="Try a longer time period or another agent."
        minHeight="240px"
      />
    );
  }
  return (
    <div className={styles.root}>
      <EmptyState
        icon={<FilterDismissRegular />}
        title="No conversations match your filters"
        description="Try a different analysis status or search term."
        minHeight="200px"
      />
      <Button icon={<FilterDismissRegular />} onClick={onClearFilters}>Clear filters</Button>
    </div>
  );
}
