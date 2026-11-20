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
} from '@fluentui/react-components';
import type { TableColumnDefinition } from '@fluentui/react-components';
import {
  SearchRegular,
  ArrowClockwise20Regular,
  Add20Regular,
} from '@fluentui/react-icons';
import { PowerShieldBreadcrumb } from '../../../shared/components/PowerShieldBreadcrumb';
import { PaginationBar } from '../../../shared/components/PaginationBar';
import { getBlockedConnectors } from '../services/blockedConnectorService';
import type { BlockedConnector } from '../../../models/blockedConnector';
import { BlockedConnectorDialog } from './BlockedConnectorDialog';
import { useLayoutStyles, useTableStyles, useToolbarStyles } from '../../../shared/styles';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_PAGE_SIZE = 5;
const PAGE_SIZE_OPTIONS = [5, 10, 25] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

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
    fontWeight: tokens.fontWeightSemibold,
  },
  monospace: {
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase200,
  },
  nameLink: {
    color: tokens.colorBrandForeground1,
    cursor: 'pointer',
    fontWeight: '500',
    textDecoration: 'none',
    ':hover': {
      textDecoration: 'underline',
    },
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

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function BlockedConnectorsScreen() {
  const styles = useStyles();
  const layoutStyles = useLayoutStyles();
  const tableStyles = useTableStyles();
  const toolbarStyles = useToolbarStyles();

  const [items, setItems] = useState<BlockedConnector[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSizeRaw] = useState(DEFAULT_PAGE_SIZE);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editItem, setEditItem] = useState<BlockedConnector | null>(null);

  const setPageSize = useCallback((size: number) => {
    setPageSizeRaw(size);
    setCurrentPage(1);
  }, []);

  async function fetchData() {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getBlockedConnectors();
      setItems(data);
    } catch {
      setError('Failed to load blocked connectors. Please try refreshing.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void fetchData();
  }, []);

  function handleSearchChange(value: string) {
    setSearchTerm(value);
    setCurrentPage(1);
  }

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return items;
    const lower = searchTerm.trim().toLowerCase();
    return items.filter(c => c.name.toLowerCase().includes(lower));
  }, [items, searchTerm]);

  const totalFilteredCount = filtered.length;
  const pageCount = Math.max(1, Math.ceil(totalFilteredCount / pageSize));
  const safePage = Math.min(currentPage, pageCount);
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const columnSizingOptions = useMemo(() => ({
    name: { minWidth: 200, defaultWidth: 260 },
    connectorKey: { minWidth: 180, defaultWidth: 240 },
    publisherName: { minWidth: 180, defaultWidth: 240 },
    lastSyncedOn: { minWidth: 160, defaultWidth: 200 },
    createdOn: { minWidth: 160, defaultWidth: 200 },
  }), []);

  const columns: TableColumnDefinition<BlockedConnector>[] = useMemo(() => [
    createTableColumn<BlockedConnector>({
      columnId: 'name',
      compare: (a, b) => a.name.localeCompare(b.name),
      renderHeaderCell: () => 'Name',
      renderCell: (item) => (
        <span
          className={styles.nameLink}
          role="button"
          tabIndex={0}
          onClick={(e) => { e.stopPropagation(); setEditItem(item); setIsCreateOpen(true); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setEditItem(item);
              setIsCreateOpen(true);
            }
          }}
          aria-label={`Edit ${item.name}`}
        >
          {item.name}
        </span>
      ),
    }),
    createTableColumn<BlockedConnector>({
      columnId: 'connectorKey',
      compare: (a, b) => a.connectorKey.localeCompare(b.connectorKey),
      renderHeaderCell: () => 'Connector Key',
      renderCell: (item) => (
        <span className={styles.monospace}>{item.connectorKey || '-'}</span>
      ),
    }),
    createTableColumn<BlockedConnector>({
      columnId: 'publisherName',
      compare: (a, b) => (a.publisherName ?? '').localeCompare(b.publisherName ?? ''),
      renderHeaderCell: () => 'Publisher Name',
      renderCell: (item) => (
        <Text>{item.publisherName || '-'}</Text>
      ),
    }),
    createTableColumn<BlockedConnector>({
      columnId: 'lastSyncedOn',
      compare: (a, b) => {
        const tA = a.lastSyncedOn ? new Date(a.lastSyncedOn).getTime() : 0;
        const tB = b.lastSyncedOn ? new Date(b.lastSyncedOn).getTime() : 0;
        return tA - tB;
      },
      renderHeaderCell: () => 'Last Synced On',
      renderCell: (item) => (
        <Text>
          {item.lastSyncedOn
            ? new Date(item.lastSyncedOn).toLocaleString()
            : '-'}
        </Text>
      ),
    }),
    createTableColumn<BlockedConnector>({
      columnId: 'createdOn',
      compare: (a, b) => {
        const tA = a.createdOn ? new Date(a.createdOn).getTime() : 0;
        const tB = b.createdOn ? new Date(b.createdOn).getTime() : 0;
        return tA - tB;
      },
      renderHeaderCell: () => 'Created On',
      renderCell: (item) => (
        <Text>
          {item.createdOn
            ? new Date(item.createdOn).toLocaleString()
            : '-'}
        </Text>
      ),
    }),
  ], [styles.monospace, styles.nameLink]);

  return (
    <div className={layoutStyles.pageContainer}>
      <PowerShieldBreadcrumb segments={[{ label: 'Blocked Connectors' }]} />

      <div className={styles.header}>
        <Text as="h1" size={700} weight="semibold">Blocked Connectors</Text>
        <Text className={styles.subtitle}>
          Manage the list of connectors and publishers that are restricted from being selected by makers during policy requests.
          Blocked items will appear as non-selectable in the connector selection step, helping enforce your organization's governance and compliance standards.
        </Text>
      </div>

      <MessageBar intent="info">
        <MessageBarBody>
          Changes to blocked connectors take effect during the next daily connector sync.
          To expedite, open the connector in the <strong>Connectors</strong> table and update the <strong>Risk Level</strong> field manually.
        </MessageBarBody>
      </MessageBar>

      <div className={toolbarStyles.toolbarWrap}>
        <Button
          appearance="primary"
          icon={<Add20Regular />}
          onClick={() => { setEditItem(null); setIsCreateOpen(true); }}
        >
          Add
        </Button>
        <Input
          className={styles.searchInput}
          contentBefore={<SearchRegular />}
          placeholder="Search by name..."
          value={searchTerm}
          onChange={(_, data) => handleSearchChange(data.value)}
        />
        <Button
          appearance="subtle"
          icon={<ArrowClockwise20Regular />}
          onClick={() => void fetchData()}
          disabled={isLoading}
          aria-label="Refresh"
        >
          Refresh
        </Button>
        {items.length > 0 && (
          <Text size={200} className={styles.subtitle}>
            {totalFilteredCount} {totalFilteredCount === 1 ? 'connector' : 'connectors'}
          </Text>
        )}
      </div>

      {error && (
        <Text className={styles.errorText}>{error}</Text>
      )}

      {isLoading ? (
        <div className={styles.loadingContainer}>
          <Spinner label="Loading blocked connectors..." />
        </div>
      ) : filtered.length === 0 ? (
        <MessageBar>
          <MessageBarBody>
            {searchTerm.trim()
              ? `No blocked connectors match "${searchTerm}".`
              : 'No blocked connectors found.'}
          </MessageBarBody>
        </MessageBar>
      ) : (
        <div className={tableStyles.tableShell}>
          <DataGrid
            items={paged}
            columns={columns}
            columnSizingOptions={columnSizingOptions}
            resizableColumns
            sortable
            defaultSortState={{ sortColumn: 'name', sortDirection: 'ascending' }}
            getRowId={(item) => item.id}
            focusMode="composite"
          >
            <DataGridHeader>
              <DataGridRow>
                {({ renderHeaderCell }) => (
                  <DataGridHeaderCell className={styles.headerCell}>{renderHeaderCell()}</DataGridHeaderCell>
                )}
              </DataGridRow>
            </DataGridHeader>
            <DataGridBody<BlockedConnector>>
              {({ item, rowId }) => (
                <DataGridRow<BlockedConnector> key={rowId}>
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
            totalRecords={totalFilteredCount}
            onPageChange={(p) => setCurrentPage(p)}
            onPageSizeChange={(size) => setPageSize(size)}
          />
        </div>
      )}

      <BlockedConnectorDialog
        open={isCreateOpen}
        onClose={() => { setIsCreateOpen(false); setEditItem(null); }}
        onSaved={() => {
          setIsCreateOpen(false);
          setEditItem(null);
          void fetchData();
        }}
        existingItems={items}
        editData={editItem}
      />
    </div>
  );
}
