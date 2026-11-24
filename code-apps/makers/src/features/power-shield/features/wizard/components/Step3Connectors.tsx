import { useState, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from '../../../shared/hooks/useNavigate';
import {
  makeStyles,
  tokens,
  Text,
  Button,
  Input,
  Combobox,
  Dropdown,
  Option,
  Link,
  Tooltip,
  Spinner,
  Badge,
  TabList,
  Tab,
  DataGrid,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridBody,
  DataGridRow,
  DataGridCell,
  DataGridSelectionCell,
  createTableColumn,
} from '@fluentui/react-components';
import type {
  OnSelectionChangeData,
  SelectTabData,
  SelectTabEvent,
  TableColumnDefinition,
  TableRowId,
} from '@fluentui/react-components';
import {
  SearchRegular,
  ArrowLeft20Regular,
  ArrowRight20Regular,
  Info16Regular,
  Add20Regular,
  PlugConnected20Regular,
  FilterDismiss20Regular,
} from '@fluentui/react-icons';
import { useWizard } from './WizardShell';
import { CancelWizardDialog } from './CancelWizardDialog';
import { SaveDraftButton } from './SaveDraftButton';
import { ConnectorActionsDialog } from './ConnectorActionsDialog';
import { CustomConnectorPatternsDialog } from './CustomConnectorPatternsDialog';
import { ConfirmConnectorsDialog } from './ConfirmConnectorsDialog';
import { useConnectorSearch } from '../hooks/useConnectors';
import type { ConnectorSearchParams } from '../hooks/useConnectors';
import type { Connector, RiskLevel } from '../../../models/connector';
import type { WizardSelectedConnector, WizardCustomConnectorPattern } from '../contexts/wizardTypes';
import type { ActionOverrideMap } from '../../../models/connectorAction';
import { getConnectorActions } from '../../../shared/services/dataverse/connectorActionsService';
import { useNotify } from '../../../shared/hooks/useNotify';
import { useToolbarStyles } from '../../../shared/styles';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
  },
  filterControl: {
    minWidth: '130px',
    maxWidth: '160px',
    flex: '1 1 auto',
  },
  paginationRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    paddingTop: tokens.spacingVerticalS,
  },
  navRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    paddingTop: tokens.spacingVerticalM,
  },
  navRowGroup: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
    alignItems: 'center',
  },
  connectorCell: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    minWidth: 0,
  },
  connectorIcon: {
    width: '32px',
    height: '32px',
    borderRadius: tokens.borderRadiusSmall,
    objectFit: 'contain',
    flexShrink: 0,
  },
  connectorIconPlaceholder: {
    width: '32px',
    height: '32px',
    borderRadius: tokens.borderRadiusSmall,
    backgroundColor: tokens.colorNeutralBackground3,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    color: tokens.colorNeutralForeground3,
  },
  connectorInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
    minWidth: 0,
  },
  connectorName: {
    fontWeight: tokens.fontWeightSemibold,
    display: '-webkit-box',
    WebkitLineClamp: '2',
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  connectorMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    flexWrap: 'wrap',
  },
  descriptionCell: {
    display: '-webkit-box',
    WebkitLineClamp: '3',
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    color: tokens.colorNeutralForeground2,
    fontSize: tokens.fontSizeBase200,
  },
  searchingOverlay: {
    display: 'flex',
    justifyContent: 'center',
    padding: tokens.spacingVerticalXXL,
  },
  filterHint: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    paddingLeft: tokens.spacingHorizontalS,
    borderLeftWidth: '2px',
    borderLeftStyle: 'solid',
    borderLeftColor: tokens.colorBrandForeground1,
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
  },
  blockedRow: {
    opacity: '0.6',
    pointerEvents: 'none',
    cursor: 'not-allowed',
  },
  dataGrid: {
    '& [role="row"]': {
      borderBottomWidth: tokens.strokeWidthThin,
      borderBottomStyle: 'solid',
      borderBottomColor: tokens.colorNeutralStroke2,
    },
  },
  searchPanel: {
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusMedium,
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalL}`,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  toolbarActions: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  scrollContainer: {
    maxHeight: 'calc(100vh - 420px)',
    minHeight: '200px',
    overflowY: 'auto',
    position: 'relative',
  },
  stickyHeader: {
    position: 'sticky' as const,
    top: 0,
    zIndex: 1,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  guidanceHint: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    paddingLeft: tokens.spacingHorizontalS,
    borderLeftWidth: '2px',
    borderLeftStyle: 'solid',
    borderLeftColor: tokens.colorBrandForeground1,
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
  },
  headerCell: {
    fontWeight: tokens.fontWeightSemibold,
  },
});

const RISK_BADGE_COLOR: Record<RiskLevel, 'danger' | 'warning' | 'success' | 'important' | 'subtle'> = {
  High: 'danger',
  Medium: 'warning',
  Low: 'success',
  'No Risk': 'success',
  None: 'subtle',
};

function RiskBadge({ level }: { level: RiskLevel | undefined }) {
  if (!level || level === 'None') return null;
  return (
    <Badge color={RISK_BADGE_COLOR[level]} appearance="tint" size="small">
      {level}
    </Badge>
  );
}

function ConnectorCell({ item }: { item: Connector }) {
  const styles = useStyles();
  const [imgError, setImgError] = useState(false);
  const showPlaceholder = !item.iconUrl || imgError;
  return (
    <div className={styles.connectorCell}>
      {showPlaceholder ? (
        <span className={styles.connectorIconPlaceholder}>
          <PlugConnected20Regular fontSize={16} />
        </span>
      ) : (
        <img
          src={item.iconUrl}
          alt=""
          className={styles.connectorIcon}
          onError={() => setImgError(true)}
        />
      )}
      <div className={styles.connectorInfo}>
        <Text className={styles.connectorName}>{item.displayName}</Text>
        <div className={styles.connectorMeta}>
          {item.publisher && (
            <Text size={100} style={{ color: tokens.colorNeutralForeground3 }}>
              {item.publisher}
            </Text>
          )}
          {item.isPremium && (
            <Badge color="brand" appearance="tint" size="small">Premium</Badge>
          )}
          {item.releaseTag === 'Preview' && (
            <Badge color="informative" appearance="tint" size="small">Preview</Badge>
          )}
          {item.blockedByAdmin && (
            <Badge color="danger" appearance="filled" size="small">Blocked by Admin</Badge>
          )}
        </div>
        {item.connectorDetailsUrl && (
          <Link
            href={item.connectorDetailsUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Text size={200}>View Connector Details</Text>
          </Link>
        )}
      </div>
    </div>
  );
}

export function Step3Connectors() {
  const styles = useStyles();
  const toolbarStyles = useToolbarStyles();
  const navigate = useNavigate();
  const { state, dispatch } = useWizard();

  const {
    publishers,
    results,
    hasMore,
    currentPage: currentPageIndex,
    isLoading,
    activeParams,
    search,
    nextPage,
    prevPage,
  } = useConnectorSearch();

  // "Pending" form state — not applied to Dataverse until Search is clicked
  const [pendingSearchTerm, setPendingSearchTerm] = useState('');
  const [pendingPublisher, setPendingPublisher] = useState('');
  const [pendingPremium, setPendingPremium] = useState<'all' | 'premium' | 'standard'>('all');
  const [pendingRelease, setPendingRelease] = useState<'all' | 'Production' | 'Preview'>('all');
  const [pendingRiskLevel, setPendingRiskLevel] = useState<'all' | 'No Risk' | 'High' | 'Medium' | 'Low' | 'None'>('all');
  const [blockedFilter, setBlockedFilter] = useState<'all' | 'available' | 'blocked'>('available');

  const [actionsConnector, setActionsConnector] = useState<Connector | null>(null);
  const actionsDialogTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [customPatternsOpen, setCustomPatternsOpen] = useState(false);
  const customPatternsTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [isPopulatingOverrides, setIsPopulatingOverrides] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const { notifyError } = useNotify();

  const handleBlockedFilterChange = useCallback((value: 'all' | 'available' | 'blocked') => {
    setBlockedFilter(value);
    search({
      searchTerm: pendingSearchTerm || undefined,
      publisher: pendingPublisher || undefined,
      isPremium: pendingPremium,
      releaseTag: pendingRelease,
      riskLevel: pendingRiskLevel,
      blockedFilter: value,
    });
  }, [pendingSearchTerm, pendingPublisher, pendingPremium, pendingRelease, pendingRiskLevel, search]);

  const columnSizingOptions = useMemo(() => ({
    connector: { minWidth: 280, defaultWidth: 320 },
    riskLevel: { minWidth: 100, defaultWidth: 120 },
    description: { minWidth: 200, defaultWidth: 600 },
    actions: { minWidth: 180, defaultWidth: 200 },
  }), []);

  const columns: TableColumnDefinition<Connector>[] = useMemo(() => [
    createTableColumn<Connector>({
      columnId: 'connector',
      renderHeaderCell: () => 'Connector',
      renderCell: (item) => <ConnectorCell item={item} />,
    }),
    createTableColumn<Connector>({
      columnId: 'riskLevel',
      renderHeaderCell: () => 'Risk Level',
      renderCell: (item) => <RiskBadge level={item.riskLevel} />,
    }),
    createTableColumn<Connector>({
      columnId: 'description',
      renderHeaderCell: () => 'Description',
      renderCell: (item) => {
        const desc = item.description ?? '-';
        const isTruncated = desc.length > 100;
        const display = isTruncated ? `${desc.slice(0, 100)}...` : desc;
        return isTruncated ? (
          <Tooltip content={desc} relationship="description" withArrow>
            <span className={styles.descriptionCell}>{display}</span>
          </Tooltip>
        ) : (
          <span className={styles.descriptionCell}>{display}</span>
        );
      },
    }),
    createTableColumn<Connector>({
      columnId: 'actions',
      renderHeaderCell: () => 'Actions',
      renderCell: (item) => {
        const count = item.actionCount ?? 0;
        return (
          <Link
            as="button"
            ref={(el: HTMLButtonElement | null) => { actionsDialogTriggerRef.current = el; }}
            onClick={(e) => {
              e.stopPropagation();
              // Auto-select the connector if not already selected and not blocked
              if (!item.blockedByAdmin && !state.selectedConnectors.some(c => c.connectorId === item.id)) {
                dispatch({
                  type: 'SET_CONNECTORS',
                  payload: [...state.selectedConnectors, {
                    connectorId: item.id,
                    displayName: item.displayName,
                    connectorKey: item.connectorKey ?? '',
                    connectorDetailsUrl: item.connectorDetailsUrl,
                    connectorName: item.connectorName,
                  }],
                });
              }
              setActionsConnector(item);
            }}
          >
            <Text size={200}>View Connector Actions{count > 0 ? ` (${count})` : ''}</Text>
          </Link>
        );
      },
    }),
  ], [styles.descriptionCell, state.selectedConnectors, dispatch]);

  // IDs of connectors blocked by admin — these rows are non-selectable
  const blockedIds = useMemo(() => new Set(results.filter(c => c.blockedByAdmin).map(c => c.id)), [results]);

  // Selected IDs to show checkmarks for — only items in the current page that are globally selected (never blocked)
  const pageSelectedIds = useMemo(() => {
    const wizardIds = new Set(state.selectedConnectors.map(c => c.connectorId));
    return new Set(results.filter(c => wizardIds.has(c.id) && !c.blockedByAdmin).map(c => c.id));
  }, [results, state.selectedConnectors]);

  const handleSearch = useCallback(() => {
    const params: ConnectorSearchParams = {
      searchTerm: pendingSearchTerm || undefined,
      publisher: pendingPublisher || undefined,
      isPremium: pendingPremium,
      releaseTag: pendingRelease,
      riskLevel: pendingRiskLevel,
      blockedFilter,
    };
    search(params);
  }, [pendingSearchTerm, pendingPublisher, pendingPremium, pendingRelease, pendingRiskLevel, blockedFilter, search]);

  function handleSearchKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSearch();
  }

  function handleClear() {
    setPendingSearchTerm('');
    setPendingPublisher('');
    setPendingPremium('all');
    setPendingRelease('all');
    setPendingRiskLevel('all');
    setBlockedFilter('available');
    search({ blockedFilter: 'available' });
  }

  // True when the user has changed a filter but hasn't clicked Search yet
  const hasPendingChanges =
    pendingSearchTerm !== (activeParams.searchTerm ?? '') ||
    pendingPublisher  !== (activeParams.publisher  ?? '') ||
    pendingPremium    !== (activeParams.isPremium   ?? 'all') ||
    pendingRelease    !== (activeParams.releaseTag  ?? 'all') ||
    pendingRiskLevel  !== (activeParams.riskLevel   ?? 'all');

  // True when any filter is set (pending or applied) — controls Clear button visibility
  const hasAnyFilter = !!(
    pendingSearchTerm || pendingPublisher ||
    pendingPremium !== 'all' || pendingRelease !== 'all' || pendingRiskLevel !== 'all' ||
    blockedFilter !== 'available' ||
    activeParams.searchTerm || activeParams.publisher ||
    (activeParams.isPremium && activeParams.isPremium !== 'all') ||
    (activeParams.releaseTag && activeParams.releaseTag !== 'all') ||
    (activeParams.riskLevel && activeParams.riskLevel !== 'all') ||
    activeParams.blockedFilter && activeParams.blockedFilter !== 'available'
  );

  function handleSelectionChange(_: unknown, data: OnSelectionChangeData) {
    // Strip any blocked connectors that the DataGrid may have included (e.g. select-all)
    const newPageIds = new Set([...(data.selectedItems as Set<TableRowId>)].filter(id => !blockedIds.has(id as string)));
    const currentPageIds = new Set(results.map(c => c.id));

    // Clone existing global selections (cross-page selections are preserved)
    const allSelected = new Map<string, WizardSelectedConnector>(
      state.selectedConnectors.map(c => [c.connectorId, c])
    );

    // Remove items de-selected on the current page
    currentPageIds.forEach(id => {
      if (!newPageIds.has(id)) allSelected.delete(id as string);
    });

    // Add newly selected items with their metadata
    newPageIds.forEach(id => {
      if (!allSelected.has(id as string)) {
        const conn = results.find(c => c.id === id);
        allSelected.set(id as string, {
          connectorId: id as string,
          displayName: conn?.displayName ?? (id as string),
          connectorKey: conn?.connectorKey ?? '',
          connectorDetailsUrl: conn?.connectorDetailsUrl,
          connectorName: conn?.connectorName,
        });
      }
    });

    dispatch({ type: 'SET_CONNECTORS', payload: Array.from(allSelected.values()) });
  }

  async function handleNext() {
    if (state.selectedConnectors.length === 0) return;

    // Auto-populate action overrides for connectors that the maker never opened the Actions dialog for
    const connectorsWithoutOverrides = state.selectedConnectors.filter(
      (c) => !state.connectorActionOverrides[c.connectorId] || Object.keys(state.connectorActionOverrides[c.connectorId]).length === 0,
    );

    if (connectorsWithoutOverrides.length > 0) {
      setIsPopulatingOverrides(true);
      try {
        const results = await Promise.allSettled(
          connectorsWithoutOverrides.map(async (c) => {
            const actions = await getConnectorActions(c.connectorId);
            const overrides: ActionOverrideMap = {};
            for (const a of actions) {
              if (a.actionStatus === 'Allow' || a.actionStatus === 'Block') {
                overrides[a.actionKey] = a.blockedByAdmin ? 'Block' : 'Allow';
              }
            }
            return { connectorId: c.connectorId, overrides };
          }),
        );

        for (const result of results) {
          if (result.status === 'fulfilled') {
            dispatch({ type: 'SET_CONNECTOR_ACTION_OVERRIDES', payload: result.value });
          }
        }

        const failCount = results.filter((r) => r.status === 'rejected').length;
        if (failCount > 0) {
          notifyError(`Failed to fetch actions for ${failCount} connector${failCount > 1 ? 's' : ''}. You can set them manually via "View Connector Actions".`);
        }
      } finally {
        setIsPopulatingOverrides(false);
      }
    }

    setConfirmDialogOpen(true);
  }

  function proceedToNextStep() {
    setConfirmDialogOpen(false);
    dispatch({ type: 'ADVANCE_STEP', payload: 3 });
    navigate('/new-request/justification');
  }

  const currentPage = currentPageIndex + 1;
  const showPagination = currentPageIndex > 0 || hasMore;
  const hasActiveFilters = !!(
    activeParams.searchTerm ||
    activeParams.publisher ||
    (activeParams.isPremium && activeParams.isPremium !== 'all') ||
    (activeParams.releaseTag && activeParams.releaseTag !== 'all') ||
    (activeParams.riskLevel && activeParams.riskLevel !== 'all') ||
    (activeParams.blockedFilter && activeParams.blockedFilter !== 'available')
  );

  // Full-page spinneronly on the very first load (no results yet)
  if (isLoading && results.length === 0) {
    return <Spinner label="Loading connectors..." />;
  }

  return (
    <div className={styles.root}>
      <div className={styles.searchPanel}>
        <div className={toolbarStyles.toolbarWrap}>
          <Input
            contentBefore={<SearchRegular />}
            placeholder="Search connectors..."
            value={pendingSearchTerm}
            onChange={(_, data) => setPendingSearchTerm(data.value)}
            onKeyDown={handleSearchKeyDown}
            style={{ minWidth: '200px', flex: '1 1 200px' }}
          />
          <Combobox
            aria-label="Filter by publisher"
            placeholder="All publishers"
            value={pendingPublisher}
            selectedOptions={pendingPublisher ? [pendingPublisher] : []}
            onInput={(e) => setPendingPublisher((e.target as HTMLInputElement).value)}
            onOptionSelect={(_, data) => {
              setPendingPublisher(data.optionValue === '' ? '' : (data.optionValue ?? ''));
            }}
            className={styles.filterControl}
            freeform
          >
            <Option value="" text="All publishers">All publishers</Option>
            {publishers.map(p => (
              <Option key={p} value={p} text={p}>{p}</Option>
            ))}
          </Combobox>
          <Dropdown
            aria-label="Filter by tier"
            placeholder="All tiers"
            value={pendingPremium === 'all' ? 'All tiers' : pendingPremium === 'premium' ? 'Premium' : 'Standard'}
            selectedOptions={[pendingPremium]}
            onOptionSelect={(_, data) => setPendingPremium((data.optionValue ?? 'all') as 'all' | 'premium' | 'standard')}
            className={styles.filterControl}
          >
            <Option value="all">All tiers</Option>
            <Option value="premium">Premium</Option>
            <Option value="standard">Standard</Option>
          </Dropdown>
          <Dropdown
            aria-label="Filter by release"
            placeholder="All releases"
            value={pendingRelease === 'all' ? 'All releases' : pendingRelease}
            selectedOptions={[pendingRelease]}
            onOptionSelect={(_, data) => setPendingRelease((data.optionValue ?? 'all') as 'all' | 'Production' | 'Preview')}
            className={styles.filterControl}
          >
            <Option value="all">All releases</Option>
            <Option value="Production">Production</Option>
            <Option value="Preview">Preview</Option>
          </Dropdown>
          <Dropdown
            aria-label="Filter by risk level"
            placeholder="All risk levels"
            value={pendingRiskLevel === 'all' ? 'All risk levels' : pendingRiskLevel}
            selectedOptions={[pendingRiskLevel]}
            onOptionSelect={(_, data) => setPendingRiskLevel((data.optionValue ?? 'all') as 'all' | 'No Risk' | 'High' | 'Medium' | 'Low' | 'None')}
            className={styles.filterControl}
          >
            <Option value="all">All risk levels</Option>
            <Option value="No Risk">No Risk</Option>
            <Option value="High">High</Option>
            <Option value="Medium">Medium</Option>
            <Option value="Low">Low</Option>
            <Option value="None">None</Option>
          </Dropdown>
          <Button
            appearance="primary"
            icon={<SearchRegular />}
            onClick={handleSearch}
            disabled={isLoading}
            aria-label="Search"
          />
          <Tooltip content="Clear all filters" relationship="label">
            <Button
              appearance="subtle"
              icon={<FilterDismiss20Regular />}
              onClick={handleClear}
              disabled={!hasAnyFilter || isLoading}
              aria-label="Clear all filters"
            />
          </Tooltip>
        </div>
        {hasPendingChanges && (
          <div className={styles.filterHint}>
            <Info16Regular />
            <span>Filters changed - click <strong>Search</strong> to apply</span>
          </div>
        )}
      </div>

      <div className={styles.toolbarActions}>
        <TabList
          selectedValue={blockedFilter}
          onTabSelect={(_: SelectTabEvent, data: SelectTabData) =>
            handleBlockedFilterChange(data.value as 'all' | 'available' | 'blocked')
          }
          aria-label="Filter connectors by availability"
          size="small"
          appearance="filled-circular"
        >
          <Tab value="available">Available</Tab>
          <Tab value="all">All</Tab>
          <Tab value="blocked">Blocked</Tab>
        </TabList>
        <Tooltip
          content="Define URL patterns to classify custom connectors into DLP data groups"
          relationship="description"
        >
          <Button
            ref={customPatternsTriggerRef}
            appearance="outline"
            size="small"
            icon={<Add20Regular />}
            onClick={() => setCustomPatternsOpen(true)}
            style={{ flexShrink: 0, borderColor: tokens.colorBrandStroke1, color: tokens.colorBrandForeground1 }}
          >
            Add Custom Connectors ({state.customConnectorPatterns.length})
          </Button>
        </Tooltip>
      </div>

      <div className={styles.guidanceHint}>
        <Info16Regular />
        {state.selectedConnectors.length === 0 ? (
          <span>0 connectors selected</span>
        ) : (
          <span>
            <strong>{state.selectedConnectors.length}</strong> connector{state.selectedConnectors.length !== 1 ? 's' : ''} selected - click <strong>Next</strong> to continue
          </span>
        )}
      </div>

      {isLoading ? (
        <div className={styles.searchingOverlay}>
          <Spinner label="Searching..." />
        </div>
      ) : results.length === 0 ? (
        <Text style={{ color: tokens.colorNeutralForeground3 }}>
          {hasActiveFilters
            ? 'No connectors match the current filters.'
            : 'No connectors found.'}
        </Text>
      ) : (
        <div className={styles.scrollContainer}>
          <DataGrid
            items={results}
            columns={columns}
            columnSizingOptions={columnSizingOptions}
            resizableColumns
            selectionMode="multiselect"
            selectedItems={pageSelectedIds}
            onSelectionChange={handleSelectionChange}
            getRowId={(item) => item.id}
            className={styles.dataGrid}
          >
            <DataGridHeader className={styles.stickyHeader}>
              <DataGridRow selectionCell={<DataGridSelectionCell />}>
                {({ renderHeaderCell }) => (
                  <DataGridHeaderCell className={styles.headerCell}>{renderHeaderCell()}</DataGridHeaderCell>
                )}
              </DataGridRow>
            </DataGridHeader>
            <DataGridBody<Connector>>
              {({ item, rowId }) => (
                <DataGridRow<Connector>
                  key={rowId}
                  className={item.blockedByAdmin ? styles.blockedRow : undefined}
                  selectionCell={
                    item.blockedByAdmin ? (
                      <Tooltip content="This connector is blocked by an admin and cannot be requested" relationship="description">
                        <DataGridSelectionCell tabIndex={-1} />
                      </Tooltip>
                    ) : (
                      <DataGridSelectionCell />
                    )
                  }
                >
                  {({ renderCell }) => (
                    <DataGridCell>{renderCell(item)}</DataGridCell>
                  )}
                </DataGridRow>
              )}
            </DataGridBody>
          </DataGrid>
        </div>
      )}

      {showPagination && (
        <div className={styles.paginationRow}>
          <Button
            appearance="subtle"
            size="small"
            disabled={currentPageIndex === 0 || isLoading}
            icon={<ArrowLeft20Regular />}
            onClick={prevPage}
          >
            Prev
          </Button>
          <Text size={200}>Page {currentPage}</Text>
          <Button
            appearance="subtle"
            size="small"
            disabled={!hasMore || isLoading}
            icon={<ArrowRight20Regular />}
            iconPosition="after"
            onClick={nextPage}
          >
            Next
          </Button>
        </div>
      )}

      <div className={styles.navRow}>
        <div className={styles.navRowGroup}>
          <Button
            appearance="secondary"
            onClick={() => navigate(state.hasQuestionnaire === false ? '/new-request/environment' : '/new-request/questionnaire')}
            icon={<ArrowLeft20Regular />}
          >
            Back
          </Button>
          <CancelWizardDialog />
        </div>
        <div className={styles.navRowGroup}>
          <SaveDraftButton />
          <Button
            appearance="primary"
            onClick={handleNext}
            disabled={state.selectedConnectors.length === 0 || isPopulatingOverrides}
            icon={isPopulatingOverrides ? <Spinner size="tiny" /> : <ArrowRight20Regular />}
            iconPosition="after"
          >
            {isPopulatingOverrides ? 'Loading actions...' : 'Next'}
          </Button>
        </div>
      </div>

      <ConnectorActionsDialog
        connector={actionsConnector}
        open={actionsConnector !== null}
        onClose={() => {
          setActionsConnector(null);
          // Restore focus without scrolling to prevent scroll-jump when dialog closes
          requestAnimationFrame(() => {
            actionsDialogTriggerRef.current?.focus({ preventScroll: true });
          });
        }}
        initialOverrides={actionsConnector ? (state.connectorActionOverrides[actionsConnector.id] ?? {}) : {}}
        onSave={(overrides) => {
          if (actionsConnector) {
            dispatch({ type: 'SET_CONNECTOR_ACTION_OVERRIDES', payload: { connectorId: actionsConnector.id, overrides } });
          }
        }}
      />

      <CustomConnectorPatternsDialog
        open={customPatternsOpen}
        onClose={() => {
          setCustomPatternsOpen(false);
          requestAnimationFrame(() => {
            customPatternsTriggerRef.current?.focus({ preventScroll: true });
          });
        }}
        patterns={state.customConnectorPatterns}
        onSave={(updated: WizardCustomConnectorPattern[]) => {
          dispatch({ type: 'SET_CUSTOM_CONNECTOR_PATTERNS', payload: updated });
          setCustomPatternsOpen(false);
          requestAnimationFrame(() => {
            customPatternsTriggerRef.current?.focus({ preventScroll: true });
          });
        }}
      />

      <ConfirmConnectorsDialog
        open={confirmDialogOpen}
        onConfirm={proceedToNextStep}
        onCancel={() => setConfirmDialogOpen(false)}
        selectedConnectors={state.selectedConnectors}
        connectorActionOverrides={state.connectorActionOverrides}
        customConnectorPatterns={state.customConnectorPatterns}
      />
    </div>
  );
}
