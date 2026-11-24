import { useCallback, useMemo, useState } from 'react';
import {
  Drawer, DrawerBody, DrawerHeader, DrawerHeaderTitle, DrawerFooter,
  Button, Checkbox, Body1, Caption1, Spinner,
  makeStyles, tokens, Divider,
  Dropdown, Option, OptionGroup,
} from '@fluentui/react-components';
import { Dismiss24Regular, CheckmarkCircle24Regular, SelectAllOn24Regular, SelectAllOff24Regular } from '@fluentui/react-icons';
import type { SuggestedMetric, MetricDomain } from '../../services/suggestedMetrics';
import type { AggregationType, MetricDefinition, VisualizationType } from '../../types';

const useStyles = makeStyles({
  drawer: { width: '480px' },
  metricRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: tokens.spacingHorizontalS,
    padding: `${tokens.spacingVerticalS} 0`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke3}`,
  },
  metricInfo: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  metricName: { fontWeight: 600 },
  metricOptions: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    marginTop: tokens.spacingVerticalXS,
  },
  optionDropdown: { minWidth: '90px', maxWidth: '120px' },
  alreadyAdded: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    color: tokens.colorPaletteGreenForeground1,
    fontSize: '12px',
  },
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summary: {
    fontSize: '13px',
    color: tokens.colorNeutralForeground3,
  },
});

const VIZ_OPTIONS: VisualizationType[] = ['KPI', 'Line', 'Bar', 'HorizontalBar', 'GroupedBar', 'Area', 'Donut', 'TopicsList', 'Table'];
const AGG_OPTIONS: AggregationType[] = ['Sum', 'Average', 'Count', 'Min', 'Max', 'Latest'];

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

const VIZ_GROUPS: { label: string; items: VisualizationType[] }[] = [
  { label: 'Summary', items: ['KPI'] },
  { label: 'Trends', items: ['Line', 'Area'] },
  { label: 'Comparison', items: ['Bar', 'HorizontalBar', 'GroupedBar'] },
  { label: 'Composition', items: ['Donut', 'TopicsList'] },
  { label: 'Detail', items: ['Table'] },
];

interface MetricPickerDrawerProps {
  open: boolean;
  domain: MetricDomain | null;
  existingMetrics: MetricDefinition[];
  onClose: () => void;
  onAddMetrics: (metrics: SuggestedMetric[]) => Promise<void>;
}

interface MetricSelection {
  selected: boolean;
  viz: VisualizationType;
  agg: AggregationType;
}

export function MetricPickerDrawer({ open, domain, existingMetrics, onClose, onAddMetrics }: MetricPickerDrawerProps) {
  const s = useStyles();
  const [saving, setSaving] = useState(false);

  // Track which existing metrics are already registered (by table+field)
  const existingKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const m of existingMetrics) {
      keys.add(`${m.sourceTable}.${m.sourceField}`);
    }
    return keys;
  }, [existingMetrics]);

  // Initialize selection state for each metric in this domain
  const [selections, setSelections] = useState<Record<string, MetricSelection>>({});

  // Reset selections when domain changes
  useMemo(() => {
    if (!domain) return;
    const init: Record<string, MetricSelection> = {};
    for (const m of domain.metrics) {
      const isExisting = existingKeys.has(`${m.sourceTable}.${m.sourceField}`);
      init[m.key] = {
        selected: false,
        viz: m.visualizationType,
        agg: m.aggregation,
      };
    }
    setSelections(init);
  }, [domain, existingKeys]);

  const updateSelection = useCallback((key: string, patch: Partial<MetricSelection>) => {
    setSelections(prev => ({
      ...prev,
      [key]: { ...prev[key], ...patch },
    }));
  }, []);

  const selectedCount = Object.values(selections).filter(s => s.selected).length;

  const handleSelectAll = useCallback(() => {
    if (!domain) return;
    setSelections(prev => {
      const next = { ...prev };
      for (const m of domain.metrics) {
        const isExisting = existingKeys.has(`${m.sourceTable}.${m.sourceField}`);
        if (!isExisting) {
          next[m.key] = { ...next[m.key], selected: true };
        }
      }
      return next;
    });
  }, [domain, existingKeys]);

  const handleDeselectAll = useCallback(() => {
    setSelections(prev => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        next[key] = { ...next[key], selected: false };
      }
      return next;
    });
  }, []);

  const handleAdd = useCallback(async () => {
    if (!domain) return;
    setSaving(true);
    try {
      const toAdd = domain.metrics
        .filter(m => selections[m.key]?.selected)
        .map(m => ({
          ...m,
          visualizationType: selections[m.key].viz,
          aggregation: selections[m.key].agg,
        }));
      await onAddMetrics(toAdd);
      onClose();
    } finally {
      setSaving(false);
    }
  }, [domain, selections, onAddMetrics, onClose]);

  if (!domain) return null;

  return (
    <Drawer
      open={open}
      onOpenChange={(_, { open: isOpen }) => { if (!isOpen) onClose(); }}
      position="end"
      size="medium"
      className={s.drawer}
    >
      <DrawerHeader>
        <DrawerHeaderTitle
          action={
            <Button appearance="subtle" icon={<Dismiss24Regular />} onClick={onClose} aria-label="Close" />
          }
        >
          {domain.label}
        </DrawerHeaderTitle>
      </DrawerHeader>

      <DrawerBody>
        <Body1>{domain.description}</Body1>
        <Caption1 style={{ display: 'block', marginTop: tokens.spacingVerticalXS, color: tokens.colorNeutralForeground3 }}>
          Metrics already in your registry are shown as "Already added." To remove them, delete from the Metric Registry grid.
        </Caption1>
        <div style={{ display: 'flex', gap: tokens.spacingHorizontalS, margin: `${tokens.spacingVerticalS} 0` }}>
          <Button size="small" appearance="outline" icon={<SelectAllOn24Regular />} onClick={handleSelectAll}>Select all</Button>
          <Button size="small" appearance="outline" icon={<SelectAllOff24Regular />} onClick={handleDeselectAll}>Deselect all</Button>
        </div>
        <Divider />

        {domain.metrics.map(metric => {
          const isExisting = existingKeys.has(`${metric.sourceTable}.${metric.sourceField}`);
          const sel = selections[metric.key];

          return (
            <div key={metric.key} className={s.metricRow}>
              {isExisting ? (
                <div style={{ width: '32px', paddingTop: '4px' }}>
                  <CheckmarkCircle24Regular primaryFill={tokens.colorPaletteGreenForeground1} />
                </div>
              ) : (
                <Checkbox
                  checked={sel?.selected ?? false}
                  onChange={(_, data) => updateSelection(metric.key, { selected: !!data.checked })}
                />
              )}
              <div className={s.metricInfo}>
                <span className={s.metricName}>{metric.name}</span>
                <Caption1>{metric.description}</Caption1>
                {isExisting ? (
                  <span className={s.alreadyAdded}>Already added</span>
                ) : (
                  <div className={s.metricOptions}>
                    <Dropdown
                      className={s.optionDropdown}
                      size="small"
                      value={VIZ_LABELS[sel?.viz ?? metric.visualizationType] ?? (sel?.viz ?? metric.visualizationType)}
                      selectedOptions={[sel?.viz ?? metric.visualizationType]}
                      onOptionSelect={(_, d) => updateSelection(metric.key, { viz: d.optionValue as VisualizationType })}
                    >
                      {VIZ_GROUPS.map(group => {
                        const filtered = group.items.filter(v => VIZ_OPTIONS.includes(v));
                        if (filtered.length === 0) return null;
                        return (
                          <OptionGroup key={group.label} label={group.label}>
                            {filtered.map(v => <Option key={v} value={v} text={VIZ_LABELS[v]}>{VIZ_LABELS[v]}</Option>)}
                          </OptionGroup>
                        );
                      })}
                    </Dropdown>
                    <Dropdown
                      className={s.optionDropdown}
                      size="small"
                      value={sel?.agg ?? metric.aggregation}
                      selectedOptions={[sel?.agg ?? metric.aggregation]}
                      onOptionSelect={(_, d) => updateSelection(metric.key, { agg: d.optionValue as AggregationType })}
                    >
                      {AGG_OPTIONS.map(a => <Option key={a} value={a}>{a}</Option>)}
                    </Dropdown>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </DrawerBody>

      <DrawerFooter className={s.footer}>
        <span className={s.summary}>{selectedCount} new metric{selectedCount !== 1 ? 's' : ''} selected</span>
        <div style={{ display: 'flex', gap: tokens.spacingHorizontalS }}>
          <Button appearance="secondary" onClick={onClose}>Cancel</Button>
          <Button
            appearance="primary"
            disabled={selectedCount === 0 || saving}
            onClick={handleAdd}
            icon={saving ? <Spinner size="tiny" /> : undefined}
          >
            {saving ? 'Adding…' : `Add ${selectedCount} new metric${selectedCount !== 1 ? 's' : ''}`}
          </Button>
        </div>
      </DrawerFooter>
    </Drawer>
  );
}
