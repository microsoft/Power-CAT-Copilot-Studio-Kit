/**
 * The "How this score is calculated" explanation shown behind the info trigger
 * beside a review's overall score.
 *
 * Every review type computes its score differently — Copilot Studio agents
 * weight patterns against instructions, declarative agents weight six criteria,
 * uploaded artifacts weight six rubric dimensions — but the reader is asking the
 * same question on each screen, and deserves the same answer in the same place
 * and the same shape. Three hand-written popovers drifted in wording, in
 * heading, and in whether the weights were stated at all; one component cannot.
 *
 * The house wording comes from the grounded-configuration rail, which asked the
 * question first: a heading, one sentence naming what goes in, and a plain
 * statement of what the number does *not* claim. The caveat is required rather
 * than optional on purpose — a score with no stated limit reads as a verdict on
 * the whole artifact, which none of these three are.
 *
 * Typography matches that rail exactly (13px semibold heading, 11.5px muted
 * body) so the popover is recognisably the same object on all three screens.
 */

import { Text, makeStyles, tokens } from '@fluentui/react-components';
import type { ReactNode } from 'react';

const useStyles = makeStyles({
  title: {
    fontSize: '13px',
    fontWeight: 600,
    display: 'block',
  },
  note: {
    fontSize: '11.5px',
    color: tokens.colorNeutralForeground3,
    display: 'block',
    lineHeight: 1.45,
  },
  breakdown: {
    margin: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
  },
  breakdownRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: tokens.spacingHorizontalM,
    fontSize: '11.5px',
    color: tokens.colorNeutralForeground2,
  },
  breakdownTerm: {
    minWidth: 0,
    overflowWrap: 'anywhere',
  },
  breakdownWeight: {
    color: tokens.colorNeutralForeground3,
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
  },
  breakdownValue: {
    margin: 0,
    fontWeight: tokens.fontWeightSemibold,
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'normal',
    textAlign: 'right',
  },
});

export interface ScoreHintBreakdownRow {
  key: string;
  label: ReactNode;
  /** Effective weight used in this review. The component adds the multiplication sign. */
  weight?: ReactNode;
  value: ReactNode;
}

export interface ScoreHintProps {
  /** What the number is made of, in one sentence. */
  basis: ReactNode;
  /** What the number does not claim. Required — see the note above. */
  caveat: ReactNode;
  /**
   * How an unmeasured component is handled. Every review type drops it and
   * shares its weight across the rest rather than scoring it zero, so saying so
   * is what stops a reader reading a missing dimension as a failed one.
   */
  redistribution?: ReactNode;
  /** Optional current calculation, shown in the same label/weight/value form on every review. */
  breakdown?: readonly ScoreHintBreakdownRow[];
  breakdownLabel?: string;
}

/**
 * Renders as a fragment so its blocks become direct children of the popover
 * surface and pick up its 10px column gap.
 */
export function ScoreHint({
  basis,
  caveat,
  redistribution,
  breakdown = [],
  breakdownLabel = 'Score breakdown',
}: ScoreHintProps) {
  const styles = useStyles();

  return (
    <>
      <Text className={styles.title}>How this score is calculated</Text>
      <Text className={styles.note}>{basis}</Text>
      <Text className={styles.note}>{caveat}</Text>
      {redistribution && <Text className={styles.note}>{redistribution}</Text>}
      {breakdown.length > 0 && (
        <dl className={styles.breakdown} aria-label={breakdownLabel}>
          {breakdown.map((row) => (
            <div key={row.key} className={styles.breakdownRow}>
              <dt className={styles.breakdownTerm}>
                {row.label}{' '}
                {row.weight !== undefined && (
                  <span className={styles.breakdownWeight}>×{row.weight}</span>
                )}
              </dt>
              <dd className={styles.breakdownValue}>{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </>
  );
}
