import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  makeStyles,
  tokens,
  Text,
  Button,
  Input,
  Field,
  Textarea,
  Spinner,
  Tooltip,
  DataGrid,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridBody,
  DataGridRow,
  DataGridCell,
  createTableColumn,
  Card,
  Badge,
  MessageBar,
  MessageBarBody,
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions,
  TabList,
  Tab,
} from '@fluentui/react-components';
import type { SelectTabData, SelectTabEvent, TableColumnDefinition } from '@fluentui/react-components';
import {
  SearchRegular,
  ChevronLeftRegular,
  ArrowClockwise20Regular,
  DeleteRegular,
  SaveRegular,
  BoxRegular,
} from '@fluentui/react-icons';
import { PaginationBar } from '../../../shared/components/PaginationBar';
import { useNotify } from '../../../shared/hooks/useNotify';
import { useAuth } from '../../../shared/contexts/AuthContext';
import {
  updateServiceTree,
  getServiceTreeWithMembers,
  deleteServiceTree,
} from '../../../shared/services/dataverse/serviceTreeService';
import {
  getContainersByServiceTree,
  deleteGroup,
  getGroupMembers,
} from '../../../shared/services/dataverse/environmentGroupService';
import { useEligibleEnvironments } from '../../wizard/hooks/useEligibleEnvironments';
import { CreateContainerModal } from '../../wizard/components/CreateContainerModal';
import { MemberPicker } from './MemberPicker';
import { useSurfaceStyles, useTableStyles, useToolbarStyles } from '../../../shared/styles';
import type { ServiceTree } from '../../../models/serviceTree';
import type { ServiceTreeMemberEntry } from '../../../models/serviceTreeMember';
import type { EnvironmentGroup, EnvironmentGroupMember } from '../../../models/environmentGroup';
import { semanticColors } from '../../../theme/powerShieldTheme.tokens';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_PAGE_SIZE = 5;
const PAGE_SIZE_OPTIONS = [5, 10, 20] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const useStyles = makeStyles({
  formGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: tokens.spacingHorizontalL,
    '@media (max-width: 640px)': {
      gridTemplateColumns: '1fr',
    },
  },
  formActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: tokens.spacingHorizontalM,
    paddingTop: tokens.spacingVerticalS,
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: tokens.colorNeutralStroke2,
  },
  tabList: {
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: tokens.colorNeutralStroke2,
  },
  tabContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    paddingTop: tokens.spacingVerticalM,
  },
  searchInput: {
    flex: '1',
    maxWidth: '360px',
  },
  headerCell: {
    fontWeight: tokens.fontWeightSemibold,
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
  descriptionCell: {
    maxWidth: '250px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground2,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

interface ServiceTreeDetailViewProps {
  serviceTree: ServiceTree;
  onBack: () => void;
  onDataChanged: () => void;
}

export function ServiceTreeDetailView({
  serviceTree,
  onBack,
  onDataChanged,
}: ServiceTreeDetailViewProps) {
  const styles = useStyles();
  const surfaceStyles = useSurfaceStyles();
  const tableStyles = useTableStyles();
  const toolbarStyles = useToolbarStyles();
  const { notifySuccess, notifyError } = useNotify();
  const auth = useAuth();

  // ── Tab state ──
  const [activeTab, setActiveTab] = useState<string>('details');

  const onTabSelect = useCallback((_: SelectTabEvent, data: SelectTabData) => {
    setActiveTab(data.value as string);
  }, []);

  // ── Form state ──
  const [name, setName] = useState(serviceTree.name);
  const [organization, setOrganization] = useState(serviceTree.organization ?? '');
  const [description, setDescription] = useState(serviceTree.description ?? '');
  const [members, setMembers] = useState<ServiceTreeMemberEntry[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [hasAttemptedSave, setHasAttemptedSave] = useState(false);
  const [isLoadingMembers, setIsLoadingMembers] = useState(true);

  // ── Delete state ──
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // ── Containers sub-grid state ──
  const [containers, setContainers] = useState<EnvironmentGroup[]>([]);
  const [isLoadingContainers, setIsLoadingContainers] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSizeRaw] = useState(DEFAULT_PAGE_SIZE);
  const [createContainerOpen, setCreateContainerOpen] = useState(false);

  // ── Container delete state ──
  const [containerToDelete, setContainerToDelete] = useState<EnvironmentGroup | null>(null);
  const [isDeletingContainer, setIsDeletingContainer] = useState(false);

  // ── Container detail (drill-in) state ──
  const [selectedContainer, setSelectedContainer] = useState<EnvironmentGroup | null>(null);
  const [containerMembers, setContainerMembers] = useState<EnvironmentGroupMember[]>([]);
  const [isLoadingContainerMembers, setIsLoadingContainerMembers] = useState(false);

  // ── Member environments pagination state ──
  const [memberPage, setMemberPage] = useState(1);
  const [memberPageSize, setMemberPageSizeRaw] = useState(DEFAULT_PAGE_SIZE);

  const setMemberPageSize = useCallback((size: number) => {
    setMemberPageSizeRaw(size);
    setMemberPage(1);
  }, []);

  // ── Environments for CreateContainerModal ──
  const { environments, isLoading: isLoadingEnvs } = useEligibleEnvironments();

  const creatorEntry: ServiceTreeMemberEntry = {
    dvUserId: auth.dvUserId,
    aadObjectId: auth.aadObjectId,
    upn: auth.upn,
    displayName: auth.displayName,
  };

  const setPageSize = useCallback((size: number) => {
    setPageSizeRaw(size);
    setCurrentPage(1);
  }, []);

  // ── Load members on mount ──
  useEffect(() => {
    void (async () => {
      setIsLoadingMembers(true);
      try {
        const { members: loadedMembers } = await getServiceTreeWithMembers(serviceTree.id);
        const nonCreator = loadedMembers.filter((m) => m.dvUserId !== auth.dvUserId);
        setMembers(nonCreator);
      } catch {
        notifyError('Failed to load Service Tree members.');
      } finally {
        setIsLoadingMembers(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceTree.id]);

  // ── Load containers ──
  async function loadContainers() {
    setIsLoadingContainers(true);
    try {
      const data = await getContainersByServiceTree(serviceTree.id);
      setContainers(data);
    } catch (err) {
      notifyError(err instanceof Error ? err.message : 'Failed to load environment containers.');
    } finally {
      setIsLoadingContainers(false);
    }
  }

  useEffect(() => {
    void loadContainers();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceTree.id]);

  // ── Form validation ──
  const nameInvalid = !name.trim();
  const membersInvalid = members.length === 0;
  const showNameError = hasAttemptedSave && nameInvalid;
  const showMembersError = hasAttemptedSave && membersInvalid;

  // ── Save handler ──
  async function handleSave() {
    setHasAttemptedSave(true);
    if (nameInvalid || membersInvalid) return;

    setIsSaving(true);
    try {
      const allMembers = [creatorEntry, ...members];
      await updateServiceTree(
        serviceTree.id,
        {
          name: name.trim(),
          organization: organization.trim() || undefined,
          description: description.trim() || undefined,
        },
        allMembers,
      );
      notifySuccess('Service Tree updated successfully.');
      onDataChanged();
    } catch (err) {
      notifyError(err instanceof Error ? err.message : 'Failed to update Service Tree.');
    } finally {
      setIsSaving(false);
    }
  }

  // ── Delete Service Tree ──
  function handleDeleteClick() {
    if (containers.length > 0) {
      notifyError(
        `This Service Tree has ${containers.length} environment container(s). Delete all containers first.`,
      );
      return;
    }
    setDeleteDialogOpen(true);
  }

  async function handleDeleteConfirm() {
    setIsDeleting(true);
    try {
      await deleteServiceTree(serviceTree.id);
      notifySuccess('Service Tree deleted successfully.');
      onBack();
      onDataChanged();
    } catch (err) {
      notifyError(err instanceof Error ? err.message : 'Failed to delete Service Tree.');
    } finally {
      setIsDeleting(false);
      setDeleteDialogOpen(false);
    }
  }

  // ── Delete container ──
  async function handleDeleteContainerConfirm() {
    if (!containerToDelete) return;
    setIsDeletingContainer(true);
    try {
      await deleteGroup(containerToDelete.id);
      notifySuccess(`Container "${containerToDelete.name}" deleted successfully.`);
      setContainerToDelete(null);
      void loadContainers();
    } catch (err) {
      notifyError(err instanceof Error ? err.message : 'Failed to delete container.');
    } finally {
      setIsDeletingContainer(false);
    }
  }

  // ── Container created callback ──
  function handleContainerCreated() {
    setCreateContainerOpen(false);
    void loadContainers();
  }

  // ── Container drill-in ──
  async function handleContainerClick(container: EnvironmentGroup) {
    setSelectedContainer(container);
    setMemberPage(1);
    setIsLoadingContainerMembers(true);
    try {
      const members = await getGroupMembers(container.id);
      setContainerMembers(members);
    } catch (err) {
      notifyError(err instanceof Error ? err.message : 'Failed to load container environments.');
      setContainerMembers([]);
    } finally {
      setIsLoadingContainerMembers(false);
    }
  }

  function handleBackToContainersList() {
    setSelectedContainer(null);
    setContainerMembers([]);
  }

  // ── Container members grid columns ──
  const memberColumns: TableColumnDefinition<EnvironmentGroupMember>[] = useMemo(
    () => [
      createTableColumn<EnvironmentGroupMember>({
        columnId: 'environmentName',
        compare: (a, b) => a.environmentName.localeCompare(b.environmentName),
        renderHeaderCell: () => 'Environment Name',
        renderCell: (item) => <Text weight="semibold">{item.environmentName}</Text>,
      }),
      createTableColumn<EnvironmentGroupMember>({
        columnId: 'environmentGuid',
        renderHeaderCell: () => 'Environment ID',
        renderCell: (item) => (
          <Text style={{ fontFamily: 'monospace', fontSize: '12px', color: tokens.colorNeutralForeground2 }}>
            {item.environmentGuid}
          </Text>
        ),
      }),
    ],
    [],
  );

  // ── Containers sub-grid filtering & pagination ──
  const filteredContainers = useMemo(() => {
    if (!searchTerm) return containers;
    return containers.filter((c) =>
      c.name.toLowerCase().includes(searchTerm.toLowerCase()),
    );
  }, [containers, searchTerm]);

  const totalFiltered = filteredContainers.length;
  const pageCount = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const safePage = Math.min(currentPage, pageCount);
  const paged = filteredContainers.slice((safePage - 1) * pageSize, safePage * pageSize);

  // ── Containers grid columns ──
  const containerColumns: TableColumnDefinition<EnvironmentGroup>[] = useMemo(
    () => [
      createTableColumn<EnvironmentGroup>({
        columnId: 'name',
        compare: (a, b) => a.name.localeCompare(b.name),
        renderHeaderCell: () => 'Container Name',
        renderCell: (item) => (
          <span
            className={styles.nameLink}
            role="button"
            tabIndex={0}
            onClick={() => void handleContainerClick(item)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); void handleContainerClick(item); } }}
            aria-label={`Open ${item.name}`}
          >
            {item.name}
          </span>
        ),
      }),
      createTableColumn<EnvironmentGroup>({
        columnId: 'description',
        renderHeaderCell: () => 'Description',
        renderCell: (item) =>
          item.description ? (
            <Tooltip content={item.description} relationship="label">
              <span className={styles.descriptionCell}>{item.description}</span>
            </Tooltip>
          ) : (
            <span style={{ color: tokens.colorNeutralForeground3 }}>-</span>
          ),
      }),
      createTableColumn<EnvironmentGroup>({
        columnId: 'memberCount',
        compare: (a, b) => a.memberCount - b.memberCount,
        renderHeaderCell: () => 'Environments',
        renderCell: (item) => (
          <Badge
            appearance="tint"
            color={item.memberCount > 0 ? 'informative' : 'subtle'}
            size="small"
          >
            {item.memberCount}
          </Badge>
        ),
      }),
      createTableColumn<EnvironmentGroup>({
        columnId: 'createdBy',
        compare: (a, b) => (a.ownerUpn ?? '').localeCompare(b.ownerUpn ?? ''),
        renderHeaderCell: () => 'Created By',
        renderCell: (item) =>
          item.ownerUpn ? (
            <Tooltip content={item.ownerUpn} relationship="label">
              <Text size={200}>{item.ownerUpn}</Text>
            </Tooltip>
          ) : (
            <span style={{ color: tokens.colorNeutralForeground3 }}>-</span>
          ),
      }),
      createTableColumn<EnvironmentGroup>({
        columnId: 'actions',
        renderHeaderCell: () => '',
        renderCell: (item) => (
          <Tooltip content="Delete container" relationship="label">
            <Button
              appearance="subtle"
              icon={<DeleteRegular />}
              size="small"
              onClick={() => setContainerToDelete(item)}
              aria-label={`Delete ${item.name}`}
            />
          </Tooltip>
        ),
      }),
    ],
    [styles.nameLink, styles.descriptionCell],
  );

  const containerColumnSizing = useMemo(
    () => ({
      name: { minWidth: 180, defaultWidth: 220 },
      description: { minWidth: 120, defaultWidth: 200 },
      memberCount: { minWidth: 100, defaultWidth: 110 },
      createdBy: { minWidth: 140, defaultWidth: 180 },
      actions: { minWidth: 60, defaultWidth: 80 },
    }),
    [],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalL }}>
      {/* ── Tab Navigation ── */}
      <TabList
        selectedValue={activeTab}
        onTabSelect={onTabSelect}
        className={styles.tabList}
        size="large"
      >
        <Tab value="details">Details</Tab>
        <Tab value="containers">
          Environment Containers
          {!isLoadingContainers && containers.length > 0 && (
            <Badge
              appearance="tint"
              color="informative"
              size="small"
              style={{ marginLeft: '8px' }}
            >
              {containers.length}
            </Badge>
          )}
        </Tab>
      </TabList>

      {/* ── Details Tab ── */}
      {activeTab === 'details' && (
        <div className={styles.tabContent}>
          <Card className={surfaceStyles.surfaceCard}>
            <Text size={500} weight="semibold">Service Tree Details</Text>

            {isLoadingMembers ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '24px' }}>
                <Spinner size="small" label="Loading details..." />
              </div>
            ) : (
              <>
                <div className={styles.formGrid}>
                  <Field
                    label="Name"
                    required
                    validationState={showNameError ? 'error' : 'none'}
                    validationMessage={showNameError ? 'Name is required.' : undefined}
                  >
                    <Input
                      value={name}
                      onChange={(_, data) => setName(data.value)}
                      placeholder="Service Tree name..."
                    />
                  </Field>
                  <Field label="Organization">
                    <Input
                      value={organization}
                      onChange={(_, data) => setOrganization(data.value)}
                      placeholder="Organization (optional)..."
                    />
                  </Field>
                </div>
                <Field label="Description">
                  <Textarea
                    value={description}
                    onChange={(_, data) => setDescription(data.value)}
                    placeholder="Description (optional)..."
                    rows={2}
                  />
                </Field>

                <div>
                  <MemberPicker
                    members={members}
                    onChange={setMembers}
                    lockedMembers={[creatorEntry]}
                  />
                  {showMembersError && (
                    <Text size={200} style={{ color: tokens.colorPaletteRedForeground1, marginTop: '4px', display: 'block' }}>
                      Add at least one additional member.
                    </Text>
                  )}
                </div>

                <div className={styles.formActions}>
                  <Button
                    appearance="subtle"
                    icon={<DeleteRegular />}
                    onClick={handleDeleteClick}
                    disabled={isSaving}
                    style={{ color: semanticColors.error }}
                  >
                    Delete
                  </Button>
                  <Button
                    appearance="primary"
                    icon={<SaveRegular />}
                    onClick={() => void handleSave()}
                    disabled={isSaving}
                  >
                    {isSaving ? 'Saving...' : 'Save Changes'}
                  </Button>
                </div>
              </>
            )}
          </Card>
        </div>
      )}

      {/* ── Containers Tab ── */}
      {activeTab === 'containers' && (
        <div className={styles.tabContent}>
          {/* Container Detail Sub-View */}
          {selectedContainer ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalM }}>
                <Button
                  appearance="subtle"
                  icon={<ChevronLeftRegular />}
                  onClick={handleBackToContainersList}
                  size="small"
                >
                  Back to containers
                </Button>
              </div>

              <Text size={500} weight="semibold">{selectedContainer.name}</Text>
              {selectedContainer.description && (
                <Text size={300} style={{ color: tokens.colorNeutralForeground3 }}>{selectedContainer.description}</Text>
              )}

              {isLoadingContainerMembers ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: tokens.spacingVerticalXXL }}>
                  <Spinner label="Loading environments..." />
                </div>
              ) : containerMembers.length === 0 ? (
                <MessageBar>
                  <MessageBarBody>No environments found in this container.</MessageBarBody>
                </MessageBar>
              ) : (() => {
                const memberTotalCount = containerMembers.length;
                const memberPageCount = Math.max(1, Math.ceil(memberTotalCount / memberPageSize));
                const memberSafePage = Math.min(memberPage, memberPageCount);
                const memberPaged = containerMembers.slice(
                  (memberSafePage - 1) * memberPageSize,
                  memberSafePage * memberPageSize,
                );
                return (
                  <div className={tableStyles.tableShell}>
                    <DataGrid
                      items={memberPaged}
                      columns={memberColumns}
                      sortable
                      defaultSortState={{ sortColumn: 'environmentName', sortDirection: 'ascending' }}
                      getRowId={(item) => item.environmentGuid}
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
                      <DataGridBody<EnvironmentGroupMember>>
                        {({ item, rowId }) => (
                          <DataGridRow<EnvironmentGroupMember> key={rowId}>
                            {({ renderCell }) => (
                              <DataGridCell>{renderCell(item)}</DataGridCell>
                            )}
                          </DataGridRow>
                        )}
                      </DataGridBody>
                    </DataGrid>

                    <PaginationBar
                      page={memberSafePage}
                      pageCount={memberPageCount}
                      pageSize={memberPageSize}
                      pageSizeOptions={PAGE_SIZE_OPTIONS}
                      totalRecords={memberTotalCount}
                      onPageChange={setMemberPage}
                      onPageSizeChange={setMemberPageSize}
                    />
                  </div>
                );
              })()}
            </>
          ) : (
            /* Containers List */
            <>
              <div className={toolbarStyles.toolbar}>
                <Button
                  appearance="primary"
                  onClick={() => setCreateContainerOpen(true)}
                  disabled={isLoadingEnvs}
                >
                  + New Container
                </Button>
                <Input
                  className={styles.searchInput}
                  contentBefore={<SearchRegular />}
                  placeholder="Search containers..."
                  value={searchTerm}
                  onChange={(_, data) => { setSearchTerm(data.value); setCurrentPage(1); }}
                />
                <Button
                  appearance="subtle"
                  icon={<ArrowClockwise20Regular />}
                  onClick={() => void loadContainers()}
                  disabled={isLoadingContainers}
                  aria-label="Refresh"
                >
                  Refresh
                </Button>
                {containers.length > 0 && (
                  <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                    {containers.length} container{containers.length !== 1 ? 's' : ''}
                  </Text>
                )}
              </div>

              {isLoadingContainers ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: tokens.spacingVerticalXXL }}>
                  <Spinner label="Loading containers..." />
                </div>
              ) : filteredContainers.length === 0 ? (
                searchTerm ? (
                  <MessageBar>
                    <MessageBarBody>{`No containers match "${searchTerm}".`}</MessageBarBody>
                  </MessageBar>
                ) : (
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: tokens.spacingVerticalM,
                    padding: '48px 24px',
                    textAlign: 'center',
                  }}>
                    <BoxRegular style={{ fontSize: '48px', color: tokens.colorNeutralForeground3 }} />
                    <Text size={500} weight="semibold">No containers yet</Text>
                    <Text size={300} style={{ color: tokens.colorNeutralForeground3, maxWidth: '420px' }}>
                      Environment containers group one or more Dataverse environments under this Service Tree. Create a container to get started.
                    </Text>
                    <Button
                      appearance="primary"
                      onClick={() => setCreateContainerOpen(true)}
                      disabled={isLoadingEnvs}
                    >
                      + Create your first container
                    </Button>
                  </div>
                )
              ) : (
                <div className={tableStyles.tableShell}>
                  <DataGrid
                    items={paged}
                    columns={containerColumns}
                    columnSizingOptions={containerColumnSizing}
                    resizableColumns
                    sortable
                    defaultSortState={{ sortColumn: 'name', sortDirection: 'ascending' }}
                    getRowId={(item) => item.id}
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
                    <DataGridBody<EnvironmentGroup>>
                      {({ item, rowId }) => (
                        <DataGridRow<EnvironmentGroup> key={rowId}>
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
                    totalRecords={totalFiltered}
                    onPageChange={setCurrentPage}
                    onPageSizeChange={setPageSize}
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Create Container Modal ── */}
      <CreateContainerModal
        open={createContainerOpen}
        onClose={() => setCreateContainerOpen(false)}
        onCreated={handleContainerCreated}
        serviceTreeId={serviceTree.id}
        environments={environments}
      />

      {/* ── Delete Service Tree Dialog ── */}
      <Dialog
        open={deleteDialogOpen}
        onOpenChange={(_, data) => { if (!data.open) setDeleteDialogOpen(false); }}
      >
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Delete Service Tree</DialogTitle>
            <DialogContent>
              <Text>
                Are you sure you want to delete &quot;{serviceTree.name}&quot;? This action cannot be undone.
              </Text>
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setDeleteDialogOpen(false)} disabled={isDeleting}>
                Cancel
              </Button>
              <Button
                appearance="primary"
                onClick={() => void handleDeleteConfirm()}
                disabled={isDeleting}
                style={{ backgroundColor: semanticColors.error, borderColor: semanticColors.error }}
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      {/* ── Delete Container Dialog ── */}
      <Dialog
        open={!!containerToDelete}
        onOpenChange={(_, data) => { if (!data.open) setContainerToDelete(null); }}
      >
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Delete Container</DialogTitle>
            <DialogContent>
              <Text>
                Are you sure you want to delete &quot;{containerToDelete?.name}&quot; and all its environment members? This action cannot be undone.
              </Text>
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setContainerToDelete(null)} disabled={isDeletingContainer}>
                Cancel
              </Button>
              <Button
                appearance="primary"
                onClick={() => void handleDeleteContainerConfirm()}
                disabled={isDeletingContainer}
                style={{ backgroundColor: semanticColors.error, borderColor: semanticColors.error }}
              >
                {isDeletingContainer ? 'Deleting...' : 'Delete'}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}
