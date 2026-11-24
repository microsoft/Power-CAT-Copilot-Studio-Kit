import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button, Field, Input, Textarea, Dropdown, Option, OptionGroup, Switch,
  DataGrid, DataGridHeader, DataGridRow, DataGridHeaderCell, DataGridBody, DataGridCell,
  createTableColumn,
  makeStyles, tokens, Badge, Tooltip, MessageBar, MessageBarBody, Text, Spinner,
  SearchBox, Subtitle2, Title3, Body1, Caption1,
  Breadcrumb, BreadcrumbItem, BreadcrumbDivider, BreadcrumbButton,
  Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent, DialogActions,
  useId,
  Toaster, useToastController, Toast, ToastTitle, ToastBody,
  Menu, MenuTrigger, MenuPopover, MenuList, MenuItem,
} from '@fluentui/react-components';
import type { TableColumnDefinition } from '@fluentui/react-components';
import { format, parseISO } from 'date-fns';
import {
  Add24Regular, Delete24Regular, Info16Regular,
  ChevronLeft24Regular, ChevronRight24Regular,
  ChevronDown20Regular, ChevronUp20Regular,
  Rocket24Regular, Compose24Regular,
  MoreVertical20Regular, Edit24Regular,
  CheckmarkCircle24Regular, DismissCircle24Regular,
  ArrowClockwise20Regular,
} from '@fluentui/react-icons';
import { metricService } from '../../services/metricService';
import { schemaCatalog, findTable, tableLabel, fieldLabel, TABLE_CATEGORIES, type FieldKind, type TableCategory } from '../../services/schemaCatalog';
import { metricDomains, allSuggestedMetrics, type SuggestedMetric } from '../../services/suggestedMetrics';
import { DomainCards } from './DomainCards';
import { MetricPickerDrawer } from './MetricPickerDrawer';
import type { AggregationType, MetricCategory, MetricDefinition, VisualizationType } from '../../types';
import { useAppStore } from '../../store/appStore';

const useStyles = makeStyles({
  root: {
    display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0,
  },
  commandBar: {
    display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalM,
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalL}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    background: tokens.colorNeutralBackground1,
  },
  page: {
    display: 'flex', flexDirection: 'column', flex: 1, overflow: 'auto',
    padding: `${tokens.spacingVerticalL} ${tokens.spacingHorizontalXXL}`,
    background: tokens.colorNeutralBackground2,
  },

  toolbar: { display: 'flex', gap: tokens.spacingHorizontalS, marginBottom: tokens.spacingVerticalM, alignItems: 'center' },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalM}`, alignItems: 'start' },
  confirmBar: { marginBottom: tokens.spacingVerticalM },
  formContainer: {
    maxWidth: '720px',
    paddingRight: tokens.spacingHorizontalXXL,
  },
  deleteActions: { display: 'flex', gap: tokens.spacingHorizontalS, marginLeft: 'auto' },
  toolbarSpacer: { flex: '1' },
  fullWidth: { gridColumn: '1 / span 2' },
  fieldKind: { color: tokens.colorNeutralForeground3, fontSize: '11px' },
  vizOptionContent: { display: 'flex', flexDirection: 'column' as const },
  vizOptionDesc: { fontSize: '11px', color: tokens.colorNeutralForeground3, lineHeight: '14px' },
  sectionLabel: { gridColumn: '1 / span 2', fontSize: '12px', fontWeight: 600, color: tokens.colorNeutralForeground3, textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginTop: tokens.spacingVerticalS, borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, paddingBottom: tokens.spacingVerticalXS },
  infoIcon: { color: tokens.colorNeutralForeground3, cursor: 'help', verticalAlign: 'middle', marginLeft: '4px', fontSize: '14px' },
  labelWithInfo: { display: 'inline-flex', alignItems: 'center', gap: '2px' },
  searchBox: { minWidth: '300px', flex: '1' },
  domainPanel: {
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalL}`,
    background: tokens.colorNeutralBackground1,
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    marginBottom: tokens.spacingVerticalM,
  },
  domainSection: { marginBottom: tokens.spacingVerticalL },
  domainHeading: { marginBottom: tokens.spacingVerticalS },
  breadcrumb: { marginBottom: tokens.spacingVerticalS },
  breadcrumbCurrent: { fontWeight: 600, color: tokens.colorNeutralForeground1 },
  breadcrumbLink: {
    border: 'none',
    background: 'none',
    color: tokens.colorNeutralForeground2,
    ':hover': { color: tokens.colorBrandForeground1, background: 'none', border: 'none' },
    ':focus-visible': { outlineStyle: 'solid', outlineWidth: '2px', outlineColor: tokens.colorStrokeFocus2 },
  },
  emptyState: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    padding: `${tokens.spacingVerticalXXL} ${tokens.spacingHorizontalXXL}`,
    background: tokens.colorNeutralBackground1,
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    marginBottom: tokens.spacingVerticalL,
    textAlign: 'center' as const,
    gap: tokens.spacingVerticalM,
  },
  emptyActions: {
    display: 'flex', gap: tokens.spacingHorizontalM, alignItems: 'center',
    marginTop: tokens.spacingVerticalS,
  },
  formActions: { marginTop: tokens.spacingVerticalL, justifyContent: 'flex-end' },
  gridContainer: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    overflow: 'hidden',
  },
  pagination: {
    display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalM,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    background: tokens.colorNeutralBackground2,
  },
  paginationText: { fontSize: '12px', color: tokens.colorNeutralForeground3 },
  paginationSpacer: { flex: '1' },
  sourceCell: { display: 'flex', flexDirection: 'column' as const, gap: '2px' },
  statusPublished: { display: 'inline-flex', alignItems: 'center', gap: '6px', color: tokens.colorPaletteGreenForeground1 },
  statusDraft: { display: 'inline-flex', alignItems: 'center', gap: '6px', color: tokens.colorPaletteDarkOrangeForeground1 },
  statusDot: { width: '8px', height: '8px', borderRadius: '50%', display: 'inline-block' },
  dotGreen: { backgroundColor: tokens.colorPaletteGreenForeground1 },
  dotOrange: { backgroundColor: tokens.colorPaletteDarkOrangeForeground1 },
});

