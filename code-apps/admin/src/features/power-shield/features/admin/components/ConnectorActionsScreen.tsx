import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  makeStyles,
  tokens,
  Text,
  Button,
  Input,
  Spinner,
  MessageBar,
  MessageBarBody,
  DataGrid,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridBody,
  DataGridRow,
  DataGridCell,
  createTableColumn,
  Badge,
  Tooltip,
} from '@fluentui/react-components';
import type { TableColumnDefinition } from '@fluentui/react-components';
import {
  SearchRegular,
  ArrowClockwise20Regular,
} from '@fluentui/react-icons';
import { PowerShieldBreadcrumb } from '../../../shared/components/PowerShieldBreadcrumb';
import { PaginationBar } from '../../../shared/components/PaginationBar';
import { searchConnectorActions } from '../services/connectorActionService';
import type { ConnectorActionRow, ActionSearchParams } from '../services/connectorActionService';
import { ConnectorActionDetailPanel } from './ConnectorActionDetailPanel';
import { useLayoutStyles, useTableStyles, useToolbarStyles } from '../../../shared/styles';

const DEFAULT_PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

const useStyles = makeStyles({
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  subtitle: {
    color: tokens.colorNeutralForeground3,
  },
  searchInput: {
    flex: '1',
    maxWidth: '360px',
  },
  headerCell: {
    backgroundColor: tokens.colorNeutralBackground2,
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
  cellText: {
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
  },
  footerInfo: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
  errorText: {
    color: tokens.colorPaletteRedForeground2,
  },
  loadingContainer: {
    display: 'flex',
    justifyContent: 'center',
    paddingTop: tokens.spacingVerticalXXL,
    paddingBottom: tokens.spacingVerticalXXL,
  },
});

function formatDate(val?: string): string {
  if (!val) return '-';
  return new Date(val).toLocaleString();
}

export function ConnectorActionsScreen() {
  const styles = useStyles();
  const layoutStyles = useLayoutStyles();
  const tableStyles = useTableStyles();
  const toolbarStyles = useToolbarStyles();

  const [items, setItems] = useState<ConnectorActionRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [activeParams, setActiveParams] = useState<ActionSearchParams>({});
  const [currentPage, setCurrentPage] = useState(0);
  const [tokenStack, setTokenStack] = useState<(string | undefined)[]>([undefined]);
  const [hasMore, setHasMore] = useState(false);
  const [pageSize, setPageSizeRaw] = useState(DEFAULT_PAGE_SIZE);
  const [selectedAction, setSelectedAction] = useState<ConnectorActionRow | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  const executeSearch = useCallback(
    async (params: ActionSearchParams, size: number, skipToken: string | undefined, targetPage: number) => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await searchConnectorActions(params, size, skipToken);
        setItems(result.items);
        setHasMore(result.hasMore);
        setCurrentPage(targetPage);
        setActiveParams(params);
        setTokenStack(prev => {
          const next = prev.slice(0, targetPage + 1);
          next[targetPage + 1] = result.nextSkipToken;
          return next;
        });
      } catch {
        setError('Failed to load connector actions. Please try refreshing.');
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  // Initial load
  useEffect(() => {
    void executeSearch({}, DEFAULT_PAGE_SIZE, undefined, 0);
  }, [executeSearch]);

  function handleSearch() {
    const params: ActionSearchParams = searchInput.trim()
      ? { searchTerm: searchInput.trim() }
      : {};
    setTokenStack([undefined]);
    void executeSearch(params, pageSize, undefined, 0);
  }

  function handleSearchKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSearch();
  }

  function handleRefresh() {
    setTokenStack([undefined]);
    void executeSearch(activeParams, pageSize, undefined, 0);
  }

  function handlePageSizeChange(size: number) {
    setPageSizeRaw(size);
    setTokenStack([undefined]);
    void executeSearch(activeParams, size, undefined, 0);
  }

  function handleNextPage() {
    void executeSearch(activeParams, pageSize, tokenStack[currentPage + 1], currentPage + 1);
  }

  function handlePrevPage() {
    void executeSearch(activeParams, pageSize, tokenStack[currentPage - 1], currentPage - 1);
  }

  function handleOpenDetail(item: ConnectorActionRow) {
    setSelectedAction(item);
    setPanelOpen(true);
  }

  function handlePanelClose() {
    setPanelOpen(false);
    setSelectedAction(null);
  }

  function handleSaved() {
    setPanelOpen(false);
    setSelectedAction(null);
    handleRefresh();
  }

  const columnSizingOptions = useMemo(() => ({
    name: { minWidth: 200, defaultWidth: 260 },
    actionKey: { minWidth: 150, defaultWidth: 200 },
    isActive: { minWidth: 70, defaultWidth: 85 },
    actionStatus: { minWidth: 90, defaultWidth: 110 },
    lastSync: { minWidth: 150, defaultWidth: 180 },
    connector: { minWidth: 180, defaultWidth: 240 },
    createdOn: { minWidth: 110, defaultWidth: 140 },
  }), []);

  const columns: TableColumnDefinition<ConnectorActionRow>[] = useMemo(() => [
    createTableColumn<ConnectorActionRow>({
      columnId: 'name',
      compare: (a, b) => a.actionName.localeCompare(b.actionName),
      renderHeaderCell: () => <span className={styles.headerCell}>Name</span>,
      renderCell: (item) => (
        <Tooltip content={item.actionName} relationship="label" withArrow>
          <Text className={styles.cellText} weight="medium">{item.actionName}</Text>
        </Tooltip>
      ),
    }),
    createTableColumn<ConnectorActionRow>({
      columnId: 'actionKey',
      compare: (a, b) => a.actionKey.localeCompare(b.actionKey),
      renderHeaderCell: () => <span className={styles.headerCell}>Action Key</span>,
      renderCell: (item) => (
        <Tooltip content={item.actionKey || '-'} relationship="label" withArrow>
          <Text className={styles.cellText} font="monospace">{item.actionKey || '-'}</Text>
        </Tooltip>
      ),
    }),
    createTableColumn<ConnectorActionRow>({
      columnId: 'isActive',
      compare: (a, b) => Number(a.isActive) - Number(b.isActive),
      renderHeaderCell: () => <span className={styles.headerCell}>Is Active</span>,
      renderCell: (item) => <Text className={styles.cellText}>{item.isActive ? 'Yes' : 'No'}</Text>,
    }),
    createTableColumn<ConnectorActionRow>({
      columnId: 'actionStatus',
      compare: (a, b) => a.actionStatus.localeCompare(b.actionStatus),
      renderHeaderCell: () => <span className={styles.headerCell}>Action Status</span>,
      renderCell: (item) => (
        <Badge
          appearance="filled"
          color={item.actionStatus === 'Allow' ? 'success' : item.actionStatus === 'Block' ? 'danger' : 'informative'}
        >
          {item.actionStatus}
        </Badge>
      ),
    }),
    createTableColumn<ConnectorActionRow>({
      columnId: 'lastSync',
      compare: (a, b) => {
        const tA = a.lastSyncDateTime ? new Date(a.lastSyncDateTime).getTime() : 0;
        const tB = b.lastSyncDateTime ? new Date(b.lastSyncDateTime).getTime() : 0;
        return tA - tB;
      },
      renderHeaderCell: () => <span className={styles.headerCell}>Last Sync</span>,
      renderCell: (item) => <Text className={styles.cellText}>{formatDate(item.lastSyncDateTime)}</Text>,
    }),
    createTableColumn<ConnectorActionRow>({
      columnId: 'connector',
      compare: (a, b) => (a.connectorName ?? '').localeCompare(b.connectorName ?? ''),
      renderHeaderCell: () => <span className={styles.headerCell}>Connector</span>,
      renderCell: (item) => (
        <Tooltip content={item.connectorName ?? '-'} relationship="label" withArrow>
          <Text className={styles.cellText}>{item.connectorName ?? '-'}</Text>
        </Tooltip>
      ),
    }),
    createTableColumn<ConnectorActionRow>({
      columnId: 'createdOn',
      compare: (a, b) => {
        const tA = a.createdOn ? new Date(a.createdOn).getTime() : 0;
        const tB = b.createdOn ? new Date(b.createdOn).getTime() : 0;
        return tA - tB;
      },
      renderHeaderCell: () => <span className={styles.headerCell}>Created On</span>,
      renderCell: (item) => <Text className={styles.cellText}>{item.createdOn ? new Date(item.createdOn).toLocaleDateString() : '-'}</Text>,
    }),
  ], [styles.headerCell, styles.cellText]);

  const displayPage = currentPage + 1;

  return (
    <div className={layoutStyles.pageContainer}>
      <PowerShieldBreadcrumb segments={[{ label: 'Connector Actions' }]} />

      <div className={styles.header}>
        <Text as="h1" size={700} weight="semibold">Connector Actions</Text>
        <Text className={styles.subtitle}>
          Browse and manage all connector actions synced from your Power Platform environment.
          Click an action row to view details and edit governance settings.
        </Text>
      </div>

      <div className={toolbarStyles.toolbarWrap}>
        <Input
          className={styles.searchInput}
          contentAfter={
            <Button
              appearance="transparent"
              icon={<SearchRegular />}
              size="small"
              onClick={handleSearch}
              aria-label="Search"
            />
          }
          placeholder="Search name, action key, connector..."
          value={searchInput}
          onChange={(_, data) => setSearchInput(data.value)}
          onKeyDown={handleSearchKeyDown}
        />
        <Button
          appearance="subtle"
          icon={<ArrowClockwise20Regular />}
          onClick={handleRefresh}
          disabled={isLoading}
          aria-label="Refresh"
        >
          Refresh
        </Button>
      </div>

      {error && (
        <Text className={styles.errorText}>{error}</Text>
      )}

      {isLoading ? (
        <div className={styles.loadingContainer}>
          <Spinner label="Loading connector actions..." />
        </div>
      ) : items.length === 0 ? (
        <MessageBar>
          <MessageBarBody>
            {activeParams.searchTerm
              ? `No connector actions match "${activeParams.searchTerm}".`
              : 'No connector actions found.'}
          </MessageBarBody>
        </MessageBar>
      ) : (
        <div className={tableStyles.tableShell}>
          <DataGrid
            items={items}
            columns={columns}
            columnSizingOptions={columnSizingOptions}
            resizableColumns
            sortable
            defaultSortState={{ sortColumn: 'name', sortDirection: 'ascending' }}
            getRowId={(item) => item.id}
          >
            <DataGridHeader>
              <DataGridRow>
                {({ renderHeaderCell }) => (
                  <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>
                )}
              </DataGridRow>
            </DataGridHeader>
            <DataGridBody<ConnectorActionRow>>
              {({ item, rowId }) => (
                <DataGridRow<ConnectorActionRow>
                  key={rowId}
                  className={styles.row}
                  onClick={() => handleOpenDetail(item)}
                >
                  {({ renderCell }) => (
                    <DataGridCell>{renderCell(item)}</DataGridCell>
                  )}
                </DataGridRow>
              )}
            </DataGridBody>
          </DataGrid>

          <PaginationBar
            page={displayPage}
            pageCount={hasMore ? displayPage + 1 : displayPage}
            pageSize={pageSize}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
            totalRecords={items.length}
            onPageChange={(p) => { if (p < displayPage) handlePrevPage(); else handleNextPage(); }}
            onPageSizeChange={handlePageSizeChange}
          />
        </div>
      )}

      <ConnectorActionDetailPanel
        open={panelOpen}
        action={selectedAction}
        onClose={handlePanelClose}
        onSaved={handleSaved}
      />
    </div>
  );
}
