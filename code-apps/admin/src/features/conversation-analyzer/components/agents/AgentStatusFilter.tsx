import { makeStyles, tokens, Tab, TabList, CounterBadge } from '@fluentui/react-components';
import { HEALTH_BADGE } from '../../contracts/constants';
import type { HealthStatus } from '../../contracts/types';
import { STATUS_FILTER_ORDER, type AgentStatusFilterValue } from './agentGridUtils';

const DOT_COLOR: Record<HealthStatus, string> = {
  critical: tokens.colorPaletteRedBackground3,
  attention: tokens.colorPaletteMarigoldBackground3,
  healthy: tokens.colorPaletteGreenBackground3,
  unknown: tokens.colorNeutralStroke1,
};

const useStyles = makeStyles({
  list: { flexWrap: 'wrap', rowGap: tokens.spacingVerticalXS },
  content: { display: 'inline-flex', alignItems: 'center', gap: tokens.spacingHorizontalS },
  dot: {
    width: '8px',
    height: '8px',
    borderRadius: tokens.borderRadiusCircular,
    flexShrink: 0,
  },
});

interface AgentStatusFilterProps {
  value: AgentStatusFilterValue;
  counts: Record<HealthStatus, number>;
  total: number;
  onChange: (value: AgentStatusFilterValue) => void;
}

/**
 * Pill-style status filter with counts. Only statuses present in the data are
 * shown (the selected one stays visible even when its count drops to 0).
 */
export function AgentStatusFilter({ value, counts, total, onChange }: AgentStatusFilterProps) {
  const styles = useStyles();
  const statuses = STATUS_FILTER_ORDER.filter((s) => counts[s] > 0 || s === value);

  const renderTab = (key: AgentStatusFilterValue, label: string, count: number, dot?: string) => (
    <Tab key={key} value={key} aria-label={`${label}, ${count.toLocaleString()} agents`}>
      <span className={styles.content}>
        {dot && <span className={styles.dot} style={{ backgroundColor: dot }} aria-hidden />}
        {label}
        <CounterBadge
          count={count}
          overflowCount={9999}
          showZero
          size="small"
          appearance="filled"
          color={value === key ? 'brand' : 'informative'}
          aria-hidden
        />
      </span>
    </Tab>
  );

  return (
    <TabList
      className={styles.list}
      appearance="filled-circular"
      size="small"
      aria-label="Filter by status"
      selectedValue={value}
      onTabSelect={(_e, data) => onChange(data.value as AgentStatusFilterValue)}
    >
      {renderTab('all', 'All', total)}
      {statuses.map((s) => renderTab(s, HEALTH_BADGE[s].label, counts[s], DOT_COLOR[s]))}
    </TabList>
  );
}
