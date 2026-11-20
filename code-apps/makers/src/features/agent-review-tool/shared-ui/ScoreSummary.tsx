/**
 * The result header: one grade, the score behind it, and the targets it was rolled up from.
 *
 * A rolled-up score is an average over targets, so it is never shown without the count it averages.
 * "87/100" alone invites the reader to treat a healthy agent and a failing one as a single healthy
 * result; "87/100 across 3 targets" is the number plus the reason to click through.
 *
 * Selecting a target is navigation, not filtering — the caller swaps the whole result body. The chip
 * row therefore reports the choice and holds no state of its own.
 */

import { Badge, Caption1, Text, Title1, makeStyles, mergeClasses, shorthands, tokens } from '@fluentui/react-components';
import type { ReactNode } from 'react';
import { toneForScore, type ScoreTone } from './format';

export { toneForScore } from './format';
export type { ScoreTone } from './format';

export interface ScoreSummaryProps {
  /** Letter grade from the rubric, e.g. "B+". Omitted when a review produced no grade. */
  grade?: string;
  /** Points earned. Omitted while a review is still running. */
  score?: number;
  /** Denominator, defaulting to the 100-point scale both rubrics use. */
  outOf?: number;
  /** Heading above the score, e.g. "Rolled up score". */
  label?: string;
  /** One line naming what was rolled up, e.g. "3 targets (3 x Copilot Studio Agents)". */
  detail?: string;
  /** Right-hand slot, normally the target chips. */
  actions?: ReactNode;
  /** Overrides the band derived from `score`. */
  tone?: ScoreTone;
}

const useStyles = makeStyles({
  root: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalL,
    flexWrap: 'wrap',
  },
  left: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalM },
  grade: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '56px',
    height: '56px',
    padding: `0 ${tokens.spacingHorizontalS}`,
    borderRadius: tokens.borderRadiusXLarge,
    fontSize: tokens.fontSizeHero700,
    lineHeight: tokens.lineHeightHero700,
    fontWeight: tokens.fontWeightSemibold,
  },
  good: {
    backgroundColor: tokens.colorPaletteGreenBackground1,
    color: tokens.colorPaletteGreenForeground1,
  },
  fair: {
    backgroundColor: tokens.colorPaletteYellowBackground1,
    color: tokens.colorPaletteYellowForeground1,
  },
  poor: {
    backgroundColor: tokens.colorPaletteRedBackground1,
    color: tokens.colorPaletteRedForeground1,
  },
  // The rule separating the grade from the number it summarises.
  scoreBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
    paddingLeft: tokens.spacingHorizontalM,
    borderLeft: `${tokens.strokeWidthThicker} solid ${tokens.colorNeutralStroke1}`,
  },
  muted: { color: tokens.colorNeutralForeground3 },
  outOf: { color: tokens.colorNeutralForeground3, fontWeight: tokens.fontWeightRegular },
  chips: { display: 'flex', gap: tokens.spacingHorizontalS, flexWrap: 'wrap' },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    padding: `${tokens.spacingVerticalSNudge} ${tokens.spacingHorizontalM}`,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground1,
    cursor: 'pointer',
    font: 'inherit',
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  chipSelected: {
    ...shorthands.borderColor(tokens.colorBrandStroke1),
    backgroundColor: tokens.colorBrandBackground2,
    color: tokens.colorBrandForeground1,
    fontWeight: tokens.fontWeightSemibold,
  },
});

export function ScoreSummary({
  grade,
  score,
  outOf = 100,
  label = 'Rolled up score',
  detail,
  actions,
  tone,
}: ScoreSummaryProps) {
  const styles = useStyles();
  const band = tone ?? toneForScore(score);

  return (
    <div className={styles.root}>
      <div className={styles.left}>
        {grade ? (
          <div className={mergeClasses(styles.grade, styles[band])} aria-label={`Grade ${grade}`}>
            {grade}
          </div>
        ) : null}
        <div className={styles.scoreBlock}>
          <Caption1 className={styles.muted}>{label}</Caption1>
          {detail ? <Caption1 className={styles.muted}>{detail}</Caption1> : null}
          <Title1>
            {score === undefined ? '—' : score}
            <Text className={styles.outOf}>/{outOf}</Text>
          </Title1>
        </div>
      </div>
      {actions}
    </div>
  );
}

export interface ReviewTarget {
  id: string;
  name: string;
  /** Small glyph for the target's harness. */
  icon?: ReactNode;
  /** Shown after the name, e.g. a per-target grade. */
  badge?: string;
}

export interface TargetChipsProps {
  targets: readonly ReviewTarget[];
  selectedId: string;
  onSelect: (id: string) => void;
}

/** One chip per reviewed agent. A single-target review renders nothing — there is nothing to pick. */
export function TargetChips({ targets, selectedId, onSelect }: TargetChipsProps) {
  const styles = useStyles();
  if (targets.length < 2) return null;

  return (
    <div className={styles.chips} role="tablist" aria-label="Reviewed targets">
      {targets.map((target) => (
        <button
          key={target.id}
          type="button"
          role="tab"
          aria-selected={target.id === selectedId}
          className={mergeClasses(styles.chip, target.id === selectedId && styles.chipSelected)}
          onClick={() => onSelect(target.id)}
        >
          {target.icon}
          {target.name}
          {target.badge ? (
            <Badge shape="rounded" appearance="outline" size="small">
              {target.badge}
            </Badge>
          ) : null}
        </button>
      ))}
    </div>
  );
}
