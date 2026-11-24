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
  DataGridSelectionCell,
  createTableColumn,
  Badge,
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@fluentui/react-components';
import type { TableColumnDefinition, SelectionItemId } from '@fluentui/react-components';
import {
  ArrowClockwise20Regular,
  ShieldProhibitedRegular,
  ShieldCheckmarkRegular,
  Dismiss24Regular,
  SearchRegular,
} from '@fluentui/react-icons';
import { getConnectorActionsByConnectorId, bulkUpdateConnectorActions } from '../services/connectorActionService';
import { PaginationBar } from '../../../shared/components/PaginationBar';
import type { ConnectorActionRow, BulkUpdateResult } from '../services/connectorActionService';
import { ConnectorActionDetailPanel } from './ConnectorActionDetailPanel';
import { useTableStyles } from '../../../shared/styles';

interface ConnectorActionsSubGridProps {
  connectorId: string;
}

const DEFAULT_PAGE_SIZE = 10;
const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerCell: {
    fontWeight: tokens.fontWeightSemibold,
  },
  nameLink: {
    color: tokens.colorBrandForeground1,
    cursor: 'pointer',
    fontWeight: '500',
    textDecoration: 'none',
    ':hover': { textDecoration: 'underline' },
  },
  footerInfo: {
    fontSize: '12px',
    color: tokens.colorNeutralForeground3,
  },
  searchInput: {
    width: '100%',
  },
});

