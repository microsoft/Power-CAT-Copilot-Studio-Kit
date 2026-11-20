import { useState, useEffect, useMemo, useCallback } from 'react';
import { PowerShieldBreadcrumb } from '../../../shared/components/PowerShieldBreadcrumb';
import {
  makeStyles,
  tokens,
  Text,
  Button,
  Input,
  Spinner,
  Tooltip,
  DataGrid,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridBody,
  DataGridRow,
  DataGridCell,
  createTableColumn,
  MessageBar,
  MessageBarBody,
  Badge,
} from '@fluentui/react-components';
import type { TableColumnDefinition } from '@fluentui/react-components';
import {
  SearchRegular,
} from '@fluentui/react-icons';
import { PaginationBar } from '../../../shared/components/PaginationBar';
import { useAuth } from '../../../shared/contexts/AuthContext';
import { useNotify } from '../../../shared/hooks/useNotify';
import { useLayoutStyles, useTableStyles, useToolbarStyles } from '../../../shared/styles';
import {
  getServiceTreesForUser,
} from '../../../shared/services/dataverse/serviceTreeService';
import { getContainerCountsByServiceTreeIds } from '../../../shared/services/dataverse/environmentGroupService';
import { ServiceTreeWizardModal } from '../components/ServiceTreeWizardModal';
import { useEligibleEnvironments } from '../../wizard/hooks/useEligibleEnvironments';
import { ServiceTreeDetailView } from '../components/ServiceTreeDetailView';
import { ServiceTreeTour } from '../components/ServiceTreeTour';
import type { ServiceTree } from '../../../models/serviceTree';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_PAGE_SIZE = 5;
const PAGE_SIZE_OPTIONS = [5, 10, 20] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Drill-down state
// ─────────────────────────────────────────────────────────────────────────────

type DrillDownState =
  | { level: 'list' }
  | { level: 'detail'; serviceTree: ServiceTree };

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const useStyles = makeStyles({
  headerRow: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalM,
  },
  searchInput: {
    flex: '1',
    maxWidth: '360px',
  },
  headerCell: {
    fontWeight: tokens.fontWeightSemibold,
  },
  descriptionCell: {
    maxWidth: '250px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground2,
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
});

// ─────────────────────────────────────────────────────────────────────────────
// ServiceTreeManagementScreen
// ─────────────────────────────────────────────────────────────────────────────

