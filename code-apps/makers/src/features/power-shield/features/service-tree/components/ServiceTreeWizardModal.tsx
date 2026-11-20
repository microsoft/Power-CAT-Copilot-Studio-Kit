import { useState, useEffect, useMemo } from 'react';
import {
  makeStyles,
  mergeClasses,
  tokens,
  Text,
  Button,
  Input,
  Textarea,
  Dropdown,
  Option,
  Spinner,
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions,
  DataGrid,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridBody,
  DataGridRow,
  DataGridCell,
  DataGridSelectionCell,
  createTableColumn,
  Field,
  MessageBar,
  MessageBarBody,
} from '@fluentui/react-components';
import { CheckmarkCircle16Regular } from '@fluentui/react-icons';
import type { OnSelectionChangeData, TableColumnDefinition, TableRowId } from '@fluentui/react-components';
import { createServiceTree } from '../../../shared/services/dataverse/serviceTreeService';
import { createGroup } from '../../../shared/services/dataverse/environmentGroupService';
import { useNotify } from '../../../shared/hooks/useNotify';
import { useAuth } from '../../../shared/contexts/AuthContext';
import { MemberPicker } from './MemberPicker';
import { TypeBadge } from '../../wizard/components/CreateContainerModal';
import type { ServiceTreeMemberEntry } from '../../../models/serviceTreeMember';
import type { PpEnvironment } from '../../../models/environment';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const ENV_PAGE_SIZE = 15;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ServiceTreeWizardModalProps {
  open: boolean;
  onClose: () => void;
  /** Called when the wizard completes (after ST creation, with optional container). */
  onCompleted: (
    serviceTreeId: string,
    serviceTreeName: string,
    containerId?: string,
    containerName?: string,
  ) => void;
  /** Environments for the container step's selection grid. */
  environments: PpEnvironment[];
}

