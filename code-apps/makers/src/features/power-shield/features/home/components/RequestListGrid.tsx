import {
  Button,
  DataGrid,
  DataGridBody,
  DataGridCell,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridRow,
  Divider,
  Input,
  Dropdown,
  Option,
  MessageBar,
  MessageBarBody,
  Text,
  Tooltip,
  makeStyles,
  tokens,
  createTableColumn,
} from '@fluentui/react-components';
import type { TableColumnDefinition } from '@fluentui/react-components';
import {
  SearchRegular,
  ArrowClockwiseRegular,
} from '@fluentui/react-icons';
import { PaginationBar } from '../../../shared/components/PaginationBar';
import { useNavigate } from '../../../shared/hooks/useNavigate';
import { useAuth } from '../../../shared/hooks/useAuth';
import { useTableStyles } from '../../../shared/styles';
import { StatusBadge } from '../../../shared/components/StatusBadge';
import { RequestListSkeleton } from './RequestListSkeleton';
import { RowActionsMenu } from './RowActionsMenu';
import type { PolicyRequestSummary } from '../../../models/policyRequest';
import type { RequestStatus } from '../../../models/status';

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },

  // ── Filter bar ─────────────────────────────────────────────────────────────
  filterBar: {
    display: 'flex',
    flexDirection: 'row',
    gap: '0',
    alignItems: 'center',
    flexWrap: 'nowrap',
    rowGap: tokens.spacingVerticalSNudge,
    paddingBottom: tokens.spacingVerticalM,
  },
  filterDivider: {
    flexGrow: 0,
    height: '24px',
    marginLeft: tokens.spacingHorizontalS,
    marginRight: tokens.spacingHorizontalS,
  },
  searchInput: {
    width: '240px',
    flexShrink: 0,
  },
  filterDropdown: {
    minWidth: '160px',
  },
  // ── Filter action buttons ─────────────────────────────────────────────────
  filterActions: {
    marginLeft: 'auto',
    display: 'flex',
    gap: tokens.spacingHorizontalXS,
    alignItems: 'center',
  },

  // ── Table container ───────────────────────────────────────────────────────
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
  },
  row: {
    cursor: 'pointer',
    transitionProperty: 'background-color',
    transitionDuration: tokens.durationFaster,
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
  cell: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
    paddingTop: tokens.spacingVerticalSNudge,
    paddingBottom: tokens.spacingVerticalSNudge,
    paddingLeft: tokens.spacingHorizontalM,
    paddingRight: tokens.spacingHorizontalM,
  },

  emptyState: {
    padding: tokens.spacingVerticalXL,
    color: tokens.colorNeutralForeground3,
    display: 'block',
    textAlign: 'center',
  },

  // ── Cell variants ─────────────────────────────────────────────────────────
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
  },
  cellMono: {
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
  },
  cellEmphasised: {
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground2,
  },

});

