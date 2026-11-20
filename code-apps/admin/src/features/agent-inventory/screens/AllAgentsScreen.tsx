import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Button,
  Link,
  MessageBar,
  MessageBarActions,
  MessageBarBody,
  Text,
  Toast,
  Toaster,
  ToastTitle,
  makeStyles,
  tokens,
  useToastController,
} from '@fluentui/react-components';
import {
  ArrowDownload24Regular,
  DismissRegular,
  PersonArrowRight24Regular,
  ShieldCheckmark24Regular,
  ShieldDismiss24Regular,
} from '@fluentui/react-icons';
import { AgentInventoryBreadcrumb } from '../components/AgentInventoryBreadcrumb';
import { AdvancedDataGrid } from '../components/shared/AdvancedDataGrid';
import type {
  GridChoiceOption,
  GridColumnDefinition,
  GridSelectionActionsContext,
} from '../components/shared/AdvancedDataGrid';
import type { AgentInventoryRecord, InventoryChoice } from '../contracts/types';
import { useAllAgents } from '../hooks/useAllAgents';
import { AGENT_INVENTORY_VIEWS, isAgentInventoryView } from '../utils/agentViews';
import { ReassignAgentDialog } from '../components/bulk-actions/ReassignAgentDialog';
import { QuarantineActionDialog } from '../components/bulk-actions/QuarantineActionDialog';
import type { ActionCompletionSummary } from '../services/actionCompletionService';

const MAX_BULK_ACTION_RECORDS = 50;

