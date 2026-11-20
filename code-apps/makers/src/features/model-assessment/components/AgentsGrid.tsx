import { useMemo, useState, type Ref } from 'react';
import {
  Button,
  Caption1,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Tooltip,
  createTableColumn,
  useTableFeatures,
  useTableSort,
  useTableColumnSizing_unstable,
  makeStyles,
  mergeClasses,
  tokens,
  type TableColumnDefinition,
  type TableColumnSizingOptions,
  type SortDirection,
} from '@fluentui/react-components';
import { BotSparkle24Regular } from '@fluentui/react-icons';
import {
  changeAssessedWithErrors,
  showKitBadge,
  isRunInProgress,
  regressionTone,
  runTone,
  type TrackedAgentVM,
} from '../contracts/model-assessment';
import { ResultsBar, StatusBadge } from './StatusBadge';
import { modelDisplayName } from '../contracts/model-display';
import { copilotStudioReviewLightTheme } from '../../agent-review-tool/agents-experience/components/copilotStudioReviewTheme';

const useStyles = makeStyles({
  scroll: { width: '100%', overflowX: 'auto' },
  // Matches the Agent Review Tool grid: regular header text, 60px rows, icon + name.
  headerCell: {
    textAlign: 'left',
    '--borderRadiusMedium': copilotStudioReviewLightTheme.borderRadiusMedium,
  },
  resultsCell: { width: '128px' },
  nameHeader: { paddingLeft: tokens.spacingHorizontalS },
  row: { height: '60px', cursor: 'pointer' },
  cell: { fontSize: tokens.fontSizeBase300 },
  nameCell: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalXS, minWidth: 0 },
  nameIcon: { width: '36px', height: '36px', flexShrink: 0, marginLeft: tokens.spacingHorizontalS },
  nameText: {
    fontWeight: tokens.fontWeightRegular,
    textAlign: 'left',
    justifyContent: 'flex-start',
    minWidth: 0,
    paddingLeft: tokens.spacingHorizontalXS,
  },
  muted: { color: tokens.colorNeutralForeground3 },
  pending: { display: 'block', color: tokens.colorPaletteMarigoldForeground2 },
  assessing: { display: 'block', color: tokens.colorBrandForeground1 },
  empty: {
    textAlign: 'center',
    color: tokens.colorNeutralForeground3,
    padding: tokens.spacingVerticalXXL,
  },
});

const runLabel = (status: string) => {
  const norm = status.toLowerCase().replace(/[^a-z]/g, '');
  if (norm === 'none') return 'Never run';
  if (norm.includes('noevaluations')) return 'No evaluations';
  return status;
};

const cmp = (a?: string, b?: string) => (a ?? '').localeCompare(b ?? '');

/** Column ids (the results column is not sortable). */
type ColumnId =
  | 'name'
  | 'previousModel'
  | 'currentModel'
  | 'regression'
  | 'lastRun'
  | 'results';

const COLUMN_SIZING: TableColumnSizingOptions = {
  name: { idealWidth: 240, minWidth: 160 },
  previousModel: { idealWidth: 150, minWidth: 110 },
  currentModel: { idealWidth: 150, minWidth: 110 },
  regression: { idealWidth: 130, minWidth: 110 },
  lastRun: { idealWidth: 160, minWidth: 140 },
  results: { idealWidth: 128, minWidth: 112 },
};

export interface AgentsGridProps {
  agents: TrackedAgentVM[];
  onSelect: (agent: TrackedAgentVM, trigger: HTMLButtonElement) => void;
  /** 0-based page of the sorted rows to show; all rows when no page size is set. */
  pageIndex?: number;
  pageSize?: number;
  /** Tour anchor on the first agent's name. */
  firstAgentRef?: Ref<HTMLButtonElement>;
  /** Tour anchor on the Regression column header. */
  regressionHeaderRef?: Ref<HTMLTableCellElement>;
}

