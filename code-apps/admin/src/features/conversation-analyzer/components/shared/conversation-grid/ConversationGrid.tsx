import { useCallback, useMemo } from 'react';
import type { ReactNode, UIEvent, WheelEvent } from 'react';
import {
  DataGrid,
  DataGridBody,
  DataGridCell,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridRow,
  Spinner,
  makeStyles,
  mergeClasses,
  tokens,
  type DataGridProps,
} from '@fluentui/react-components';
import { RetryMessageBar } from '../RetryMessageBar';
import { createConversationGridColumns, type ConversationGridColumnOptions } from './conversationGridColumns';
import type { ConversationGridColumnId, ConversationGridRow, ConversationGridSortState } from './types';
import { COPY_ID_CLASS } from './types';

const LOAD_MORE_BUFFER_PX = 600;

// CSS flex sizing: fixed columns keep their width, Conversation/Summary absorb the rest so the grid always fills 100%.
const useColumnStyles = makeStyles({
  conversation: { flex: '2 1 280px', minWidth: '240px' },
  agent: { flex: '0 0 170px' },
  startTime: { flex: '0 0 180px' },
  duration: { flex: '0 0 92px' },
  messages: { flex: '0 0 92px' },
  analysis: { flex: '0 0 210px' },
  summary: { flex: '1 1 240px', minWidth: '200px' },
  actions: { flex: '0 0 120px' },
});

const useStyles = makeStyles({
  root: { minWidth: 0, width: '100%' },
  viewport: {
    minHeight: '240px',
    overflow: 'auto',
    '& [role="rowgroup"]:first-child [role="row"]': {
      position: 'sticky',
      top: 0,
      zIndex: 1,
      backgroundColor: tokens.colorNeutralBackground1,
    },
  },
  headerCell: { fontWeight: tokens.fontWeightSemibold },
  grid: { width: '100%', minWidth: '1000px' },
  row: {
    minHeight: '56px',
    [`& .${COPY_ID_CLASS}`]: { opacity: 0 },
    [`&:hover .${COPY_ID_CLASS}, &:focus-within .${COPY_ID_CLASS}`]: { opacity: 1 },
  },
  action: { display: 'flex', justifyContent: 'flex-end', width: '100%' },
  state: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '240px',
    padding: tokens.spacingVerticalL,
  },
  footer: {
    display: 'flex',
    justifyContent: 'center',
    paddingTop: tokens.spacingVerticalS,
    paddingBottom: tokens.spacingVerticalS,
  },
});

export interface ConversationGridProps<T extends ConversationGridRow>
  extends Omit<ConversationGridColumnOptions<T>, 'actionClassName'> {
  rows: readonly T[];
  ariaLabel: string;
  sortState?: ConversationGridSortState;
  onSortChange?: (sort: ConversationGridSortState) => void;
  selectedItems?: Set<string>;
  onSelectionChange?: NonNullable<DataGridProps['onSelectionChange']>;
  selectionDisabled?: boolean;
  isLoading?: boolean;
  loadingLabel?: string;
  error?: unknown;
  errorTitle?: string;
  onRetry?: () => void;
  /** More rows can be shown; scrolling near the end calls onLoadMore. */
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  empty: ReactNode;
  maxHeight?: string;
}