// ─────────────────────────────────────────────────────────────────────────────
// Column definitions
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface RequestListGridProps {
  requests: PolicyRequestSummary[];
  isLoading: boolean;
  searchTerm: string;
  onSearchChange: (v: string) => void;
  showCapNotice: boolean;
  refresh: () => void;
  // Filter props
  tileFilter: RequestStatus[] | null;
  onTileFilterChange: (statuses: RequestStatus[] | null) => void;
  serviceTreeFilter: string | null;
  onServiceTreeChange: (id: string | null) => void;
  distinctServiceTrees: Array<{ id: string; name: string }>;
  // Environment group filter props
  environmentGroupFilter: string | null;
  onEnvironmentGroupChange: (id: string | null) => void;
  distinctEnvironmentGroups: Array<{ id: string; name: string }>;
  // Pagination props
  currentPage: number;
  onPageChange: (page: number) => void;
  pageSize: number;
  onPageSizeChange: (size: number) => void;
  pageSizeOptions: readonly number[];
  pageCount: number;
  totalFilteredCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function RequestListGrid({
  requests,
  isLoading,
  searchTerm,
  onSearchChange,
  showCapNotice,
  refresh,
  tileFilter,
  onTileFilterChange,
  serviceTreeFilter,
  onServiceTreeChange,
  distinctServiceTrees,
  environmentGroupFilter,
  onEnvironmentGroupChange,
  distinctEnvironmentGroups,
  currentPage,
  onPageChange,
  pageSize,
  onPageSizeChange,
  pageSizeOptions,
  pageCount,
  totalFilteredCount,
}: RequestListGridProps) {
  const styles = useStyles();
  const tableStyles = useTableStyles();
  const navigate = useNavigate();
  const { aadObjectId } = useAuth();

  const hasActiveFilters = !!(tileFilter || serviceTreeFilter || environmentGroupFilter || searchTerm.trim());

  const handleClearFilters = () => {
    onSearchChange('');
    onTileFilterChange(null);
    onServiceTreeChange(null);
    onEnvironmentGroupChange(null);
  };

  // Column definitions
  const baseColumns: TableColumnDefinition<PolicyRequestSummary>[] = [
    createTableColumn<PolicyRequestSummary>({
      columnId: 'requestNumber',
      compare: (a, b) => a.requestNumber.localeCompare(b.requestNumber),
      renderHeaderCell: () => <span>Request #</span>,
      renderCell: (item) => (
        <div className={styles.reqNumCellWrapper}>
          <span className={styles.reqNumCell}>{item.requestNumber}</span>
          <RowActionsMenu
            item={item}
            showWithdraw={true}
            currentUserAadObjectId={aadObjectId}
            onCloned={(newId) => void navigate(`/requests/${newId}`)}
            onWithdrawn={refresh}
          />
        </div>
      ),
    }),
    createTableColumn<PolicyRequestSummary>({
      columnId: 'serviceTree',
      compare: (a, b) => (a.serviceTreeName ?? '').localeCompare(b.serviceTreeName ?? ''),
      renderHeaderCell: () => <span>Service Tree</span>,
      renderCell: (item) => (
        <Text className={styles.cellEmphasised}>
          {item.serviceTreeName ?? item.serviceTreeId}
        </Text>
      ),
    }),
    createTableColumn<PolicyRequestSummary>({
      columnId: 'environmentGroup',
      compare: (a, b) => (a.environmentGroupName ?? '').localeCompare(b.environmentGroupName ?? ''),
      renderHeaderCell: () => <span>Env Container</span>,
      renderCell: (item) => <Text className={styles.cell}>{item.environmentGroupName ?? '-'}</Text>,
    }),
    createTableColumn<PolicyRequestSummary>({
      columnId: 'status',
      compare: (a, b) => a.status.localeCompare(b.status),
      renderHeaderCell: () => <span>Status</span>,
      renderCell: (item) => <StatusBadge status={item.status} />,
    }),
    createTableColumn<PolicyRequestSummary>({
      columnId: 'submittedOn',
      compare: (a, b) => {
        const dateA = a.submittedOn ? new Date(a.submittedOn).getTime() : 0;
        const dateB = b.submittedOn ? new Date(b.submittedOn).getTime() : 0;
        return dateA - dateB;
      },
      renderHeaderCell: () => <span>Submitted On</span>,
      renderCell: (item) => <Text className={styles.cell}>{formatDate(item.submittedOn)}</Text>,
    }),
    createTableColumn<PolicyRequestSummary>({
      columnId: 'environmentCount',
      compare: (a, b) => (a.environmentCount ?? 0) - (b.environmentCount ?? 0),
      renderHeaderCell: () => <span>Environments</span>,
      renderCell: (item) => (
        <Tooltip content={`${item.environmentCount ?? 0} environment${item.environmentCount !== 1 ? 's' : ''}`} relationship="label">
          <Text className={styles.cellMono}>
            {item.environmentCount ?? 0}
          </Text>
        </Tooltip>
      ),
    }),
    createTableColumn<PolicyRequestSummary>({
      columnId: 'connectorsCount',
      compare: (a, b) => (a.connectorsCount ?? 0) - (b.connectorsCount ?? 0),
      renderHeaderCell: () => <span>Connectors</span>,
      renderCell: (item) => (
        <Tooltip content={`${item.connectorsCount ?? 0} connector${item.connectorsCount !== 1 ? 's' : ''}`} relationship="label">
          <Text className={styles.cellMono}>
            {item.connectorsCount ?? 0}
          </Text>
        </Tooltip>
      ),
    }),
  ];

  const columns = baseColumns;

  const columnSizingOptions = {
    requestNumber:    { minWidth: 130, defaultWidth: 150 },
    serviceTree:      { minWidth: 140, defaultWidth: 180 },
    environmentGroup: { minWidth: 140, defaultWidth: 170 },
    status:           { minWidth: 120, defaultWidth: 140 },
    submittedOn:      { minWidth: 110, defaultWidth: 130 },
    environmentCount: { minWidth: 100, defaultWidth: 120 },
    connectorsCount:  { minWidth: 100, defaultWidth: 120 },
  };

  const searchPlaceholder = 'Search my requests…';

  return (
    <div className={styles.container}>
      {/* ── Filter bar ───────────────────────────────────────────────────── */}
      <div className={styles.filterBar}>
        {/* Search */}
        <Input
          className={styles.searchInput}
          contentBefore={<SearchRegular />}
          placeholder={searchPlaceholder}
          value={searchTerm}
          onChange={(_, data) => onSearchChange(data.value)}
          aria-label={searchPlaceholder}
        />

        {/* Service Tree dropdown (shown for all personas when >1 option) */}
        {distinctServiceTrees.length > 1 && (
          <>
            <Divider vertical className={styles.filterDivider} />

            <Dropdown
              placeholder="All Service Trees"
              value={
                serviceTreeFilter
                  ? (distinctServiceTrees.find((s) => s.id === serviceTreeFilter)?.name ?? '')
                  : ''
              }
              selectedOptions={serviceTreeFilter ? [serviceTreeFilter] : []}
              onOptionSelect={(_, data) => {
                if (data.optionValue === serviceTreeFilter) {
                  onServiceTreeChange(null);
                } else {
                  onServiceTreeChange(data.optionValue ?? null);
                }
              }}
              aria-label="Filter by service tree"
              className={styles.filterDropdown}
            >
              {distinctServiceTrees.map((st) => (
                <Option key={st.id} value={st.id}>
                  {st.name}
                </Option>
              ))}
            </Dropdown>
          </>
        )}

        {/* Environment Container dropdown (shown for all personas when >1 option) */}
        {distinctEnvironmentGroups.length > 1 && (
          <>
            <Divider vertical className={styles.filterDivider} />

            <Dropdown
              placeholder="All Environment Containers"
              value={
                environmentGroupFilter
                  ? (distinctEnvironmentGroups.find((g) => g.id === environmentGroupFilter)?.name ?? '')
                  : ''
              }
              selectedOptions={environmentGroupFilter ? [environmentGroupFilter] : []}
              onOptionSelect={(_, data) => {
                if (data.optionValue === environmentGroupFilter) {
                  onEnvironmentGroupChange(null);
                } else {
                  onEnvironmentGroupChange(data.optionValue ?? null);
                }
              }}
              aria-label="Filter by environment container"
              className={styles.filterDropdown}
            >
              {distinctEnvironmentGroups.map((g) => (
                <Option key={g.id} value={g.id}>
                  {g.name}
                </Option>
              ))}
            </Dropdown>
          </>
        )}

        {/* Right-aligned: Clear Filters + Refresh */}
        <div className={styles.filterActions}>
          {hasActiveFilters && (
            <Button
              appearance="subtle"
              size="small"
              onClick={handleClearFilters}
              aria-label="Clear all filters"
            >
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
              aria-label="Refresh requests"
            />
          </Tooltip>
        </div>
      </div>

      {showCapNotice && (
        <MessageBar intent="info">
          <MessageBarBody>Showing 100 most recent requests</MessageBarBody>
        </MessageBar>
      )}

      {/* ── Table ─────────────────────────────────────────────────────────── */}
      <div className={tableStyles.tableShell}>
        {isLoading ? (
          <RequestListSkeleton />
        ) : requests.length === 0 ? (
          <Text className={styles.emptyState}>
            {hasActiveFilters
              ? 'No requests match the current filters.'
              : 'No requests found.'}
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
              <DataGridBody<PolicyRequestSummary>>
                {({ item, rowId }) => (
                  <DataGridRow<PolicyRequestSummary>
                    key={rowId}
                    className={styles.row}
                    onClick={() => void navigate(`/requests/${item.id}`)}
                  >
                    {({ renderCell }) => (
                      <DataGridCell>{renderCell(item)}</DataGridCell>
                    )}
                  </DataGridRow>
                )}
              </DataGridBody>
            </DataGrid>

            {/* ── Footer / pagination ────────────────────────────────────── */}
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

export default RequestListGrid;