export function AgentsGrid({
  agents,
  onSelect,
  pageIndex = 0,
  pageSize,
  firstAgentRef,
  regressionHeaderRef,
}: AgentsGridProps) {
  const styles = useStyles();
  const [sortState, setSortState] = useState<{
    sortColumn: ColumnId | undefined;
    sortDirection: SortDirection;
  }>({ sortColumn: 'name', sortDirection: 'ascending' });

  // Only the compare functions matter here — body cells are rendered
  // explicitly below, so no render* callbacks are supplied.
  const columns: TableColumnDefinition<TrackedAgentVM>[] = useMemo(
    () => [
      createTableColumn<TrackedAgentVM>({
        columnId: 'name',
        compare: (a, b) => cmp(a.name, b.name),
      }),
      createTableColumn<TrackedAgentVM>({
        columnId: 'previousModel',
        compare: (a, b) => cmp(modelDisplayName(a.previousModel), modelDisplayName(b.previousModel)),
      }),
      createTableColumn<TrackedAgentVM>({
        columnId: 'currentModel',
        compare: (a, b) => cmp(modelDisplayName(a.currentModel), modelDisplayName(b.currentModel)),
      }),
      createTableColumn<TrackedAgentVM>({
        columnId: 'regression',
        compare: (a, b) => cmp(a.regression, b.regression),
      }),
      createTableColumn<TrackedAgentVM>({
        columnId: 'lastRun',
        compare: (a, b) => cmp(a.lastRunCompletedOn, b.lastRunCompletedOn),
      }),
      createTableColumn<TrackedAgentVM>({
        columnId: 'results',
        compare: (a, b) => b.pass - a.pass || a.fail - b.fail,
      }),
    ],
    [],
  );

  const {
    getRows,
    columnSizing_unstable,
    tableRef,
    sort: { getSortDirection, toggleColumnSort, sort },
  } = useTableFeatures({ columns, items: agents }, [
    useTableColumnSizing_unstable({ columnSizingOptions: COLUMN_SIZING }),
    useTableSort({
      sortState,
      onSortChange: (_, next) => setSortState(next as typeof sortState),
    }),
  ]);

  const sorted = sort(getRows());
  // Paging after sorting keeps the order across pages.
  const rows = pageSize ? sorted.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize) : sorted;

  const sortableHeaderProps = (columnId: ColumnId) => ({
    sortDirection: getSortDirection(columnId),
    onClick: (e: React.MouseEvent) => toggleColumnSort(e, columnId),
  });

  if (agents.length === 0) {
    return <div className={styles.empty}>No agents match your filters.</div>;
  }

  return (
    <div className={styles.scroll}>
      <Table
        aria-label="Tracked agents"
        sortable
        ref={tableRef}
        {...columnSizing_unstable.getTableProps({ style: { minWidth: 760 } })}
      >
        <TableHeader>
          <TableRow>
            <TableHeaderCell
              className={styles.headerCell}
              {...columnSizing_unstable.getTableHeaderCellProps('name')}
              {...sortableHeaderProps('name')}
            >
              <span className={styles.nameHeader}>Agent Name</span>
            </TableHeaderCell>
            <TableHeaderCell
              className={styles.headerCell}
              {...columnSizing_unstable.getTableHeaderCellProps('previousModel')}
              {...sortableHeaderProps('previousModel')}
            >
              Previous model
            </TableHeaderCell>
            <TableHeaderCell
              className={styles.headerCell}
              {...columnSizing_unstable.getTableHeaderCellProps('currentModel')}
              {...sortableHeaderProps('currentModel')}
            >
              Current model
            </TableHeaderCell>
            <TableHeaderCell
              ref={regressionHeaderRef}
              className={styles.headerCell}
              {...columnSizing_unstable.getTableHeaderCellProps('regression')}
              {...sortableHeaderProps('regression')}
            >
              Regression
            </TableHeaderCell>
            <TableHeaderCell
              className={styles.headerCell}
              {...columnSizing_unstable.getTableHeaderCellProps('lastRun')}
              {...sortableHeaderProps('lastRun')}
            >
              Last run
            </TableHeaderCell>
            <TableHeaderCell
              className={mergeClasses(styles.headerCell, styles.resultsCell)}
            >
              Latest results
            </TableHeaderCell>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(({ item: agent }, index) => {
            return (
              <TableRow
                key={agent.id}
                className={styles.row}
                onClick={(e) => {
                  const trigger = e.currentTarget.querySelector<HTMLButtonElement>('button[data-agent-details]');
                  if (trigger) onSelect(agent, trigger);
                }}
              >
                <TableCell
                  className={styles.cell}
                  {...columnSizing_unstable.getTableCellProps('name')}
                >
                  <div className={styles.nameCell}>
                    {agent.iconUrl ? (
                      <img src={agent.iconUrl} alt="" className={styles.nameIcon} />
                    ) : (
                      <BotSparkle24Regular className={styles.nameIcon} aria-hidden />
                    )}
                    <Button appearance="transparent" className={styles.nameText} data-agent-details
                      ref={index === 0 ? firstAgentRef : undefined}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelect(agent, e.currentTarget);
                      }}>
                      {agent.name}
                    </Button>
                  </div>
                </TableCell>
                <TableCell
                  className={styles.cell}
                  {...columnSizing_unstable.getTableCellProps('previousModel')}
                >
                  <span className={styles.muted}>{modelDisplayName(agent.previousModel) || '—'}</span>
                </TableCell>
                <TableCell
                  className={styles.cell}
                  {...columnSizing_unstable.getTableCellProps('currentModel')}
                >
                  {modelDisplayName(agent.currentModel) || '—'}
                  {agent.modelChangePending && (isRunInProgress(agent.lastRunStatus) ? (
                    <Tooltip relationship="description" withArrow
                      content="An assessment of this model is running. The grid updates when it finishes.">
                      <Caption1 className={styles.assessing}>
                        Changed · assessment running
                      </Caption1>
                    </Tooltip>
                  ) : changeAssessedWithErrors(agent) ? (
                    <Tooltip relationship="description" withArrow
                      content="The last assessment of this model completed with errors, so the change is not recorded yet. Open the agent to review the errors and assess again.">
                      <Caption1 className={styles.pending}>
                        Changed · assessed with errors
                      </Caption1>
                    </Tooltip>
                  ) : (
                    <Tooltip relationship="description" withArrow
                      content="The agent's model changed in Copilot Studio. Open the agent to assess it.">
                      <Caption1 className={styles.pending}>
                        Changed · not yet assessed
                      </Caption1>
                    </Tooltip>
                  ))}
                </TableCell>
                <TableCell
                  className={styles.cell}
                  {...columnSizing_unstable.getTableCellProps('regression')}
                >
                  <StatusBadge tone={regressionTone(agent.regression)} label={agent.regression} />
                </TableCell>
                <TableCell
                  className={styles.cell}
                  {...columnSizing_unstable.getTableCellProps('lastRun')}
                >
                  {(() => {
                    const badge = (
                      <StatusBadge tone={runTone(agent.lastRunStatus)} label={runLabel(agent.lastRunStatus)} />
                    );
                    // Explain a failed or stopped run, or what the Kit tests are doing.
                    const tip = agent.lastRunMessage
                      ?? (showKitBadge(agent.lastKit) ? agent.lastKit.message : undefined);
                    return tip ? (
                      <Tooltip relationship="description" withArrow content={tip}>
                        <span>{badge}</span>
                      </Tooltip>
                    ) : badge;
                  })()}
                </TableCell>
                <TableCell
                  className={mergeClasses(styles.cell, styles.resultsCell)}
                >
                  <ResultsBar
                    compact
                    pass={agent.pass}
                    fail={agent.fail}
                    error={agent.error}
                    excluded={agent.excluded}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
