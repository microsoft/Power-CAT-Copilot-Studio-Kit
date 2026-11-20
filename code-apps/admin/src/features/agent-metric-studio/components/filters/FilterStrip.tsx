import { useCallback, useId, useMemo, useState } from 'react';
import {
  makeStyles, tokens, Dropdown, Option, Label, Input, Button, Combobox, Text,
} from '@fluentui/react-components';
import { ArrowClockwise20Regular } from '@fluentui/react-icons';
import { useAppStore } from '../../store/appStore';
import type { TimeRangePreset, DataMode } from '../../types';
import { resolveTimeRange } from '../../utils/dateHelpers';
import { format } from 'date-fns';

const ALL_AGENTS_VALUE = '__all__';
const ALL_CHANNELS_VALUE = '__all__';

const channelOptions: { value: string; label: string }[] = [
  { value: ALL_CHANNELS_VALUE, label: 'All' },
  { value: 'msteams', label: 'Teams' },
  { value: 'webchat', label: 'Web Chat' },
  { value: 'directline', label: 'Direct Line' },
  { value: 'pva-studio', label: 'Test Panel' },
  { value: 'pva-autonomous', label: 'Autonomous' },
  { value: 'pva-published-engine-direct', label: 'Published Engine' },
  { value: 'pva-maker-evaluation', label: 'Copilot Evaluation' },
  { value: 'm365copilot', label: 'M365 Copilot' },
  { value: 'mobile', label: 'Mobile' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'unknown', label: 'Unknown' },
];

const dataModeOptions: { value: DataMode | 'both'; label: string }[] = [
  { value: 'both', label: 'All data' },
  { value: 'production', label: 'Production' },
  { value: 'test', label: 'Test data' },
];

const useStyles = makeStyles({
  group: {
    display: 'inline-flex', alignItems: 'center', gap: tokens.spacingHorizontalXS,
    whiteSpace: 'nowrap',
  },
  groupLabel: { fontSize: '13px', fontWeight: 600, color: tokens.colorNeutralForeground1 },
  agentCombobox: { minWidth: '140px' },
  narrowDropdown: { minWidth: '80px', maxWidth: '150px' },
});

const rangeOptions: { value: TimeRangePreset; label: string }[] = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'ytd', label: 'Year to date' },
  { value: 'custom', label: 'Custom range' },
];

interface FilterStripProps {
  /** When false, hides the time range filter (used by Forecast tab which has its own Horizon control). */
  showTimeRange?: boolean;
}

