/**
 * The headline number cards that open the Runtime analysis tab.
 *
 * Presentational only — a caller passes numbers that are already computed and already formatted.
 * That restriction is what lets both the Architecture Review app and the Agent Review Tool import
 * this file: neither a Dataverse client nor a React Query hook can follow it into a bundle.
 *
 * `trend` is deliberately not derived from the value. A rise in "conversations with errors" is bad
 * and a rise in "conversations analysed" is neutral, so only the caller knows which colour is
 * honest; a component that guessed would eventually render a failure in success green.
 */

import { makeStyles, mergeClasses, tokens, Caption1, Title3 } from '@fluentui/react-components';
import { ArrowUpRightRegular, ArrowDownRightRegular } from '@fluentui/react-icons';
import type { ReactNode } from 'react';

/** Direction of travel for a metric's sub-label, when the caller knows what direction means. */
export type MetricTrend = 'up-good' | 'up-bad' | 'down-good' | 'down-bad' | 'neutral';

export interface MetricCardProps {
  /** Row heading, e.g. "Conversations analysed". */
  label: string;
  /**
   * The headline figure, pre-formatted.
   *
   * A string rather than a number because units and precision belong to the caller: "15.2 s" and
   * "8.6%" and "139" all render identically here, and a component that formatted them would have to
   * know which is a duration.
   */
  value: string;
  /** Secondary line under the value, e.g. "174 transcript rows". Omitted when there is nothing to add. */
  detail?: string;
  /** Colours and arrow for `detail`. Defaults to no colour at all. */
  trend?: MetricTrend;
  /** Optional leading glyph, sized by the caller. */
  icon?: ReactNode;
  /** Marks the card as still being computed, so a stale number is never shown as final. */
  pending?: boolean;
}

const useStyles = makeStyles({
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
    flex: '1 1 0',
    minWidth: '150px',
    padding: tokens.spacingHorizontalM,
    backgroundColor: tokens.colorNeutralBackground1,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
  },
  label: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    color: tokens.colorNeutralForeground2,
  },
  value: { color: tokens.colorNeutralForeground1 },
  /** Greys the placeholder so an in-flight card cannot be misread as a real zero. */
  valuePending: { color: tokens.colorNeutralForeground4 },
  detail: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXXS,
    color: tokens.colorNeutralForeground3,
  },
  good: { color: tokens.colorPaletteGreenForeground1 },
  bad: { color: tokens.colorPaletteRedForeground1 },
  group: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalM,
    alignItems: 'stretch',
  },
});

/** Green when the movement is the one the reader wants, red when it is not, uncoloured otherwise. */
function toneFor(trend: MetricTrend | undefined): 'good' | 'bad' | undefined {
  if (trend === 'up-good' || trend === 'down-good') return 'good';
  if (trend === 'up-bad' || trend === 'down-bad') return 'bad';
  return undefined;
}

function isUpward(trend: MetricTrend | undefined): boolean {
  return trend === 'up-good' || trend === 'up-bad';
}

export function MetricCard({ label, value, detail, trend, icon, pending }: MetricCardProps) {
  const styles = useStyles();
  const tone = toneFor(trend);
  const Arrow = isUpward(trend) ? ArrowUpRightRegular : ArrowDownRightRegular;

  return (
    <div className={styles.card}>
      <Caption1 className={styles.label}>
        {icon}
        {label}
      </Caption1>
      <Title3 className={pending ? styles.valuePending : styles.value}>
        {pending ? '—' : value}
      </Title3>
      {detail ? (
        <Caption1 className={mergeClasses(styles.detail, tone && styles[tone])}>
          {trend && trend !== 'neutral' ? <Arrow fontSize={12} /> : null}
          {detail}
        </Caption1>
      ) : null}
    </div>
  );
}

/** Lays the cards out in one wrapping row of equal widths. */
export function MetricCardGroup({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return <div className={styles.group}>{children}</div>;
}
