import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  makeStyles,
  tokens,
  Text,
  Button,
  SearchBox,
  Spinner,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  MessageBarActions,
  DataGrid,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridBody,
  DataGridRow,
  DataGridCell,
  DataGridSelectionCell,
  createTableColumn,
  Badge,
  Tooltip,
  Switch,
  Menu,
  MenuTrigger,
  MenuPopover,
  MenuList,
  MenuItem,
  Link,
} from '@fluentui/react-components';
import type { TableColumnDefinition, SelectionItemId, DataGridProps } from '@fluentui/react-components';
import {
  ArrowClockwise20Regular,
  EyeRegular,
  ShieldProhibitedRegular,
  ShieldCheckmarkRegular,
  ShieldRegular,
  ChevronDownRegular,
  PlugConnected20Regular,
  OpenRegular,
  DismissRegular,
} from '@fluentui/react-icons';
import { PaginationBar } from '../../../shared/components/PaginationBar';
import { getAllConnectors } from '../services/connectorService';
import { PowerShieldBreadcrumb } from '../../../shared/components/PowerShieldBreadcrumb';
import type { ConnectorRow } from '../services/connectorService';
import type { RiskLevel } from '../../../models/connector';
import { ConnectorDetailPanel } from './ConnectorDetailPanel';
import { BulkActionConfirmDialog } from './BulkActionConfirmDialog';
import type { BulkActionType } from './BulkActionConfirmDialog';
import type { BulkUpdateResult } from '../services/connectorService';
import { useLayoutStyles, useTableStyles } from '../../../shared/styles';

const DEFAULT_PAGE_SIZE = 25;
const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

const RISK_LEVELS_FOR_MENU: RiskLevel[] = ['Low', 'Medium', 'High', 'None', 'No Risk'];

type SortState = Parameters<NonNullable<DataGridProps['onSortChange']>>[1];
const DEFAULT_SORT: SortState = { sortColumn: 'name', sortDirection: 'ascending' };

// Ascending = least to most severe; unset sorts first.
const RISK_RANK: Record<RiskLevel, number> = { None: 0, 'No Risk': 1, Low: 2, Medium: 3, High: 4 };

type ConnectorSortColumn = 'name' | 'publisher' | 'actionCount' | 'riskLevel' | 'blocked';

/** Single source of compare functions, shared by full-list sorting and the DataGrid columns. */
const COMPARERS: Record<ConnectorSortColumn, (a: ConnectorRow, b: ConnectorRow) => number> = {
  name: (a, b) => a.displayName.localeCompare(b.displayName),
  publisher: (a, b) => (a.publisher ?? '').localeCompare(b.publisher ?? ''),
  actionCount: (a, b) => (a.actionCount ?? 0) - (b.actionCount ?? 0),
  riskLevel: (a, b) =>
    (a.riskLevel ? RISK_RANK[a.riskLevel] : -1) - (b.riskLevel ? RISK_RANK[b.riskLevel] : -1),
  blocked: (a, b) => Number(a.blockedByAdmin ?? false) - Number(b.blockedByAdmin ?? false),
};

const RISK_COLORS: Record<RiskLevel, 'danger' | 'warning' | 'success' | 'informative' | 'important'> = {
  High: 'danger',
  Medium: 'warning',
  Low: 'success',
  'No Risk': 'success',
  None: 'informative',
};

const useStyles = makeStyles({
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  toolbarRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
  },
  toolbarLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
  },
  toolbarRight: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    flexShrink: 0,
  },
  searchInput: {
    width: '320px',
  },
  headerCell: {
    backgroundColor: tokens.colorNeutralBackground2,
    fontSize: '10px',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: tokens.colorNeutralForeground3,
    padding: '9px 12px',
  },
  row: {
    cursor: 'pointer',
    borderLeft: '3px solid transparent',
    transitionProperty: 'background-color, border-color',
    transitionDuration: '100ms',
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground1,
      borderLeftColor: tokens.colorBrandForeground1,
    },
  },
  cell: {
    fontSize: '12.5px',
    color: tokens.colorNeutralForeground2,
    padding: '11px 12px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  cellText: {
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '12.5px',
    color: tokens.colorNeutralForeground2,
  },
  connectorNameCell: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    overflow: 'hidden',
  },
  connectorIcon: {
    width: '20px',
    height: '20px',
    borderRadius: '4px',
    flexShrink: 0,
    objectFit: 'contain',
  },
  connectorIconPlaceholder: {
    width: '20px',
    height: '20px',
    borderRadius: '4px',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.colorNeutralBackground3,
    color: tokens.colorNeutralForeground3,
  },
  actionsLink: {
    color: tokens.colorBrandForeground1,
    cursor: 'pointer',
    fontSize: '12.5px',
    textDecoration: 'none',
    ':hover': { textDecoration: 'underline' },
  },
  footerInfo: {
    fontSize: '12px',
    color: tokens.colorNeutralForeground3,
  },
  resultMessage: {
    marginTop: tokens.spacingVerticalS,
  },
  bannerTitle: {
    display: 'block',
  },
  bannerLine: {
    margin: `${tokens.spacingVerticalXS} 0 0`,
  },
});

