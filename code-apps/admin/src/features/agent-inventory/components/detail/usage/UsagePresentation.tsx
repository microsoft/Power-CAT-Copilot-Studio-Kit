import type { ReactNode } from 'react';
import {
  Body1Strong,
  Caption1,
  mergeClasses,
  Subtitle2,
} from '@fluentui/react-components';
import { InventoryMetricCard } from '../../InventoryMetricCard';
import { useAgentUsageStyles } from './AgentUsageTab.styles';

interface MetricProps {
  label: string;
  value: string;
  support: string;
  detail?: string;
  detailIntent?: 'positive' | 'negative';
  accentColor: string;
  valueTooltipOnOverflow?: boolean;
}

export function UsageMetric({
  label,
  value,
  support,
  detail,
  detailIntent,
  accentColor,
  valueTooltipOnOverflow,
}: MetricProps) {
  return (
    <InventoryMetricCard
      kind="metric"
      label={label}
      value={value}
      supporting={support}
      detail={detail}
      detailIntent={detailIntent}
      accentColor={accentColor}
      layout="stacked"
      valueTooltipOnOverflow={valueTooltipOnOverflow}
    />
  );
}

interface SignalProps {
  icon: ReactNode;
  label: string;
  value: string;
  support: string;
  detail?: string;
  last?: boolean;
}

export function UsageSignal({ icon, label, value, support, detail, last }: SignalProps) {
  const styles = useAgentUsageStyles();
  return (
    <div className={mergeClasses(styles.standout, last && styles.standoutLast)}>
      <div className={styles.signalIcon} aria-hidden="true">{icon}</div>
      <div className={styles.signalCopy}>
        <Caption1>{label}</Caption1>
        <Body1Strong className={styles.signalValue} title={value}>{value}</Body1Strong>
        <Caption1 className={styles.supportText}>{support}</Caption1>
      </div>
      {detail && <Subtitle2 className={styles.signalDetail}>{detail}</Subtitle2>}
    </div>
  );
}
