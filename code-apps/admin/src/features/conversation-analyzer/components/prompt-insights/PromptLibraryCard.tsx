/** Prompt library: every prompt with its latest insight and run stats (PI-6…PI-9). */

import { useCallback, useMemo, useState } from 'react';
import {
  Button, Caption1, Card, CardHeader, Skeleton, SkeletonItem, Subtitle2,
  DataGrid, DataGridBody, DataGridCell, DataGridHeader, DataGridHeaderCell, DataGridRow,
  makeStyles, tokens, type SortDirection,
} from '@fluentui/react-components';
import { Add16Regular, ChevronLeft16Regular, ChevronRight16Regular } from '@fluentui/react-icons';
import { useNavigate } from 'react-router-dom';
import { useFeaturedPrompts } from '../../hooks/useFeaturedPrompts';
import type { PromptInsightRow } from '../../hooks/usePromptInsightsData';
import { useStretchedColumnSizing } from '../../hooks/useStretchedColumnSizing';
import { PAGE_SIZE_CUSTOM_ANALYSIS } from '../../contracts/constants';
import { getPromptLabel } from '../../utils/format';
import { EmptyState } from '../shared/EmptyState';
import { createLibraryColumns } from './promptLibraryColumns';
import { LIBRARY_COLUMN_SIZING, LIBRARY_FLEX_COLUMNS, useLibraryCellStyles } from './promptLibraryStyles';
import { PromptLibraryToolbar, type LibraryCounts, type LibraryFilter } from './PromptLibraryToolbar';
import { managePromptsPath } from './promptInsightsUtils';

type SortState = { sortColumn: string; sortDirection: SortDirection };

const useStyles = makeStyles({
  card: { width: '100%' },
  meta: { color: tokens.colorNeutralForeground3 },
  body: { minWidth: 0, overflowX: 'auto' },
  createButton: { whiteSpace: 'nowrap' },
  row: { minHeight: '64px' },
  footer: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: tokens.spacingHorizontalM },
  pager: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalXS },
});

function sortRows(rows: PromptInsightRow[], { sortColumn, sortDirection }: SortState): PromptInsightRow[] {
  const dir = sortDirection === 'ascending' ? 1 : -1;
  return [...rows].sort((a, b) => {
    switch (sortColumn) {
      case 'prompt': return dir * getPromptLabel(a).localeCompare(getPromptLabel(b));
      case 'type': return dir * a.scope.localeCompare(b.scope);
      case 'lastRun': return dir * (a.lastRunOn ?? '').localeCompare(b.lastRunOn ?? '');
      default: return dir * (a.runsCount - b.runsCount);
    }
  });
}

