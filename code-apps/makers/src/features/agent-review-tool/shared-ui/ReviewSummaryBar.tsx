/**
 * The band above the findings list: how much of the review passed, and what produced it.
 *
 * The bar is the whole verdict in one line. It shows only the graded rows — a rule that could not
 * be assessed is not a pass and not a failure, and letting it into this bar is exactly how the
 * headline ratio and the list underneath came to disagree. Rules excluded from grading are shown
 * in their own section below, where they can be read without distorting anything.
 */

import {
  Body1Strong,
  Caption1,
  Subtitle2,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { Fragment } from 'react';
import type { ConsolidatedTotals } from './consolidatedFindings';

export interface ReviewSummaryMetadata {
  label: string;
  value: string;
}

export interface ReviewSummaryBarProps {
  totals: ConsolidatedTotals;
  /** e.g. "17 references cited", "15 Microsoft Learn", "2 web". Rendered as a quiet provenance line. */
  provenance?: readonly string[];
  /** Completed on / Model / Memory / Duration / Ignored / Web search, in the order given. */
  metadata?: readonly ReviewSummaryMetadata[];
  heading?: string;
}

const useStyles = makeStyles({
  /**
   * Figma `8967:25185` is one card split in two: the bar and its legend hold the left ~60%, the
   * run's metadata sits to their right rather than underneath. Stacking them pushed the findings
   * list a full band further down the page for information that is read once.
   *
   * The heading spans both, so the two columns start level with each other: metadata drawn beside
   * the title instead sat a row higher than the bar it describes.
   */
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    padding: tokens.spacingHorizontalL,
    backgroundColor: tokens.colorNeutralBackground1,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
  },
  body: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: tokens.spacingHorizontalXXL,
    flexWrap: 'wrap',
  },
  main: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    flexGrow: 1,
    flexBasis: '520px',
    minWidth: 0,
  },
  ratioLine: { display: 'flex', alignItems: 'baseline', gap: tokens.spacingHorizontalS },
  ratio: { marginLeft: 'auto', flexShrink: 0 },
  // A single track of proportional segments: the reader compares lengths, not numbers.
  track: {
    display: 'flex',
    width: '100%',
    height: '8px',
    borderRadius: tokens.borderRadiusCircular,
    overflow: 'hidden',
    backgroundColor: tokens.colorNeutralBackground5,
  },
  legend: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    color: tokens.colorNeutralForeground3,
  },
  legendItem: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalXS },
  swatch: { width: '8px', height: '8px', borderRadius: tokens.borderRadiusSmall, flexShrink: 0 },
  /**
   * Three columns of two, filled downwards — the arrangement Figma `9183:51209` uses.
   *
   * Each column is its own little grid rather than the whole block being one. That is what keeps a
   * value beside its label: the label track then sizes to the longest label *in that column*, so
   * `Model:` is followed immediately by the model. A single shared track across all six pairs sized
   * itself to `Completed on:` and pushed every other value an inch to the right.
   */
  meta: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: tokens.spacingHorizontalXXL,
    margin: 0,
    flexShrink: 0,
    color: tokens.colorNeutralForeground3,
  },
  metaColumn: {
    display: 'grid',
    gridTemplateColumns: 'auto auto',
    alignItems: 'baseline',
    columnGap: tokens.spacingHorizontalS,
    rowGap: tokens.spacingVerticalXXS,
  },
  metaLabel: { margin: 0 },
  metaValue: { color: tokens.colorNeutralForeground2, margin: 0 },
});

const SEGMENT_COLOR = {
  passed: tokens.colorPaletteGreenForeground1,
  fail: tokens.colorPaletteRedForeground1,
} as const;

/** Whole percent of the graded total, so the legend adds up to what the bar shows. */
function percent(part: number, total: number): number {
  return total === 0 ? 0 : Math.round((part / total) * 100);
}

export function ReviewSummaryBar({
  totals,
  provenance,
  metadata,
  heading = 'Review summary',
}: ReviewSummaryBarProps) {
  const styles = useStyles();
  const { evaluated, passed, needsAttention, fail, ignored } = totals;

  // One failure segment, not two. The rows call both outcomes Fail and separate them by severity,
  // so a bar that still drew "Needs attention" in its own colour would be the only place in the
  // report claiming a third verdict exists.
  const failed = fail + needsAttention;

  /**
   * Overrides count as passes here rather than taking a third colour.
   *
   * They already count as passes in the ratio and in the score, so a segment of their own made the
   * track the one place in the report that graded them differently. How many were set aside is
   * still on the record — it is the "Ignored" figure in the metadata beside this bar.
   */
  const passedTotal = passed + ignored;

  /**
   * Down the column first, then across: the pairs arrive in reading order and are cut into columns
   * of two, so the caller controls the layout by ordering its list rather than by knowing this.
   */
  const metaColumns: ReviewSummaryMetadata[][] = [];
  for (let i = 0; i < (metadata?.length ?? 0); i += 2) {
    metaColumns.push(metadata!.slice(i, i + 2));
  }

  const segments = [
    { key: 'passed', value: passedTotal, color: SEGMENT_COLOR.passed, label: 'Passed' },
    { key: 'fail', value: failed, color: SEGMENT_COLOR.fail, label: 'Fail' },
  ].filter(s => s.value > 0);

  return (
    <section className={styles.root} aria-label={heading}>
      <Subtitle2>{heading}</Subtitle2>

      <div className={styles.body}>
        <div className={styles.main}>
          <div className={styles.ratioLine}>
            <Caption1>Total checks passed</Caption1>
            <Body1Strong className={styles.ratio}>{passedTotal} / {evaluated}</Body1Strong>
          </div>

          <div
            className={styles.track}
            role="img"
            aria-label={
              `${passedTotal} of ${evaluated} checks passed, ${failed} failed` +
              (ignored ? ` (${ignored} passed because a reviewer set the rule aside)` : '')
            }
          >
            {segments.map(s => (
              <div
                key={s.key}
                style={{ width: `${percent(s.value, evaluated)}%`, backgroundColor: s.color }}
              />
            ))}
          </div>

          {/* Provenance sits on the legend's own line: both answer "what is this bar made of". */}
          <div className={styles.legend}>
            {segments.map(s => (
              <span key={s.key} className={styles.legendItem}>
                <span className={styles.swatch} style={{ backgroundColor: s.color }} />
                <Caption1>{s.label} ({percent(s.value, evaluated)}%)</Caption1>
              </span>
            ))}
            {provenance?.map(p => <Caption1 key={p}>{p}</Caption1>)}
          </div>
        </div>

        {metadata?.length ? (
          <dl className={styles.meta}>
            {metaColumns.map(column => (
              <div key={column[0].label} className={styles.metaColumn}>
                {column.map(m => (
                  <Fragment key={m.label}>
                    <dt className={styles.metaLabel}><Caption1>{m.label}:</Caption1></dt>
                    <dd className={styles.metaValue}><Caption1>{m.value}</Caption1></dd>
                  </Fragment>
                ))}
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </section>
  );
}