/** Auto-suggest a MetricCategory based on the table's domain category */
const TABLE_CAT_TO_METRIC_CAT: Record<TableCategory, MetricCategory> = {
  Conversations: 'Conversations',
  Performance: 'Performance',
  Agents: 'Adoption',
  Quality: 'Quality',
  Testing: 'Quality',
};

// --- Smart defaults by field kind ---

const AGG_BY_KIND: Record<FieldKind, { default: AggregationType; allowed: AggregationType[] }> = {
  numeric:     { default: 'Sum',   allowed: ['Sum', 'Average', 'Count', 'Min', 'Max', 'Latest'] },
  id:          { default: 'Count', allowed: ['Count'] },
  text:        { default: 'Count', allowed: ['Count'] },
  boolean:     { default: 'Count', allowed: ['Count'] },
  categorical: { default: 'Count', allowed: ['Count'] },
  date:        { default: 'Count', allowed: ['Count', 'Min', 'Max', 'Latest'] },
};

const VIZ_BY_KIND: Record<FieldKind, { default: VisualizationType; allowed: VisualizationType[] }> = {
  numeric:     { default: 'Line',  allowed: ['KPI', 'Line', 'Bar', 'HorizontalBar', 'GroupedBar', 'Area', 'Table'] },
  id:          { default: 'KPI',   allowed: ['KPI', 'Line', 'Bar', 'HorizontalBar', 'GroupedBar', 'Area', 'Table'] },
  text:        { default: 'Table', allowed: ['Bar', 'HorizontalBar', 'TopicsList', 'Table'] },
  boolean:     { default: 'KPI',   allowed: ['KPI', 'Bar', 'HorizontalBar', 'GroupedBar', 'Donut', 'Table'] },
  categorical: { default: 'Donut', allowed: ['KPI', 'Bar', 'HorizontalBar', 'GroupedBar', 'Donut', 'TopicsList', 'Table'] },
  date:        { default: 'Line',  allowed: ['KPI', 'Line', 'Area', 'Table'] },
};

/** Display labels for visualization types */
const VIZ_LABELS: Record<VisualizationType, string> = {
  KPI: 'KPI Card',
  Line: 'Line',
  Area: 'Area',
  Bar: 'Vertical Bar',
  HorizontalBar: 'Horizontal Bar',
  GroupedBar: 'Grouped Bar',
  Donut: 'Donut',
  TopicsList: 'Ranked List',
  Table: 'Data Table',
};

/** Short descriptions for each visualization type */
const VIZ_DESCRIPTIONS: Record<VisualizationType, string> = {
  KPI: 'Single value with trend sparkline and delta badge',
  Line: 'Plots values over time as a connected line',
  Area: 'Line chart with filled area beneath',
  Bar: 'Vertical columns comparing values by category or time',
  HorizontalBar: 'Horizontal bars, ideal for ranked or long-label data',
  GroupedBar: 'Side-by-side bars comparing multiple series',
  Donut: 'Proportional ring chart for composition breakdown',
  TopicsList: 'Ranked list of items sorted by value',
  Table: 'Grid with predefined columns from the source table',
};

/** Grouped visualization options for the dropdown */
const VIZ_GROUPS: { label: string; items: VisualizationType[] }[] = [
  { label: 'Summary', items: ['KPI'] },
  { label: 'Trends', items: ['Line', 'Area'] },
  { label: 'Comparison', items: ['Bar', 'HorizontalBar', 'GroupedBar'] },
  { label: 'Composition', items: ['Donut', 'TopicsList'] },
  { label: 'Detail', items: ['Table'] },
];

function generateAutoName(
  tableLogical: string, fieldLabel: string, fieldKind: FieldKind, agg: AggregationType,
): string {
  if (fieldKind === 'id') return `${tableLabel(tableLogical)} count`;
  if (fieldKind === 'categorical') return `${fieldLabel} breakdown`;
  if (fieldKind === 'text' || fieldKind === 'boolean') return `${fieldLabel} count`;
  // numeric / date
  switch (agg) {
    case 'Sum':     return `Total ${fieldLabel}`;
    case 'Average': return `Avg ${fieldLabel}`;
    case 'Count':   return `${fieldLabel} count`;
    case 'Min':     return `Min ${fieldLabel}`;
    case 'Max':     return `Max ${fieldLabel}`;
    case 'Latest':  return `Latest ${fieldLabel}`;
  }
}

function normalizeMetricDraft(
  draft: MetricDefinition & { nameManuallyEdited?: boolean },
  fieldKind: FieldKind,
  fieldLbl: string,
): MetricDefinition & { nameManuallyEdited?: boolean } {
  const aggRules = AGG_BY_KIND[fieldKind];
  const vizRules = VIZ_BY_KIND[fieldKind];
  let agg = draft.aggregation;
  let viz = draft.visualizationType;
  // Ensure aggregation is valid for this field kind
  if (!aggRules.allowed.includes(agg)) agg = aggRules.default;
  // Ensure visualization is valid for this field kind
  if (!vizRules.allowed.includes(viz)) viz = vizRules.default;
  // Auto-generate name if not manually edited
  const name = draft.nameManuallyEdited
    ? draft.name
    : generateAutoName(draft.sourceTable, fieldLbl, fieldKind, agg);
  return { ...draft, aggregation: agg, visualizationType: viz, name };
}

