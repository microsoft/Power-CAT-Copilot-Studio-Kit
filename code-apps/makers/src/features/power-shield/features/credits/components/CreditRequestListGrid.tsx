import {
  Button,
  DataGrid,
  DataGridBody,
  DataGridCell,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridRow,
  Input,
  Link,
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
import { PaginationBar } from '../../../shared/components/PaginationBar';
import { useNavigate } from '../../../shared/hooks/useNavigate';
import { useAuth } from '../../../shared/hooks/useAuth';
import { useTableStyles } from '../../../shared/styles';
import { CreditStatusBadge } from './CreditStatusBadge';
import { CreditRowActionsMenu } from './CreditRowActionsMenu';
import { RequestListSkeleton } from '../../home/components/RequestListSkeleton';
import type { CreditRequestSummary } from '../../../models/creditRequest';

// ─────────────────────────────────────────────────────────────────────────────
// Copilot Credits list grid (T029, FR-004/FR-006). Same columns as the Admin
// credits grid: environment, status, credits requested/added, dates and assigned admin. No Clone action.
// ─────────────────────────────────────────────────────────────────────────────

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
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
  errorState: {
    padding: tokens.spacingVerticalXL,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: tokens.spacingVerticalM,
    color: tokens.colorNeutralForeground2,
    textAlign: 'center',
  },
  reqNumCellWrapper: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    gap: tokens.spacingHorizontalXS,
  },
  reqNumCell: {
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground1,
    whiteSpace: 'nowrap',
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

/** First environment name, plus "+N more" when a draft spans several. The full list is in a tooltip. */
function EnvironmentNamesCell({ names, className }: { names: string[]; className: string }) {
  const label = names.length > 1 ? `${names[0]} +${names.length - 1} more` : names[0];
  return <TruncatedText text={label} tooltip={names.join(', ')} className={className} />;
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

/** Confirmed credits added: "+N", "0" when nothing was added, "-" while unknown. */
function formatCreditsAdded(added: number | undefined): string {
  if (added === undefined) return '-';
  if (added === 0) return '0';
  return `+${added.toLocaleString()}`;
}

interface CreditRequestListGridProps {
  requests: CreditRequestSummary[];
  isLoading: boolean;
  error: string | null;
  searchTerm: string;
  onSearchChange: (v: string) => void;
  showCapNotice: boolean;
  refresh: () => void;
  hasActiveBucketFilter: boolean;
  onClearBucketFilter: () => void;
  currentPage: number;
  onPageChange: (page: number) => void;
  pageSize: number;
  onPageSizeChange: (size: number) => void;
  pageSizeOptions: readonly number[];
  pageCount: number;
  totalFilteredCount: number;
}

export function CreditRequestListGrid({
  requests,
  isLoading,
  error,
  searchTerm,
  onSearchChange,
  showCapNotice,
  refresh,
  hasActiveBucketFilter,
  onClearBucketFilter,
  currentPage,
  onPageChange,
  pageSize,
  onPageSizeChange,
  pageSizeOptions,
  pageCount,
  totalFilteredCount,
}: CreditRequestListGridProps) {
  const styles = useStyles();
  const tableStyles = useTableStyles();
  const navigate = useNavigate();
  const { aadObjectId } = useAuth();

  const hasActiveFilters = !!(hasActiveBucketFilter || searchTerm.trim());

  const handleClearFilters = () => {
    onSearchChange('');
    onClearBucketFilter();
  };

  const columns: TableColumnDefinition<CreditRequestSummary>[] = [
    createTableColumn<CreditRequestSummary>({
      columnId: 'requestNumber',
      compare: (a, b) => a.requestNumber.localeCompare(b.requestNumber),
      renderHeaderCell: () => <span>Request #</span>,
      renderCell: (item) => (
        <div className={styles.reqNumCellWrapper}>
          <Link
            as="button"
            className={styles.reqNumCell}
            onClick={(e) => {
              e.stopPropagation();
              void navigate(`/credit-requests/${item.id}`);
            }}
            aria-label={`Open credit request ${item.requestNumber}`}
          >
            {item.requestNumber}
          </Link>
          <CreditRowActionsMenu
            item={item}
            currentUserAadObjectId={aadObjectId}
            onWithdrawn={refresh}
          />
        </div>
      ),
    }),
    createTableColumn<CreditRequestSummary>({
      columnId: 'environment',
      compare: (a, b) => (a.environmentNames[0] ?? '').localeCompare(b.environmentNames[0] ?? ''),
      renderHeaderCell: () => <span>Environment</span>,
      renderCell: (item) => <EnvironmentNamesCell names={item.environmentNames} className={styles.cell} />,
    }),
    createTableColumn<CreditRequestSummary>({
      columnId: 'outcome',
      compare: (a, b) => a.creditLabel.localeCompare(b.creditLabel),
      renderHeaderCell: () => <span>Status</span>,
      renderCell: (item) => <CreditStatusBadge label={item.creditLabel} />,
    }),
    createTableColumn<CreditRequestSummary>({
      columnId: 'requestedAmount',
      compare: (a, b) => (a.requestedAmount ?? -1) - (b.requestedAmount ?? -1),
      renderHeaderCell: () => <span>Credits requested</span>,
      renderCell: (item) => (
        <Text className={styles.cell}>
          {item.requestedAmount !== undefined ? item.requestedAmount.toLocaleString() : '-'}
        </Text>
      ),
    }),
    createTableColumn<CreditRequestSummary>({
      columnId: 'creditsAdded',
      compare: (a, b) => (a.creditsAdded ?? -1) - (b.creditsAdded ?? -1),
      renderHeaderCell: () => <span>Credits added</span>,
      renderCell: (item) => <Text className={styles.cell}>{formatCreditsAdded(item.creditsAdded)}</Text>,
    }),
    createTableColumn<CreditRequestSummary>({
      columnId: 'submittedOn',
      compare: (a, b) => {
        const dateA = a.submittedOn ? new Date(a.submittedOn).getTime() : 0;
        const dateB = b.submittedOn ? new Date(b.submittedOn).getTime() : 0;
        return dateA - dateB;
      },
      renderHeaderCell: () => <span>Submitted On</span>,
      renderCell: (item) => <Text className={styles.cell}>{formatDate(item.submittedOn)}</Text>,
    }),
    createTableColumn<CreditRequestSummary>({
      columnId: 'decidedOn',
      compare: (a, b) => (a.decidedOn ? new Date(a.decidedOn).getTime() : 0) - (b.decidedOn ? new Date(b.decidedOn).getTime() : 0),
      renderHeaderCell: () => <span>Decided On</span>,
      renderCell: (item) => <Text className={styles.cell}>{formatDate(item.decidedOn)}</Text>,
    }),
    createTableColumn<CreditRequestSummary>({
      columnId: 'assignedAdmin',
      compare: (a, b) => (a.assignedAdminName ?? '').localeCompare(b.assignedAdminName ?? ''),
      renderHeaderCell: () => <span>Assigned Admin</span>,
      renderCell: (item) => <TruncatedText text={item.assignedAdminName} className={styles.cell} />,
    }),
  ];

  const columnSizingOptions = {
    requestNumber:    { minWidth: 160, defaultWidth: 170 },
    environment:      { minWidth: 140, defaultWidth: 200 },
    outcome:          { minWidth: 150, defaultWidth: 190 },
    requestedAmount:  { minWidth: 150, defaultWidth: 160 },
    creditsAdded:     { minWidth: 130, defaultWidth: 140 },
    submittedOn:      { minWidth: 110, defaultWidth: 130 },
    decidedOn:        { minWidth: 110, defaultWidth: 130 },
    assignedAdmin:    { minWidth: 140, defaultWidth: 170 },
  };

  return (
    <div className={styles.container}>
      <div className={styles.filterBar}>
        <Input
          className={styles.searchInput}
          contentBefore={<SearchRegular />}
          placeholder="Search my credit requests…"
          value={searchTerm}
          onChange={(_, data) => onSearchChange(data.value)}
          aria-label="Search my credit requests"
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
          <MessageBarBody>Showing 100 most recent requests</MessageBarBody>
        </MessageBar>
      )}

      <div className={tableStyles.tableShell}>
        {isLoading ? (
          <RequestListSkeleton />
        ) : error ? (
          <div className={styles.errorState} role="alert">
            <Text>Couldn't load your credit requests. {error}</Text>
            <Button appearance="primary" icon={<ArrowClockwiseRegular />} onClick={refresh}>
              Retry
            </Button>
          </div>
        ) : requests.length === 0 ? (
          <Text className={styles.emptyState}>
            {hasActiveFilters
              ? 'No credit requests match the current filters.'
              : 'No credit requests yet. Select New credits request to create one.'}
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
              defaultSortState={{ sortColumn: 'requestNumber', sortDirection: 'descending' }}
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
                    onClick={() => void navigate(`/credit-requests/${item.id}`)}
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

export default CreditRequestListGrid;
