import {
  Button,
  Checkbox,
  DataGrid,
  DataGridBody,
  DataGridCell,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridRow,
  Input,
  MessageBar,
  MessageBarBody,
  Text,
  Tooltip,
  makeStyles,
  tokens,
  createTableColumn,
} from '@fluentui/react-components';
import type { TableColumnDefinition } from '@fluentui/react-components';
import { SearchRegular, ArrowClockwiseRegular } from '@fluentui/react-icons';
import { useNavigate } from '../../../shared/hooks/useNavigate';
import { useTableStyles } from '../../../shared/styles';
import { StatusBadge } from '../../../shared/components/StatusBadge';
import { PaginationBar } from '../../../shared/components/PaginationBar';
import { RequestListSkeleton } from '../../home/components/RequestListSkeleton';
import { CreditRowActionsMenu } from './CreditRowActionsMenu';
import type { CreditRequestSummary } from '../../../models/creditRequest';
import { CREDIT_STATUS_BADGE } from '../../../models/status';
import { CREDIT_LIST_COMPARE } from '../hooks/useCreditRequestList';
import type { CreditListSortState } from '../hooks/useCreditRequestList';

// ─────────────────────────────────────────────────────────────────────────────
// Styles (mirrors the connector RequestListGrid so both tabs feel identical)
// ─────────────────────────────────────────────────────────────────────────────

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalSNudge,
  },
  filterBar: {
    display: 'flex',
    flexDirection: 'row',
    gap: '0',
    alignItems: 'center',
    flexWrap: 'nowrap',
    rowGap: tokens.spacingVerticalSNudge,
    paddingBottom: tokens.spacingVerticalM,
  },
  searchInput: {
    width: '240px',
    flexShrink: 0,
  },
  assignedToggle: {
    marginLeft: tokens.spacingHorizontalM,
    flexShrink: 0,
  },
  filterActions: {
    marginLeft: 'auto',
    display: 'flex',
    gap: tokens.spacingHorizontalXS,
    alignItems: 'center',
  },
  headerCell: {
    fontSize: tokens.fontSizeBase100,
    fontWeight: tokens.fontWeightSemibold,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: tokens.colorNeutralForeground3,
    paddingTop: tokens.spacingVerticalS,
    paddingBottom: tokens.spacingVerticalS,
    paddingLeft: tokens.spacingHorizontalM,
    paddingRight: tokens.spacingHorizontalM,
    whiteSpace: 'nowrap',
  },
  // Same side padding as headerCell, so each value lines up with its header.
  dataCell: {
    paddingLeft: tokens.spacingHorizontalM,
    paddingRight: tokens.spacingHorizontalM,
  },
  row: {
    cursor: 'pointer',
    transitionProperty: 'background-color',
    transitionDuration: tokens.durationFaster,
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
  // One line per value. Long text ends in "..." and the tooltip shows it in full.
  cell: {
    display: 'block',
    minWidth: 0,
    maxWidth: '100%',
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
    paddingTop: tokens.spacingVerticalSNudge,
    paddingBottom: tokens.spacingVerticalSNudge,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  emptyState: {
    padding: tokens.spacingVerticalXL,
    color: tokens.colorNeutralForeground3,
    display: 'block',
    textAlign: 'center',
  },
  reqNumCellWrapper: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    gap: tokens.spacingHorizontalXXS,
  },
  reqNumCell: {
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground1,
    whiteSpace: 'nowrap',
  },
  cellMono: {
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
  },
});

/** One-line text that ends in "..." when too long, with the full text in a tooltip. Empty shows "-". */
function TruncatedText({ text, tooltip, className }: { text?: string; tooltip?: string; className: string }) {
  if (!text) return <Text className={className}>-</Text>;
  return (
    <Tooltip content={tooltip ?? text} relationship="description">
      <Text className={className} tabIndex={0}>{text}</Text>
    </Tooltip>
  );
}

/** First environment name, plus "+N more" when a request spans several. The full list is in a tooltip. */
function EnvironmentNamesCell({ names, className }: { names: string[]; className: string }) {
  const label = names.length > 1 ? `${names[0]} +${names.length - 1} more` : names[0];
  return <TruncatedText text={label} tooltip={names.join(', ')} className={className} />;
}