const empty: MetricDefinition & { nameManuallyEdited?: boolean } = {
  id: '', name: '', category: 'Conversations',
  sourceTable: schemaCatalog[0]?.logical ?? 'cat_copilotkpi',
  sourceField: '',
  aggregation: 'Sum',
  visualizationType: 'KPI', isActive: true,
  nameManuallyEdited: false,
};

export function MetricRegistry() {
  const s = useStyles();
  const setView = useAppStore(st => st.setView);
  const toasterId = useId('metric-registry-toaster');
  const { dispatchToast } = useToastController(toasterId);
  const [rows, setRows] = useState<MetricDefinition[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [editing, setEditing] = useState<(MetricDefinition & { nameManuallyEdited?: boolean }) | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [pendingAction, setPendingAction] = useState<
    | { type: 'delete'; ids: string[] }
    | { type: 'publish'; ids: string[] }
    | { type: 'unpublish'; ids: string[] }
    | null
  >(null);
  const [drawerDomain, setDrawerDomain] = useState<import('../../services/suggestedMetrics').MetricDomain | null>(null);
  const [showDomains, setShowDomains] = useState(true);
  // (bulk-add states removed — now using domain cards + picker drawer only)
  const [formDirty, setFormDirty] = useState(false);
  const [pendingNav, setPendingNav] = useState<(() => void) | null>(null);

  const refresh = async () => {
    const list = await metricService.listAllMetrics(true);
    setRows(list);
    const activeList = list.filter(m => m.isActive);
    const validIds = new Set(activeList.map(m => m.id));
    const { currentLayout } = useAppStore.getState();
    const prunedCards = currentLayout.cards.filter(c => validIds.has(c.metricId));
    useAppStore.setState({
      metrics: activeList,
      currentLayout: prunedCards.length !== currentLayout.cards.length
        ? { ...currentLayout, cards: prunedCards }
        : currentLayout,
    });
  };

  // On mount: load existing metrics only
  useEffect(() => { refresh().finally(() => setInitialLoading(false)); }, []);

  const tableOptions = useMemo(() => schemaCatalog, []);
  const currentTable = editing ? findTable(editing.sourceTable) : undefined;
  const fieldOptions = currentTable?.fields ?? [];
  const currentField = currentTable?.fields.find(f => f.logical === editing?.sourceField);
  const currentFieldKind: FieldKind = currentField?.kind ?? 'numeric';
  const aggRules = AGG_BY_KIND[currentFieldKind];
  const vizRules = VIZ_BY_KIND[currentFieldKind];
  const showAggregation = editing?.visualizationType !== 'Table';
  const showUnit = currentFieldKind === 'numeric' && editing?.visualizationType !== 'Table';
  const isTableViz = editing?.visualizationType === 'Table';

  const updateEditing = (patch: Partial<MetricDefinition & { nameManuallyEdited?: boolean }>) => {
    if (!editing) return;
    setFormDirty(true);
    const merged = { ...editing, ...patch };
    // Look up field kind for the merged state
    const tbl = findTable(merged.sourceTable);
    const fld = tbl?.fields.find(f => f.logical === merged.sourceField);
    const kind: FieldKind = fld?.kind ?? 'numeric';
    const fldLabel = fld?.label ?? merged.sourceField;
    // Normalize if source field changed or aggregation/viz might be invalid
    if (patch.sourceField !== undefined || patch.sourceTable !== undefined) {
      // Field changed → reset nameManuallyEdited if the field actually changed
      if (patch.sourceField !== undefined && patch.sourceField !== editing.sourceField) {
        merged.nameManuallyEdited = false;
      }
      // For Table viz, preserve sourceField='*' and generate grid name
      if (merged.visualizationType === 'Table') {
        merged.sourceField = '*';
        if (!merged.nameManuallyEdited) {
          merged.name = `${tableLabel(merged.sourceTable)} grid`;
        }
        setEditing(merged);
      } else {
        setEditing(normalizeMetricDraft(merged, kind, fldLabel));
      }
    } else if (patch.aggregation !== undefined) {
      // Aggregation changed → update auto-name
      if (!merged.nameManuallyEdited) {
        merged.name = generateAutoName(merged.sourceTable, fldLabel, kind, merged.aggregation);
      }
      setEditing(merged);
    } else if (patch.visualizationType !== undefined) {
      // Viz changed → handle Table special case
      if (patch.visualizationType === 'Table') {
        merged.sourceField = '*';
        if (!merged.nameManuallyEdited) {
          merged.name = `${tableLabel(merged.sourceTable)} grid`;
        }
      }
      setEditing(merged);
    } else {
      setEditing(merged);
    }
  };

  const save = async () => {
    if (!editing) return;
    setError(undefined);
    setSaving(true);
    const isNew = editing.id === '';
    const metricName = editing.name;
    try {
      // Strip the UI-only field before saving
      const { nameManuallyEdited: _, ...toSave } = editing;
      await metricService.upsertMetric(toSave);
      await refresh();
      if (isNew) {
        dispatchToast(
          <Toast>
            <ToastTitle>Metric &ldquo;{metricName}&rdquo; created</ToastTitle>
            <ToastBody>You can start using it in dashboard</ToastBody>
          </Toast>,
          { intent: 'success' },
        );
      }
      setFormDirty(false);
      setEditing(null);
    } catch (e) {
      setError((e as Error).message ?? 'Failed to save metric.');
    } finally { setSaving(false); }
  };

  /** If the form has unsaved changes, show a confirmation dialog; otherwise navigate immediately. */
  const guardNav = (action: () => void) => {
    if (formDirty) { setPendingNav(() => action); }
    else { action(); }
  };

  const confirmAction = async () => {
    if (!pendingAction) return;
    setError(undefined);
    try {
      if (pendingAction.type === 'delete') {
        for (const id of pendingAction.ids) {
          await metricService.deleteMetric(id);
        }
        await refresh();
        if (pendingAction.ids.length > 1) {
          dispatchToast(
            <Toast><ToastTitle>{pendingAction.ids.length} metrics deleted</ToastTitle></Toast>,
            { intent: 'success' },
          );
        }
      } else {
        const publish = pendingAction.type === 'publish';
        for (const id of pendingAction.ids) {
          const metric = rows.find(r => r.id === id);
          if (metric) await metricService.upsertMetric({ ...metric, isActive: publish });
        }
        await refresh();
        const count = pendingAction.ids.length;
        dispatchToast(
          <Toast><ToastTitle>{count} metric{count > 1 ? 's' : ''} {publish ? 'published' : 'unpublished'}</ToastTitle></Toast>,
          { intent: 'success' },
        );
      }
    } catch (e) {
      setError((e as Error).message ?? 'Action failed.');
    } finally {
      setPendingAction(null);
    }
  };

  const handleBulkAdd = useCallback(async (metrics: SuggestedMetric[]) => {
    setError(undefined);
    const toCreate = metrics.map(m => ({
      id: '',
      name: m.name,
      description: m.description,
      category: m.category,
      sourceTable: m.sourceTable,
      sourceField: m.sourceField,
      aggregation: m.aggregation,
      visualizationType: m.visualizationType,
      isActive: m.publishedByDefault,
    }));
    try {
      await metricService.batchUpsert(toCreate);
      await refresh();
      const count = metrics.length;
      dispatchToast(
        <Toast>
          <ToastTitle>{count} metric{count > 1 ? 's' : ''} added</ToastTitle>
          <ToastBody>You can now use {count > 1 ? 'them' : 'it'} in your dashboard</ToastBody>
        </Toast>,
        { intent: 'success' },
      );
    } catch (e) {
      setError((e as Error).message ?? 'Failed to add metrics.');
    }
  }, [dispatchToast]);

  // Compute missing recommended metrics count
  const recommendedMissing = useMemo(() => {
    const existingKeys = new Set(rows.map(r => `${r.sourceTable}.${r.sourceField}`));
    return allSuggestedMetrics
      .filter(m => m.publishedByDefault)
      .filter(m => !existingKeys.has(`${m.sourceTable}.${m.sourceField}`))
      .length;
  }, [rows]);

  // Derive confirmation dialog content from pendingAction
  const pendingActionNames = pendingAction
    ? rows.filter(r => pendingAction.ids.includes(r.id)).map(r => r.name)
    : [];

  return (
    <div className={s.root}>
      <Toaster toasterId={toasterId} position="top-end" />

      {/* Shell-level command bar — flush below tabs, matching DashboardCommandBar layout */}
      {!editing && !initialLoading && rows.length > 0 && (
        <div className={s.commandBar} data-tour-id="metrics-toolbar" role="toolbar" aria-label="Metric registry actions">
          <Subtitle2>Metric Registry</Subtitle2>
          <Badge appearance="filled" color="informative" size="small">{rows.length}</Badge>
          <div className={s.toolbarSpacer} />
          {recommendedMissing > 0 && (
            <Button
              appearance="subtle"
              size="small"
              icon={showDomains ? <ChevronUp20Regular /> : <ChevronDown20Regular />}
              aria-expanded={showDomains}
              aria-controls="metric-domain-cards"
              onClick={() => setShowDomains(v => !v)}
            >
              {showDomains ? 'Hide recommended' : 'Browse recommended'}
            </Button>
          )}
          <Button appearance="primary" size="small" icon={<Add24Regular />} onClick={() => setEditing({ ...empty })}>
            New Metric
          </Button>
        </div>
      )}

      <div className={s.page}>
        {/* Breadcrumb — only shown when editing a metric */}
        {editing && (
        <Breadcrumb className={s.breadcrumb} size="large">
          <BreadcrumbItem>
            <BreadcrumbButton className={s.breadcrumbLink} onClick={() => guardNav(() => { setFormDirty(false); setEditing(null); })}>Metrics</BreadcrumbButton>
          </BreadcrumbItem>
          <BreadcrumbDivider />
          <BreadcrumbItem>
            <Text className={s.breadcrumbCurrent}>
              {editing.id
                ? `${editing.name || 'Metric'}`
                : 'New Metric'}
            </Text>
          </BreadcrumbItem>
        </Breadcrumb>
        )}

        {editing && (
          <Title3>
            {editing.id ? `${editing.name || 'Metric'}` : 'New Metric'}
          </Title3>
        )}

        {error && (
          <MessageBar intent="error" className={s.confirmBar}>
            <MessageBarBody>{error}</MessageBarBody>
          </MessageBar>
        )}

        {/* Unified confirmation dialog for delete/publish/unpublish */}
        <Dialog open={!!pendingAction} onOpenChange={(_, d) => { if (!d.open) setPendingAction(null); }}>
          <DialogSurface>
            <DialogBody>
              <DialogTitle>
                {pendingAction?.type === 'delete' && 'Delete metric?'}
                {pendingAction?.type === 'publish' && 'Publish metric?'}
                {pendingAction?.type === 'unpublish' && 'Unpublish metric?'}
              </DialogTitle>
              <DialogContent>
                <Body1>
                  {pendingAction?.type === 'delete' && (
                    pendingActionNames.length === 1
                      ? <>Are you sure you want to delete &ldquo;<b>{pendingActionNames[0]}</b>&rdquo;? This will remove it from all dashboards.</>
                      : <>Are you sure you want to delete <b>{pendingActionNames.length} metrics</b>? They will be removed from all dashboards.</>
                  )}
                  {pendingAction?.type === 'publish' && (
                    pendingActionNames.length === 1
                      ? <>Publishing &ldquo;<b>{pendingActionNames[0]}</b>&rdquo; will make it available on dashboards for all users.</>
                      : <>Publishing <b>{pendingActionNames.length} metrics</b> will make them available on dashboards for all users.</>
                  )}
                  {pendingAction?.type === 'unpublish' && (
                    pendingActionNames.length === 1
                      ? <>Unpublishing &ldquo;<b>{pendingActionNames[0]}</b>&rdquo; will remove it from dashboards. Existing cards will no longer display data.</>
                      : <>Unpublishing <b>{pendingActionNames.length} metrics</b> will remove them from dashboards. Existing cards will no longer display data.</>
                  )}
                </Body1>
              </DialogContent>
              <DialogActions>
                <Button appearance="secondary" onClick={() => setPendingAction(null)}>Cancel</Button>
                {pendingAction?.type === 'delete'
                  ? <Button appearance="primary" style={{ backgroundColor: tokens.colorStatusDangerBackground3, color: tokens.colorNeutralForegroundOnBrand }} onClick={confirmAction}>Delete</Button>
                  : <Button appearance="primary" onClick={confirmAction}>{pendingAction?.type === 'publish' ? 'Publish' : 'Unpublish'}</Button>
                }
              </DialogActions>
            </DialogBody>
          </DialogSurface>
        </Dialog>

        {/* Unsaved changes confirmation dialog */}
        <Dialog open={!!pendingNav} onOpenChange={(_, d) => { if (!d.open) setPendingNav(null); }}>
          <DialogSurface>
            <DialogBody>
              <DialogTitle>Unsaved changes</DialogTitle>
              <DialogContent>
                <Body1>You have unsaved changes that will be lost. Do you want to discard them?</Body1>
              </DialogContent>
              <DialogActions>
                <Button appearance="secondary" onClick={() => setPendingNav(null)}>Keep editing</Button>
                <Button appearance="primary" onClick={() => { const nav = pendingNav; setPendingNav(null); nav?.(); }}>Discard</Button>
              </DialogActions>
            </DialogBody>
          </DialogSurface>
        </Dialog>

        {!editing && (
          <>
            {/* Loading state */}
            {initialLoading && (
              <div className={s.emptyState}>
                <Spinner size="large" label="Loading metrics…" />
              </div>
            )}

            {/* Empty state: no metrics yet — show domain cards for pick-and-choose */}
            {!initialLoading && rows.length === 0 && (
              <>
                <div className={s.emptyState}>
                  <Rocket24Regular style={{ fontSize: '40px', color: tokens.colorBrandForeground1 }} />
                  <Title3>Get started with metrics</Title3>
                  <Body1>
                    Browse recommended metrics by domain below, or create your own from scratch.
                  </Body1>
                  <div className={s.emptyActions}>
                    <Button
                      appearance="secondary"
                      icon={<Compose24Regular />}
                      onClick={() => setEditing({ ...empty })}
                      size="large"
                    >
                      Create a custom Metric
                    </Button>
                  </div>
                  <Caption1>Select a domain below to pick and choose which metrics to add.</Caption1>
                </div>
                <div className={s.domainSection} id="metric-domain-cards">
                  <Subtitle2 className={s.domainHeading}>Recommended metrics by domain</Subtitle2>
                  <DomainCards
                    domains={metricDomains}
                    existingMetrics={rows}
                    onDomainClick={(domain) => setDrawerDomain(domain)}
                  />
                </div>
              </>
            )}

            {/* Non-empty state: unified command bar + collapsible domain cards */}
            {!initialLoading && rows.length > 0 && (
              <MetricListView
                rows={rows}
                styles={s}
                onEdit={(r) => setEditing({ ...r, nameManuallyEdited: true })}
                onDelete={(id) => setPendingAction({ type: 'delete', ids: [id] })}
                onTogglePublish={(id, publish) => setPendingAction({ type: publish ? 'publish' : 'unpublish', ids: [id] })}
                onBulkDelete={(ids) => setPendingAction({ type: 'delete', ids })}
                onBulkTogglePublish={(ids, publish) => setPendingAction({ type: publish ? 'publish' : 'unpublish', ids })}
                domainCardsSlot={showDomains ? (
                  <div className={s.domainPanel} id="metric-domain-cards" role="region" aria-label="Recommended metrics by domain" data-tour-id="metrics-recommendations">
                    <Subtitle2 className={s.domainHeading}>Recommended metrics by domain</Subtitle2>
                    <DomainCards
                      domains={metricDomains}
                      existingMetrics={rows}
                      onDomainClick={(domain) => setDrawerDomain(domain)}
                    />
                  </div>
                ) : null}
              />
            )}
          </>
        )}

        {editing && (
          <div className={s.formContainer}>
            <div className={s.grid}>
              {/* — Data source — */}
              <div className={s.sectionLabel}>Data source</div>
              <Field label={<span className={s.labelWithInfo}>Source table <Tooltip content="The Dataverse table to query data from" relationship="description"><Info16Regular className={s.infoIcon} /></Tooltip></span>} required>
                <Dropdown
                  value={tableLabel(editing.sourceTable)}
                  selectedOptions={[editing.sourceTable]}
                  onOptionSelect={(_, d) => {
                    const nextTable = d.optionValue ?? editing.sourceTable;
                    const tbl = tableOptions.find(t => t.logical === nextTable);
                    const autoCategory = tbl ? TABLE_CAT_TO_METRIC_CAT[tbl.category] : editing.category;
                    updateEditing({
                      sourceTable: nextTable,
                      sourceField: editing.visualizationType === 'Table' ? '*' : '',
                      category: autoCategory,
                    });
                  }}
                >
                  {TABLE_CATEGORIES.map(cat => {
                    const tables = tableOptions.filter(t => t.category === cat.value);
                    if (tables.length === 0) return null;
                    return (
                      <OptionGroup key={cat.value} label={cat.label}>
                        {tables.map(t => (
                          <Option key={t.logical} value={t.logical} text={t.label}>
                            <span className={s.vizOptionContent}>
                              <span>{t.label}</span>
                              {t.description && <span className={s.vizOptionDesc}>{t.description}</span>}
                            </span>
                          </Option>
                        ))}
                      </OptionGroup>
                    );
                  })}
                </Dropdown>
              </Field>
              {!isTableViz && (
                <Field label={<span className={s.labelWithInfo}>Source field <Tooltip content="The column to measure or count" relationship="description"><Info16Regular className={s.infoIcon} /></Tooltip></span>} required>
                  <Dropdown
                    disabled={!currentTable}
                    value={editing.sourceField ? fieldLabel(editing.sourceTable, editing.sourceField) : ''}
                    selectedOptions={editing.sourceField ? [editing.sourceField] : []}
                    onOptionSelect={(_, d) => updateEditing({ sourceField: d.optionValue ?? '' })}
                  >
                    {fieldOptions.map(f => (
                      <Option key={f.logical} value={f.logical} text={f.label}>
                        {f.label} <span className={s.fieldKind}>· {f.kind}</span>
                      </Option>
                    ))}
                  </Dropdown>
                </Field>
              )}

              {/* — Display — */}
              <div className={s.sectionLabel}>Display</div>
              <Field className={s.fullWidth} label={<span className={s.labelWithInfo}>Visualization <Tooltip content="How the metric is displayed on the dashboard" relationship="description"><Info16Regular className={s.infoIcon} /></Tooltip></span>}>
                <Dropdown
                  value={VIZ_LABELS[editing.visualizationType] ?? editing.visualizationType}
                  selectedOptions={[editing.visualizationType]}
                  onOptionSelect={(_, d) => updateEditing({ visualizationType: d.optionValue as VisualizationType })}
                >
                  {VIZ_GROUPS.map(group => {
                    const filtered = group.items.filter(v => vizRules.allowed.includes(v));
                    if (filtered.length === 0) return null;
                    return (
                      <OptionGroup key={group.label} label={group.label}>
                        {filtered.map(v => (
                          <Option key={v} value={v} text={VIZ_LABELS[v]}>
                            <span className={s.vizOptionContent}>
                              <span>{VIZ_LABELS[v]}</span>
                              <span className={s.vizOptionDesc}>{VIZ_DESCRIPTIONS[v]}</span>
                            </span>
                          </Option>
                        ))}
                      </OptionGroup>
                    );
                  })}
                </Dropdown>
              </Field>
              {showAggregation && (
                <Field label={<span className={s.labelWithInfo}>Aggregation <Tooltip content="How values are combined per time period" relationship="description"><Info16Regular className={s.infoIcon} /></Tooltip></span>}>
                  <Dropdown
                    value={editing.aggregation}
                    selectedOptions={[editing.aggregation]}
                    onOptionSelect={(_, d) => updateEditing({ aggregation: d.optionValue as AggregationType })}
                  >
                    {aggRules.allowed.map(a => <Option key={a} value={a}>{a}</Option>)}
                  </Dropdown>
                </Field>
              )}
              {showUnit && (
                <Field label={<span className={s.labelWithInfo}>Unit <Tooltip content="Display suffix shown after the value, e.g. %, $, ms, credits" relationship="description"><Info16Regular className={s.infoIcon} /></Tooltip></span>}>
                  <Input value={editing.unit ?? ''} placeholder="e.g. credits, $, seconds" onChange={(_, d) => updateEditing({ unit: d.value })} />
                </Field>
              )}

              {/* — Details — */}
              <div className={s.sectionLabel}>Details</div>
              <Field label="Name" required>
                <Input
                  value={editing.name}
                  placeholder="Metric display name"
                  onChange={(_, d) => setEditing({ ...editing, name: d.value, nameManuallyEdited: true })}
                />
              </Field>
              <Field label={<span className={s.labelWithInfo}>Status <Tooltip content="Draft metrics are saved but hidden from the sidebar" relationship="description"><Info16Regular className={s.infoIcon} /></Tooltip></span>}>
                <Switch checked={editing.isActive} onChange={(_, d) => updateEditing({ isActive: d.checked })}
                  label={editing.isActive ? 'Published' : 'Draft'} />
              </Field>
              <Field label="Description" className={s.fullWidth} required>
                <Textarea value={editing.description ?? ''} placeholder="What this metric measures and why it matters" onChange={(_, d) => updateEditing({ description: d.value })} />
              </Field>
            </div>
            <div className={`${s.toolbar} ${s.formActions}`}>
              <Button appearance="secondary" onClick={() => guardNav(() => { setFormDirty(false); setEditing(null); })}>Cancel</Button>
              <Button appearance="primary" onClick={save}
                disabled={saving || !editing.name || !editing.description || !editing.sourceTable || (!editing.sourceField && editing.visualizationType !== 'Table')}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
        )}
      </div>
      <MetricPickerDrawer
        open={!!drawerDomain}
        domain={drawerDomain}
        existingMetrics={rows}
        onClose={() => setDrawerDomain(null)}
        onAddMetrics={handleBulkAdd}
      />

    </div>
  );
}

// --- DataGrid list view with search, sort, pagination ---

const PAGE_SIZES = [10, 25, 50] as const;

type RowItem = MetricDefinition;

interface MetricListViewProps {
  rows: RowItem[];
  styles: ReturnType<typeof useStyles>;
  onEdit: (r: RowItem) => void;
  onDelete: (id: string) => void;
  onTogglePublish: (id: string, publish: boolean) => void;
  onBulkDelete: (ids: string[]) => void;
  onBulkTogglePublish: (ids: string[], publish: boolean) => void;
  domainCardsSlot?: React.ReactNode;
}

function MetricListView({ rows, styles: s, onEdit, onDelete, onTogglePublish, onBulkDelete, onBulkTogglePublish, domainCardsSlot }: MetricListViewProps) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(10);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Reset page when search or rows change
  useEffect(() => { setPage(0); }, [search, rows.length]);

  // Clear selection when rows change
  useEffect(() => { setSelectedIds(new Set()); }, [rows]);

  const selectedCount = selectedIds.size;

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(r =>
      r.name.toLowerCase().includes(q) ||
      tableLabel(r.sourceTable).toLowerCase().includes(q) ||
      fieldLabel(r.sourceTable, r.sourceField).toLowerCase().includes(q) ||
      r.category.toLowerCase().includes(q) ||
      (r.isRecommendedMetric && 'recommended'.includes(q))
    );
  }, [rows, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pagedRows = filtered.slice(page * pageSize, (page + 1) * pageSize);

  const columns: TableColumnDefinition<RowItem>[] = useMemo(() => [
    createTableColumn<RowItem>({
      columnId: 'name',
      compare: (a, b) => a.name.localeCompare(b.name),
      renderHeaderCell: () => 'NAME',
      renderCell: (item) => (
        <Button appearance="transparent" size="small" style={{ fontWeight: 600, padding: 0, minWidth: 0, textAlign: 'left' }} onClick={() => onEdit(item)}>
          {item.name}
        </Button>
      ),
    }),
    createTableColumn<RowItem>({
      columnId: 'category',
      compare: (a, b) => a.category.localeCompare(b.category),
      renderHeaderCell: () => 'CATEGORY',
      renderCell: (item) => <Badge appearance="tint" size="small">{item.category}</Badge>,
    }),
    createTableColumn<RowItem>({
      columnId: 'source',
      compare: (a, b) => tableLabel(a.sourceTable).localeCompare(tableLabel(b.sourceTable)),
      renderHeaderCell: () => 'SOURCE',
      renderCell: (item) => (
        <Tooltip content={`${item.sourceTable}.${item.sourceField}`} relationship="description">
          <span>{tableLabel(item.sourceTable)} › {fieldLabel(item.sourceTable, item.sourceField)}</span>
        </Tooltip>
      ),
    }),
    createTableColumn<RowItem>({
      columnId: 'aggregation',
      compare: (a, b) => a.aggregation.localeCompare(b.aggregation),
      renderHeaderCell: () => 'AGGREGATION',
      renderCell: (item) => item.aggregation,
    }),
    createTableColumn<RowItem>({
      columnId: 'visualization',
      compare: (a, b) => a.visualizationType.localeCompare(b.visualizationType),
      renderHeaderCell: () => 'VISUALIZATION',
      renderCell: (item) => item.visualizationType,
    }),
    createTableColumn<RowItem>({
      columnId: 'status',
      compare: (a, b) => Number(b.isActive) - Number(a.isActive),
      renderHeaderCell: () => 'STATUS',
      renderCell: (item) => item.isActive
        ? <span className={s.statusPublished}><span className={`${s.statusDot} ${s.dotGreen}`} />Published</span>
        : <span className={s.statusDraft}><span className={`${s.statusDot} ${s.dotOrange}`} />Draft</span>,
    }),
    createTableColumn<RowItem>({
      columnId: 'createdOn',
      compare: (a, b) => (a.createdOn ?? '').localeCompare(b.createdOn ?? ''),
      renderHeaderCell: () => 'CREATED ON',
      renderCell: (item) => item.createdOn ? format(parseISO(item.createdOn), 'MMM d, yyyy') : '—',
    }),
    createTableColumn<RowItem>({
      columnId: 'createdBy',
      compare: (a, b) => (a.createdBy ?? '').localeCompare(b.createdBy ?? ''),
      renderHeaderCell: () => 'CREATED BY',
      renderCell: (item) => item.createdBy ?? '—',
    }),
    createTableColumn<RowItem>({
      columnId: 'actions',
      renderHeaderCell: () => '',
      renderCell: (item) => (
        <Menu positioning="below-end">
          <MenuTrigger disableButtonEnhancement>
            <Button size="small" appearance="transparent" icon={<MoreVertical20Regular />} aria-label={`Actions for ${item.name}`} />
          </MenuTrigger>
          <MenuPopover>
            <MenuList>
              <MenuItem icon={<Edit24Regular />} onClick={() => onEdit(item)}>Edit</MenuItem>
              {item.isActive
                ? <MenuItem icon={<DismissCircle24Regular />} onClick={() => onTogglePublish(item.id, false)}>Unpublish</MenuItem>
                : <MenuItem icon={<CheckmarkCircle24Regular />} onClick={() => onTogglePublish(item.id, true)}>Publish</MenuItem>
              }
              <MenuItem icon={<Delete24Regular />} onClick={() => onDelete(item.id)}>Delete</MenuItem>
            </MenuList>
          </MenuPopover>
        </Menu>
      ),
    }),
  ], [s, onEdit, onDelete, onTogglePublish]);

  return (
    <>
      {domainCardsSlot}

      <div className={s.toolbar} role="search">
        <SearchBox
          className={s.searchBox}
          placeholder="Search by name, source, or category"
          aria-label="Search metrics"
          value={search}
          onChange={(_, d) => setSearch(d.value)}
          size="small"
        />
        {search && (
          <Button
            size="small"
            appearance="subtle"
            icon={<ArrowClockwise20Regular />}
            onClick={() => setSearch('')}
          >
            Reset
          </Button>
        )}
      </div>

      {selectedCount > 0 && (
        <div className={s.toolbar} role="toolbar" aria-label="Selected metric actions">
          <Text size={200} weight="semibold" aria-live="polite">{selectedCount} selected</Text>
          {rows.some(r => selectedIds.has(r.id) && !r.isActive) && (
            <Button size="small" appearance="subtle" icon={<CheckmarkCircle24Regular />} onClick={() => onBulkTogglePublish([...selectedIds].filter(id => !rows.find(r => r.id === id)?.isActive), true)}>Publish</Button>
          )}
          {rows.some(r => selectedIds.has(r.id) && r.isActive) && (
            <Button size="small" appearance="subtle" icon={<DismissCircle24Regular />} onClick={() => onBulkTogglePublish([...selectedIds].filter(id => rows.find(r => r.id === id)?.isActive), false)}>Unpublish</Button>
          )}
          <Button size="small" appearance="subtle" icon={<Delete24Regular />} onClick={() => onBulkDelete([...selectedIds])}>Delete</Button>
          <div className={s.toolbarSpacer} />
          <Button size="small" appearance="subtle" onClick={() => setSelectedIds(new Set())}>Clear selection</Button>
        </div>
      )}

      <div className={s.gridContainer} data-tour-id="metrics-datagrid">
        <DataGrid
          items={pagedRows}
          columns={columns}
          sortable
          resizableColumns
          selectionMode="multiselect"
          selectedItems={selectedIds}
          onSelectionChange={(_, data) => setSelectedIds(data.selectedItems as Set<string>)}
          defaultSortState={{ sortColumn: 'createdOn', sortDirection: 'descending' }}
          aria-label="Metric Registry"
          columnSizingOptions={{
            name: { minWidth: 140, defaultWidth: 160 },
            source: { minWidth: 200, defaultWidth: 260 },
            aggregation: { minWidth: 90, defaultWidth: 100 },
            visualization: { minWidth: 100, defaultWidth: 110 },
            category: { minWidth: 100, defaultWidth: 120 },
            status: { minWidth: 90, defaultWidth: 100 },
            createdOn: { minWidth: 100, defaultWidth: 120 },
            createdBy: { minWidth: 100, defaultWidth: 130 },
            actions: { minWidth: 60, defaultWidth: 60 },
          }}
          getRowId={(item) => item.id}
          size="small"
          style={{ minWidth: '100%' }}
        >
          <DataGridHeader style={{ fontWeight: 600, fontSize: '11px', letterSpacing: '0.5px' }}>
            <DataGridRow>
              {({ renderHeaderCell }) => <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>}
            </DataGridRow>
          </DataGridHeader>
          <DataGridBody<RowItem>>
            {({ item, rowId }) => (
              <DataGridRow<RowItem> key={rowId}>
                {({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
              </DataGridRow>
            )}
          </DataGridBody>
        </DataGrid>

        {filtered.length > 0 && (
          <div className={s.pagination}>
            <span className={s.paginationText}>Show</span>
            <Dropdown
              size="small"
              value={String(pageSize)}
              selectedOptions={[String(pageSize)]}
              onOptionSelect={(_, d) => { setPageSize(Number(d.optionValue)); setPage(0); }}
              style={{ minWidth: '70px' }}
            >
              {PAGE_SIZES.map(n => <Option key={n} value={String(n)} text={String(n)}>{n}</Option>)}
            </Dropdown>
            <span className={s.paginationText}>per page</span>
            <div className={s.paginationSpacer} />
            <Button size="small" appearance="subtle" icon={<ChevronLeft24Regular />} disabled={page === 0} onClick={() => setPage(p => p - 1)} />
            <span className={s.paginationText}>
              {page + 1} / {totalPages}
            </span>
            <Button size="small" appearance="subtle" icon={<ChevronRight24Regular />} disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} />
            <div className={s.paginationSpacer} />
            <span className={s.paginationText}>{filtered.length} item{filtered.length !== 1 ? 's' : ''}</span>
          </div>
        )}
      </div>
    </>
  );
}