export function ServiceTreeManagementScreen() {
  const styles = useStyles();
  const layoutStyles = useLayoutStyles();
  const tableStyles = useTableStyles();
  const toolbarStyles = useToolbarStyles();
  const auth = useAuth();
  const { notifyError } = useNotify();
  const { environments } = useEligibleEnvironments();

  const [drillDown, setDrillDown] = useState<DrillDownState>({ level: 'list' });
  const [serviceTrees, setServiceTrees] = useState<ServiceTree[]>([]);
  const [containerCounts, setContainerCounts] = useState<Map<string, number>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSizeRaw] = useState(DEFAULT_PAGE_SIZE);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const setPageSize = useCallback((size: number) => {
    setPageSizeRaw(size);
    setCurrentPage(1);
  }, []);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  // ── Load service trees + container counts ──
  useEffect(() => {
    void (async () => {
      setIsLoading(true);
      try {
        const data = await getServiceTreesForUser(auth.dvUserId);
        setServiceTrees(data);

        // Fetch container counts in bulk
        if (data.length > 0) {
          const counts = await getContainerCountsByServiceTreeIds(data.map((t) => t.id));
          setContainerCounts(counts);
        } else {
          setContainerCounts(new Map());
        }
      } catch (err) {
        notifyError(err instanceof Error ? err.message : 'Failed to load service trees.');
      } finally {
        setIsLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.dvUserId, refreshKey]);

  const filtered = useMemo(
    () =>
      serviceTrees.filter((t) =>
        !searchTerm || t.name.toLowerCase().includes(searchTerm.toLowerCase()),
      ),
    [serviceTrees, searchTerm],
  );

  const totalFilteredCount = filtered.length;
  const pageCount = Math.max(1, Math.ceil(totalFilteredCount / pageSize));
  const safePage = Math.min(currentPage, pageCount);
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  function handleCreated(serviceTreeId: string, serviceTreeName: string, containerId?: string) {
    setCreateModalOpen(false);
    setServiceTrees((prev) =>
      [...prev, { id: serviceTreeId, name: serviceTreeName }].sort((a, b) => a.name.localeCompare(b.name)),
    );
    // Update container count if a container was created alongside the service tree
    if (containerId) {
      setContainerCounts((prev) => new Map([...prev, [serviceTreeId, 1]]));
    }
  }

  function handleDrillIn(item: ServiceTree) {
    setDrillDown({ level: 'detail', serviceTree: item });
  }

  function handleBackToList() {
    setDrillDown({ level: 'list' });
    refresh();
  }

  function truncate(text: string, maxLen = 40): string {
    return text.length > maxLen ? text.slice(0, maxLen) + '...' : text;
  }

  const columns: TableColumnDefinition<ServiceTree>[] = [
    createTableColumn<ServiceTree>({
      columnId: 'name',
      renderHeaderCell: () => 'Name',
      renderCell: (item) => (
        <DataGridCell>
          <span
            className={styles.nameLink}
            role="button"
            tabIndex={0}
            onClick={() => handleDrillIn(item)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleDrillIn(item); } }}
            aria-label={`Open ${item.name}`}
          >
            {item.name}
          </span>
        </DataGridCell>
      ),
    }),
    createTableColumn<ServiceTree>({
      columnId: 'organization',
      renderHeaderCell: () => 'Organization',
      renderCell: (item) => <DataGridCell>{item.organization ?? '-'}</DataGridCell>,
    }),
    createTableColumn<ServiceTree>({
      columnId: 'description',
      renderHeaderCell: () => 'Description',
      renderCell: (item) => (
        <DataGridCell>
          {item.description ? (
            <Tooltip content={item.description} relationship="label">
              <span className={styles.descriptionCell}>{item.description}</span>
            </Tooltip>
          ) : (
            <span style={{ color: tokens.colorNeutralForeground3 }}>-</span>
          )}
        </DataGridCell>
      ),
    }),
    createTableColumn<ServiceTree>({
      columnId: 'containers',
      renderHeaderCell: () => 'Containers',
      renderCell: (item) => {
        const count = containerCounts.get(item.id) ?? 0;
        return (
          <DataGridCell>
            <Badge
              appearance="tint"
              color={count > 0 ? 'informative' : 'subtle'}
              size="small"
            >
              {count}
            </Badge>
          </DataGridCell>
        );
      },
    }),
  ];

  return (
    <div className={layoutStyles.pageContainer}>
      {/* Breadcrumb navigation */}
      {drillDown.level === 'list' ? (
        <PowerShieldBreadcrumb segments={[{ label: 'Service Trees' }]} />
      ) : (
        <PowerShieldBreadcrumb segments={[
          { label: 'Service Trees', onClick: handleBackToList },
          { label: truncate(drillDown.serviceTree.name) },
        ]} />
      )}

      {/* Header — only show at list level */}
      {drillDown.level === 'list' && (
        <div className={styles.headerRow}>
          <Text as="h1" size={700} weight="semibold">
            Service Trees
          </Text>
          <ServiceTreeTour />
        </div>
      )}

      {/* Level 1 — Service Trees List */}
      {drillDown.level === 'list' && (
        <>
          <div className={toolbarStyles.toolbar}>
            <Input
              className={styles.searchInput}
              contentBefore={<SearchRegular />}
              placeholder="Search by name..."
              value={searchTerm}
              onChange={(_, data) => { setSearchTerm(data.value); setCurrentPage(1); }}
            />
            <Button appearance="primary" onClick={() => setCreateModalOpen(true)}>
              + New Service Tree
            </Button>
          </div>

          {isLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: tokens.spacingVerticalXXL }}>
              <Spinner label="Loading service trees..." />
            </div>
          ) : filtered.length === 0 ? (
            <MessageBar>
              <MessageBarBody>
                {searchTerm
                  ? `No service trees match "${searchTerm}".`
                  : 'No service trees found. Create one to get started.'}
              </MessageBarBody>
            </MessageBar>
          ) : (
            <div className={tableStyles.tableShell}>
              <DataGrid
                items={paged}
                columns={columns}
                getRowId={(item: ServiceTree) => item.id}
                focusMode="composite"
              >
                <DataGridHeader>
                  <DataGridRow>
                    {({ renderHeaderCell }) => (
                      <DataGridHeaderCell className={styles.headerCell}>
                        {renderHeaderCell()}
                      </DataGridHeaderCell>
                    )}
                  </DataGridRow>
                </DataGridHeader>
                <DataGridBody<ServiceTree>>
                  {({ item, rowId }) => (
                    <DataGridRow<ServiceTree> key={rowId}>
                      {({ renderCell }) => renderCell(item)}
                    </DataGridRow>
                  )}
                </DataGridBody>
              </DataGrid>

              {/* Footer — always visible */}
              <PaginationBar
                page={safePage}
                pageCount={pageCount}
                pageSize={pageSize}
                pageSizeOptions={PAGE_SIZE_OPTIONS}
                totalRecords={totalFilteredCount}
                onPageChange={setCurrentPage}
                onPageSizeChange={setPageSize}
              />
            </div>
          )}

          {/* Create wizard modal (create-only, with container step) */}
          <ServiceTreeWizardModal
            open={createModalOpen}
            onClose={() => setCreateModalOpen(false)}
            onCompleted={handleCreated}
            environments={environments}
          />
        </>
      )}

      {/* Level 2 — Service Tree Detail */}
      {drillDown.level === 'detail' && (
        <ServiceTreeDetailView
          serviceTree={drillDown.serviceTree}
          onBack={handleBackToList}
          onDataChanged={refresh}
        />
      )}
    </div>
  );
}