export function FilterStrip({ showTimeRange = true }: FilterStripProps) {
  const s = useStyles();
  const filters = useAppStore(st => st.filters);
  const setFilters = useAppStore(st => st.setFilters);
  const agents = useAppStore(st => st.agents);
  const agentsLoading = useAppStore(st => st.agentsLoading);
  const startDateId = useId();
  const endDateId = useId();

  // Agent combobox search state
  const [agentQuery, setAgentQuery] = useState('');
  const [agentOpen, setAgentOpen] = useState(false);

  const selectedAgentId = filters.agentIds?.[0] ?? ALL_AGENTS_VALUE;
  const selectedAgentLabel = useMemo(() => {
    if (selectedAgentId === ALL_AGENTS_VALUE) return 'All';
    return agents.find(a => a.id === selectedAgentId)?.name ?? 'All';
  }, [selectedAgentId, agents]);

  const agentOptions = useMemo(
    () => [
      { id: ALL_AGENTS_VALUE, name: 'All' },
      ...agents,
    ],
    [agents],
  );

  const filteredAgentOptions = useMemo(() => {
    if (!agentQuery) return agentOptions;
    const q = agentQuery.toLowerCase();
    return agentOptions.filter(o => o.name.toLowerCase().includes(q));
  }, [agentOptions, agentQuery]);

  const handleAgentSelect = useCallback(
    (_: unknown, d: { optionValue?: string }) => {
      const id = d.optionValue;
      setFilters({ agentIds: id && id !== ALL_AGENTS_VALUE ? [id] : [] });
      setAgentQuery('');
    },
    [setFilters],
  );

  const { today, oneYearAgo } = useMemo(() => {
    const now = new Date();
    const t = now.toISOString().slice(0, 10);
    const past = new Date(now);
    past.setFullYear(past.getFullYear() - 1);
    return { today: t, oneYearAgo: past.toISOString().slice(0, 10) };
  }, []);

  // Compute time range display label with resolved dates
  const timeRangeLabel = useMemo(() => {
    const opt = rangeOptions.find(r => r.value === filters.timeRange.preset);
    if (filters.timeRange.preset === 'custom') {
      const from = filters.timeRange.from ?? '';
      const to = filters.timeRange.to ?? '';
      if (from && to) return `${from} - ${to}`;
      return 'Custom range';
    }
    const resolved = resolveTimeRange(filters.timeRange);
    const fromStr = format(resolved.from, 'M/d/yy');
    const toStr = format(resolved.to, 'M/d/yy');
    return `${opt?.label ?? ''} (${fromStr} - ${toStr})`;
  }, [filters.timeRange]);

  return (
    <>
      {/* Agent filter */}
      <div className={s.group}>
        <Text className={s.groupLabel}>Agents:</Text>
        <Combobox
          aria-label="Filter by agent"
          placeholder={agentsLoading ? 'Loading...' : 'Search agents...'}
          freeform
          size="small"
          appearance="outline"
          className={s.agentCombobox}
          value={agentOpen ? agentQuery : selectedAgentLabel}
          selectedOptions={[selectedAgentId]}
          onOptionSelect={handleAgentSelect}
          onChange={(e) => setAgentQuery((e.target as HTMLInputElement).value)}
          onOpenChange={(_, d) => {
            setAgentOpen(d.open);
            if (d.open) setAgentQuery('');
          }}
        >
          {filteredAgentOptions.map(opt => (
            <Option key={opt.id} value={opt.id}>{opt.name}</Option>
          ))}
        </Combobox>
      </div>

      {/* Time range filter */}
      {showTimeRange && (
        <div className={s.group}>
          <Dropdown
            aria-label="Time range"
            size="small"
            value={timeRangeLabel}
            selectedOptions={[filters.timeRange.preset]}
            onOptionSelect={(_, d) => {
              const preset = d.optionValue as TimeRangePreset;
              setFilters({ timeRange: { preset } });
            }}
          >
            {rangeOptions.map(r => <Option key={r.value} value={r.value}>{r.label}</Option>)}
          </Dropdown>
        </div>
      )}

      {showTimeRange && filters.timeRange.preset === 'custom' && (
        <div className={s.group}>
          <Label htmlFor={startDateId} size="small">Start</Label>
          <Input id={startDateId} type="date" size="small" value={filters.timeRange.from ?? ''}
            min={oneYearAgo} max={filters.timeRange.to || today}
            onChange={(_, d) => setFilters({ timeRange: { ...filters.timeRange, from: d.value } })} />
          <span aria-hidden="true">→</span>
          <Label htmlFor={endDateId} size="small">End</Label>
          <Input id={endDateId} type="date" size="small" value={filters.timeRange.to ?? ''}
            min={filters.timeRange.from || oneYearAgo} max={today}
            onChange={(_, d) => setFilters({ timeRange: { ...filters.timeRange, to: d.value } })} />
        </div>
      )}

      {/* Channel filter */}
      <div className={s.group}>
        <Text className={s.groupLabel}>Channels:</Text>
        <Dropdown
          className={s.narrowDropdown}
          aria-label="Filter by channel"
          size="small"
          appearance="outline"
          value={channelOptions.find(c => c.value === (filters.channels?.[0] ?? ALL_CHANNELS_VALUE))?.label ?? 'All'}
          selectedOptions={[filters.channels?.[0] ?? ALL_CHANNELS_VALUE]}
          onOptionSelect={(_, d) => {
            const val = d.optionValue;
            setFilters({ channels: val && val !== ALL_CHANNELS_VALUE ? [val] : [] });
          }}
        >
          {channelOptions.map(c => <Option key={c.value} value={c.value}>{c.label}</Option>)}
        </Dropdown>
      </div>

      {/* Data mode filter */}
      <div className={s.group}>
        <Text className={s.groupLabel}>Data:</Text>
        <Dropdown
          className={s.narrowDropdown}
          aria-label="Filter by data mode"
          size="small"
          appearance="outline"
          value={dataModeOptions.find(d => d.value === (filters.dataMode ?? 'both'))?.label ?? 'All data'}
          selectedOptions={[filters.dataMode ?? 'both']}
          onOptionSelect={(_, d) => {
            const val = d.optionValue as DataMode;
            setFilters({ dataMode: val });
          }}
        >
          {dataModeOptions.map(d => <Option key={d.value} value={d.value}>{d.label}</Option>)}
        </Dropdown>
      </div>

      {/* Reset filters */}
      <Button
        size="small"
        appearance="subtle"
        icon={<ArrowClockwise20Regular />}
        onClick={() => setFilters({ timeRange: { preset: '30d' }, agentIds: [], channels: [], locales: [], dataMode: 'both' })}
      >
        Reset
      </Button>
    </>
  );
}
