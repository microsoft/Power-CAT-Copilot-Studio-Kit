/** All prompts table for Manage prompts (MP-1, MP-2, MP-8). */

import { useMemo } from 'react';
import {
  Button, Caption1, Card, CardHeader, Link, Skeleton, SkeletonItem, Subtitle2,
  DataGrid, DataGridBody, DataGridCell, DataGridHeader, DataGridHeaderCell, DataGridRow,
  createTableColumn, makeStyles, tokens, type TableColumnDefinition,
} from '@fluentui/react-components';
import { Delete16Regular, Edit16Regular, Eye16Regular } from '@fluentui/react-icons';
import type { PromptTableRow } from '../../hooks/usePromptsTable';
import { useStretchedColumnSizing } from '../../hooks/useStretchedColumnSizing';
import { formatDate, getPromptLabel } from '../../utils/format';
import { DotLabel } from '../shared/DotLabel';
import { EmptyState } from '../shared/EmptyState';
import { PromptTypeBadge } from '../shared/PromptPreview';

const BASE_COLUMN_SIZING = {
  prompt: { minWidth: 220, defaultWidth: 260 },
  scope: { minWidth: 90, defaultWidth: 100 },
  runs: { minWidth: 80, defaultWidth: 90 },
  lastRun: { minWidth: 110, defaultWidth: 120 },
  createdOn: { minWidth: 110, defaultWidth: 110 },
  createdBy: { minWidth: 150, defaultWidth: 160 },
  modifiedOn: { minWidth: 110, defaultWidth: 110 },
  modifiedBy: { minWidth: 150, defaultWidth: 160 },
  actions: { minWidth: 160, defaultWidth: 170 },
} as const;
const FLEX_COLUMNS = ['prompt'] as const;