const useStyles = makeStyles({
  root: {
    width: '100%',
    minHeight: '100vh',
    boxSizing: 'border-box',
    background: `radial-gradient(124.48% 109.39% at 26.98% 6.02%, ${tokens.colorNeutralBackground1} 0%, ${tokens.colorNeutralBackground1} 37.08%, ${tokens.colorBrandBackground2} 100%)`,
  },
  chrome: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalL,
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalXXL}`,
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    '@media (max-width: 600px)': {
      alignItems: 'flex-start',
      flexDirection: 'column',
      padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    },
  },
  chromeActions: {
    marginLeft: 'auto',
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    '@media (max-width: 600px)': {
      marginLeft: 0,
    },
  },
  content: {
    width: '100%',
    boxSizing: 'border-box',
    padding: `${tokens.spacingVerticalL} ${tokens.spacingHorizontalXXL} ${tokens.spacingVerticalXXL}`,
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
    overflowX: 'hidden',
    '@media (max-width: 600px)': {
      padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalM} ${tokens.spacingVerticalL}`,
    },
  },
  filterBanner: {
    marginBottom: tokens.spacingVerticalM,
  },
  nameLink: {
    fontWeight: tokens.fontWeightSemibold,
  },
  feature: {
    display: 'inline-flex',
    minWidth: '32px',
    alignItems: 'center',
    justifyContent: 'center',
    padding: `2px ${tokens.spacingHorizontalS}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground3,
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase100,
    lineHeight: tokens.lineHeightBase100,
    fontWeight: tokens.fontWeightSemibold,
  },
  featureYes: {
    backgroundColor: tokens.colorBrandBackground2,
    color: tokens.colorBrandForeground1,
  },
  featureNa: {
    backgroundColor: 'transparent',
    border: `${tokens.strokeWidthThin} dashed ${tokens.colorNeutralStrokeAccessible}`,
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
  },
  secondary: {
    color: tokens.colorNeutralForeground3,
  },
  selectionCount: {
    color: tokens.colorBrandForeground1,
    fontFamily: tokens.fontFamilyBase,
    fontSize: tokens.fontSizeBase300,
    lineHeight: tokens.lineHeightBase300,
    fontWeight: tokens.fontWeightRegular,
    whiteSpace: 'nowrap',
  },
  clearSelection: {
    fontFamily: tokens.fontFamilyBase,
    fontSize: tokens.fontSizeBase300,
    lineHeight: tokens.lineHeightBase300,
    fontWeight: tokens.fontWeightRegular,
  },
  status: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    padding: `2px ${tokens.spacingHorizontalS}`,
    borderRadius: tokens.borderRadiusMedium,
    fontSize: tokens.fontSizeBase100,
    lineHeight: tokens.lineHeightBase100,
    fontWeight: tokens.fontWeightSemibold,
    whiteSpace: 'nowrap',
  },
  statusDot: {
    width: '6px',
    height: '6px',
    borderRadius: tokens.borderRadiusCircular,
    backgroundColor: 'currentColor',
  },
  statusAvailable: {
    backgroundColor: tokens.colorPaletteGreenBackground1,
    color: tokens.colorPaletteGreenForeground1,
  },
  statusBlocked: {
    backgroundColor: tokens.colorPaletteRedBackground1,
    color: tokens.colorPaletteRedForeground1,
  },
  statusDraft: {
    backgroundColor: tokens.colorPaletteYellowBackground1,
    color: tokens.colorPaletteYellowForeground1,
  },
  statusNeutral: {
    backgroundColor: tokens.colorNeutralBackground3,
    color: tokens.colorNeutralForeground3,
  },
});

const numberFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

function formatNumber(value?: number | null): string {
  return value === null || value === undefined ? '' : numberFormatter.format(value);
}

function uniqueOptions(values: Array<string | undefined>): GridChoiceOption[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))]
    .sort((left, right) => left.localeCompare(right))
    .map((value) => ({ value, label: value }));
}

function choiceOptions(): GridChoiceOption[] {
  return [
    { value: 'yes', label: 'Yes' },
    { value: 'no', label: 'No' },
    { value: 'na', label: 'Not applicable' },
    { value: 'unknown', label: 'Unknown' },
  ];
}

function ChoiceValue({ value }: { value: InventoryChoice }) {
  const styles = useStyles();
  const label = value === 'yes' ? 'Yes' : value === 'no' ? 'No' : value === 'na' ? 'NA' : 'Unknown';
  return (
    <span className={`${styles.feature} ${value === 'yes' ? styles.featureYes : ''} ${value === 'na' ? styles.featureNa : ''}`}>
      {label}
    </span>
  );
}

function statusChoiceOptions(): GridChoiceOption[] {
  return [
    { value: 'Available', label: 'Available' },
    { value: 'Blocked', label: 'Blocked' },
    { value: 'Draft', label: 'Draft' },
    { value: 'NA', label: 'NA' },
    { value: 'Unknown', label: 'Unknown' },
  ];
}

function StatusValue({ status }: { status: AgentInventoryRecord['status'] }) {
  const styles = useStyles();
  const colorClass = status === 'Available'
    ? styles.statusAvailable
    : status === 'Blocked'
      ? styles.statusBlocked
      : status === 'Draft'
        ? styles.statusDraft
        : styles.statusNeutral;
  return (
    <span className={`${styles.status} ${colorClass}`}>
      <span className={styles.statusDot} aria-hidden="true" />
      {status}
    </span>
  );
}

function formatDate(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString();
}

function poweredByChoiceOptions(): GridChoiceOption[] {
  return [
    { value: 'Copilot Chat', label: 'Copilot Chat' },
    { value: 'Github Copilot', label: 'GitHub Copilot' },
    { value: 'Standard', label: 'Standard' },
    { value: 'Unknown', label: 'Unknown' },
  ];
}

/**
 * Normalize the raw `cat_enduserauthenticationtype` value into a user-facing
 * authentication bucket. Dataverse stores the display strings directly
 * ("Integrated", "None", "Custom Entra ID", "Generic OAuth2") or leaves it
 * empty; empty or unrecognized values fall back to "Unknown".
 */
function authenticationChoice(value?: string): string {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'integrated') return 'Integrated';
  if (normalized === 'none') return 'None';
  if (normalized === 'custom entra id') return 'Custom Entra ID';
  if (normalized === 'generic oauth2') return 'Generic OAuth2';
  return 'Unknown';
}

function authenticationChoiceOptions(): GridChoiceOption[] {
  return [
    { value: 'Integrated', label: 'Integrated' },
    { value: 'None', label: 'None' },
    { value: 'Custom Entra ID', label: 'Custom Entra ID' },
    { value: 'Generic OAuth2', label: 'Generic OAuth2' },
    { value: 'Unknown', label: 'Unknown' },
  ];
}

function createdInChoiceOptions(): GridChoiceOption[] {
  return [
    { value: 'Copilot Studio', label: 'Copilot Studio' },
    { value: 'Copilot Studio Lite', label: 'Copilot Studio Lite' },
  ];
}

function managedStateChoiceOptions(): GridChoiceOption[] {
  return [
    { value: 'Managed', label: 'Managed' },
    { value: 'Unmanaged', label: 'Unmanaged' },
  ];
}

function typeChoiceOptions(): GridChoiceOption[] {
  return [
    { value: 'Custom', label: 'Custom' },
    { value: 'Declarative', label: 'Declarative' },
  ];
}

function orchestrationTypeChoiceOptions(): GridChoiceOption[] {
  return [
    { value: 'Classic', label: 'Classic' },
    { value: 'Generative', label: 'Generative' },
  ];
}

export default function AllAgentsScreen() {
  const styles = useStyles();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const query = useAllAgents();
  const records = useMemo(() => query.data ?? [], [query.data]);
  const toasterId = useId();
  const { dispatchToast } = useToastController(toasterId);

  const [bulkAction, setBulkAction] = useState<
    { type: 'reassign' | 'quarantine' | 'unquarantine'; records: AgentInventoryRecord[] } | null
  >(null);
  const [selectedRecords, setSelectedRecords] = useState<AgentInventoryRecord[]>([]);
  const clearSelectionRef = useRef<(() => void) | null>(null);
  const exportActionRef = useRef<(() => void) | null>(null);

  const viewParam = searchParams.get('view');
  const activeView = isAgentInventoryView(viewParam) ? viewParam : null;
  const activeViewDefinition = activeView ? AGENT_INVENTORY_VIEWS[activeView] : null;

  const groupParam = searchParams.get('group') ?? undefined;

  const visibleRecords = useMemo(
    () => (activeViewDefinition ? records.filter(activeViewDefinition.predicate) : records),
    [activeViewDefinition, records],
  );

  const clearView = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('view');
    setSearchParams(next, { replace: true });
  };

  useEffect(() => {
    document.title = 'All agents | Agent Inventory | Copilot Studio Kit';
  }, []);

  const columns = useMemo<GridColumnDefinition<AgentInventoryRecord>[]>(() => [
    {
      columnId: 'name',
      label: 'Name',
      dataType: 'text',
      required: true,
      defaultVisible: true,
      minWidth: 160,
      idealWidth: 215,
      getValue: (record) => record.name,
      getSearchText: (record) => `${record.name} ${record.description ?? ''}`,
      renderCell: (record) => (
        <Link
          className={styles.nameLink}
          onClick={() => navigate(`/agent-inventory/agents/${encodeURIComponent(record.id)}`)}
        >
          {record.name}
        </Link>
      ),
    },
    {
      columnId: 'status',
      label: 'Status',
      dataType: 'choice',
      choiceOptions: statusChoiceOptions(),
      defaultVisible: true,
      minWidth: 90,
      idealWidth: 100,
      getValue: (record) => record.status,
      renderCell: (record) => <StatusValue status={record.status} />,
    },
    {
      columnId: 'owner',
      label: 'Owner',
      dataType: 'text',
      defaultVisible: true,
      minWidth: 140,
      idealWidth: 165,
      getValue: (record) => record.owner ?? '',
      getSearchText: (record) => `${record.owner ?? ''} ${record.ownerEmail ?? ''}`,
      renderCell: (record) => record.owner || '',
    },
    {
      columnId: 'environment',
      label: 'Environment',
      dataType: 'text',
      defaultVisible: true,
      minWidth: 150,
      idealWidth: 180,
      getValue: (record) => record.environmentName ?? '',
      renderCell: (record) => record.environmentName || '',
    },
    {
      columnId: 'authentication',
      label: 'End user authentication',
      dataType: 'choice',
      choiceOptions: authenticationChoiceOptions(),
      defaultVisible: true,
      minWidth: 150,
      idealWidth: 165,
      getValue: (record) => authenticationChoice(record.authenticationType),
      renderCell: (record) => authenticationChoice(record.authenticationType),
    },
    {
      columnId: 'usesGenAi',
      label: 'Uses Gen AI',
      dataType: 'boolean',
      choiceOptions: choiceOptions(),
      defaultVisible: true,
      minWidth: 120,
      idealWidth: 180,
      getValue: (record) => record.capabilities.usesGenAI,
      renderCell: (record) => <ChoiceValue value={record.capabilities.usesGenAI} />,
    },
    {
      columnId: 'usesMcp',
      label: 'Uses MCP',
      dataType: 'boolean',
      choiceOptions: choiceOptions(),
      defaultVisible: true,
      minWidth: 120,
      idealWidth: 180,
      getValue: (record) => record.capabilities.usesMCP,
      renderCell: (record) => <ChoiceValue value={record.capabilities.usesMCP} />,
    },
    {
      columnId: 'usage180d',
      label: 'Usage 180d',
      dataType: 'number',
      defaultVisible: true,
      align: 'end',
      minWidth: 120,
      idealWidth: 180,
      getValue: (record) => record.aggregateCredits,
      renderCell: (record) => formatNumber(record.aggregateCredits),
    },
    {
      columnId: 'lastUsageDate',
      label: 'Last usage date',
      dataType: 'date',
      defaultVisible: true,
      minWidth: 110,
      idealWidth: 110,
      getValue: (record) => record.lastUsageDate ?? '',
      renderCell: (record) => formatDate(record.lastUsageDate),
    },
    {
      columnId: 'type',
      label: 'Type',
      dataType: 'choice',
      choiceOptions: typeChoiceOptions(),
      getValue: (record) => record.type ?? '',
      renderCell: (record) => record.type,
    },
    {
      columnId: 'owningbusinessUnit',
      label: 'Owning business unit',
      dataType: 'text',
      minWidth: 160,
      idealWidth: 220,
      getValue: (record) => record.owningBusinessUnit ?? '',
      renderCell: (record) => record.owningBusinessUnit || '',
    },
    {
      columnId: 'location',
      label: 'Location',
      dataType: 'text',
      getValue: (record) => record.location ?? '',
      renderCell: (record) => record.location || '',
    },
    {
      columnId: 'autonomousAgent',
      label: 'Autonomous agent',
      dataType: 'boolean',
      choiceOptions: choiceOptions(),
      getValue: (record) => record.autonomousAgent,
      renderCell: (record) => <ChoiceValue value={record.autonomousAgent} />,
    },
    {
      columnId: 'totalUsage',
      label: 'Total usage',
      dataType: 'number',
      align: 'end',
      getValue: (record) => record.aggregateCredits,
      renderCell: (record) => formatNumber(record.aggregateCredits),
    },
    {
      columnId: 'agentId',
      label: 'Agent ID',
      dataType: 'text',
      minWidth: 180,
      idealWidth: 280,
      getValue: (record) => record.agentId,
      renderCell: (record) => record.agentId,
    },
    {
      columnId: 'evaluations',
      label: 'Evaluation test cases count',
      dataType: 'number',
      align: 'end',
      getValue: (record) => record.numberOfEvaluations,
      renderCell: (record) => formatNumber(record.numberOfEvaluations),
    },
    {
      columnId: 'description',
      label: 'Description',
      dataType: 'text',
      getValue: (record) => record.description ?? '',
      renderCell: (record) => record.description || '',
    },
    {
      columnId: 'instructions',
      label: 'Instructions',
      dataType: 'text',
      getValue: (record) => record.instructions ?? '',
      renderCell: (record) => record.instructions || '',
    },
    {
      columnId: 'agentDetailsId',
      label: 'Agent details ID',
      dataType: 'text',
      minWidth: 180,
      idealWidth: 280,
      getValue: (record) => record.id,
      renderCell: (record) => record.id,
    },
    {
      columnId: 'environmentId',
      label: 'Environment ID',
      dataType: 'text',
      minWidth: 180,
      idealWidth: 280,
      getValue: (record) => record.environmentId ?? '',
      renderCell: (record) => record.environmentId || '',
    },
    {
      columnId: 'environmentType',
      label: 'Environment type',
      dataType: 'choice',
      choiceOptions: uniqueOptions(records.map((record) => record.environmentType)),
      getValue: (record) => record.environmentType ?? '',
      renderCell: (record) => record.environmentType || '',
    },
    {
      columnId: 'environmentUrl',
      label: 'Environment URL',
      dataType: 'text',
      minWidth: 180,
      idealWidth: 260,
      getValue: (record) => record.environmentUrl ?? '',
      renderCell: (record) => record.environmentUrl || '',
    },
    {
      columnId: 'ownerEmail',
      label: 'Owner email',
      dataType: 'text',
      getValue: (record) => record.ownerEmail ?? '',
      renderCell: (record) => record.ownerEmail || '',
    },
    {
      columnId: 'ownerAdId',
      label: 'Owner (AAD ID)',
      dataType: 'text',
      minWidth: 180,
      idealWidth: 280,
      getValue: (record) => record.ownerAdId ?? '',
      renderCell: (record) => record.ownerAdId || '',
    },
    {
      columnId: 'createdBy',
      label: 'Created by',
      dataType: 'text',
      getValue: (record) => record.createdBy ?? '',
      renderCell: (record) => record.createdBy || '',
    },
    {
      columnId: 'createdByUpn',
      label: 'Created by (UPN)',
      dataType: 'text',
      getValue: (record) => record.createdByUpn ?? '',
      renderCell: (record) => record.createdByUpn || '',
    },
    {
      columnId: 'createdByAdId',
      label: 'Created by (AAD ID)',
      dataType: 'text',
      minWidth: 180,
      idealWidth: 280,
      getValue: (record) => record.createdByAdId ?? '',
      renderCell: (record) => record.createdByAdId || '',
    },
    {
      columnId: 'createdDate',
      label: 'Created date',
      dataType: 'date',
      getValue: (record) => record.createdDate ?? '',
      renderCell: (record) => formatDate(record.createdDate),
    },
    {
      columnId: 'modifiedBy',
      label: 'Modified by',
      dataType: 'text',
      getValue: (record) => record.modifiedBy ?? '',
      renderCell: (record) => record.modifiedBy || '',
    },
    {
      columnId: 'modifiedDate',
      label: 'Modified date',
      dataType: 'date',
      getValue: (record) => record.modifiedDate ?? '',
      renderCell: (record) => formatDate(record.modifiedDate),
    },
    {
      columnId: 'published',
      label: 'Published',
      dataType: 'choice',
      choiceOptions: choiceOptions(),
      getValue: (record) => record.published,
      renderCell: (record) => <ChoiceValue value={record.published} />,
    },
    {
      columnId: 'publishedBy',
      label: 'Published by',
      dataType: 'text',
      getValue: (record) => record.publishedBy ?? '',
      renderCell: (record) => record.publishedBy || '',
    },
    {
      columnId: 'publishedDate',
      label: 'Published date',
      dataType: 'date',
      getValue: (record) => record.publishedDate ?? '',
      renderCell: (record) => formatDate(record.publishedDate),
    },
    {
      columnId: 'orchestrationType',
      label: 'Orchestration',
      dataType: 'choice',
      choiceOptions: orchestrationTypeChoiceOptions(),
      getValue: (record) => record.orchestrationType ?? '',
      renderCell: (record) => record.orchestrationType || '',
    },
    {
      columnId: 'poweredBy',
      label: 'Powered by',
      dataType: 'choice',
      choiceOptions: poweredByChoiceOptions(),
      getValue: (record) => record.poweredBy ?? '',
      renderCell: (record) => record.poweredBy || '',
    },
    {
      columnId: 'model',
      label: 'Model',
      dataType: 'choice',
      choiceOptions: uniqueOptions(records.map((record) => record.model)),
      getValue: (record) => record.model ?? '',
      renderCell: (record) => record.model || '',
    },
    {
      columnId: 'managedState',
      label: 'Managed state',
      dataType: 'choice',
      choiceOptions: managedStateChoiceOptions(),
      getValue: (record) => record.managedState ?? '',
      renderCell: (record) => record.managedState || '',
    },
    {
      columnId: 'createdIn',
      label: 'Created in',
      dataType: 'choice',
      choiceOptions: createdInChoiceOptions(),
      getValue: (record) => record.createdIn ?? '',
      renderCell: (record) => record.createdIn || '',
    },
    {
      columnId: 'schemaName',
      label: 'Schema name',
      dataType: 'text',
      getValue: (record) => record.schemaName ?? '',
      renderCell: (record) => record.schemaName || '',
    },
    {
      columnId: 'defaultApplicationId',
      label: 'Default application ID',
      dataType: 'text',
      minWidth: 180,
      idealWidth: 280,
      getValue: (record) => record.defaultApplicationId ?? '',
      renderCell: (record) => record.defaultApplicationId || '',
    },
    {
      columnId: 'template',
      label: 'Template',
      dataType: 'choice',
      choiceOptions: uniqueOptions(records.map((record) => record.template)),
      getValue: (record) => record.template ?? '',
      renderCell: (record) => record.template || '',
    },
    {
      columnId: 'transcriptAvailable',
      label: 'Transcript available',
      dataType: 'choice',
      choiceOptions: choiceOptions(),
      getValue: (record) => record.transcriptAvailable,
      renderCell: (record) => <ChoiceValue value={record.transcriptAvailable} />,
    },
    {
      columnId: 'hasSystemAdminAccess',
      label: 'Has system admin access',
      dataType: 'choice',
      choiceOptions: choiceOptions(),
      getValue: (record) => record.hasSystemAdminAccess,
      renderCell: (record) => <ChoiceValue value={record.hasSystemAdminAccess} />,
    },
    {
      columnId: 'hasPpacMismatch',
      label: 'Has PPAC mismatch',
      dataType: 'choice',
      choiceOptions: choiceOptions(),
      getValue: (record) => record.hasPpacMismatch,
      renderCell: (record) => <ChoiceValue value={record.hasPpacMismatch} />,
    },
    {
      columnId: 'testConfigured',
      label: 'Test configured',
      dataType: 'choice',
      choiceOptions: choiceOptions(),
      getValue: (record) => record.testConfigured,
      renderCell: (record) => <ChoiceValue value={record.testConfigured} />,
    },
    {
      columnId: 'firstUsagedate',
      label: 'First usage date',
      dataType: 'date',
      minWidth: 110,
      idealWidth: 110,
      getValue: (record) => record.firstUsageDate ?? '',
      renderCell: (record) => formatDate(record.firstUsageDate),
    },
    {
      columnId: 'firstUsageFeature',
      label: 'First usage feature',
      dataType: 'text',
      minWidth: 110,
      idealWidth: 110,
      getValue: (record) => record.firstUsageFeature ?? '',
      renderCell: (record) => record.firstUsageFeature || '',
    },
    {
      columnId: 'lastUsageFeature',
      label: 'Last usage feature',
      dataType: 'text',
      minWidth: 110,
      idealWidth: 110,
      getValue: (record) => record.lastUsageFeature ?? '',
      renderCell: (record) => record.lastUsageFeature || '',
    },
    {
      columnId: 'usesPrompts',
      label: 'Uses prompts',
      dataType: 'choice',
      choiceOptions: choiceOptions(),
      getValue: (record) => record.capabilities.usesPrompts,
      renderCell: (record) => <ChoiceValue value={record.capabilities.usesPrompts} />,
    },
    {
      columnId: 'usesEvaluations',
      label: 'Uses evaluations',
      dataType: 'choice',
      choiceOptions: choiceOptions(),
      getValue: (record) => record.capabilities.usesEvaluations,
      renderCell: (record) => <ChoiceValue value={record.capabilities.usesEvaluations} />,
    },
    {
      columnId: 'usesEnhancedSearch',
      label: 'Uses enhanced search',
      dataType: 'choice',
      choiceOptions: choiceOptions(),
      getValue: (record) => record.capabilities.usesEnhancedSearch,
      renderCell: (record) => <ChoiceValue value={record.capabilities.usesEnhancedSearch} />,
    },
    {
      columnId: 'usesFileInput',
      label: 'Uses file input',
      dataType: 'choice',
      choiceOptions: choiceOptions(),
      getValue: (record) => record.capabilities.usesFileInput,
      renderCell: (record) => <ChoiceValue value={record.capabilities.usesFileInput} />,
    },
    {
      columnId: 'usesCustomizedResponses',
      label: 'Uses customized responses',
      dataType: 'choice',
      choiceOptions: choiceOptions(),
      getValue: (record) => record.capabilities.usesCustomizedResponses,
      renderCell: (record) => <ChoiceValue value={record.capabilities.usesCustomizedResponses} />,
    },
    {
      columnId: 'usesSkills',
      label: 'Uses skills',
      dataType: 'choice',
      choiceOptions: choiceOptions(),
      getValue: (record) => record.capabilities.usesSkills,
      renderCell: (record) => <ChoiceValue value={record.capabilities.usesSkills} />,
    },
    {
      columnId: 'usesComputerUse',
      label: 'Uses computer use',
      dataType: 'choice',
      choiceOptions: choiceOptions(),
      getValue: (record) => record.capabilities.usesComputer,
      renderCell: (record) => <ChoiceValue value={record.capabilities.usesComputer} />,
    },
    {
      columnId: 'usesHttpRequests',
      label: 'Uses HTTP requests',
      dataType: 'choice',
      choiceOptions: choiceOptions(),
      getValue: (record) => record.capabilities.usesHttpRequests,
      renderCell: (record) => <ChoiceValue value={record.capabilities.usesHttpRequests} />,
    },
    {
      columnId: 'usesCustomKnowledge',
      label: 'Uses custom knowledge',
      dataType: 'choice',
      choiceOptions: choiceOptions(),
      getValue: (record) => record.capabilities.usesCustomKnowledgeSource,
      renderCell: (record) => <ChoiceValue value={record.capabilities.usesCustomKnowledgeSource} />,
    },
    {
      columnId: 'usesClassicGenerativeAnswerSources',
      label: 'Uses classic generative answer sources',
      dataType: 'choice',
      choiceOptions: choiceOptions(),
      getValue: (record) => record.capabilities.usesClassicGenerativeAnswerSources,
      renderCell: (record) => <ChoiceValue value={record.capabilities.usesClassicGenerativeAnswerSources} />,
    },
    {
      columnId: 'usesAIKnowledge',
      label: 'Uses AI knowledge',
      dataType: 'choice',
      choiceOptions: choiceOptions(),
      getValue: (record) => record.capabilities.usesAIKnowledge,
      renderCell: (record) => <ChoiceValue value={record.capabilities.usesAIKnowledge} />,
    },
    {
      columnId: 'usesDeepReasoning',
      label: 'Uses deep reasoning',
      dataType: 'choice',
      choiceOptions: choiceOptions(),
      getValue: (record) => record.capabilities.usesDeepReasoning,
      renderCell: (record) => <ChoiceValue value={record.capabilities.usesDeepReasoning} />,
    },
    {
      columnId: 'usesKnowledgeSources',
      label: 'Uses knowledge sources',
      dataType: 'choice',
      choiceOptions: choiceOptions(),
      getValue: (record) => record.capabilities.usesKnowledgeSources,
      renderCell: (record) => <ChoiceValue value={record.capabilities.usesKnowledgeSources} />,
    },
    {
      columnId: 'usesTools',
      label: 'Uses tools',
      dataType: 'choice',
      choiceOptions: choiceOptions(),
      getValue: (record) => record.capabilities.usesTools,
      renderCell: (record) => <ChoiceValue value={record.capabilities.usesTools} />,
    },
    {
      columnId: 'usesConnectorMakerAuthContext',
      label: 'Uses connector maker auth context',
      dataType: 'choice',
      choiceOptions: choiceOptions(),
      getValue: (record) => record.capabilities.usesConnectorMakerAuthContext,
      renderCell: (record) => <ChoiceValue value={record.capabilities.usesConnectorMakerAuthContext} />,
    },
    {
      columnId: 'usesCloudFlowAuthContext',
      label: 'Uses cloud flow auth context',
      dataType: 'choice',
      choiceOptions: choiceOptions(),
      getValue: (record) => record.capabilities.usesCloudFlowAuthContext,
      renderCell: (record) => <ChoiceValue value={record.capabilities.usesCloudFlowAuthContext} />,
    },
    {
      columnId: 'websearchEnabled',
      label: 'Web search enabled',
      dataType: 'choice',
      choiceOptions: choiceOptions(),
      getValue: (record) => record.capabilities.webSearchEnabled,
      renderCell: (record) => <ChoiceValue value={record.capabilities.webSearchEnabled} />,
    },
    {
      columnId: 'knowledgeSources',
      label: 'Knowledge sources',
      dataType: 'text',
      minWidth: 180,
      idealWidth: 280,
      getValue: (record) => record.components.knowledgeSources ?? '',
      renderCell: (record) => record.components.knowledgeSources || '',
    },
    {
      columnId: 'prompts',
      label: 'Prompts',
      dataType: 'text',
      minWidth: 180,
      idealWidth: 280,
      getValue: (record) => record.components.prompts ?? '',
      renderCell: (record) => record.components.prompts || '',
    },
    {
      columnId: 'agentTriggers',
      label: 'Agent triggers',
      dataType: 'text',
      minWidth: 180,
      idealWidth: 280,
      getValue: (record) => record.components.triggers ?? '',
      renderCell: (record) => record.components.triggers || '',
    },
    {
      columnId: 'classicDataSources',
      label: 'Classic data sources',
      dataType: 'text',
      minWidth: 180,
      idealWidth: 280,
      getValue: (record) => record.components.classicDataSources ?? '',
      renderCell: (record) => record.components.classicDataSources || '',
    },
    {
      columnId: 'httpRequestActions',
      label: 'HTTP request actions',
      dataType: 'text',
      minWidth: 180,
      idealWidth: 280,
      getValue: (record) => record.components.httpRequestActions ?? '',
      renderCell: (record) => record.components.httpRequestActions || '',
    },
    {
      columnId: 'connections',
      label: 'Connections',
      dataType: 'text',
      minWidth: 180,
      idealWidth: 280,
      getValue: (record) => record.components.connections ?? '',
      renderCell: (record) => record.components.connections || '',
    },
    {
      columnId: 'skills',
      label: 'Skills',
      dataType: 'text',
      minWidth: 180,
      idealWidth: 280,
      getValue: (record) => record.components.skills ?? '',
      renderCell: (record) => record.components.skills || '',
    },
    {
      columnId: 'evaluationDetails',
      label: 'Evaluations',
      dataType: 'text',
      minWidth: 180,
      idealWidth: 280,
      getValue: (record) => record.components.evaluations ?? '',
      renderCell: (record) => record.components.evaluations || '',
    },
    {
      columnId: 'mcp',
      label: 'MCP servers and tools',
      dataType: 'text',
      minWidth: 180,
      idealWidth: 280,
      getValue: (record) => record.components.mcp ?? '',
      renderCell: (record) => record.components.mcp || '',
    },
    {
      columnId: 'connectedAgents',
      label: 'Connected agents',
      dataType: 'text',
      minWidth: 180,
      idealWidth: 280,
      getValue: (record) => record.components.connectedAgents ?? '',
      renderCell: (record) => record.components.connectedAgents || '',
    },
    {
      columnId: 'usageData',
      label: 'Usage data',
      dataType: 'text',
      minWidth: 180,
      idealWidth: 280,
      getValue: (record) => record.components.usageData ?? '',
      renderCell: (record) => record.components.usageData || '',
    },
    {
      columnId: 'usageAgentActionBilled',
      label: 'Usage agent action billed',
      dataType: 'number',
      align: 'end',
      minWidth: 120,
      idealWidth: 180,
      getValue: (record) => record.agentUsage.usageAgentActionBilled,
      renderCell: (record) => formatNumber(record.agentUsage.usageAgentActionBilled),
    },
    {
      columnId: 'usageAgentActionNonBilled',
      label: 'Usage agent action non-billed',
      dataType: 'number',
      align: 'end',
      minWidth: 120,
      idealWidth: 180,
      getValue: (record) => record.agentUsage.usageAgentActionNonBilled,
      renderCell: (record) => formatNumber(record.agentUsage.usageAgentActionNonBilled),
    },
    {
      columnId: 'usageAgentFlowActionBilled',
      label: 'Usage agent flow action billed',
      dataType: 'number',
      align: 'end',
      minWidth: 120,
      idealWidth: 180,
      getValue: (record) => record.agentUsage.usageAgentFlowActionBilled,
      renderCell: (record) => formatNumber(record.agentUsage.usageAgentFlowActionBilled),
    },
    {
      columnId: 'usageAgentFlowActionNonBilled',
      label: 'Usage agent flow action non-billed',
      dataType: 'number',
      align: 'end',
      minWidth: 120,
      idealWidth: 180,
      getValue: (record) => record.agentUsage.usageAgentFlowActionNonBilled,
      renderCell: (record) => formatNumber(record.agentUsage.usageAgentFlowActionNonBilled),
    },
    {
      columnId: 'usageClassicAnswerBilled',
      label: 'Usage classic answer billed',
      dataType: 'number',
      align: 'end',
      minWidth: 120,
      idealWidth: 180,
      getValue: (record) => record.agentUsage.usageClassicAnswerBilled,
      renderCell: (record) => formatNumber(record.agentUsage.usageClassicAnswerBilled),
    },
    {
      columnId: 'usageClassicAnswerNonBilled',
      label: 'Usage classic answer non-billed',
      dataType: 'number',
      align: 'end',
      minWidth: 120,
      idealWidth: 180,
      getValue: (record) => record.agentUsage.usageClassicAnswerNonBilled,
      renderCell: (record) => formatNumber(record.agentUsage.usageClassicAnswerNonBilled),
    },
    {
      columnId: 'usageGenerativeAnswerBilled',
      label: 'Usage generative answer billed',
      dataType: 'number',
      align: 'end',
      minWidth: 120,
      idealWidth: 180,
      getValue: (record) => record.agentUsage.usageGenerativeAnswerBilled,
      renderCell: (record) => formatNumber(record.agentUsage.usageGenerativeAnswerBilled),
    },
    {
      columnId: 'usageGenerativeAnswerNonBilled',
      label: 'Usage generative answer non-billed',
      dataType: 'number',
      align: 'end',
      minWidth: 120,
      idealWidth: 180,
      getValue: (record) => record.agentUsage.usageGenerativeAnswerNonBilled,
      renderCell: (record) => formatNumber(record.agentUsage.usageGenerativeAnswerNonBilled),
    },
    {
      columnId: 'usageTextAndGenAIToolsBasicBilled',
      label: 'Usage text and Gen AI tools basic billed',
      dataType: 'number',
      align: 'end',
      minWidth: 120,
      idealWidth: 180,
      getValue: (record) => record.agentUsage.usageTextAndGenAIToolsBasicBilled,
      renderCell: (record) => formatNumber(record.agentUsage.usageTextAndGenAIToolsBasicBilled),
    },
    {
      columnId: 'usageTextAndGenAIToolsBasicNonBilled',
      label: 'Usage text and Gen AI tools basic non-billed',
      dataType: 'number',
      align: 'end',
      minWidth: 120,
      idealWidth: 180,
      getValue: (record) => record.agentUsage.usageTextAndGenAIToolsBasicNonBilled,
      renderCell: (record) => formatNumber(record.agentUsage.usageTextAndGenAIToolsBasicNonBilled),
    },
    {
      columnId: 'usageTextAndGenAIToolsStandardBilled',
      label: 'Usage text and Gen AI tools standard billed',
      dataType: 'number',
      align: 'end',
      minWidth: 120,
      idealWidth: 180,
      getValue: (record) => record.agentUsage.usageTextAndGenAIToolsStandardBilled,
      renderCell: (record) => formatNumber(record.agentUsage.usageTextAndGenAIToolsStandardBilled),
    },
    {
      columnId: 'usageTextAndGenAIToolsStandardNonBilled',
      label: 'Usage text and Gen AI tools standard non-billed',
      dataType: 'number',
      align: 'end',
      minWidth: 120,
      idealWidth: 180,
      getValue: (record) => record.agentUsage.usageTextAndGenAIToolsStandardNonBilled,
      renderCell: (record) => formatNumber(record.agentUsage.usageTextAndGenAIToolsStandardNonBilled),
    },
    {
      columnId: 'usageTextAndGenAIToolsPremiumBilled',
      label: 'Usage text and Gen AI tools premium billed',
      dataType: 'number',
      align: 'end',
      minWidth: 120,
      idealWidth: 180,
      getValue: (record) => record.agentUsage.usageTextAndGenAIToolsPremiumBilled,
      renderCell: (record) => formatNumber(record.agentUsage.usageTextAndGenAIToolsPremiumBilled),
    },
    {
      columnId: 'usageTextAndGenAIToolsPremiumNonBilled',
      label: 'Usage text and Gen AI tools premium non-billed',
      dataType: 'number',
      align: 'end',
      minWidth: 120,
      idealWidth: 180,
      getValue: (record) => record.agentUsage.usageTextAndGenAIToolsPremiumNonBilled,
      renderCell: (record) => formatNumber(record.agentUsage.usageTextAndGenAIToolsPremiumNonBilled),
    },
    {
      columnId: 'sharedWithEditorUsers',
      label: 'Shared with editor users',
      dataType: 'number',
      align: 'end',
      minWidth: 120,
      idealWidth: 180,
      getValue: (record) => record.sharedWithEditorUserCount,
      renderCell: (record) => formatNumber(record.sharedWithEditorUserCount),
    },
    {
      columnId: 'sharedWithEditorGroups',
      label: 'Shared with editor groups',
      dataType: 'number',
      align: 'end',
      minWidth: 120,
      idealWidth: 180,
      getValue: (record) => record.sharedWithEditorGroupCount,
      renderCell: (record) => formatNumber(record.sharedWithEditorGroupCount),
    },
    {
      columnId: 'sharedWithViewerUsers',
      label: 'Shared with viewer users',
      dataType: 'number',
      align: 'end',
      minWidth: 120,
      idealWidth: 180,
      getValue: (record) => record.sharedWithViewerUserCount,
      renderCell: (record) => formatNumber(record.sharedWithViewerUserCount),
    },
    {
      columnId: 'sharedWithViewerGroups',
      label: 'Shared with viewer groups',
      dataType: 'number',
      align: 'end',
      minWidth: 120,
      idealWidth: 180,
      getValue: (record) => record.sharedWithViewerGroupCount,
      renderCell: (record) => formatNumber(record.sharedWithViewerGroupCount),
    },
    {
      columnId: 'sharedWithEntireTenantAsViewer',
      label: 'Shared with entire tenant as viewer',
      dataType: 'choice',
      choiceOptions: choiceOptions(),
      minWidth: 150,
      idealWidth: 210,
      getValue: (record) => record.sharedWithEntireTenantAsViewer,
      renderCell: (record) => <ChoiceValue value={record.sharedWithEntireTenantAsViewer} />,
    },
  ], [navigate, records, styles.nameLink, styles.secondary]);

  const openBulkAction = (
    type: 'reassign' | 'quarantine' | 'unquarantine',
    records: AgentInventoryRecord[],
  ) => {
    setBulkAction({ type, records });
  };

  const completeBulkAction = (summary: ActionCompletionSummary) => {
    if (summary.single && summary.total > 0) {
      const failed = summary.errorCount > 0;
      dispatchToast(
        <Toast>
          <ToastTitle>
            {failed
              ? (summary.errorMessage?.trim() || `Unable to ${summary.action.toLowerCase()} the agent.`)
              : `${summary.action} completed successfully.`}
          </ToastTitle>
        </Toast>,
        { intent: failed ? 'error' : 'success' },
      );
    }
    clearSelectionRef.current?.();
    setBulkAction(null);
    void query.refetch();
  };

  const renderSelectionActions = ({
    selectedKeys,
    clearSelection,
  }: GridSelectionActionsContext<AgentInventoryRecord>) => {
    if (selectedKeys.length === 0) return null;
    return (
      <div className={styles.actions}>
        <Text className={styles.selectionCount}>{selectedKeys.length} selected</Text>
        <Button className={styles.clearSelection} appearance="subtle" onClick={clearSelection}>
          Clear selection
        </Button>
      </div>
    );
  };

  const exceedsBulkLimit = selectedRecords.length > MAX_BULK_ACTION_RECORDS;
  const noMismatch = selectedRecords.every((record) => record.hasPpacMismatch !== 'yes');
  const canReassign = selectedRecords.length > 0 && !exceedsBulkLimit && noMismatch;
  const canQuarantine = canReassign
    && selectedRecords.every((record) => record.status === 'Draft' || record.status === 'Available');
  const canUnquarantine = canReassign
    && selectedRecords.every((record) => record.status === 'Blocked');
  const handleSelectionChange = useCallback(
    (_selectedKeys: string[], selected: AgentInventoryRecord[]) => {
      setSelectedRecords((current) => {
        const unchanged = current.length === selected.length
          && current.every((record, index) => record.id === selected[index]?.id);
        return unchanged ? current : selected;
      });
    },
    [],
  );

  return (
    <main className={styles.root}>
      <Toaster toasterId={toasterId} position="top-end" />
      <header className={styles.chrome}>
        <AgentInventoryBreadcrumb
          items={[
            { label: 'Agent Inventory', onClick: () => navigate('/agent-inventory') },
            { label: 'All agents' },
          ]}
        />
        <div className={styles.chromeActions}>
          {canReassign && (
            <Button
              appearance="outline"
              icon={<PersonArrowRight24Regular />}
              onClick={() => openBulkAction('reassign', selectedRecords)}
            >
              Reassign
            </Button>
          )}
          {canQuarantine && (
            <Button
              appearance="outline"
              icon={<ShieldDismiss24Regular />}
              onClick={() => openBulkAction('quarantine', selectedRecords)}
            >
              Quarantine
            </Button>
          )}
          {canUnquarantine && (
            <Button
              appearance="outline"
              icon={<ShieldCheckmark24Regular />}
              onClick={() => openBulkAction('unquarantine', selectedRecords)}
            >
              Unquarantine
            </Button>
          )}
          <Button
            appearance="outline"
            icon={<ArrowDownload24Regular />}
            onClick={() => exportActionRef.current?.()}
          >
            Export
          </Button>
        </div>
      </header>
      <div className={styles.content}>
        {activeViewDefinition && (
          <MessageBar intent="info" className={styles.filterBanner}>
            <MessageBarBody>
              Filtered by <strong>{activeViewDefinition.label}</strong> — showing{' '}
              {visibleRecords.length.toLocaleString()} of {records.length.toLocaleString()} agents.
            </MessageBarBody>
            <MessageBarActions>
              <Button
                appearance="transparent"
                icon={<DismissRegular />}
                onClick={clearView}
              >
                Clear filter
              </Button>
            </MessageBarActions>
          </MessageBar>
        )}
        <AdvancedDataGrid
          gridId="all-agents"
          ariaLabel="All agents"
          title="Agents"
          records={visibleRecords}
          initialGroupColumnId={groupParam}
          columns={columns}
          getRecordKey={(record) => record.id}
          searchPlaceholder="Search name, owner, environment"
          isLoading={query.isLoading}
          error={query.error}
          onRetry={() => { void query.refetch(); }}
          emptyMessage="No agents have been synchronized yet."
          noResultsMessage="No agents match the current search and filters."
          renderSelectionActions={renderSelectionActions}
          selectionNotice={exceedsBulkLimit ? (
            <MessageBar intent="warning">
              <MessageBarBody>
                You can select a maximum of {MAX_BULK_ACTION_RECORDS} records to perform a bulk action.
              </MessageBarBody>
            </MessageBar>
          ) : undefined}
          onSelectionChange={handleSelectionChange}
          exportActionRef={exportActionRef}
          clearSelectionActionRef={clearSelectionRef}
          showToolbarExport={false}
          fillAvailableHeight
        />
      </div>
      <ReassignAgentDialog
        open={bulkAction?.type === 'reassign'}
        agents={bulkAction?.type === 'reassign' ? bulkAction.records : []}
        onClose={() => setBulkAction(null)}
        onCompleted={completeBulkAction}
      />
      <QuarantineActionDialog
        open={bulkAction?.type === 'quarantine'}
        mode="quarantine"
        agents={bulkAction?.type === 'quarantine' ? bulkAction.records : []}
        onClose={() => setBulkAction(null)}
        onCompleted={completeBulkAction}
      />
      <QuarantineActionDialog
        open={bulkAction?.type === 'unquarantine'}
        mode="unquarantine"
        agents={bulkAction?.type === 'unquarantine' ? bulkAction.records : []}
        onClose={() => setBulkAction(null)}
        onCompleted={completeBulkAction}
      />
    </main>
  );
}