function formatCreditsAdded(added: number | undefined): string {
  if (added === undefined) return '-';
  if (added === 0) return '0';
  return `+${added.toLocaleString()}`;
}

function formatDate(isoString: string | undefined): string {
  if (!isoString) return '-';
  try {
    return new Date(isoString).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return isoString;
  }
}

interface CreditListGridProps {
  requests: CreditRequestSummary[];
  isLoading: boolean;
  searchTerm: string;
  onSearchChange: (v: string) => void;
  showCapNotice: boolean;
  refresh: () => void;
  assignedToMe: boolean;
  onAssignedToMeChange: (on: boolean) => void;
  currentPage: number;
  onPageChange: (page: number) => void;
  pageSize: number;
  onPageSizeChange: (size: number) => void;
  pageSizeOptions: readonly number[];
  pageCount: number;
  totalFilteredCount: number;
  sortState: CreditListSortState;
  onSortChange: (state: CreditListSortState) => void;
}

export function CreditListGrid({
  requests,
  isLoading,
  searchTerm,
  onSearchChange,
  showCapNotice,
  refresh,
  assignedToMe,
  onAssignedToMeChange,
  currentPage,
  onPageChange,
  pageSize,
  onPageSizeChange,
  pageSizeOptions,
  pageCount,
  totalFilteredCount,
  sortState,
  onSortChange,
}: CreditListGridProps) {
  const styles = useStyles();
  const tableStyles = useTableStyles();
  const navigate = useNavigate();

  const hasActiveFilters = !!(assignedToMe || searchTerm.trim());

  const handleClearFilters = () => {
    onSearchChange('');
    onAssignedToMeChange(false);
  };

  // "Credits added" shows only confirmed credits — never a planned figure — and a dash otherwise.
  const columns: TableColumnDefinition<CreditRequestSummary>[] = [
    createTableColumn<CreditRequestSummary>({
      columnId: 'requestNumber',
      compare: CREDIT_LIST_COMPARE.requestNumber,
      renderHeaderCell: () => <span>Request #</span>,
      renderCell: (item) => (
        <div className={styles.reqNumCellWrapper}>
          <span className={styles.reqNumCell}>{item.requestNumber}</span>
          <CreditRowActionsMenu item={item} onActionComplete={refresh} />
        </div>
      ),
    }),
    createTableColumn<CreditRequestSummary>({
      columnId: 'environment',
      compare: CREDIT_LIST_COMPARE.environment,
      renderHeaderCell: () => <span>Environment</span>,
      renderCell: (item) => <EnvironmentNamesCell names={item.environmentNames} className={styles.cell} />,
    }),
    createTableColumn<CreditRequestSummary>({
      columnId: 'outcome',
      compare: CREDIT_LIST_COMPARE.outcome,
      renderHeaderCell: () => <span>Status</span>,
      renderCell: (item) => (
        <StatusBadge
          label={CREDIT_STATUS_BADGE[item.status].label}
          colorKey={CREDIT_STATUS_BADGE[item.status].colorKey}
        />
      ),
    }),
    createTableColumn<CreditRequestSummary>({
      columnId: 'creditsRequested',
      compare: CREDIT_LIST_COMPARE.creditsRequested,
      renderHeaderCell: () => <span>Credits requested</span>,
      renderCell: (item) =>
        item.creditsRequested === undefined ? (
          <Text className={styles.cell} aria-label="Not specified">-</Text>
        ) : (
          <Text className={styles.cellMono}>{item.creditsRequested.toLocaleString()}</Text>
        ),
    }),
    createTableColumn<CreditRequestSummary>({
      columnId: 'creditsAdded',
      compare: CREDIT_LIST_COMPARE.creditsAdded,
      renderHeaderCell: () => <span>Credits added</span>,
      renderCell: (item) => (
        <Text className={item.creditsAdded === undefined ? styles.cell : styles.cellMono}>
          {formatCreditsAdded(item.creditsAdded)}
        </Text>
      ),
    }),
    createTableColumn<CreditRequestSummary>({
      columnId: 'submittedOn',
      compare: CREDIT_LIST_COMPARE.submittedOn,
      renderHeaderCell: () => <span>Submitted On</span>,
      renderCell: (item) => <Text className={styles.cell}>{formatDate(item.submittedOn)}</Text>,
    }),
    createTableColumn<CreditRequestSummary>({
      columnId: 'decidedOn',
      compare: CREDIT_LIST_COMPARE.decidedOn,
      renderHeaderCell: () => <span>Decided On</span>,
      renderCell: (item) => <Text className={styles.cell}>{formatDate(item.decidedOn)}</Text>,
    }),
    createTableColumn<CreditRequestSummary>({
      columnId: 'assignedAdmin',
      compare: CREDIT_LIST_COMPARE.assignedAdmin,
      renderHeaderCell: () => <span>Assigned Admin</span>,
      renderCell: (item) => <TruncatedText text={item.assignedAdminName} className={styles.cell} />,
    }),
  ];

  const columnSizingOptions = {
    requestNumber:    { minWidth: 160, defaultWidth: 170 },
    environment:      { minWidth: 140, defaultWidth: 200 },
    outcome:          { minWidth: 150, defaultWidth: 190 },
    creditsRequested: { minWidth: 150, defaultWidth: 160 },
    creditsAdded:     { minWidth: 130, defaultWidth: 150 },
    submittedOn:      { minWidth: 110, defaultWidth: 130 },
    decidedOn:        { minWidth: 110, defaultWidth: 130 },
    assignedAdmin:    { minWidth: 120, defaultWidth: 180 },
  };

  return (
    <div className={styles.container}>
      <div className={styles.filterBar}>
        <Input
          className={styles.searchInput}
          contentBefore={<SearchRegular />}
          placeholder="Search credit requests…"
          value={searchTerm}
          onChange={(_, data) => onSearchChange(data.value)}
          aria-label="Search credit requests"
        />

        <Checkbox
          className={styles.assignedToggle}
          label="Assigned to me"
          checked={assignedToMe}
          onChange={(_, data) => onAssignedToMeChange(!!data.checked)}
        />

        <div className={styles.filterActions}>
          {hasActiveFilters && (
            <Button appearance="subtle" size="small" onClick={handleClearFilters} aria-label="Clear all filters">
              Clear filters
            </Button>
          )}
          <Tooltip content="Refresh" relationship="label">
            <Button
              appearance="subtle"
              size="small"
              icon={<ArrowClockwiseRegular />}
              onClick={refresh}
              disabled={isLoading}
              aria-label="Refresh credit requests"
            />
          </Tooltip>
        </div>
      </div>

      {showCapNotice && (
        <MessageBar intent="info">
          <MessageBarBody>Showing the 200 most recent credit requests</MessageBarBody>
        </MessageBar>
      )}

      <div className={tableStyles.tableShell}>
        {isLoading ? (
          <RequestListSkeleton />
        ) : requests.length === 0 ? (
          <Text className={styles.emptyState}>
            {hasActiveFilters
              ? 'No credit requests match the current filters.'
              : 'No credit requests found.'}
          </Text>
        ) : (
          <>
            <DataGrid
              items={requests}
              columns={columns}
              getRowId={(item) => item.id}
              sortable
              resizableColumns
              columnSizingOptions={columnSizingOptions}
              sortState={sortState}
              onSortChange={(_, next) =>
                onSortChange({ sortColumn: next.sortColumn as string | undefined, sortDirection: next.sortDirection })
              }
            >
              <DataGridHeader>
                <DataGridRow>
                  {({ renderHeaderCell }) => (
                    <DataGridHeaderCell className={styles.headerCell}>{renderHeaderCell()}</DataGridHeaderCell>
                  )}
                </DataGridRow>
              </DataGridHeader>
              <DataGridBody<CreditRequestSummary>>
                {({ item, rowId }) => (
                  <DataGridRow<CreditRequestSummary>
                    key={rowId}
                    className={styles.row}
                    onClick={() => void navigate(`/credits/${item.id}`)}
                  >
                    {({ renderCell }) => <DataGridCell className={styles.dataCell}>{renderCell(item)}</DataGridCell>}
                  </DataGridRow>
                )}
              </DataGridBody>
            </DataGrid>

            <PaginationBar
              page={currentPage}
              pageCount={pageCount}
              pageSize={pageSize}
              pageSizeOptions={pageSizeOptions}
              totalRecords={totalFilteredCount}
              onPageChange={onPageChange}
              onPageSizeChange={onPageSizeChange}
            />
          </>
        )}
      </div>
    </div>
  );
}

export default CreditListGrid;
