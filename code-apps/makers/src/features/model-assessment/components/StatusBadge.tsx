import { Badge, makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import type { Tone } from '../contracts/model-assessment';
import { toSentenceCase } from '../contracts/sentence-case';

const BADGE_COLOR = {
  success: 'success',
  danger: 'danger',
  warning: 'warning',
  brand: 'brand',
  neutral: 'informative',
} as const satisfies Record<Tone, string>;

const useBadgeStyles = makeStyles({
  badge: { whiteSpace: 'nowrap' },
});


export interface StatusBadgeProps {
  tone: Tone;
  label: string;
}

/** Fluent tint badge used for statuses across the grid, drawer and compare surfaces. */
export function StatusBadge({ tone, label }: StatusBadgeProps) {
  const styles = useBadgeStyles();
  return (
    <Badge appearance="tint" shape="rounded" color={BADGE_COLOR[tone]} className={styles.badge}>
      {toSentenceCase(label)}
    </Badge>
  );
}

const useBarStyles = makeStyles({
  wrap: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    minWidth: '130px',
  },
  bar: {
    flex: 1,
    display: 'flex',
    height: '8px',
    borderRadius: tokens.borderRadiusCircular,
    overflow: 'hidden',
    backgroundColor: tokens.colorNeutralBackground4,
    minWidth: '80px',
  },
  count: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    whiteSpace: 'nowrap',
  },
  compactWrap: {
    minWidth: 0,
    width: '100%',
    maxWidth: '112px',
    gap: tokens.spacingHorizontalXS,
    flexWrap: 'wrap',
  },
  compactBar: { minWidth: '40px' },
  compactCount: { maxWidth: '100%', whiteSpace: 'normal', overflowWrap: 'anywhere' },
  pass: { backgroundColor: tokens.colorPaletteGreenBackground3 },
  fail: { backgroundColor: tokens.colorPaletteRedBackground3 },
  error: { backgroundColor: tokens.colorPaletteYellowBackground3 },
  excluded: { backgroundColor: tokens.colorNeutralForeground4 },
});

export interface ResultsBarProps {
  pass: number;
  fail: number;
  error: number;
  excluded: number;
  showCount?: boolean;
  compact?: boolean;
}

/** Segmented pass/fail/error/excluded ratio bar with an optional `pass/total`. */
export function ResultsBar({
  pass,
  fail,
  error,
  excluded,
  showCount = true,
  compact = false,
}: ResultsBarProps) {
  const styles = useBarStyles();
  const total = pass + fail + error + excluded;
  if (total === 0) {
    return <span className={styles.count}>No results</span>;
  }
  const pct = (n: number) => `${((n / total) * 100).toFixed(1)}%`;
  const summary = `${pass} pass, ${fail} fail, ${error} error, ${excluded} excluded`;
  return (
    <div className={mergeClasses(styles.wrap, compact && styles.compactWrap)}>
      <div className={mergeClasses(styles.bar, compact && styles.compactBar)} role="img" aria-label={summary}>
        {pass > 0 && <span className={styles.pass} style={{ width: pct(pass) }} />}
        {fail > 0 && <span className={styles.fail} style={{ width: pct(fail) }} />}
        {error > 0 && <span className={styles.error} style={{ width: pct(error) }} />}
        {excluded > 0 && (
          <span className={styles.excluded} style={{ width: pct(excluded) }} />
        )}
      </div>
      {showCount && (
        <span className={mergeClasses(styles.count, compact && styles.compactCount)} aria-hidden="true">
          {pass}/{total}
        </span>
      )}
    </div>
  );
}