export function ConnectorActionsSubGrid({ connectorId }: ConnectorActionsSubGridProps) {
  const styles = useStyles();
  const tableStyles = useTableStyles();

  const [items, setItems] = useState<ConnectorActionRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSizeRaw] = useState(DEFAULT_PAGE_SIZE);
  const [selectedAction, setSelectedAction] = useState<ConnectorActionRow | null>(null);
  const [actionPanelOpen, setActionPanelOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<SelectionItemId>>(new Set());

  // Bulk action dialog state
  type BulkActionType = 'block' | 'unblock';
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkActionType, setBulkActionType] = useState<BulkActionType>('block');
  const [isApplyingBulk, setIsApplyingBulk] = useState(false);
  const [bulkResultMessage, setBulkResultMessage] = useState<string | null>(null);

  const setPageSize = useCallback((size: number) => {
    setPageSizeRaw(size);
    setCurrentPage(1);
  }, []);

  const fetchActions = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getConnectorActionsByConnectorId(connectorId);
      setItems(data);
    } catch {
      // Silently fail — sub-grid is secondary content
    } finally {
      setIsLoading(false);
    }
  }, [connectorId]);

  useEffect(() => {
    void fetchActions();
  }, [fetchActions]);

  // Client-side search filtering
  const filteredItems = useMemo(() => {
    if (!searchTerm.trim()) return items;
    const term = searchTerm.toLowerCase();
    return items.filter(
      (a) =>
        a.actionName.toLowerCase().includes(term) ||
        (a.actionDescription ?? '').toLowerCase().includes(term) ||
        a.actionKey.toLowerCase().includes(term),
    );
  }, [items, searchTerm]);

  const totalCount = filteredItems.length;
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(currentPage, pageCount);
  const paged = filteredItems.slice((safePage - 1) * pageSize, safePage * pageSize);

  const hasSelection = selectedIds.size > 0;
  const selectedIdsArray = useMemo(() => Array.from(selectedIds) as string[], [selectedIds]);

  function handleSelectionChange(_e: unknown, data: { selectedItems: Set<SelectionItemId> }) {
    setSelectedIds(data.selectedItems);
  }

  function handleBlockAction() {
    setBulkActionType('block');
    setBulkDialogOpen(true);
  }

  function handleUnblockAction() {
    setBulkActionType('unblock');
    setBulkDialogOpen(true);
  }

  async function handleBulkApply() {
    setIsApplyingBulk(true);
    try {
      const fields = bulkActionType === 'block'
        ? { blockedByAdmin: true, actionStatus: 'Block' as const }
        : { blockedByAdmin: false, actionStatus: 'Allow' as const };

      const result: BulkUpdateResult = await bulkUpdateConnectorActions(selectedIdsArray, fields);
      setBulkDialogOpen(false);
      setSelectedIds(new Set());

      if (result.failedCount === 0) {
        setBulkResultMessage(`Successfully ${bulkActionType === 'block' ? 'blocked' : 'unblocked'} ${result.successCount} action${result.successCount !== 1 ? 's' : ''}.`);
      } else {
        setBulkResultMessage(`Updated ${result.successCount}, ${result.failedCount} failed.`);
      }
      void fetchActions();
      setTimeout(() => setBulkResultMessage(null), 5000);
    } catch {
      setBulkDialogOpen(false);
      setBulkResultMessage('Failed to update actions. Please try again.');
      setTimeout(() => setBulkResultMessage(null), 5000);
    } finally {
      setIsApplyingBulk(false);
    }
  }

  const columnSizingOptions = useMemo(() => ({
    name: { minWidth: 140, defaultWidth: 200 },
    actionDescription: { minWidth: 160, defaultWidth: 280 },
    actionStatus: { minWidth: 80, defaultWidth: 90 },
  }), []);

  const columns: TableColumnDefinition<ConnectorActionRow>[] = useMemo(() => [
    createTableColumn<ConnectorActionRow>({
      columnId: 'name',
      compare: (a, b) => a.actionName.localeCompare(b.actionName),
      renderHeaderCell: () => 'Name',
      renderCell: (item) => (
        <span
          className={styles.nameLink}
          role="button"
          tabIndex={0}
          onClick={(e) => { e.stopPropagation(); setSelectedAction(item); setActionPanelOpen(true); }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedAction(item); setActionPanelOpen(true); } }}
          aria-label={`View ${item.actionName}`}
        >
          {item.actionName}
        </span>
      ),
    }),
    createTableColumn<ConnectorActionRow>({
      columnId: 'actionDescription',
      compare: (a, b) => (a.actionDescription ?? '').localeCompare(b.actionDescription ?? ''),
      renderHeaderCell: () => 'Description',
      renderCell: (item) => <Text>{item.actionDescription ?? '-'}</Text>,
    }),
    createTableColumn<ConnectorActionRow>({
      columnId: 'actionStatus',
      compare: (a, b) => a.actionStatus.localeCompare(b.actionStatus),
      renderHeaderCell: () => 'Status',
      renderCell: (item) => (
        <Badge
          appearance="filled"
          color={item.actionStatus === 'Allow' ? 'success' : item.actionStatus === 'Block' ? 'danger' : 'informative'}
          size="small"
        >
          {item.actionStatus}
        </Badge>
      ),
    }),
  ], [styles.nameLink]);

  if (isLoading) {
    return <Spinner size="small" label="Loading actions..." />;
  }

  if (items.length === 0) {
    return (
      <MessageBar>
        <MessageBarBody>No connector actions found for this connector.</MessageBarBody>
      </MessageBar>
    );
  }

  return (
    <div className={styles.container}>
      <Input
        contentBefore={<SearchRegular />}
        placeholder="Search actions..."
        value={searchTerm}
        onChange={(_, data) => { setSearchTerm(data.value); setCurrentPage(1); }}
        className={styles.searchInput}
        size="small"
      />

      <div className={styles.toolbar}>
        <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
          {totalCount} {totalCount === 1 ? 'action' : 'actions'}{searchTerm.trim() ? ` (of ${items.length})` : ''}
        </Text>
        <div style={{ display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS }}>
          <Button
            appearance="outline"
            icon={<ShieldProhibitedRegular />}
            disabled={!hasSelection}
            onClick={handleBlockAction}
            size="small"
          >
            Block
          </Button>
          <Button
            appearance="outline"
            icon={<ShieldCheckmarkRegular />}
            disabled={!hasSelection}
            onClick={handleUnblockAction}
            size="small"
          >
            Unblock
          </Button>
          <Button
            appearance="subtle"
            icon={<ArrowClockwise20Regular />}
            onClick={() => { setSelectedIds(new Set()); void fetchActions(); }}
            size="small"
            aria-label="Refresh actions"
          />
        </div>
      </div>

      {bulkResultMessage && (
        <MessageBar intent="success" style={{ marginBottom: tokens.spacingVerticalXS }}>
          <MessageBarBody>{bulkResultMessage}</MessageBarBody>
        </MessageBar>
      )}

      <div className={tableStyles.tableShell}>
        <DataGrid
          items={paged}
          columns={columns}
          columnSizingOptions={columnSizingOptions}
          resizableColumns
          sortable
          selectionMode="multiselect"
          selectedItems={selectedIds}
          onSelectionChange={handleSelectionChange}
          defaultSortState={{ sortColumn: 'name', sortDirection: 'ascending' }}
          getRowId={(item) => item.id}
          focusMode="composite"
          size="small"
        >
          <DataGridHeader>
            <DataGridRow selectionCell={<DataGridSelectionCell />}>
              {({ renderHeaderCell }) => (
                <DataGridHeaderCell className={styles.headerCell}>{renderHeaderCell()}</DataGridHeaderCell>
              )}
            </DataGridRow>
          </DataGridHeader>
          <DataGridBody<ConnectorActionRow>>
            {({ item, rowId }) => (
              <DataGridRow<ConnectorActionRow> key={rowId} selectionCell={<DataGridSelectionCell />}>
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
          totalRecords={totalCount}
          onPageChange={(p) => setCurrentPage(p)}
          onPageSizeChange={(size) => setPageSize(size)}
        />
      </div>

      {/* Bulk Action Confirmation Dialog */}
      <Dialog open={bulkDialogOpen} onOpenChange={(_, data) => { if (!data.open && !isApplyingBulk) setBulkDialogOpen(false); }}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle
              action={
                <Button
                  appearance="subtle"
                  aria-label="Close"
                  icon={<Dismiss24Regular />}
                  onClick={() => setBulkDialogOpen(false)}
                  disabled={isApplyingBulk}
                />
              }
            >
              Are you sure you want to make the following changes?
            </DialogTitle>
            <DialogContent>
              <Text style={{ color: tokens.colorNeutralForeground2 }}>
                {bulkActionType === 'block'
                  ? `This will block ${selectedIdsArray.length} action${selectedIdsArray.length !== 1 ? 's' : ''} from being requested by makers.`
                  : `This will unblock ${selectedIdsArray.length} action${selectedIdsArray.length !== 1 ? 's' : ''}, allowing makers to request them.`}
              </Text>
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setBulkDialogOpen(false)} disabled={isApplyingBulk}>
                Cancel
              </Button>
              <Button
                appearance="primary"
                onClick={() => void handleBulkApply()}
                disabled={isApplyingBulk}
                icon={isApplyingBulk ? <Spinner size="tiny" /> : undefined}
              >
                {isApplyingBulk ? 'Applying...' : 'Apply'}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <ConnectorActionDetailPanel
        open={actionPanelOpen}
        action={selectedAction}
        onClose={() => { setActionPanelOpen(false); setSelectedAction(null); }}
        onSaved={() => { setActionPanelOpen(false); setSelectedAction(null); void fetchActions(); }}
      />
    </div>
  );
}
