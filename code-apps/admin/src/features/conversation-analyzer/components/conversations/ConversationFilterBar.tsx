import {
  Field,
  Option,
  SearchBox,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { DatePicker } from '@fluentui/react-datepicker-compat';
import type { ConversationAgentOption, ConversationEnvironment } from '../../contracts/types';
import type { AnalysisStatusFilter } from '../../hooks/useConversationListView';
import { SingleLineDropdown } from '../shared/SingleLineDropdown';
import {
  CONVERSATION_PERIODS,
  fromLocalDateKey,
  toLocalDateKey,
  type ConversationDateRange,
  type ConversationPeriod,
} from './conversationPeriods';

const ALL_AGENTS_VALUE = 'all-agents';
const ALL_AGENTS_LABEL = 'All agents';

const STATUS_OPTIONS: { value: AnalysisStatusFilter; label: string }[] = [
  { value: 'all', label: 'All conversations' },
  { value: 'not-analyzed', label: 'Not analyzed' },
  { value: 'analyzed', label: 'Analyzed' },
];

const useStyles = makeStyles({
  toolbar: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
  },
  field: { minWidth: '160px', flex: '0 1 220px' },
  environment: { minWidth: '180px', flex: '0 1 240px' },
  small: { minWidth: '140px', flex: '0 1 160px' },
  date: { minWidth: '150px', flex: '0 1 170px' },
  dateInput: { width: '100%', minWidth: 0 },
  dropdown: { minWidth: 'unset', width: '100%' },
  search: { minWidth: '200px', flex: '0 1 300px', marginLeft: 'auto' },
});

interface ConversationFilterBarProps {
  environments: ConversationEnvironment[];
  selectedEnvironment?: ConversationEnvironment;
  agents: ConversationAgentOption[];
  selectedAgentId: string;
  period: ConversationPeriod;
  dateRange: ConversationDateRange;
  status: AnalysisStatusFilter;
  searchInput: string;
  loadingEnvironments: boolean;
  loadingAgents: boolean;
  disabled: boolean;
  onEnvironmentChange: (url: string) => void;
  onAgentChange: (id: string) => void;
  onPeriodChange: (period: ConversationPeriod) => void;
  onDateRangeChange: (range: ConversationDateRange) => void;
  onStatusChange: (status: AnalysisStatusFilter) => void;
  onSearchChange: (value: string) => void;
}

/** Environment, agent, time period and analysis status filters plus message search (CV-1, CV-3…CV-5, CV-7). */
export function ConversationFilterBar({
  environments,
  selectedEnvironment,
  agents,
  selectedAgentId,
  period,
  dateRange,
  status,
  searchInput,
  loadingEnvironments,
  loadingAgents,
  disabled,
  onEnvironmentChange,
  onAgentChange,
  onPeriodChange,
  onDateRangeChange,
  onStatusChange,
  onSearchChange,
}: ConversationFilterBarProps) {
  const styles = useStyles();
  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId);
  const hasEnvironment = Boolean(selectedEnvironment);
  const periodLabel = CONVERSATION_PERIODS.find((p) => p.value === period)?.label ?? '';
  const isCustom = period === 'custom';
  const rangeStart = fromLocalDateKey(dateRange.start);
  const rangeEnd = fromLocalDateKey(dateRange.end);
  const today = new Date();
  const formatDate = (date?: Date) => date?.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) ?? '';
  const statusLabel = STATUS_OPTIONS.find((s) => s.value === status)?.label ?? '';

  return (
    <div className={styles.toolbar} role="toolbar" aria-label="Conversation filters">
      <Field className={styles.environment} label="Environment">
        <SingleLineDropdown
          className={styles.dropdown}
          value={selectedEnvironment?.name ?? ''}
          placeholder={loadingEnvironments ? 'Loading environments…' : 'Select an environment'}
          selectedOptions={selectedEnvironment ? [selectedEnvironment.organizationUrl] : []}
          disabled={disabled || loadingEnvironments || environments.length === 0}
          onOptionSelect={(_e, data) => { if (data.optionValue) onEnvironmentChange(data.optionValue); }}
        >
          {environments.map((env) => (
            <Option key={env.organizationUrl} value={env.organizationUrl} text={env.name}>{env.name}</Option>
          ))}
        </SingleLineDropdown>
      </Field>
      <Field className={styles.field} label="Agent">
        <SingleLineDropdown
          className={styles.dropdown}
          value={hasEnvironment && !loadingAgents ? selectedAgent?.name ?? ALL_AGENTS_LABEL : ''}
          placeholder={!hasEnvironment ? 'Select an environment first' : loadingAgents ? 'Loading agents…' : ALL_AGENTS_LABEL}
          selectedOptions={hasEnvironment ? [selectedAgent?.id ?? ALL_AGENTS_VALUE] : []}
          disabled={disabled || !hasEnvironment || loadingAgents}
          onOptionSelect={(_e, data) => onAgentChange(!data.optionValue || data.optionValue === ALL_AGENTS_VALUE ? '' : data.optionValue)}
        >
          <Option value={ALL_AGENTS_VALUE} text={ALL_AGENTS_LABEL}>{ALL_AGENTS_LABEL}</Option>
          {agents.map((agent) => <Option key={agent.id} value={agent.id} text={agent.name}>{agent.name}</Option>)}
        </SingleLineDropdown>
      </Field>
      <Field className={styles.small} label="Time period">
        <SingleLineDropdown
          className={styles.dropdown}
          value={periodLabel}
          selectedOptions={[period]}
          disabled={disabled || !hasEnvironment}
          onOptionSelect={(_e, data) => { if (data.optionValue) onPeriodChange(data.optionValue as ConversationPeriod); }}
        >
          {CONVERSATION_PERIODS.map((p) => <Option key={p.value} value={p.value}>{p.label}</Option>)}
        </SingleLineDropdown>
      </Field>
      {isCustom && (
        <>
          <Field className={styles.date} label="From">
            <DatePicker
              className={styles.dateInput}
              value={rangeStart}
              maxDate={rangeEnd ?? today}
              formatDate={formatDate}
              disabled={disabled || !hasEnvironment}
              aria-label="Start date"
              onSelectDate={(date) => { if (date) onDateRangeChange({ ...dateRange, start: toLocalDateKey(date) }); }}
            />
          </Field>
          <Field className={styles.date} label="To">
            <DatePicker
              className={styles.dateInput}
              value={rangeEnd}
              minDate={rangeStart}
              maxDate={today}
              formatDate={formatDate}
              disabled={disabled || !hasEnvironment}
              aria-label="End date"
              onSelectDate={(date) => { if (date) onDateRangeChange({ ...dateRange, end: toLocalDateKey(date) }); }}
            />
          </Field>
        </>
      )}
      <Field className={styles.small} label="Analysis">
        <SingleLineDropdown
          className={styles.dropdown}
          value={statusLabel}
          selectedOptions={[status]}
          disabled={disabled || !hasEnvironment}
          onOptionSelect={(_e, data) => { if (data.optionValue) onStatusChange(data.optionValue as AnalysisStatusFilter); }}
        >
          {STATUS_OPTIONS.map((s) => <Option key={s.value} value={s.value}>{s.label}</Option>)}
        </SingleLineDropdown>
      </Field>
      {hasEnvironment && (
        <SearchBox
          className={styles.search}
          aria-label="Search messages, conversation ID or agent"
          placeholder="Search messages or ID"
          value={searchInput}
          disabled={disabled}
          onChange={(_e, data) => onSearchChange(data.value)}
        />
      )}
    </div>
  );
}