/** Shared conversation grid (GR-1…GR-3): same columns, formats, row height and sorting on every screen. */
export function ConversationGrid<T extends ConversationGridRow>({
  rows,
  ariaLabel,
  showAgent,
  showAnalysis,
  showSummary,
  renderActions,
  unsortable,
  clickableSort,
  sortState,
  onSortChange,
  selectedItems,
  onSelectionChange,
  selectionDisabled = false,
  isLoading = false,
  loadingLabel = 'Loading conversations…',
  error,
  errorTitle = 'Unable to load conversations.',
  onRetry,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
  empty,
  maxHeight = '70vh',
}: ConversationGridProps<T>) {
  const styles = useStyles();
  const columnStyles = useColumnStyles();
  const columns = useMemo(
    () => createConversationGridColumns<T>({
      showAgent, showAnalysis, showSummary, renderActions, unsortable, clickableSort, actionClassName: styles.action,
    }),
    [clickableSort, renderActions, showAgent, showAnalysis, showSummary, styles.action, unsortable],
  );
  const columnClass = (columnId: string | number) => columnStyles[columnId as ConversationGridColumnId];

  const loadMoreNearEnd = useCallback((el: HTMLDivElement) => {
    if (hasMore && !isLoadingMore && el.scrollHeight - el.scrollTop - el.clientHeight < LOAD_MORE_BUFFER_PX) {
      onLoadMore?.();
    }
  }, [hasMore, isLoadingMore, onLoadMore]);
  const handleScroll = useCallback((event: UIEvent<HTMLDivElement>) => loadMoreNearEnd(event.currentTarget), [loadMoreNearEnd]);
  // A short list has no scrollbar, so scroll events never fire; wheeling down still loads more.
  const handleWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    if (event.deltaY > 0) loadMoreNearEnd(event.currentTarget);
  }, [loadMoreNearEnd]);

  const handleSortChange = useCallback<NonNullable<DataGridProps['onSortChange']>>((_e, data) => {
    onSortChange?.({ sortColumn: data.sortColumn as ConversationGridColumnId, sortDirection: data.sortDirection });
  }, [onSortChange]);

  let content: ReactNode;
  if (isLoading && rows.length === 0) {
    content = <div className={styles.state} role="status" aria-live="polite"><Spinner label={loadingLabel} /></div>;
  } else if (error && rows.length === 0) {
    content = <div className={styles.state}><RetryMessageBar title={errorTitle} onRetry={onRetry} /></div>;
  } else if (rows.length === 0) {
    content = <div className={styles.state} role="status" aria-live="polite">{empty}</div>;
  } else {
    content = (
      <>
        <div className={styles.viewport} style={{ maxHeight }} onScroll={handleScroll} onWheel={handleWheel}>
          <DataGrid
            aria-label={ariaLabel}
            items={rows as T[]}
            columns={columns}
            getRowId={(row: T) => row.id}
            selectionMode={onSelectionChange ? 'multiselect' : undefined}
            selectedItems={selectedItems}
            onSelectionChange={onSelectionChange}
            sortable={Boolean(onSortChange)}
            sortState={sortState}
            onSortChange={handleSortChange}
            focusMode="composite"
            className={styles.grid}
          >
            <DataGridHeader>
              <DataGridRow
                selectionCell={{ checkboxIndicator: { 'aria-label': 'Select all loaded conversations', disabled: selectionDisabled } }}
              >
                {({ renderHeaderCell, columnId }) => (
                  <DataGridHeaderCell aria-label={columnId === 'actions' ? 'Actions' : undefined} className={mergeClasses(styles.headerCell, columnClass(columnId))}>{renderHeaderCell()}</DataGridHeaderCell>
                )}
              </DataGridRow>
            </DataGridHeader>
            <DataGridBody<T>>
              {({ item, rowId }) => (
                <DataGridRow<T>
                  key={rowId}
                  className={styles.row}
                  selectionCell={{
                    checkboxIndicator: { 'aria-label': `Select conversation ${item.topic ?? item.conversationId}`, disabled: selectionDisabled },
                  }}
                >
                  {({ renderCell, columnId }) => <DataGridCell className={columnClass(columnId)}>{renderCell(item)}</DataGridCell>}
                </DataGridRow>
              )}
            </DataGridBody>
          </DataGrid>
        </div>
        {isLoadingMore && (
          <div className={styles.footer} role="status" aria-live="polite">
            <Spinner size="small" label="Loading more conversations…" />
          </div>
        )}
        {Boolean(error) && !isLoadingMore && (
          <RetryMessageBar intent="warning" title="Unable to load more conversations." onRetry={onRetry} />
        )}
      </>
    );
  }

  // Narrow viewports scroll horizontally instead of squeezing the fixed columns.
  return <div className={styles.root}>{content}</div>;
}