function ConnectorIcon({ iconUrl }: { iconUrl?: string }) {
  const styles = useStyles();
  const [imgError, setImgError] = useState(false);
  const showPlaceholder = !iconUrl || imgError;

  if (showPlaceholder) {
    return (
      <span className={styles.connectorIconPlaceholder}>
        <PlugConnected20Regular fontSize={14} />
      </span>
    );
  }

  return (
    <img
      src={iconUrl}
      alt=""
      className={styles.connectorIcon}
      onError={() => setImgError(true)}
    />
  );
}

export function ConnectorsScreen() {
  const styles = useStyles();
  const layoutStyles = useLayoutStyles();
  const tableStyles = useTableStyles();

  // Data state
  const [allItems, setAllItems] = useState<ConnectorRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [showBlocked, setShowBlocked] = useState(true);
  const [sortState, setSortState] = useState<SortState>(DEFAULT_SORT);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<SelectionItemId>>(new Set());

  // Detail panel state
  const [selectedConnector, setSelectedConnector] = useState<ConnectorRow | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  // Bulk action dialog state
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkActionType, setBulkActionType] = useState<BulkActionType>('block');
  const [bulkRiskLevel, setBulkRiskLevel] = useState<RiskLevel | undefined>();
  const [bulkResultMessage, setBulkResultMessage] = useState<string | null>(null);
  const [bulkResultIntent, setBulkResultIntent] = useState<'success' | 'error'>('success');

  const loadConnectors = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setSelectedIds(new Set());
    try {
      const rows = await getAllConnectors();
      setAllItems(rows);
      // Keep an open details panel in sync with fresh data; it closes if the connector is gone.
      setSelectedConnector(prev => (prev ? rows.find(r => r.id === prev.id) ?? null : prev));
    } catch (err) {
      console.error('[ConnectorsScreen] load failed:', err);
      setAllItems([]);
      setError('Failed to load connectors. Please try refreshing.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConnectors();
  }, [loadConnectors]);

  const searchTerm = searchInput.trim().toLowerCase();

  const filteredItems = useMemo(() => {
    const visible = showBlocked ? allItems : allItems.filter(c => !c.blockedByAdmin);
    if (!searchTerm) return visible;
    return visible.filter(c =>
      [c.displayName, c.publisher, c.category, c.connectorKey]
        .some(v => v?.toLowerCase().includes(searchTerm)),
    );
  }, [allItems, showBlocked, searchTerm]);

  const sortedItems = useMemo(() => {
    const compare = COMPARERS[sortState.sortColumn as ConnectorSortColumn];
    if (!compare) return filteredItems;
    const dir = sortState.sortDirection === 'descending' ? -1 : 1;
    return [...filteredItems].sort((a, b) => dir * compare(a, b));
  }, [filteredItems, sortState]);

  const pageCount = Math.max(1, Math.ceil(sortedItems.length / pageSize));
  const safePage = Math.min(currentPage, pageCount);
  const pageItems = useMemo(
    () => sortedItems.slice((safePage - 1) * pageSize, safePage * pageSize),
    [sortedItems, safePage, pageSize],
  );

  function resetView() {
    setCurrentPage(1);
    setSelectedIds(new Set());
  }

  function handleSearchChange(value: string) {
    setSearchInput(value);
    resetView();
  }

  function handleShowBlockedToggle(checked: boolean) {
    setShowBlocked(checked);
    resetView();
  }

  function handleSortChange(_e: unknown, next: SortState) {
    setSortState(next);
    resetView();
  }

  function handleRefresh() {
    void loadConnectors();
  }

  function handlePageSizeChange(size: number) {
    setPageSize(size);
    resetView();
  }

  function handlePageChange(page: number) {
    setCurrentPage(page);
    setSelectedIds(new Set());
  }

  function handleSelectionChange(_e: unknown, data: { selectedItems: Set<SelectionItemId> }) {
    setSelectedIds(data.selectedItems);
  }

  // Toolbar actions
  function handleViewDetails() {
    const id = Array.from(selectedIds)[0] as string;
    const connector = allItems.find(c => c.id === id);
    if (connector) handleOpenPanel(connector);
  }

  function handleBlockAction() {
    setBulkActionType('block');
    setBulkRiskLevel(undefined);
    setBulkDialogOpen(true);
  }

  function handleUnblockAction() {
    setBulkActionType('unblock');
    setBulkRiskLevel(undefined);
    setBulkDialogOpen(true);
  }

  function handleSetRisk(level: RiskLevel) {
    setBulkActionType('setRisk');
    setBulkRiskLevel(level);
    setBulkDialogOpen(true);
  }

  function handleBulkComplete(result: BulkUpdateResult) {
    setBulkDialogOpen(false);
    setSelectedIds(new Set());
    const actionLabel = bulkActionType === 'block' ? 'blocked' : bulkActionType === 'unblock' ? 'unblocked' : 'updated risk level for';
    const connectorText = `${result.successCount} connector${result.successCount !== 1 ? 's' : ''}`;

    if (result.failedCount === 0) {
      setBulkResultIntent('success');
      const successMessage = bulkActionType === 'block'
        ? `${connectorText} blocked. Makers can no longer request ${result.successCount !== 1 ? 'them' : 'it'} in Request Center.`
        : bulkActionType === 'unblock'
          ? `${connectorText} unblocked. Makers can now request ${result.successCount !== 1 ? 'them' : 'it'} in Request Center.`
          : `Successfully ${actionLabel} ${connectorText}.`;
      setBulkResultMessage(successMessage);
      setTimeout(() => setBulkResultMessage(null), 5000);
    } else if (result.successCount === 0) {
      setBulkResultIntent('error');
      const errorDetail = result.errors.length > 0 ? ` Error: ${result.errors[0]}` : '';
      setBulkResultMessage(`Failed to ${bulkActionType} ${result.failedCount} connector${result.failedCount !== 1 ? 's' : ''}.${errorDetail}`);
    } else {
      setBulkResultIntent('error');
      const errorDetail = result.errors.length > 0 ? ` Error: ${result.errors[0]}` : '';
      setBulkResultMessage(`${actionLabel} ${connectorText}, ${result.failedCount} failed.${errorDetail}`);
    }
    handleRefresh();
  }

  function handlePanelClose() {
    setPanelOpen(false);
    setSelectedConnector(null);
  }

  const handleOpenPanel = useCallback((connector: ConnectorRow) => {
    setSelectedConnector(connector);
    setPanelOpen(true);
  }, []);

  const hasSelection = selectedIds.size > 0;
  const hasSingleSelection = selectedIds.size === 1;

  const columnSizingOptions = useMemo(() => ({
    name: { minWidth: 200, defaultWidth: 280 },
    publisher: { minWidth: 120, defaultWidth: 160 },
    actionCount: { minWidth: 80, defaultWidth: 110 },
    riskLevel: { minWidth: 90, defaultWidth: 110 },
    blocked: { minWidth: 80, defaultWidth: 100 },
    documentation: { minWidth: 100, defaultWidth: 120 },
  }), []);

  const columns: TableColumnDefinition<ConnectorRow>[] = useMemo(() => [
    createTableColumn<ConnectorRow>({
      columnId: 'name',
      compare: COMPARERS.name,
      renderHeaderCell: () => <span className={styles.headerCell}>Name</span>,
      renderCell: (item) => (
        <div className={styles.connectorNameCell}>
          <ConnectorIcon iconUrl={item.iconUrl} />
          <Tooltip content={item.displayName} relationship="label" withArrow>
            <Text className={styles.cellText} style={{ fontWeight: '500', color: tokens.colorNeutralForeground1 }}>
              {item.displayName}
            </Text>
          </Tooltip>
        </div>
      ),
    }),
    createTableColumn<ConnectorRow>({
      columnId: 'publisher',
      compare: COMPARERS.publisher,
      renderHeaderCell: () => <span className={styles.headerCell}>Published by</span>,
      renderCell: (item) => (
        <Tooltip content={item.publisher ?? '-'} relationship="label" withArrow>
          <Text className={styles.cellText}>{item.publisher ?? '-'}</Text>
        </Tooltip>
      ),
    }),
    createTableColumn<ConnectorRow>({
      columnId: 'actionCount',
      compare: COMPARERS.actionCount,
      renderHeaderCell: () => <span className={styles.headerCell}>Actions</span>,
      renderCell: (item) => {
        const count = item.actionCount ?? 0;
        return (
          <span
            className={styles.actionsLink}
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); handleOpenPanel(item); }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleOpenPanel(item); } }}
          >
            {count > 0 ? `${count} action${count !== 1 ? 's' : ''}` : 'Actions'}
          </span>
        );
      },
    }),
    createTableColumn<ConnectorRow>({
      columnId: 'riskLevel',
      compare: COMPARERS.riskLevel,
      renderHeaderCell: () => <span className={styles.headerCell}>Risk level</span>,
      renderCell: (item) => item.riskLevel
        ? <Badge appearance="filled" color={RISK_COLORS[item.riskLevel]}>{item.riskLevel}</Badge>
        : <Text className={styles.cellText}>-</Text>,
    }),
    createTableColumn<ConnectorRow>({
      columnId: 'blocked',
      compare: COMPARERS.blocked,
      renderHeaderCell: () => <span className={styles.headerCell}>Blocked</span>,
      renderCell: (item) => item.blockedByAdmin
        ? <Badge appearance="filled" color="danger">Blocked</Badge>
        : <Text className={styles.cellText}>-</Text>,
    }),
    createTableColumn<ConnectorRow>({
      columnId: 'documentation',
      renderHeaderCell: () => <span className={styles.headerCell}>Documentation</span>,
      renderCell: (item) => item.connectorDetailsUrl
        ? (
          <Link
            href={item.connectorDetailsUrl}
            target="_blank"
            rel="noopener noreferrer"
            inline
            style={{ fontSize: '12.5px' }}
          >
            Learn more <OpenRegular fontSize={12} />
          </Link>
        )
        : <Text className={styles.cellText}>-</Text>,
    }),
  ], [styles.headerCell, styles.cellText, styles.connectorNameCell, styles.actionsLink, handleOpenPanel]);

  const selectedIdsArray = useMemo(() => Array.from(selectedIds) as string[], [selectedIds]);

  return (
    <div className={layoutStyles.pageContainer}>
      <PowerShieldBreadcrumb segments={[{ label: 'Settings', route: '/settings' }, { label: 'Connector Configurations' }]} />

      <div className={styles.header}>
        <Text as="h1" size={700} weight="semibold">Connector Configurations</Text>
        <Text style={{ color: tokens.colorNeutralForeground3 }}>
          Browse and manage all connectors synced from your Power Platform environment.
          Select connectors to view details and edit governance settings.
        </Text>
      </div>

      <MessageBar intent="info" layout="multiline">
        <MessageBarBody>
          <MessageBarTitle className={styles.bannerTitle}>About blocked connectors</MessageBarTitle>
          <p className={styles.bannerLine}>
            Blocking only applies to Request Center. Makers can&rsquo;t select or request a blocked connector,
            but your data policies and Power Platform admin center settings don&rsquo;t change.
          </p>
          <p className={styles.bannerLine}>
            Connectors from non-Microsoft publishers are blocked by default.
            You can unblock any connector you want makers to request.
          </p>
        </MessageBarBody>
      </MessageBar>

      {/* Toolbar */}
      <div className={styles.toolbarRow}>
        <div className={styles.toolbarLeft}>
          <Button
            appearance="outline"
            icon={<EyeRegular />}
            disabled={!hasSingleSelection}
            onClick={handleViewDetails}
          >
            View details and actions
          </Button>
          <Button
            appearance="outline"
            icon={<ShieldProhibitedRegular />}
            disabled={!hasSelection}
            onClick={handleBlockAction}
          >
            Block
          </Button>
          <Button
            appearance="outline"
            icon={<ShieldCheckmarkRegular />}
            disabled={!hasSelection}
            onClick={handleUnblockAction}
          >
            Unblock
          </Button>
          <Menu>
            <MenuTrigger disableButtonEnhancement>
              <Button
                appearance="outline"
                icon={<ShieldRegular />}
                disabled={!hasSelection}
                iconPosition="before"
              >
                Set risk <ChevronDownRegular fontSize={12} />
              </Button>
            </MenuTrigger>
            <MenuPopover>
              <MenuList>
                {RISK_LEVELS_FOR_MENU.map(level => (
                  <MenuItem key={level} onClick={() => handleSetRisk(level)}>
                    {level}
                  </MenuItem>
                ))}
              </MenuList>
            </MenuPopover>
          </Menu>
        </div>

        <div className={styles.toolbarRight}>
          <Switch
            label="Show blocked"
            checked={showBlocked}
            onChange={(_, data) => handleShowBlockedToggle(data.checked)}
          />
          <SearchBox
            className={styles.searchInput}
            placeholder="Search by name, publisher, category or key"
            aria-label="Search connectors by name, publisher, category or key"
            value={searchInput}
            onChange={(_, data) => handleSearchChange(data.value)}
          />
          <Button
            appearance="subtle"
            icon={<ArrowClockwise20Regular />}
            onClick={handleRefresh}
            disabled={isLoading}
            aria-label="Refresh"
          />
        </div>
      </div>

      {/* Bulk result message */}
      {bulkResultMessage && (
        <MessageBar className={styles.resultMessage} intent={bulkResultIntent}>
          <MessageBarBody>{bulkResultMessage}</MessageBarBody>
          <MessageBarActions containerAction={
            <Button
              appearance="transparent"
              icon={<DismissRegular />}
              size="small"
              onClick={() => setBulkResultMessage(null)}
              aria-label="Dismiss"
            />
          } />
        </MessageBar>
      )}

      {error && (
        <Text style={{ color: tokens.colorPaletteRedForeground2 }}>{error}</Text>
      )}

      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: tokens.spacingVerticalXXL }}>
          <Spinner label="Loading connectors..." />
        </div>
      ) : pageItems.length === 0 ? (
        <MessageBar>
          <MessageBarBody>
            {searchTerm
              ? `No connectors match "${searchInput.trim()}".`
              : 'No connectors found.'}
          </MessageBarBody>
        </MessageBar>
      ) : (
        <div className={tableStyles.tableShell}>
          <DataGrid
            items={pageItems}
            columns={columns}
            columnSizingOptions={columnSizingOptions}
            resizableColumns
            sortable
            selectionMode="multiselect"
            selectedItems={selectedIds}
            onSelectionChange={handleSelectionChange}
            sortState={sortState}
            onSortChange={handleSortChange}
            getRowId={(item) => item.id}
          >
            <DataGridHeader>
              <DataGridRow selectionCell={<DataGridSelectionCell />}>
                {({ renderHeaderCell }) => (
                  <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>
                )}
              </DataGridRow>
            </DataGridHeader>
            <DataGridBody<ConnectorRow>>
              {({ item, rowId }) => (
                <DataGridRow<ConnectorRow>
                  key={rowId}
                  className={styles.row}
                  selectionCell={<DataGridSelectionCell />}
                >
                  {({ renderCell }) => (
                    <DataGridCell>{renderCell(item)}</DataGridCell>
                  )}
                </DataGridRow>
              )}
            </DataGridBody>
          </DataGrid>

          <PaginationBar
            page={safePage}
            pageCount={pageCount}
            pageSize={pageSize}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
            totalRecords={sortedItems.length}
            onPageChange={handlePageChange}
            onPageSizeChange={handlePageSizeChange}
          />
        </div>
      )}

      {/* Connector Detail Panel */}
      <ConnectorDetailPanel
        open={panelOpen && selectedConnector !== null}
        connector={selectedConnector}
        onClose={handlePanelClose}
      />

      {/* Bulk Action Confirmation Dialog */}
      <BulkActionConfirmDialog
        open={bulkDialogOpen}
        actionType={bulkActionType}
        riskLevel={bulkRiskLevel}
        selectedIds={selectedIdsArray}
        onClose={() => setBulkDialogOpen(false)}
        onComplete={handleBulkComplete}
      />
    </div>
  );
}
