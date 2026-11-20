import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import {
  makeStyles,
  tokens,
  Text,
  Button,
  SearchBox,
  Spinner,
  MessageBar,
  MessageBarBody,
  MessageBarActions,
  Link,
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
import {
  DocumentRegular,
  AddRegular,
  ChevronLeft20Regular,
  ChevronRight20Regular,
  Edit20Regular,
  Info16Regular,
  PeopleTeam20Regular,
  Globe20Regular,
} from '@fluentui/react-icons';
import type { TableColumnDefinition } from '@fluentui/react-components';
import type { ServiceTree } from '../../models/serviceTree';
import type { EnvironmentGroup } from '../../models/environmentGroup';
import type { PpEnvironment } from '../../models/environment';
import { ServiceTreeWizardModal } from '../../features/service-tree/components/ServiceTreeWizardModal';
import { CreateContainerModal, TypeBadge } from '../../features/wizard/components/CreateContainerModal';
import type { EditContainerData } from '../../features/wizard/components/CreateContainerModal';
import { getGroupMembers } from '../services/dataverse/environmentGroupService';
import { useAuth } from '../hooks/useAuth';
import {
  buildEnvironmentGroupSnapshot,
  type EnvironmentGroupSnapshot,
} from './environmentGroupSnapshot';

export type { EnvironmentGroupSnapshot } from './environmentGroupSnapshot';

const SERVICE_TREE_PAGE_SIZE = 5;
const CONTAINER_PAGE_SIZE = 5;

export interface EnvironmentGroupSelectorProps {
  /** Selected Service Tree (source of truth lives in the wrapper's wizard state). */
  serviceTreeId?: string;
  serviceTreeName?: string;
  /** Selected Environment Group. */
  environmentGroupId?: string;
  environmentGroupName?: string;
  /** Ids of the environments the wrapper has committed for the selected group — drives the preview. */
  selectedEnvironmentIds?: readonly string[];
  /**
   * True when the wrapper already holds a member snapshot for the current group
   * (e.g. a resumed draft). Suppresses the automatic member reload so a draft's
   * confirmation / diff state is not clobbered (spec 018 FR-015/016).
   */
  groupSnapshotLoaded?: boolean;

  /** Service Trees, injected by the wrapper (single source; wrapper owns auto-select). */
  serviceTrees: ServiceTree[];
  serviceTreesLoading?: boolean;
  onRefreshServiceTrees?: () => void | Promise<void>;

  /** Environment Groups for the selected tree, injected by the wrapper. */
  containers: EnvironmentGroup[];
  containersLoading?: boolean;
  loadedForTreeId?: string;
  onRefreshContainers?: (overrideTreeId?: string) => Promise<void>;

  /** Eligible environments — the selector never calls useEligibleEnvironments (FR-012). */
  environments: PpEnvironment[];
  environmentsLoading?: boolean;
  environmentsError?: string;

  /** Fired when the Service Tree selection changes (row click / inline-created). null = cleared. */
  onServiceTreeChange: (tree: { id: string; name: string } | null) => void;
  /** Fired the moment a group is chosen, BEFORE members load. Callers clear the old snapshot + gate Next. */
  onEnvironmentGroupSelectionStarted: (group: { id: string; name: string }) => void;
  /** Fired only after members resolve for the still-current group. */
  onEnvironmentGroupSnapshot: (snapshot: EnvironmentGroupSnapshot) => void;
  /** Optional member-load error surface (wrapper decides how to notify). */
  onMembersError?: (message: string) => void;
  /** True while a member load is in flight (UX only — correctness gating is the cleared snapshot). */
  onLoadingMembersChange?: (loading: boolean) => void;

  /** Field-level validation messages (wrapper owns when to show them). */
  serviceTreeError?: string;
  groupError?: string;
  /** Disable all interaction (e.g. view-only role, or while the wrapper is submitting). */
  disabled?: boolean;
}

const useStyles = makeStyles({
  topRow: {
    display: 'flex',
    gap: tokens.spacingHorizontalXXL,
    flexWrap: 'wrap',
  },
  panel: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    flex: '1 1 45%',
    minWidth: '280px',
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalM}`,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
  },
  requiredStar: {
    color: tokens.colorStatusDangerForeground1,
    marginLeft: tokens.spacingHorizontalXXS,
  },
  labelSubtitle: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    fontWeight: tokens.fontWeightRegular,
  },
  fieldError: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorStatusDangerForeground1,
  },
  search: {
    width: '100%',
  },
  gridBox: {
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    overflow: 'hidden',
    minHeight: '280px',
    display: 'flex',
    flexDirection: 'column',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  toolbarButtons: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
  },
  header: {
    display: 'grid',
    gridTemplateColumns: '32px 1fr 80px',
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  headerCellSmall: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
    display: 'flex',
    alignItems: 'center',
  },
  containerRow: {
    display: 'grid',
    gridTemplateColumns: '32px 1fr 80px',
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
    alignItems: 'center',
    cursor: 'pointer',
    boxShadow: `inset 0 -1px 0 0 ${tokens.colorNeutralStroke2}`,
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground2,
    },
  },
  rowSelected: {
    backgroundColor: tokens.colorBrandBackground2,
    ':hover': {
      backgroundColor: tokens.colorBrandBackground2,
    },
  },
  serviceTreeRow: {
    cursor: 'pointer',
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground2,
    },
  },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacingVerticalS,
    flex: 1,
    color: tokens.colorNeutralForeground3,
    textAlign: 'center',
    padding: `0 ${tokens.spacingHorizontalM}`,
  },
  firstTimeEmpty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacingVerticalM,
    flex: 1,
    color: tokens.colorNeutralForeground3,
    textAlign: 'center',
    padding: `${tokens.spacingVerticalL} ${tokens.spacingHorizontalL}`,
  },
  paginationRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
    borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  paginationButtons: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
  },
  envsSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    marginTop: tokens.spacingVerticalL,
  },
  envsTableBox: {
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    overflow: 'hidden',
    maxHeight: '320px',
    overflowY: 'auto',
  },
  dataGrid: {
    '& [role="row"]': {
      boxShadow: `inset 0 -1px 0 0 ${tokens.colorNeutralStroke2}`,
    },
  },
  headerCell: {
    fontWeight: tokens.fontWeightSemibold,
  },
});

/**
 * Shared, context-free selector for a Service Tree + Environment Group, extracted
 * from the Connector wizard Step 1 so the Credits wizard can reuse the identical
 * experience (spec 018). It owns the two grids, the read-only member preview, and
 * the inline create/edit modals — plus its own search/pagination/modal state and
 * the tokened member-load transaction. It owns NO wizard state, NO navigation,
 * and NO wizard-level banners; those stay in each wrapper.
 */
export function EnvironmentGroupSelector(props: EnvironmentGroupSelectorProps) {
  const {
    serviceTreeId,
    environmentGroupId,
    environmentGroupName,
    selectedEnvironmentIds,
    groupSnapshotLoaded,
    serviceTrees,
    serviceTreesLoading,
    onRefreshServiceTrees,
    containers,
    containersLoading,
    onRefreshContainers,
    environments,
    environmentsLoading,
    environmentsError,
    onServiceTreeChange,
    onEnvironmentGroupSelectionStarted,
    onEnvironmentGroupSnapshot,
    onMembersError,
    onLoadingMembersChange,
    serviceTreeError,
    groupError,
    disabled,
  } = props;

  const styles = useStyles();
  const auth = useAuth();

  const [serviceTreeSearch, setServiceTreeSearch] = useState('');
  const [groupSearch, setGroupSearch] = useState('');
  const [serviceTreePage, setServiceTreePage] = useState(1);
  const [groupPage, setGroupPage] = useState(1);

  const [createServiceTreeOpen, setCreateServiceTreeOpen] = useState(false);
  const [createContainerOpen, setCreateContainerOpen] = useState(false);
  const [editContainerData, setEditContainerData] = useState<EditContainerData | undefined>(undefined);

  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [unavailableCount, setUnavailableCount] = useState(0);

  // Monotonic token so a slow member load can't overwrite a newer selection.
  const memberTokenRef = useRef(0);
  // Group id we have already loaded (or that arrived pre-loaded), so the effect
  // does not re-enter for the same group.
  const loadedGroupRef = useRef<string | undefined>(undefined);
  // Last selected tree/group we auto-paged to — keyed by id, never a lifetime bool.
  const pagedTreeRef = useRef<string | undefined>(undefined);
  const pagedGroupRef = useRef<string | undefined>(undefined);
  // Forces a same-id member reload (e.g. after editing the currently selected
  // group) when environmentGroupId itself does not change.
  const [reloadNonce, setReloadNonce] = useState(0);

  const isFirstTimeUser = !serviceTreesLoading && serviceTrees.length === 0;

  const setLoading = useCallback(
    (v: boolean) => {
      setIsLoadingMembers(v);
      onLoadingMembersChange?.(v);
    },
    [onLoadingMembersChange],
  );

  // ── Member-load transaction ────────────────────────────────────────────────
  // Single path for user clicks, inline-create selection, and wrapper auto-select:
  // all commit `environmentGroupId`, and this effect loads members + emits the
  // canonical snapshot, discarding stale responses via a token (FR-009/013).
  useEffect(() => {
    if (!environmentGroupId) {
      // Discard any in-flight member load: the group/tree was cleared and its
      // response must never commit a stale snapshot (FR-009/013).
      memberTokenRef.current++;
      loadedGroupRef.current = undefined;
      return;
    }
    // Wrapper already has a snapshot for this group (resumed draft): don't reload,
    // but still discard any in-flight load from a previously selected group.
    if (groupSnapshotLoaded) {
      memberTokenRef.current++;
      loadedGroupRef.current = environmentGroupId;
      return;
    }
    if (loadedGroupRef.current === environmentGroupId) return;

    const token = ++memberTokenRef.current;
    const groupId = environmentGroupId;
    const groupName =
      environmentGroupName ?? containers.find((c) => c.id === groupId)?.name ?? '';
    loadedGroupRef.current = groupId;
    setLoading(true);

    void (async () => {
      try {
        const members = await getGroupMembers(groupId);
        if (token !== memberTokenRef.current) return; // superseded — discard
        const snapshot = buildEnvironmentGroupSnapshot(
          { id: groupId, name: groupName },
          members,
          environments,
        );
        setUnavailableCount(snapshot.unavailableMemberCount);
        onEnvironmentGroupSnapshot(snapshot);
      } catch (err) {
        if (token !== memberTokenRef.current) return;
        // Allow a retry of the same group after a failure.
        loadedGroupRef.current = undefined;
        onMembersError?.(
          err instanceof Error ? err.message : 'Failed to load group environments.',
        );
      } finally {
        if (token === memberTokenRef.current) setLoading(false);
      }
    })();
    // environments is intentionally excluded: a late eligible-environments refresh
    // must not re-run a load for an already-loaded group. The snapshot uses the
    // environments available when the group was chosen; a tree/group change (which
    // is what should re-run this) updates environmentGroupId.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [environmentGroupId, groupSnapshotLoaded, reloadNonce]);

  // Invalidate any in-flight member load on unmount.
  useEffect(() => () => {
    memberTokenRef.current++;
  }, []);

  // ── Service Tree grid: filter + paginate ────────────────────────────────────
  const filteredServiceTrees = useMemo(() => {
    if (!serviceTreeSearch.trim()) return serviceTrees;
    const q = serviceTreeSearch.toLowerCase();
    return serviceTrees.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.organization ?? '').toLowerCase().includes(q),
    );
  }, [serviceTrees, serviceTreeSearch]);

  const serviceTreeTotalPages = Math.max(
    1,
    Math.ceil(filteredServiceTrees.length / SERVICE_TREE_PAGE_SIZE),
  );
  const pagedServiceTrees = useMemo(
    () =>
      filteredServiceTrees.slice(
        (serviceTreePage - 1) * SERVICE_TREE_PAGE_SIZE,
        serviceTreePage * SERVICE_TREE_PAGE_SIZE,
      ),
    [filteredServiceTrees, serviceTreePage],
  );

  // ── Environment Group grid: filter + paginate ───────────────────────────────
  const filteredContainers = useMemo(() => {
    if (!groupSearch.trim()) return containers;
    const q = groupSearch.toLowerCase();
    return containers.filter((c) => c.name.toLowerCase().includes(q));
  }, [containers, groupSearch]);

  const groupTotalPages = Math.max(1, Math.ceil(filteredContainers.length / CONTAINER_PAGE_SIZE));
  const pagedContainers = useMemo(
    () =>
      filteredContainers.slice(
        (groupPage - 1) * CONTAINER_PAGE_SIZE,
        groupPage * CONTAINER_PAGE_SIZE,
      ),
    [filteredContainers, groupPage],
  );

  // Clamp pages after a filtered list shrinks (FR-016).
  useEffect(() => {
    if (serviceTreePage > serviceTreeTotalPages) setServiceTreePage(serviceTreeTotalPages);
  }, [serviceTreePage, serviceTreeTotalPages]);
  useEffect(() => {
    if (groupPage > groupTotalPages) setGroupPage(groupTotalPages);
  }, [groupPage, groupTotalPages]);

  // Reset group search + page whenever the selected tree changes (FR-016).
  useEffect(() => {
    setGroupSearch('');
    setGroupPage(1);
  }, [serviceTreeId]);

  // Auto-page to the selected tree, keyed by its id (draft/template resume) (FR-016).
  useEffect(() => {
    if (!serviceTreeId || serviceTreesLoading || serviceTrees.length === 0) return;
    if (pagedTreeRef.current === serviceTreeId) return;
    const idx = serviceTrees.findIndex((t) => t.id === serviceTreeId);
    if (idx >= 0) setServiceTreePage(Math.floor(idx / SERVICE_TREE_PAGE_SIZE) + 1);
    pagedTreeRef.current = serviceTreeId;
  }, [serviceTreeId, serviceTreesLoading, serviceTrees]);

  // Auto-page to the selected group, keyed by its id (FR-016).
  useEffect(() => {
    if (!environmentGroupId || containersLoading || filteredContainers.length === 0) return;
    if (pagedGroupRef.current === environmentGroupId) return;
    const idx = filteredContainers.findIndex((c) => c.id === environmentGroupId);
    if (idx >= 0) setGroupPage(Math.floor(idx / CONTAINER_PAGE_SIZE) + 1);
    pagedGroupRef.current = environmentGroupId;
  }, [environmentGroupId, containersLoading, filteredContainers]);

  // ── Read-only member preview (derived from committed ids + eligible envs) ────
  const previewEnvs = useMemo<PpEnvironment[]>(() => {
    if (!selectedEnvironmentIds || selectedEnvironmentIds.length === 0) return [];
    const ids = new Set(selectedEnvironmentIds);
    return environments.filter((e) => ids.has(e.name));
  }, [selectedEnvironmentIds, environments]);

  const envColumns: TableColumnDefinition<PpEnvironment>[] = useMemo(
    () => [
      createTableColumn<PpEnvironment>({
        columnId: 'displayName',
        renderHeaderCell: () => 'Display Name',
        renderCell: (item) => item.displayName,
      }),
      createTableColumn<PpEnvironment>({
        columnId: 'type',
        renderHeaderCell: () => 'Type',
        renderCell: (item) => <TypeBadge type={item.environmentSku} />,
      }),
      createTableColumn<PpEnvironment>({
        columnId: 'location',
        renderHeaderCell: () => 'Location',
        renderCell: (item) => item.location,
      }),
    ],
    [],
  );

  const serviceTreeColumns: TableColumnDefinition<ServiceTree>[] = useMemo(
    () => [
      createTableColumn<ServiceTree>({
        columnId: 'radio',
        renderHeaderCell: () => '',
        renderCell: (item) => (
          <input
            type="radio"
            checked={serviceTreeId === item.id}
            onChange={() => handleServiceTreeRowClick(item)}
            onClick={(e) => e.stopPropagation()}
            disabled={disabled}
            aria-label={`Select service tree ${item.name}`}
            style={{ accentColor: tokens.colorBrandBackground, cursor: 'pointer' }}
          />
        ),
      }),
      createTableColumn<ServiceTree>({
        columnId: 'name',
        compare: (a, b) => a.name.localeCompare(b.name),
        renderHeaderCell: () => 'Name',
        renderCell: (item) => <Text truncate>{item.name}</Text>,
      }),
      createTableColumn<ServiceTree>({
        columnId: 'organization',
        compare: (a, b) => (a.organization ?? '').localeCompare(b.organization ?? ''),
        renderHeaderCell: () => 'Organization',
        renderCell: (item) => <Text truncate>{item.organization ?? '-'}</Text>,
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [serviceTreeId, disabled],
  );

  // Owner gate for Edit — only the owner may edit a group. UPNs are case-insensitive.
  const selectedContainer = environmentGroupId
    ? containers.find((c) => c.id === environmentGroupId)
    : undefined;
  const isContainerOwner =
    !!selectedContainer &&
    (selectedContainer.ownerUpn ?? '').trim().toLowerCase() ===
      (auth.upn ?? '').trim().toLowerCase();
  const isEditDisabled = disabled || !environmentGroupId || isLoadingMembers || !isContainerOwner;
  const editDisabledReason = !environmentGroupId
    ? 'Select an Environment Group to edit'
    : isLoadingMembers
      ? 'Loading group…'
      : !isContainerOwner
        ? `Only the owner${selectedContainer?.ownerUpn ? ` (${selectedContainer.ownerUpn})` : ''} can edit this group`
        : 'Edit Environment Group';

  function handleServiceTreeRowClick(tree: ServiceTree) {
    if (disabled || serviceTreeId === tree.id) return;
    onServiceTreeChange({ id: tree.id, name: tree.name });
  }

  function handleGroupRowClick(group: EnvironmentGroup) {
    if (disabled || isLoadingMembers) return;
    if (environmentGroupId === group.id) return;
    onEnvironmentGroupSelectionStarted({ id: group.id, name: group.name });
  }

  function handleServiceTreeCreated(
    id: string,
    name: string,
    containerId?: string,
    containerName?: string,
  ) {
    setCreateServiceTreeOpen(false);
    onServiceTreeChange({ id, name });
    void onRefreshServiceTrees?.();
    // Pass the new tree id explicitly — state hasn't re-rendered yet, so a plain
    // refresh would fetch the previous tree's containers (FR-016).
    if (containerId && containerName) {
      void onRefreshContainers?.(id).then(() => {
        onEnvironmentGroupSelectionStarted({ id: containerId, name: containerName });
      });
    }
  }

  function handleContainerCreated(id: string, name: string) {
    setCreateContainerOpen(false);
    void onRefreshContainers?.().then(() => {
      onEnvironmentGroupSelectionStarted({ id, name });
    });
  }

  function handleContainerUpdated(id: string, name: string) {
    setEditContainerData(undefined);
    void onRefreshContainers?.().then(() => {
      // Editing the currently selected group keeps the same id, so the member-load
      // effect would short-circuit on loadedGroupRef. Clear it and bump the nonce
      // to force a fresh tokened reload of the updated members.
      if (id === environmentGroupId) {
        loadedGroupRef.current = undefined;
        setReloadNonce((n) => n + 1);
      }
      onEnvironmentGroupSelectionStarted({ id, name });
    });
  }

  async function handleEditContainer() {
    if (!environmentGroupId) return;
    const container = containers.find((c) => c.id === environmentGroupId);
    if (!container) return;
    try {
      const members = await getGroupMembers(environmentGroupId);
      setEditContainerData({
        id: environmentGroupId,
        name: container.name,
        description: container.description,
        memberEnvironmentIds: members.map((m) => m.environmentGuid),
      });
    } catch (err) {
      onMembersError?.(
        err instanceof Error ? err.message : 'Failed to load the group for editing.',
      );
    }
  }

  if (environmentsLoading || serviceTreesLoading) return <Spinner label="Loading..." />;
  if (environmentsError) return <Text>Error loading environments: {environmentsError}</Text>;

  return (
    <div>
      <div className={styles.topRow}>
        {/* ── Left — Service Tree ─────────────────────────────────────────── */}
        <div className={styles.panel}>
          <div>
            <Text weight="semibold">
              Service Tree
              <span className={styles.requiredStar} aria-hidden="true">*</span>{' '}
              <Tooltip
                content="A Service Tree represents your team or project. You'll only see trees where you're a member. Create a new one if your team doesn't have one yet. To rename or edit a Service Tree, use the Manage Service Trees page."
                relationship="description"
              >
                <Info16Regular
                  style={{
                    color: tokens.colorNeutralForeground3,
                    cursor: 'help',
                    verticalAlign: 'middle',
                  }}
                />
              </Tooltip>
            </Text>
            <Text className={styles.labelSubtitle} block>
              The team that owns this request
            </Text>
            {serviceTreeError && (
              <Text className={styles.fieldError} block role="alert">
                {serviceTreeError}
              </Text>
            )}
          </div>

          {!isFirstTimeUser && (
            <SearchBox
              className={styles.search}
              placeholder="Search service trees..."
              aria-label="Search service trees"
              value={serviceTreeSearch}
              onChange={(_, data) => {
                setServiceTreeSearch(data.value);
                setServiceTreePage(1);
              }}
              size="small"
              disabled={disabled}
            />
          )}

          <div className={styles.gridBox}>
            {!isFirstTimeUser && (
              <div className={styles.toolbar}>
                <Text size={200} weight="semibold">
                  {serviceTreesLoading
                    ? 'Loading…'
                    : `${filteredServiceTrees.length} result${filteredServiceTrees.length !== 1 ? 's' : ''}`}
                </Text>
                <div className={styles.toolbarButtons}>
                  <Button
                    appearance="primary"
                    size="small"
                    disabled={disabled}
                    onClick={() => setCreateServiceTreeOpen(true)}
                  >
                    + New Service Tree
                  </Button>
                </div>
              </div>
            )}

            {filteredServiceTrees.length === 0 ? (
              <div className={isFirstTimeUser ? styles.firstTimeEmpty : styles.empty}>
                {isFirstTimeUser ? (
                  <>
                    <PeopleTeam20Regular
                      style={{ fontSize: '40px', color: tokens.colorBrandForeground1 }}
                    />
                    <Text weight="semibold" size={300}>
                      Create your first Service Tree
                    </Text>
                    <Text size={200}>
                      A Service Tree represents your team or project. Create one to organize your
                      requests.
                    </Text>
                    <Button
                      appearance="primary"
                      icon={<AddRegular />}
                      disabled={disabled}
                      onClick={() => setCreateServiceTreeOpen(true)}
                    >
                      New Service Tree
                    </Button>
                  </>
                ) : (
                  <>
                    <DocumentRegular style={{ fontSize: '32px' }} />
                    <Text size={200}>No service trees match your search.</Text>
                  </>
                )}
              </div>
            ) : (
              <>
                <DataGrid
                  items={pagedServiceTrees}
                  columns={serviceTreeColumns}
                  getRowId={(item) => item.id}
                  columnSizingOptions={{
                    radio: { minWidth: 40, defaultWidth: 40 },
                    name: { minWidth: 120, defaultWidth: 200 },
                    organization: { minWidth: 100, defaultWidth: 150 },
                  }}
                  resizableColumns
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
                      <DataGridRow<ServiceTree>
                        key={rowId}
                        onClick={() => handleServiceTreeRowClick(item)}
                        onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleServiceTreeRowClick(item);
                          }
                        }}
                        tabIndex={disabled ? -1 : 0}
                        className={
                          serviceTreeId === item.id
                            ? `${styles.serviceTreeRow} ${styles.rowSelected}`
                            : styles.serviceTreeRow
                        }
                        aria-selected={serviceTreeId === item.id}
                      >
                        {({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
                      </DataGridRow>
                    )}
                  </DataGridBody>
                </DataGrid>

                <div className={styles.paginationRow}>
                  <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                    {serviceTreePage} of {serviceTreeTotalPages}
                  </Text>
                  <div className={styles.paginationButtons}>
                    <Button
                      appearance="subtle"
                      size="small"
                      icon={<ChevronLeft20Regular />}
                      disabled={serviceTreePage <= 1}
                      onClick={() => setServiceTreePage((p) => p - 1)}
                      aria-label="Previous Service Trees page"
                    />
                    <Button
                      appearance="subtle"
                      size="small"
                      icon={<ChevronRight20Regular />}
                      disabled={serviceTreePage >= serviceTreeTotalPages}
                      onClick={() => setServiceTreePage((p) => p + 1)}
                      aria-label="Next Service Trees page"
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Right — Environment Group grid ──────────────────────────────── */}
        <div className={styles.panel}>
          <div>
            <Text weight="semibold">
              Environment Group
              <span className={styles.requiredStar} aria-hidden="true">*</span>{' '}
              <Tooltip
                content="An Environment Group bundles the Power Platform environments included in this request. Each group belongs to a Service Tree."
                relationship="description"
              >
                <Info16Regular
                  style={{
                    color: tokens.colorNeutralForeground3,
                    cursor: 'help',
                    verticalAlign: 'middle',
                  }}
                />
              </Tooltip>
            </Text>
            <Text className={styles.labelSubtitle} block>
              The environments included in this request
            </Text>
            {groupError && (
              <Text className={styles.fieldError} block role="alert">
                {groupError}
              </Text>
            )}
          </div>

          <SearchBox
            className={styles.search}
            placeholder="Search Environment Groups..."
            aria-label="Search Environment Groups"
            value={groupSearch}
            onChange={(_, data) => {
              setGroupSearch(data.value);
              setGroupPage(1);
            }}
            size="small"
            disabled={disabled || !serviceTreeId}
          />

          <div className={styles.gridBox}>
            <div className={styles.toolbar}>
              <Text size={200} weight="semibold">
                {containersLoading
                  ? 'Loading…'
                  : `${filteredContainers.length} group${filteredContainers.length !== 1 ? 's' : ''}`}
              </Text>
              <div className={styles.toolbarButtons}>
                <Tooltip content={editDisabledReason} relationship="label">
                  <Button
                    appearance="subtle"
                    size="small"
                    icon={<Edit20Regular />}
                    disabledFocusable={isEditDisabled}
                    onClick={() => {
                      void handleEditContainer();
                    }}
                  >
                    Edit
                  </Button>
                </Tooltip>
                <Button
                  appearance="primary"
                  size="small"
                  disabled={disabled || !serviceTreeId}
                  onClick={() => setCreateContainerOpen(true)}
                >
                  + New Group
                </Button>
              </div>
            </div>

            {!containersLoading && filteredContainers.length > 0 && (
              <div className={styles.header}>
                <div className={styles.headerCellSmall} />
                <div className={styles.headerCellSmall}>Group name</div>
                <div className={styles.headerCellSmall} style={{ justifyContent: 'center' }}>
                  Envs
                </div>
              </div>
            )}

            {containersLoading ? (
              <div className={styles.empty}>
                <Spinner size="small" label="Loading Environment Groups…" />
              </div>
            ) : !serviceTreeId ? (
              <div className={styles.empty}>
                <Globe20Regular style={{ fontSize: '32px' }} />
                <Text weight="semibold" size={200}>
                  Select a team first
                </Text>
                <Text size={200}>
                  After selecting a Service Tree, you&apos;ll see its Environment Groups here.
                </Text>
              </div>
            ) : filteredContainers.length === 0 ? (
              <div className={styles.empty}>
                {groupSearch ? (
                  <Text size={200}>No Environment Groups match &quot;{groupSearch}&quot;.</Text>
                ) : (
                  <>
                    <AddRegular style={{ fontSize: '32px' }} />
                    <Text weight="semibold" size={200}>
                      No Environment Groups yet
                    </Text>
                    <Text size={200}>
                      Create a group to bundle the environments included in this request.
                    </Text>
                    <Button
                      appearance="primary"
                      size="small"
                      icon={<AddRegular />}
                      disabled={disabled}
                      onClick={() => setCreateContainerOpen(true)}
                    >
                      New Group
                    </Button>
                  </>
                )}
              </div>
            ) : (
              <>
                {pagedContainers.map((c) => {
                  const isSelected = environmentGroupId === c.id;
                  const rowLoading = isLoadingMembers && environmentGroupId === c.id;
                  return (
                    <div
                      key={c.id}
                      className={`${styles.containerRow} ${isSelected ? styles.rowSelected : ''}`}
                      onClick={() => handleGroupRowClick(c)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleGroupRowClick(c);
                        }
                      }}
                      tabIndex={disabled || isLoadingMembers ? -1 : 0}
                      role="row"
                      aria-selected={isSelected}
                    >
                      <div
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        {rowLoading ? (
                          <Spinner size="extra-tiny" />
                        ) : (
                          <input
                            type="radio"
                            checked={isSelected}
                            onChange={() => handleGroupRowClick(c)}
                            onClick={(e) => e.stopPropagation()}
                            disabled={disabled}
                            aria-label={`Select Environment Group ${c.name}`}
                            style={{ accentColor: tokens.colorBrandBackground, cursor: 'pointer' }}
                          />
                        )}
                      </div>
                      <Text truncate style={{ overflow: 'hidden' }}>
                        {c.name}
                      </Text>
                      <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <Badge appearance="filled" color="brand" size="small">
                          {c.memberCount}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
                <div className={styles.paginationRow}>
                  <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                    {groupPage} of {groupTotalPages}
                  </Text>
                  <div className={styles.paginationButtons}>
                    <Button
                      appearance="subtle"
                      size="small"
                      icon={<ChevronLeft20Regular />}
                      disabled={groupPage <= 1}
                      onClick={() => setGroupPage((p) => p - 1)}
                      aria-label="Previous Environment Groups page"
                    />
                    <Button
                      appearance="subtle"
                      size="small"
                      icon={<ChevronRight20Regular />}
                      disabled={groupPage >= groupTotalPages}
                      onClick={() => setGroupPage((p) => p + 1)}
                      aria-label="Next Environment Groups page"
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Read-only member preview ──────────────────────────────────────── */}
      {environmentGroupId && (
        <div className={styles.envsSection} role="status" aria-live="polite" aria-busy={isLoadingMembers}>
          <Text weight="semibold">
            {environmentGroupName
              ? `Environments in "${environmentGroupName}" (${previewEnvs.length})`
              : 'Environments'}
          </Text>

          {!isLoadingMembers && unavailableCount > 0 && previewEnvs.length === 0 && (
            <MessageBar intent="warning">
              <MessageBarBody>
                You don&apos;t have access to any environments in this group.
              </MessageBarBody>
              <MessageBarActions>
                <Link onClick={() => setCreateContainerOpen(true)}>+ New Group</Link>
              </MessageBarActions>
            </MessageBar>
          )}

          {!isLoadingMembers && unavailableCount === 0 && previewEnvs.length === 0 && (
            <MessageBar intent="info">
              <MessageBarBody>This group has no environments.</MessageBarBody>
              <MessageBarActions>
                <Link
                  onClick={() =>
                    setEditContainerData({
                      id: environmentGroupId,
                      name: environmentGroupName ?? '',
                      memberEnvironmentIds: [],
                    })
                  }
                >
                  Edit
                </Link>
              </MessageBarActions>
            </MessageBar>
          )}

          {unavailableCount > 0 && previewEnvs.length > 0 && (
            <MessageBar intent="info">
              <MessageBarBody>
                {unavailableCount} environment{unavailableCount !== 1 ? 's' : ''} in this group{' '}
                {unavailableCount !== 1 ? 'are' : 'is'} not available to you and{' '}
                {unavailableCount !== 1 ? 'have' : 'has'} been excluded.
              </MessageBarBody>
            </MessageBar>
          )}

          {isLoadingMembers ? (
            <Spinner size="small" label="Loading environments…" labelPosition="after" />
          ) : previewEnvs.length > 0 ? (
            <div className={styles.envsTableBox}>
              <DataGrid
                items={previewEnvs}
                columns={envColumns}
                getRowId={(item) => item.name}
                className={styles.dataGrid}
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
                <DataGridBody<PpEnvironment>>
                  {({ item, rowId }) => (
                    <DataGridRow<PpEnvironment> key={rowId}>
                      {({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
                    </DataGridRow>
                  )}
                </DataGridBody>
              </DataGrid>
            </div>
          ) : null}
        </div>
      )}

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      <ServiceTreeWizardModal
        open={createServiceTreeOpen}
        onClose={() => setCreateServiceTreeOpen(false)}
        onCompleted={handleServiceTreeCreated}
        environments={environments}
      />

      {serviceTreeId && (
        <CreateContainerModal
          open={createContainerOpen}
          onClose={() => setCreateContainerOpen(false)}
          onCreated={handleContainerCreated}
          serviceTreeId={serviceTreeId}
          environments={environments}
        />
      )}

      {serviceTreeId && editContainerData && (
        <CreateContainerModal
          open={!!editContainerData}
          onClose={() => setEditContainerData(undefined)}
          onCreated={handleContainerUpdated}
          serviceTreeId={serviceTreeId}
          environments={environments}
          editContainer={editContainerData}
        />
      )}
    </div>
  );
}
