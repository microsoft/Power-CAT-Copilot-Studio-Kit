/**
 * The controls above a runtime analysis: which lens to read the run through, which window it covers,
 * and the button that runs it again.
 *
 * The lens switch is a segmented control rather than a tab strip. Tabs already sit directly above it
 * for Agent review / Agent map / Runtime analysis, and two rows of underlined tabs would read as one
 * broken navigation; the elevated-pill treatment says "filter within this view" instead.
 *
 * Dates are the analysis window, not a display filter. Narrowing them and pressing Analyze again is
 * a new run over different transcripts, so the button is the only thing that commits them — editing
 * a date must never silently re-query.
 */

import {
  Button,
  Caption1,
  Spinner,
  makeStyles,
  mergeClasses,
  shorthands,
  tokens,
} from '@fluentui/react-components';
import { PlayRegular } from '@fluentui/react-icons';
import { DatePicker } from '@fluentui/react-datepicker-compat';

/** Which slice of the run is on screen. */
export type RuntimeLens = 'errors' | 'latency' | 'knowledge';

export const RUNTIME_LENSES: readonly { key: RuntimeLens; label: string }[] = [
  { key: 'errors', label: 'Errors' },
  { key: 'latency', label: 'Latency' },
  { key: 'knowledge', label: 'Knowledge' },
];

export interface RuntimeAnalysisToolbarProps {
  lens: RuntimeLens;
  onLensChange: (lens: RuntimeLens) => void;
  /** Inclusive start of the transcript window. */
  from: Date | null;
  to: Date | null;
  onRangeChange: (next: { from: Date | null; to: Date | null }) => void;
  /** Omit to render the toolbar read-only — historical snapshots cannot be re-run in place. */
  onAnalyze?: () => void;
  /** Swaps the button for a spinner and blocks a second dispatch of the same job. */
  analyzing?: boolean;
  /** Disables the dates, e.g. while a run is in flight. */
  disabled?: boolean;
  /**
   * Shows the window without letting it be edited, while leaving Analyze again live.
   *
   * For a host that pins the window to something else it owns — a snapshot, a scheduled run — the
   * dates are a statement of what was read, not a control. Editing one there would either be
   * ignored or would quietly put the stored report and its own recorded window out of step.
   */
  rangeReadOnly?: boolean;
}

const useStyles = makeStyles({
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
  },
  segmented: {
    display: 'inline-flex',
    gap: tokens.spacingHorizontalXXS,
    padding: tokens.spacingHorizontalXXS,
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: tokens.borderRadiusMedium,
  },
  segment: {
    border: `${tokens.strokeWidthThin} solid transparent`,
    borderRadius: tokens.borderRadiusMedium,
    padding: `${tokens.spacingVerticalSNudge} ${tokens.spacingHorizontalMNudge}`,
    backgroundColor: 'transparent',
    color: tokens.colorNeutralForeground2,
    cursor: 'pointer',
    font: 'inherit',
    fontSize: tokens.fontSizeBase300,
    lineHeight: tokens.lineHeightBase300,
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  segmentSelected: {
    backgroundColor: tokens.colorNeutralBackground1,
    ...shorthands.borderColor(tokens.colorNeutralStroke2),
    color: tokens.colorNeutralForeground1,
    fontWeight: tokens.fontWeightSemibold,
    boxShadow: tokens.shadow2,
    ':hover': { backgroundColor: tokens.colorNeutralBackground1 },
  },
  range: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
  },
  picker: { minWidth: '132px' },
  separator: { color: tokens.colorNeutralForeground3 },
});

export function RuntimeAnalysisToolbar({
  lens,
  onLensChange,
  from,
  to,
  onRangeChange,
  onAnalyze,
  analyzing,
  disabled,
  rangeReadOnly,
}: RuntimeAnalysisToolbarProps) {
  const styles = useStyles();
  const datesDisabled = disabled || analyzing || rangeReadOnly;

  return (
    <div className={styles.toolbar}>
      <div className={styles.segmented} role="tablist" aria-label="Runtime analysis view">
        {RUNTIME_LENSES.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={lens === key}
            className={mergeClasses(styles.segment, lens === key && styles.segmentSelected)}
            onClick={() => onLensChange(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className={styles.range}>
        <DatePicker
          className={styles.picker}
          value={from}
          onSelectDate={(date) => onRangeChange({ from: date ?? null, to })}
          disabled={datesDisabled}
          placeholder="Start date"
          aria-label="Analysis window start"
          // A window that ends before it starts returns nothing and looks like a broken agent.
          maxDate={to ?? undefined}
        />
        <Caption1 className={styles.separator}>to</Caption1>
        <DatePicker
          className={styles.picker}
          value={to}
          onSelectDate={(date) => onRangeChange({ from, to: date ?? null })}
          disabled={datesDisabled}
          placeholder="End date"
          aria-label="Analysis window end"
          minDate={from ?? undefined}
        />
        {onAnalyze ? (
          <Button
            appearance="secondary"
            icon={analyzing ? <Spinner size="tiny" /> : <PlayRegular />}
            onClick={onAnalyze}
            disabled={analyzing || disabled}
          >
            {analyzing ? 'Analyzing…' : 'Analyze again'}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
