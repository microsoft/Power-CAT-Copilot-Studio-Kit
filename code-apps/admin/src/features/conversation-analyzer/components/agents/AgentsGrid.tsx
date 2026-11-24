import { useCallback, useMemo } from 'react';
import {
  makeStyles,
  tokens,
  createTableColumn,
  DataGrid,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridRow,
  DataGridBody,
  DataGridCell,
  Tooltip,
  type TableColumnDefinition,
  type SortDirection,
} from '@fluentui/react-components';
import type { AgentTableRow } from '../../hooks/useAgentsTable';
import { AGENT_COMPARE as COMPARE, type AgentSortState, type SortableAgentColumnId } from './agentGridUtils';
import { HealthStatusBadge } from '../shared/HealthStatusBadge';
import { CoverageMeter } from '../shared/CoverageMeter';
import { AgentNameCell, LastAnalyzedCell, NumberCell, PiiCell, SentimentCell } from './AgentCells';
import { AgentRowActionMenu } from './AgentRowActionMenu';

// CSS flex sizing: Coverage and # Analyzed stay compact; the other data columns share spare width (Agent gets a double share).
const useColumnStyles = makeStyles({
  agent: { flex: '2 1 240px', minWidth: '220px' },
  coverage: { flex: '0 0 140px' },
  conversations: { flex: '0 0 100px' },
  sentiment: { flex: '1 1 110px' },
  pii: { flex: '1 1 90px' },
  lastAnalyzed: { flex: '1 1 120px' },
  status: { flex: '1 1 140px' },
  actions: { flex: '0 0 48px' },
});
type AgentColumnId = keyof ReturnType<typeof useColumnStyles>;

const useStyles = makeStyles({
  container: { width: '100%', overflowX: 'auto' },
  grid: { width: '100%', minWidth: '880px' },
  srOnly: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    margin: '-1px',
    padding: 0,
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    border: 0,
  },
  right: { width: '100%', textAlign: 'right' },
  row: { ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover } },
});

interface AgentsGridProps {
  rows: AgentTableRow[];
  sortState: AgentSortState;
  /** Omit to render a non-sortable grid. */
  onSortChange?: (state: AgentSortState) => void;
  ariaLabel: string;
}

/** Agents grid shared by the Agents tab and the Overview agent summary. */
export function AgentsGrid({ rows, sortState, onSortChange, ariaLabel }: AgentsGridProps) {
  const styles = useStyles();
  const columnStyles = useColumnStyles();
  const columnClass = (columnId: string | number) => columnStyles[columnId as AgentColumnId];
  const sortable = Boolean(onSortChange);

  const columns = useMemo<TableColumnDefinition<AgentTableRow>[]>(() => [
    createTableColumn<AgentTableRow>({
      columnId: 'agent',
      compare: COMPARE.agent,
      renderHeaderCell: () => 'Agent',
      renderCell: (row) => <AgentNameCell name={row.name} environmentName={row.environmentName} />,
    }),
    createTableColumn<AgentTableRow>({
      columnId: 'coverage',
      compare: COMPARE.coverage,
      renderHeaderCell: () => (
        <Tooltip content="This agent's share of all analyzer records in the selected time period." relationship="description">
          <span>Coverage</span>
        </Tooltip>
      ),
      renderCell: (row) => <CoverageMeter ratio={row.coverageRatio} />,
    }),
    createTableColumn<AgentTableRow>({
      columnId: 'conversations',
      compare: COMPARE.conversations,
      renderHeaderCell: () => <span className={styles.right}># Analyzed</span>,
      renderCell: (row) => <NumberCell value={row.conversations} />,
    }),
    createTableColumn<AgentTableRow>({
      columnId: 'sentiment',
      compare: COMPARE.sentiment,
      renderHeaderCell: () => 'Sentiment',
      renderCell: (row) => <SentimentCell value={row.sentiment} />,
    }),
    createTableColumn<AgentTableRow>({
      columnId: 'pii',
      compare: COMPARE.pii,
      renderHeaderCell: () => 'PII risk',
      renderCell: (row) => <PiiCell value={row.pii} />,
    }),
    createTableColumn<AgentTableRow>({
      columnId: 'lastAnalyzed',
      compare: COMPARE.lastAnalyzed,
      renderHeaderCell: () => 'Last analyzed',
      renderCell: (row) => <LastAnalyzedCell iso={row.lastAnalyzedAt} />,
    }),
    createTableColumn<AgentTableRow>({
      columnId: 'status',
      compare: COMPARE.status,
      renderHeaderCell: () => 'Status',
      renderCell: (row) => <HealthStatusBadge status={row.status} />,
    }),
    createTableColumn<AgentTableRow>({
      columnId: 'actions',
      renderHeaderCell: () => <span className={styles.srOnly}>Actions</span>,
      renderCell: (row) => <AgentRowActionMenu row={row} />,
    }),
  ], [styles.right, styles.srOnly]);

  const handleSortChange = useCallback(
    (_e: unknown, state: { sortColumn?: string | number; sortDirection: SortDirection }) => {
      if (!state.sortColumn || state.sortColumn === 'actions') return;
      const next = { sortColumn: state.sortColumn as SortableAgentColumnId, sortDirection: state.sortDirection };
      onSortChange?.(next);
    },
    [onSortChange],
  );

  return (
    <div className={styles.container}>
      <DataGrid
        items={rows}
        columns={columns}
        getRowId={(r: AgentTableRow) => r.agentDetailsId}
        size="small"
        sortable={sortable}
        sortState={sortState}
        onSortChange={handleSortChange}
        aria-label={ariaLabel}
        className={styles.grid}
      >
        <DataGridHeader>
          <DataGridRow>
            {({ renderHeaderCell, columnId }) => <DataGridHeaderCell className={columnClass(columnId)}>{renderHeaderCell()}</DataGridHeaderCell>}
          </DataGridRow>
        </DataGridHeader>
        <DataGridBody<AgentTableRow>>
          {({ item, rowId }) => (
            <DataGridRow<AgentTableRow> key={rowId} className={styles.row}>
              {({ renderCell, columnId }) => <DataGridCell className={columnClass(columnId)}>{renderCell(item)}</DataGridCell>}
            </DataGridRow>
          )}
        </DataGridBody>
      </DataGrid>
    </div>
  );
}