const useStyles = makeStyles({
  card: { width: '100%' },
  meta: { color: tokens.colorNeutralForeground3 },
  body: { minWidth: 0 },
  row: { minHeight: '52px' },
  name: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' },
  num: { width: '100%', textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
  actions: { display: 'flex', gap: tokens.spacingHorizontalXS },
  srOnly: { position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' },
});

interface PromptsListTableProps {
  rows: PromptTableRow[];
  totalCount: number;
  isLoading: boolean;
  isFiltered: boolean;
  onView: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (row: PromptTableRow) => void;
}

export function PromptsListTable({ rows, totalCount, isLoading, isFiltered, onView, onEdit, onDelete }: PromptsListTableProps) {
  const styles = useStyles();
  const { containerRef, columnSizingOptions, gridKey } = useStretchedColumnSizing(BASE_COLUMN_SIZING, FLEX_COLUMNS);

  const columns: TableColumnDefinition<PromptTableRow>[] = useMemo(() => [
    createTableColumn<PromptTableRow>({
      columnId: 'prompt',
      compare: (a, b) => getPromptLabel(a).localeCompare(getPromptLabel(b)),
      renderHeaderCell: () => 'Prompt name',
      renderCell: (row) => (
        <Link className={styles.name} onClick={() => onView(row.id)} title={getPromptLabel(row)}>
          {getPromptLabel(row)}
        </Link>
      ),
    }),
    createTableColumn<PromptTableRow>({
      columnId: 'scope',
      compare: (a, b) => a.scope.localeCompare(b.scope),
      renderHeaderCell: () => 'Type',
      renderCell: (row) => <PromptTypeBadge scope={row.scope} />,
    }),
    createTableColumn<PromptTableRow>({
      columnId: 'runs',
      compare: (a, b) => a.runsCount - b.runsCount,
      renderHeaderCell: () => <span className={styles.num}>Runs</span>,
      renderCell: (row) => <Caption1 className={styles.num}>{row.runsCount.toLocaleString()}</Caption1>,
    }),
    createTableColumn<PromptTableRow>({
      columnId: 'lastRun',
      compare: (a, b) => (a.lastRunAt ?? '').localeCompare(b.lastRunAt ?? ''),
      renderHeaderCell: () => 'Last run',
      renderCell: (row) => row.lastRunAt
        ? <Caption1>{formatDate(row.lastRunAt)}</Caption1>
        : <DotLabel tone="subtle" muted>Never run</DotLabel>,
    }),
    createTableColumn<PromptTableRow>({
      columnId: 'createdOn',
      compare: (a, b) => (a.createdOn ?? '').localeCompare(b.createdOn ?? ''),
      renderHeaderCell: () => 'Created on',
      renderCell: (row) => <Caption1>{formatDate(row.createdOn)}</Caption1>,
    }),
    createTableColumn<PromptTableRow>({
      columnId: 'createdBy',
      compare: (a, b) => (a.createdBy ?? '').localeCompare(b.createdBy ?? ''),
      renderHeaderCell: () => 'Created by',
      renderCell: (row) => <Caption1>{row.createdBy ?? ''}</Caption1>,
    }),
    createTableColumn<PromptTableRow>({
      columnId: 'modifiedOn',
      compare: (a, b) => (a.modifiedOn ?? '').localeCompare(b.modifiedOn ?? ''),
      renderHeaderCell: () => 'Modified on',
      renderCell: (row) => <Caption1>{formatDate(row.modifiedOn)}</Caption1>,
    }),
    createTableColumn<PromptTableRow>({
      columnId: 'modifiedBy',
      compare: (a, b) => (a.modifiedBy ?? '').localeCompare(b.modifiedBy ?? ''),
      renderHeaderCell: () => 'Modified by',
      renderCell: (row) => <Caption1>{row.modifiedBy ?? ''}</Caption1>,
    }),
    createTableColumn<PromptTableRow>({
      columnId: 'actions',
      renderHeaderCell: () => <span className={styles.srOnly}>Actions</span>,
      renderCell: (row) => {
        const name = getPromptLabel(row);
        if (row.scope === 'system') {
          return (
            <Button appearance="subtle" size="small" icon={<Eye16Regular />} aria-label={`View ${name}`} onClick={() => onView(row.id)}>
              View
            </Button>
          );
        }
        return (
          <div className={styles.actions}>
            <Button appearance="subtle" size="small" icon={<Edit16Regular />} aria-label={`Edit ${name}`} onClick={() => onEdit(row.id)}>
              Edit
            </Button>
            <Button appearance="subtle" size="small" icon={<Delete16Regular />} aria-label={`Delete ${name}`} onClick={() => onDelete(row)}>
              Delete
            </Button>
          </div>
        );
      },
    }),
  ], [onView, onEdit, onDelete, styles]);

  return (
    <Card className={styles.card} appearance="filled">
      <CardHeader
        header={<Subtitle2 as="h2">All prompts</Subtitle2>}
        action={!isLoading ? (
          <Caption1 className={styles.meta} aria-live="polite">
            {isFiltered ? `${rows.length} of ${totalCount} prompts` : `${totalCount} ${totalCount === 1 ? 'prompt' : 'prompts'}`}
          </Caption1>
        ) : undefined}
      />
      <div ref={containerRef} className={styles.body}>
        {isLoading ? (
          <Skeleton aria-label="Loading prompts">
            {Array.from({ length: 4 }, (_, i) => <SkeletonItem key={i} size={36} style={{ marginBottom: 12 }} />)}
          </Skeleton>
        ) : rows.length === 0 ? (
          <EmptyState
            illustration
            title={isFiltered ? 'No prompts match your search' : 'No prompts yet'}
            description={isFiltered ? 'Try a different keyword.' : 'Use Create prompt to add a custom prompt.'}
            minHeight="280px"
          />
        ) : (
          <DataGrid
            key={gridKey}
            items={rows}
            columns={columns}
            getRowId={(r) => r.id}
            sortable
            resizableColumns
            columnSizingOptions={columnSizingOptions}
            aria-label="All prompts"
            style={{ width: '100%' }}
          >
            <DataGridHeader>
              <DataGridRow>
                {({ renderHeaderCell }) => <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>}
              </DataGridRow>
            </DataGridHeader>
            <DataGridBody<PromptTableRow>>
              {({ item, rowId }) => (
                <DataGridRow<PromptTableRow> key={rowId} className={styles.row}>
                  {({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
                </DataGridRow>
              )}
            </DataGridBody>
          </DataGrid>
        )}
      </div>
    </Card>
  );
}
