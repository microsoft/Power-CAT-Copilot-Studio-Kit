import { useState } from 'react';
import {
  Body1,
  Body1Strong,
  Button,
  Card,
  MessageBar,
  MessageBarActions,
  MessageBarBody,
  SearchBox,
  Spinner,
  ToggleButton,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components';
import {
  Grid20Filled,
  Grid20Regular,
  List20Filled,
  List20Regular,
} from '@fluentui/react-icons';
import type {
  ReviewHistoryEntry,
  ReviewHistorySubject,
} from '../../contracts/ReviewResult';
import { useReviewHistory } from '../../hooks/useReviewHistory';
import { useReviewHistoryView } from '../../hooks/useReviewHistoryView';
import { ReviewHistoryCards } from './ReviewHistoryCards';
import { ReviewHistoryGrid } from './ReviewHistoryGrid';
import { ReviewHistoryPagination } from './ReviewHistoryPagination';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalM}`,
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
    width: '100%',
  },
  searchGroup: {
    flex: '1 1 auto',
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
  controls: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    flexWrap: 'wrap',
  },
  viewToggle: {
    color: tokens.colorNeutralForeground2,
  },
  viewToggleEmphasized: {
    color: tokens.colorBrandForeground1,
  },
  search: {
    minWidth: '220px',
    maxWidth: '320px',
    flex: '1 1 auto',
  },
  center: {
    display: 'flex',
    justifyContent: 'center',
    padding: tokens.spacingVerticalXXL,
  },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    padding: tokens.spacingVerticalXL,
  },
});

export interface ReviewHistoryProps {
  subject: ReviewHistorySubject;
  currentPublishedOn?: Date | null;
  selectedReviewId: string | null;
  onOpenReview: (entry: ReviewHistoryEntry) => void;
}

/**
 * Shared Standard/Microsoft Copilot review history with List and Card views.
 */
export function ReviewHistory({
  subject,
  currentPublishedOn,
  selectedReviewId,
  onOpenReview,
}: ReviewHistoryProps) {
  const styles = useStyles();
  const history = useReviewHistory(subject);
  const view = useReviewHistoryView(history.data ?? [], currentPublishedOn);
  const [emphasizedView, setEmphasizedView] =
    useState<'list' | 'card' | null>(null);
  const listEmphasized =
    view.view === 'list' || emphasizedView === 'list';
  const cardEmphasized =
    view.view === 'card' || emphasizedView === 'card';

  if (history.isLoading) {
    return (
      <div className={styles.center}>
        <Spinner label="Loading review history" />
      </div>
    );
  }

  if (history.isError) {
    return (
      <MessageBar intent="error">
        <MessageBarBody>
          Review history could not be loaded.
        </MessageBarBody>
        <MessageBarActions
          containerAction={(
            <Button appearance="transparent" onClick={() => history.refetch()}>
              Retry
            </Button>
          )}
        />
      </MessageBar>
    );
  }

  if ((history.data?.length ?? 0) === 0) {
    return (
      <Card appearance="filled">
        <div className={styles.empty}>
          <Body1Strong>No previous reviews yet</Body1Strong>
          <Body1>Completed reviews for this agent will appear here.</Body1>
        </div>
      </Card>
    );
  }

  // Shared toolbar stays fixed regardless of List/Card toggle
  const toolbar = (
    <div className={styles.toolbar}>
      <div className={styles.searchGroup}>
        <SearchBox
          className={styles.search}
          value={view.search}
          placeholder="Search review history"
          aria-label="Search review history"
          onChange={(_, data) => view.setSearch(data.value)}
        />
      </div>
      <div className={styles.controls} role="group" aria-label="History view">
        <ToggleButton
          appearance="subtle"
          className={mergeClasses(
            styles.viewToggle,
            listEmphasized && styles.viewToggleEmphasized,
          )}
          icon={listEmphasized ? <List20Filled /> : <List20Regular />}
          checked={view.view === 'list'}
          aria-label="Show review history as a list"
          onMouseEnter={() => setEmphasizedView('list')}
          onMouseLeave={() => setEmphasizedView(null)}
          onFocus={() => setEmphasizedView('list')}
          onBlur={() => setEmphasizedView(null)}
          onClick={() => view.setView('list')}
        />
        <ToggleButton
          appearance="subtle"
          className={mergeClasses(
            styles.viewToggle,
            cardEmphasized && styles.viewToggleEmphasized,
          )}
          icon={cardEmphasized ? <Grid20Filled /> : <Grid20Regular />}
          checked={view.view === 'card'}
          aria-label="Show review history as cards"
          onMouseEnter={() => setEmphasizedView('card')}
          onMouseLeave={() => setEmphasizedView(null)}
          onFocus={() => setEmphasizedView('card')}
          onBlur={() => setEmphasizedView(null)}
          onClick={() => view.setView('card')}
        />
      </div>
    </div>
  );

  return (
    <div className={styles.root}>
      {toolbar}
      <Body1>
        Counts are the stored summary values. Older summaries can use different count rules.
        Open a review for its finding details.
      </Body1>
      {view.view === 'list' ? (
        <ReviewHistoryGrid
          entries={view.pageEntries}
          selectedReviewId={selectedReviewId}
          sortColumn={view.sortColumn}
          sortDirection={view.sortDirection}
          onSortChange={view.selectSort}
          onOpenReview={onOpenReview}
        />
      ) : (
        <ReviewHistoryCards
          entries={view.pageEntries}
          selectedReviewId={selectedReviewId}
          onOpenReview={onOpenReview}
        />
      )}
      <ReviewHistoryPagination
        page={view.page}
        pageCount={view.pageCount}
        pageSize={view.pageSize}
        totalCount={view.totalCount}
        onPageChange={view.setPage}
        onPageSizeChange={view.setPageSize}
      />
    </div>
  );
}