export function PromptLibraryCard() {
  const styles = useStyles();
  const cellStyles = useLibraryCellStyles();
  const navigate = useNavigate();
  const { data, isLoading } = useFeaturedPrompts();
  const [filter, setFilter] = useState<LibraryFilter>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [sortState, setSortState] = useState<SortState>({ sortColumn: 'runs', sortDirection: 'descending' });
  const { containerRef, columnSizingOptions, gridKey } = useStretchedColumnSizing(LIBRARY_COLUMN_SIZING, LIBRARY_FLEX_COLUMNS);

  const all = useMemo(() => data ?? [], [data]);
  const counts: LibraryCounts = useMemo(() => {
    const inUse = all.filter((p) => p.runsCount > 0).length;
    return { all: all.length, 'in-use': inUse, 'never-run': all.length - inUse };
  }, [all]);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = all.filter((p) => {
      if (filter === 'in-use' && p.runsCount === 0) return false;
      if (filter === 'never-run' && p.runsCount > 0) return false;
      if (!term) return true;
      return [getPromptLabel(p), p.userPrompt ?? '', p.latestSummary ?? ''].some((v) => v.toLowerCase().includes(term));
    });
    return sortRows(filtered, sortState);
  }, [all, filter, search, sortState]);

  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE_CUSTOM_ANALYSIS));
  const currentPage = Math.min(page, totalPages);
  const pageRows = rows.slice((currentPage - 1) * PAGE_SIZE_CUSTOM_ANALYSIS, currentPage * PAGE_SIZE_CUSTOM_ANALYSIS);
  const start = total === 0 ? 0 : (currentPage - 1) * PAGE_SIZE_CUSTOM_ANALYSIS + 1;
  const end = Math.min(currentPage * PAGE_SIZE_CUSTOM_ANALYSIS, total);
  const maxRuns = Math.max(1, ...all.map((p) => p.runsCount));

  const columns = useMemo(
    () => createLibraryColumns(cellStyles, maxRuns, (row) => navigate(managePromptsPath({ view: row.id }))),
    [cellStyles, maxRuns, navigate],
  );

  const handleSortChange = useCallback((_e: unknown, s: { sortColumn?: string | number; sortDirection: SortDirection }) => {
    if (s.sortColumn) {
      setSortState({ sortColumn: String(s.sortColumn), sortDirection: s.sortDirection });
      setPage(1);
    }
  }, []);

  const emptyTitle = search.trim()
    ? 'No prompts match your search'
    : filter === 'in-use' ? 'No prompts ran in this period'
      : filter === 'never-run' ? 'Every prompt ran in this period' : 'No prompts yet';
  const emptyDescription = search.trim()
    ? 'Try a different keyword or clear the search.'
    : filter === 'all' ? 'Create a custom prompt to start analyzing conversations.' : 'Try a different filter or time period.';

  return (
    <Card className={styles.card} appearance="filled">
      <CardHeader
        header={<Subtitle2 as="h3">Prompt library</Subtitle2>}
        description={<Caption1 className={styles.meta}>System and custom prompts with their latest insight</Caption1>}
        action={(
          <Button className={styles.createButton} appearance="primary" icon={<Add16Regular />} onClick={() => navigate(managePromptsPath({ create: true }))}>
            Create prompt
          </Button>
        )}
      />
      <PromptLibraryToolbar
        filter={filter}
        counts={counts}
        search={search}
        onFilterChange={(f) => { setFilter(f); setPage(1); }}
        onSearchChange={(s) => { setSearch(s); setPage(1); }}
      />
      <div ref={containerRef} className={styles.body}>
        {isLoading ? (
          <Skeleton aria-label="Loading prompts">
            {Array.from({ length: 5 }, (_, i) => <SkeletonItem key={i} size={40} style={{ marginBottom: 12 }} />)}
          </Skeleton>
        ) : total === 0 ? (
          <EmptyState illustration title={emptyTitle} description={emptyDescription} minHeight="280px" />
        ) : (
          <DataGrid
            key={gridKey}
            items={pageRows}
            columns={columns}
            getRowId={(r) => r.id}
            sortable
            sortState={sortState}
            onSortChange={handleSortChange}
            resizableColumns
            columnSizingOptions={columnSizingOptions}
            aria-label="Prompt library"
            style={{ width: '100%' }}
          >
            <DataGridHeader>
              <DataGridRow>
                {({ renderHeaderCell }) => <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>}
              </DataGridRow>
            </DataGridHeader>
            <DataGridBody<PromptInsightRow>>
              {({ item, rowId }) => (
                <DataGridRow<PromptInsightRow> key={rowId} className={styles.row}>
                  {({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
                </DataGridRow>
              )}
            </DataGridBody>
          </DataGrid>
        )}
      </div>
      {total > 0 && (
        <div className={styles.footer}>
          <Caption1 className={styles.meta} aria-live="polite">{`Showing ${start}–${end} of ${total} prompts`}</Caption1>
          <div className={styles.pager}>
            <Button appearance="subtle" size="small" icon={<ChevronLeft16Regular />} aria-label="Previous page"
              disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)} />
            <Caption1>{`${currentPage} / ${totalPages}`}</Caption1>
            <Button appearance="subtle" size="small" icon={<ChevronRight16Regular />} aria-label="Next page"
              disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)} />
          </div>
        </div>
      )}
    </Card>
  );
}
