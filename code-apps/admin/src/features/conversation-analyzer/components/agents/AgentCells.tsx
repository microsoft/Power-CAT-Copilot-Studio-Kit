import { makeStyles, tokens, Text, Caption1 } from '@fluentui/react-components';
import { DotLabel, type DotTone } from '../shared/DotLabel';
import type { PiiExposure, SentimentLabel } from '../../contracts/types';
import { timeAgo } from './agentGridUtils';

const useStyles = makeStyles({
  agent: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    minWidth: 0,
    paddingTop: tokens.spacingVerticalXS,
    paddingBottom: tokens.spacingVerticalXS,
  },
  avatar: {
    width: '32px',
    height: '32px',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorBrandBackground2,
    color: tokens.colorBrandForeground2,
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
  },
  agentText: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  },
  ellipsis: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  muted: { color: tokens.colorNeutralForeground3 },
  number: {
    width: '100%',
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums',
  },
  bold: { fontWeight: tokens.fontWeightSemibold },
});

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/** Square avatar with name and environment underneath. */
export function AgentNameCell({ name, environmentName }: { name: string; environmentName?: string }) {
  const styles = useStyles();
  return (
    <div className={styles.agent}>
      <span className={styles.avatar} aria-hidden>{initials(name)}</span>
      <div className={styles.agentText}>
        <Text weight="semibold" className={styles.ellipsis} title={name}>{name}</Text>
        {environmentName && (
          <Caption1 className={`${styles.ellipsis} ${styles.muted}`}>{environmentName}</Caption1>
        )}
      </div>
    </div>
  );
}

/** Right-aligned tabular number. */
export function NumberCell({ value }: { value: number }) {
  const styles = useStyles();
  return <span className={styles.number}>{value.toLocaleString()}</span>;
}

/** Unknown values render as a blank cell. */
export function UnknownCell() {
  return null;
}

const SENTIMENT_TONE: Record<Exclude<SentimentLabel, 'unknown'>, { tone: DotTone; label: string }> = {
  positive: { tone: 'success', label: 'Positive' },
  neutral: { tone: 'neutral', label: 'Neutral' },
  mixed: { tone: 'warning', label: 'Mixed' },
  negative: { tone: 'danger', label: 'Negative' },
};

export function SentimentCell({ value }: { value: SentimentLabel }) {
  const styles = useStyles();
  if (value === 'unknown') return <UnknownCell />;
  const { tone, label } = SENTIMENT_TONE[value];
  return (
    <DotLabel tone={tone} className={value === 'negative' ? styles.bold : undefined}>
      {label}
    </DotLabel>
  );
}

const PII_TONE: Record<Exclude<PiiExposure, 'unknown'>, { tone: DotTone; label: string }> = {
  high: { tone: 'danger', label: 'High' },
  medium: { tone: 'warning', label: 'Medium' },
  low: { tone: 'brand', label: 'Low' },
  none: { tone: 'subtle', label: 'None' },
};

export function PiiCell({ value }: { value: PiiExposure }) {
  if (value === 'unknown') return <UnknownCell />;
  const { tone, label } = PII_TONE[value];
  return <DotLabel tone={tone}>{label}</DotLabel>;
}

export function LastAnalyzedCell({ iso }: { iso?: string }) {
  const styles = useStyles();
  if (!iso) return <span className={styles.muted}>Never</span>;
  return <span title={new Date(iso).toLocaleString()}>{timeAgo(iso)}</span>;
}