type WizardStep = 'service-tree' | 'container';

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const useStyles = makeStyles({
  stepIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    marginBottom: tokens.spacingVerticalM,
  },
  stepDot: {
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
  },
  stepDotActive: {
    backgroundColor: tokens.colorBrandBackground,
    color: tokens.colorNeutralForegroundOnBrand,
  },
  stepDotCompleted: {
    backgroundColor: tokens.colorBrandBackground,
    color: tokens.colorNeutralForegroundOnBrand,
  },
  stepDotPending: {
    backgroundColor: tokens.colorNeutralBackground4,
    color: tokens.colorNeutralForeground3,
  },
  stepLine: {
    width: '40px',
    height: '2px',
    backgroundColor: tokens.colorNeutralStroke2,
  },
  stepLineCompleted: {
    width: '40px',
    height: '2px',
    backgroundColor: tokens.colorBrandBackground,
  },
  // Container step styles
  dialogContent: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },
  nameSection: {
    marginBottom: tokens.spacingVerticalS,
  },
  descriptionSection: {
    marginBottom: tokens.spacingVerticalM,
  },
  filterRow: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
    marginBottom: tokens.spacingVerticalM,
  },
  gridWrapper: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    borderTopStyle: 'solid',
    borderRightStyle: 'solid',
    borderBottomStyle: 'solid',
    borderLeftStyle: 'solid',
    borderTopWidth: tokens.strokeWidthThin,
    borderRightWidth: tokens.strokeWidthThin,
    borderBottomWidth: tokens.strokeWidthThin,
    borderLeftWidth: tokens.strokeWidthThin,
    borderTopColor: tokens.colorNeutralStroke2,
    borderRightColor: tokens.colorNeutralStroke2,
    borderBottomColor: tokens.colorNeutralStroke2,
    borderLeftColor: tokens.colorNeutralStroke2,
    borderRadius: tokens.borderRadiusMedium,
  },
  dataGrid: {
    '& [role="row"]': {
      boxShadow: `inset 0 -1px 0 0 ${tokens.colorNeutralStroke2}`,
    },
  },
  headerCell: {
    fontWeight: tokens.fontWeightSemibold,
  },
  selectionBar: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    paddingTop: tokens.spacingVerticalXS,
    paddingBottom: tokens.spacingVerticalXS,
    paddingLeft: tokens.spacingHorizontalM,
    paddingRight: tokens.spacingHorizontalM,
    backgroundColor: tokens.colorNeutralBackground1,
    borderTopStyle: 'solid',
    borderTopWidth: '0.5px',
    borderTopColor: tokens.colorBrandStroke2,
  },
  paginationRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: tokens.spacingHorizontalS,
    paddingTop: tokens.spacingVerticalXS,
  },
  footerHint: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    paddingTop: tokens.spacingVerticalXS,
  },
  successBanner: {
    marginBottom: tokens.spacingVerticalM,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function ServiceTreeWizardModal({
  open,
  onClose,
  onCompleted,
  environments,
}: ServiceTreeWizardModalProps) {
  const styles = useStyles();
  const { notifySuccess, notifyError } = useNotify();
  const auth = useAuth();

  // Wizard step
  const [step, setStep] = useState<WizardStep>('service-tree');

  // Service Tree created in step 1 (carried to step 2)
  const [createdServiceTreeId, setCreatedServiceTreeId] = useState<string | null>(null);
  const [createdServiceTreeName, setCreatedServiceTreeName] = useState('');

  // ── Step 1: Service Tree form state ──
  const [stName, setStName] = useState('');
  const [stOrganization, setStOrganization] = useState('');
  const [stDescription, setStDescription] = useState('');
  const [stMembers, setStMembers] = useState<ServiceTreeMemberEntry[]>([]);
  const [stSaving, setStSaving] = useState(false);
  const [stAttempted, setStAttempted] = useState(false);

  const creatorEntry: ServiceTreeMemberEntry = {
    dvUserId: auth.dvUserId,
    aadObjectId: auth.aadObjectId,
    upn: auth.upn,
    displayName: auth.displayName,
  };

  // ── Step 2: Container form state ──
  const [containerName, setContainerName] = useState('');
  const [containerDescription, setContainerDescription] = useState('');
  const [selectedEnvIds, setSelectedEnvIds] = useState<Set<TableRowId>>(new Set());
  const [envSearchTerm, setEnvSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [locationFilter, setLocationFilter] = useState<string[]>([]);
  const [envPage, setEnvPage] = useState(1);
  const [containerSaving, setContainerSaving] = useState(false);
  const [containerNameAttempted, setContainerNameAttempted] = useState(false);
  const [containerDescAttempted, setContainerDescAttempted] = useState(false);

  function resetServiceTreeForm() {
    setStName('');
    setStOrganization('');
    setStDescription('');
    setStMembers([]);
    setStSaving(false);
    setStAttempted(false);
  }

  function resetContainerForm() {
    setContainerName('');
    setContainerDescription('');
    setSelectedEnvIds(new Set());
    setEnvSearchTerm('');
    setTypeFilter([]);
    setLocationFilter([]);
    setEnvPage(1);
    setContainerSaving(false);
    setContainerNameAttempted(false);
    setContainerDescAttempted(false);
  }

  // ── Reset everything when opened/closed ──
  useEffect(() => {
    if (open) {
      setStep('service-tree');
      resetServiceTreeForm();
      resetContainerForm();
      setCreatedServiceTreeId(null);
      setCreatedServiceTreeName('');
    }
  }, [open]);

  // ── Step 1 validation ──
  const stNameInvalid = !stName.trim();
  const stOrgInvalid = !stOrganization.trim();
  const stDescInvalid = !stDescription.trim();
  const stMembersInvalid = stMembers.length === 0;

  function handleClose() {
    onClose();
  }

  // ── Step 1: Save Service Tree and advance to Step 2 ──
  async function handleSaveServiceTree() {
    setStAttempted(true);
    if (stNameInvalid || stOrgInvalid || stDescInvalid || stMembersInvalid) return;

    setStSaving(true);
    try {
      const payload = {
        name: stName.trim(),
        organization: stOrganization.trim() || undefined,
        description: stDescription.trim() || undefined,
      };
      const { id } = await createServiceTree(payload, creatorEntry, stMembers);
      notifySuccess('Service Tree created successfully.');
      setCreatedServiceTreeId(id);
      setCreatedServiceTreeName(stName.trim());
      setContainerName(`${stName.trim()} - Container 1`);
      setStep('container');
    } catch (err) {
      notifyError(err instanceof Error ? err.message : 'Failed to create Service Tree.');
    } finally {
      setStSaving(false);
    }
  }

  // ── Step 2: Save Container ──
  const typeOptions = useMemo(
    () => [...new Set(environments.map((e) => e.environmentSku))].sort(),
    [environments],
  );
  const locationOptions = useMemo(
    () => [...new Set(environments.map((e) => e.location))].sort(),
    [environments],
  );

  const filteredEnvironments = useMemo(() => {
    let result = environments;
    if (envSearchTerm) result = result.filter((e) => e.displayName.toLowerCase().includes(envSearchTerm.toLowerCase()));
    if (typeFilter.length > 0) result = result.filter((e) => typeFilter.includes(e.environmentSku));
    if (locationFilter.length > 0) result = result.filter((e) => locationFilter.includes(e.location));
    return result;
  }, [environments, envSearchTerm, typeFilter, locationFilter]);

  const envTotalPages = Math.max(1, Math.ceil(filteredEnvironments.length / ENV_PAGE_SIZE));
  const pagedEnvironments = filteredEnvironments.slice(
    (envPage - 1) * ENV_PAGE_SIZE,
    envPage * ENV_PAGE_SIZE,
  );

  const envColumns: TableColumnDefinition<PpEnvironment>[] = [
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
  ];

  function handleEnvSelectionChange(_: unknown, data: OnSelectionChangeData) {
    const ids = data.selectedItems as Set<TableRowId>;
    const visibleIds = new Set(pagedEnvironments.map((e) => e.name));
    const prevOtherPages = new Set([...selectedEnvIds].filter((id) => !visibleIds.has(id as string)));
    const newCurrentPage = new Set([...ids].filter((id) => visibleIds.has(id as string)));
    setSelectedEnvIds(new Set([...prevOtherPages, ...newCurrentPage]));
  }

  const currentPageSelection = useMemo(() => {
    const visibleIds = new Set(pagedEnvironments.map((e) => e.name));
    return new Set([...selectedEnvIds].filter((id) => visibleIds.has(id as string)));
  }, [selectedEnvIds, pagedEnvironments]);

  const showContainerNameError = containerNameAttempted && !containerName.trim();
  const showContainerDescError = containerDescAttempted && !containerDescription.trim();
  const canSaveContainer = containerName.trim().length > 0 && containerDescription.trim().length > 0 && selectedEnvIds.size > 0 && !containerSaving;

  async function handleSaveContainer() {
    setContainerNameAttempted(true);
    setContainerDescAttempted(true);
    if (!containerName.trim() || !containerDescription.trim() || selectedEnvIds.size === 0 || !createdServiceTreeId) return;

    setContainerSaving(true);
    try {
      const envMap = new Map(environments.map((e) => [e.name, e]));
      const members = [...selectedEnvIds]
        .map((id) => envMap.get(id as string))
        .filter((e): e is PpEnvironment => !!e)
        .map((e) => ({ environmentGuid: e.name, environmentName: e.displayName }));

      const newId = await createGroup({
        name: containerName.trim(),
        description: containerDescription.trim(),
        serviceTreeId: createdServiceTreeId,
        ownerAadObjectId: auth.aadObjectId,
        ownerUpn: auth.upn,
        members,
      });

      notifySuccess(`Container "${containerName.trim()}" created successfully.`);
      onCompleted(createdServiceTreeId, createdServiceTreeName, newId, containerName.trim());
    } catch (err) {
      notifyError(err instanceof Error ? err.message : 'Failed to create container.');
    } finally {
      setContainerSaving(false);
    }
  }

  function handleSkipContainer() {
    if (createdServiceTreeId) {
      onCompleted(createdServiceTreeId, createdServiceTreeName);
    }
  }

  // ── Step indicator ──
  function renderStepIndicator() {
    const isStep1 = step === 'service-tree';
    return (
      <div className={styles.stepIndicator}>
        <div
          className={mergeClasses(styles.stepDot, isStep1 ? styles.stepDotActive : styles.stepDotCompleted)}
        >
          {isStep1 ? '1' : '✓'}
        </div>
        <Text size={200} weight={isStep1 ? 'semibold' : 'regular'}>
          Team Setup
        </Text>
        <div className={mergeClasses(styles.stepLine, !isStep1 && styles.stepLineCompleted)} />
        <div
          className={mergeClasses(styles.stepDot, isStep1 ? styles.stepDotPending : styles.stepDotActive)}
        >
          2
        </div>
        <Text size={200} weight={!isStep1 ? 'semibold' : 'regular'}>
          Environment Container
        </Text>
      </div>
    );
  }

  // Dialog size adapts to the current step
  const dialogStyle = step === 'container'
    ? { maxWidth: '900px', width: '80vw', height: '90vh' }
    : { maxWidth: '600px', width: '90vw' };

  const dialogBodyStyle = step === 'container'
    ? { display: 'flex', flexDirection: 'column' as const, overflow: 'hidden', height: '100%' }
    : undefined;

  return (
    <Dialog
      open={open}
      onOpenChange={(_, data) => {
        if (!data.open) {
          // On the container step, a Service Tree was already created — prevent
          // accidental dismissal via backdrop click or Escape and treat it as "Skip".
          if (step === 'container') {
            handleSkipContainer();
            return;
          }
          handleClose();
        }
      }}
    >
      <DialogSurface style={dialogStyle} aria-labelledby="st-wizard-title">
        {renderStepIndicator()}
        <DialogBody style={dialogBodyStyle}>
          <DialogTitle id="st-wizard-title">
            {step === 'service-tree' ? 'Create New Service Tree' : 'Create Environment Container'}
          </DialogTitle>

          {/* ── Step 1: Service Tree ─────────────────────────────────── */}
          {step === 'service-tree' && (
            <>
              <DialogContent>
                <Field
                  label="Name"
                  required
                  hint="A short name for your team or project (e.g. 'Contoso Marketing')"
                  validationState={stAttempted && stNameInvalid ? 'error' : 'none'}
                  validationMessage={stAttempted && stNameInvalid ? 'Name is required.' : undefined}
                >
                  <Input
                    value={stName}
                    onChange={(_, data) => setStName(data.value)}
                    placeholder="Service Tree name..."
                  />
                </Field>
                <Field
                  label="Organization"
                  required
                  hint="Your business unit or department"
                  style={{ marginTop: '12px' }}
                  validationState={stAttempted && stOrgInvalid ? 'error' : 'none'}
                  validationMessage={stAttempted && stOrgInvalid ? 'Organization is required.' : undefined}
                >
                  <Input
                    value={stOrganization}
                    onChange={(_, data) => setStOrganization(data.value)}
                    placeholder="Organization name..."
                  />
                </Field>
                <Field
                  label="Description"
                  required
                  hint="Briefly describe what this team does and why they need connector access"
                  style={{ marginTop: '12px' }}
                  validationState={stAttempted && stDescInvalid ? 'error' : 'none'}
                  validationMessage={stAttempted && stDescInvalid ? 'Description is required.' : undefined}
                >
                  <Textarea
                    value={stDescription}
                    onChange={(_, data) => setStDescription(data.value)}
                    placeholder="Service tree description..."
                    rows={3}
                  />
                </Field>
                <div style={{ marginTop: '20px' }}>
                  <MemberPicker
                    members={stMembers}
                    onChange={setStMembers}
                    lockedMembers={[creatorEntry]}
                  />
                  {stAttempted && stMembersInvalid && (
                    <Text
                      size={200}
                      style={{ color: tokens.colorPaletteRedForeground1, marginTop: '4px', display: 'block' }}
                    >
                      Add at least one additional member.
                    </Text>
                  )}
                </div>
              </DialogContent>
              <DialogActions>
                <Button
                  appearance="primary"
                  onClick={() => void handleSaveServiceTree()}
                  disabled={stSaving}
                >
                  {stSaving ? 'Saving...' : 'Save & Continue'}
                </Button>
                <Button appearance="secondary" onClick={handleClose} disabled={stSaving}>
                  Cancel
                </Button>
              </DialogActions>
            </>
          )}

          {/* ── Step 2: Environment Container ───────────────────────── */}
          {step === 'container' && (
            <>
              <DialogContent className={styles.dialogContent}>
                {/* Success banner */}
                <MessageBar intent="success" className={styles.successBanner}>
                  <MessageBarBody>
                    Service Tree &quot;{createdServiceTreeName}&quot; created. Now create an Environment Container, or skip to do it later.
                  </MessageBarBody>
                </MessageBar>

                {/* Container name */}
                <div className={styles.nameSection}>
                  <Field
                    label="Container name"
                    required
                    validationState={showContainerNameError ? 'error' : 'none'}
                    validationMessage={showContainerNameError ? 'Container name is required.' : undefined}
                  >
                    <Input
                      value={containerName}
                      onChange={(_, d) => setContainerName(d.value)}
                      placeholder="e.g. Production US environments..."
                      style={{ maxWidth: '400px' }}
                    />
                  </Field>
                </div>

                {/* Description */}
                <div className={styles.descriptionSection}>
                  <Field
                    label="Description"
                    required
                    validationState={showContainerDescError ? 'error' : 'none'}
                    validationMessage={showContainerDescError ? 'Description is required.' : undefined}
                  >
                    <Textarea
                      value={containerDescription}
                      onChange={(_, d) => setContainerDescription(d.value)}
                      placeholder="Briefly describe the purpose of this container…"
                      rows={2}
                      resize="vertical"
                      style={{ maxWidth: '400px' }}
                    />
                  </Field>
                </div>

                {/* Filter bar */}
                <div className={styles.filterRow}>
                  <Input
                    placeholder="Search by display name..."
                    value={envSearchTerm}
                    onChange={(_, d) => { setEnvSearchTerm(d.value); setEnvPage(1); }}
                    style={{ maxWidth: '280px' }}
                    aria-label="Search environments"
                  />
                  <Dropdown
                    placeholder="All Types"
                    multiselect
                    selectedOptions={typeFilter}
                    onOptionSelect={(_, d) => { setTypeFilter(d.selectedOptions); setEnvPage(1); }}
                    value={typeFilter.length > 0 ? `${typeFilter.length} type${typeFilter.length !== 1 ? 's' : ''} selected` : ''}
                    style={{ minWidth: '160px' }}
                    aria-label="Filter by type"
                  >
                    {typeOptions.map((t) => <Option key={t} value={t}>{t}</Option>)}
                  </Dropdown>
                  <Dropdown
                    placeholder="All Locations"
                    multiselect
                    selectedOptions={locationFilter}
                    onOptionSelect={(_, d) => { setLocationFilter(d.selectedOptions); setEnvPage(1); }}
                    value={locationFilter.length > 0 ? `${locationFilter.length} location${locationFilter.length !== 1 ? 's' : ''} selected` : ''}
                    style={{ minWidth: '180px' }}
                    aria-label="Filter by location"
                  >
                    {locationOptions.map((l) => <Option key={l} value={l}>{l}</Option>)}
                  </Dropdown>
                </div>

                {/* Selection info */}
                {selectedEnvIds.size > 0 && (
                  <MessageBar intent="info" style={{ marginBottom: tokens.spacingVerticalS }}>
                    <MessageBarBody>
                      {selectedEnvIds.size} environment{selectedEnvIds.size !== 1 ? 's' : ''} selected
                      {envTotalPages > 1 ? '. Selections are preserved across pages.' : '.'}
                    </MessageBarBody>
                  </MessageBar>
                )}

                {/* Environment grid */}
                <div className={styles.gridWrapper}>
                  {filteredEnvironments.length === 0 ? (
                    <div style={{ padding: tokens.spacingVerticalL, textAlign: 'center', color: tokens.colorNeutralForeground3 }}>
                      <Text>{envSearchTerm ? `No environments match "${envSearchTerm}".` : 'No eligible environments found.'}</Text>
                    </div>
                  ) : (
                    <DataGrid
                      items={pagedEnvironments}
                      columns={envColumns}
                      selectionMode="multiselect"
                      selectedItems={currentPageSelection}
                      onSelectionChange={handleEnvSelectionChange}
                      getRowId={(item) => item.name}
                      className={styles.dataGrid}
                    >
                      <DataGridHeader>
                        <DataGridRow selectionCell={<DataGridSelectionCell />}>
                          {({ renderHeaderCell }) => (
                            <DataGridHeaderCell className={styles.headerCell}>{renderHeaderCell()}</DataGridHeaderCell>
                          )}
                        </DataGridRow>
                      </DataGridHeader>
                      <DataGridBody<PpEnvironment>>
                        {({ item, rowId }) => (
                          <DataGridRow<PpEnvironment> key={rowId} selectionCell={<DataGridSelectionCell />}>
                            {({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
                          </DataGridRow>
                        )}
                      </DataGridBody>
                    </DataGrid>
                  )}

                  {/* Selection bar */}
                  {selectedEnvIds.size > 0 && (
                    <div className={styles.selectionBar}>
                      <CheckmarkCircle16Regular style={{ color: tokens.colorBrandForeground1 }} />
                      <Text size={200} style={{ color: tokens.colorBrandForeground1 }}>
                        {selectedEnvIds.size} environment{selectedEnvIds.size !== 1 ? 's' : ''} selected
                        {envTotalPages > 1 ? ' (across all pages)' : ''}
                      </Text>
                    </div>
                  )}
                </div>

                {/* Pagination */}
                {envTotalPages > 1 && (
                  <div className={styles.paginationRow}>
                    <Button
                      appearance="subtle"
                      size="small"
                      onClick={() => setEnvPage((p) => p - 1)}
                      disabled={envPage === 1}
                    >
                      ← Prev
                    </Button>
                    <Text size={200}>Page {envPage} of {envTotalPages}</Text>
                    <Button
                      appearance="subtle"
                      size="small"
                      onClick={() => setEnvPage((p) => p + 1)}
                      disabled={envPage === envTotalPages}
                    >
                      Next →
                    </Button>
                  </div>
                )}
              </DialogContent>

              <DialogActions style={{ justifyContent: 'flex-end' }}>
                <Button
                  appearance="primary"
                  onClick={() => void handleSaveContainer()}
                  disabled={!canSaveContainer}
                  icon={containerSaving ? <Spinner size="tiny" /> : undefined}
                >
                  {containerSaving ? 'Saving…' : 'Save'}
                </Button>
                <Button appearance="secondary" onClick={handleSkipContainer} disabled={containerSaving}>
                  Skip
                </Button>
              </DialogActions>
              <Text className={styles.footerHint}>
                You can create more containers later from the Service Tree detail page.
              </Text>
            </>
          )}
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
