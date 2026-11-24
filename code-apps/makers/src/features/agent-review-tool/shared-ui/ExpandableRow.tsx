/**
 * The expand-to-read row used by both result lists.
 *
 * Findings and runtime errors are different data with the same shape on screen: a one-line summary
 * that has to be scannable in bulk, and a body that is only worth the vertical space once the reader
 * has picked a row. Building that twice is how the two lists drift apart, so it is built once here
 * and given no opinion about what it contains.
 *
 * Expansion can be left alone or driven from outside. Uncontrolled is the default because most lists
 * only need "open the one I clicked"; controlled exists for expand-all and for deep links that must
 * open a specific row on arrival.
 */

import {
  Badge,
  Caption1,
  Body1,
  Body1Strong,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { ChevronDownRegular, ChevronRightRegular, CheckmarkCircleFilled, DismissCircleFilled } from '@fluentui/react-icons';
import { useState, type ReactElement, type ReactNode } from 'react';

/**
 * Result of a single check.
 *
 * The keys stay in the rubric's stored vocabulary (`warning`, `error`) because reviews already
 * persisted carry those strings; only the words shown to a reader changed. `not-applicable`,
 * `not-assessed` and `could-not-run` describe the assessment rather than the agent, and are scored
 * by neither.
 *
 * `not-assessed` and `could-not-run` answer different questions and were offered as one word until
 * now. A rule the review reached but could not judge is *not assessed*; `could-not-run` is reserved
 * for the review itself being unable to run, which is a tooling failure the reader has to act on
 * rather than a gap in what the agent supplied.
 */
export type ResultTone =
  | 'pass'
  | 'warning'
  | 'error'
  | 'info'
  | 'ignored'
  | 'not-applicable'
  | 'not-assessed'
  | 'could-not-run';

export interface ExpandableRowProps {
  /** The summary line. Should read as a claim, not a category. */
  title: string;
  /** Small qualifiers after the title, e.g. "Skill", "Evaluation", "Connector". */
  tags?: readonly string[];
  /**
   * How much the rule matters when it is not satisfied.
   *
   * Shown only where the row carries a verdict against the agent. A passing row has no severity to
   * state: the rubric records how a rule failed, not how badly it would have failed had it not
   * passed, and inventing that here would put a red "High" beside a green "Pass".
   */
  severity?: RuleSeverity;
  /** Status shown at the row's right edge. */
  tone?: ResultTone;
  /** Overrides the default wording for `tone`, e.g. "Pass (override)". */
  toneLabel?: string;
  /** Extra right-aligned detail before the status, e.g. "3 occurrences". */
  meta?: ReactNode;
  /** Body, rendered only while open so heavy detail costs nothing when collapsed. */
  children?: ReactNode;
  /** Supply with `onOpenChange` to drive expansion from outside. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Starting state when uncontrolled. */
  defaultOpen?: boolean;
}

/**
 * Reader-facing wording.
 *
 * There is no "Needs attention" verdict any more. A rule either holds or it does not, and how much
 * it matters is carried by the severity tag beside it — so the rubric's `warning` level reads as a
 * Medium-severity failure rather than as a third outcome the reader has to place between the two.
 * The stored vocabulary is untouched, and so is the credit `warning` earns: this renames what is
 * shown, not what is scored.
 */
const TONE_LABEL: Record<ResultTone, string> = {
  pass: 'Pass',
  warning: 'Fail',
  error: 'Fail',
  info: 'Info',
  ignored: 'Manual pass',
  'not-applicable': 'Not applicable',
  'not-assessed': 'Not assessed',
  'could-not-run': 'Could not run',
};

const TONE_APPEARANCE: Record<ResultTone, 'success' | 'warning' | 'danger' | 'informative' | 'subtle'> = {
  pass: 'success',
  // Labelled Fail, so it has to read as one. Shown in blue while it said "Needs attention", which
  // would now put a calm blue pill on a row that states the agent did not satisfy the rule.
  warning: 'danger',
  error: 'danger',
  info: 'informative',
  // `subtle` is white-on-white for an outline badge, which put these pills in the markup and
  // nowhere on screen. `informative` is the quietest colour that can still be read; the outline
  // below is what separates them from a real verdict.
  ignored: 'informative',
  'not-applicable': 'informative',
  'not-assessed': 'informative',
  'could-not-run': 'informative',
};

/**
 * A verdict is icon-led; everything else is not.
 *
 * Pass and Fail are read in bulk and at a glance, so they carry the mark the design gives them. The
 * states that describe the assessment rather than the agent stay plain, so a skimming reader counts
 * only the rows that actually graded something.
 */
const TONE_ICON: Partial<Record<ResultTone, ReactElement>> = {
  pass: <CheckmarkCircleFilled />,
  warning: <DismissCircleFilled />,
  error: <DismissCircleFilled />,
};

/**
 * Ghost badges carry colour and no border, which reads well for a verdict but leaves the muted
 * tones as grey text on white — present in the markup and invisible on screen. The states that
 * describe the assessment rather than the agent get an outline so they can actually be seen.
 */
const TONE_BADGE_APPEARANCE: Partial<Record<ResultTone, 'ghost' | 'outline'>> = {
  ignored: 'outline',
  'not-applicable': 'outline',
  'not-assessed': 'outline',
  'could-not-run': 'outline',
};

/**
 * How much a rule matters when it is not satisfied.
 *
 * A restatement of the rubric's own `error` / `warning` / `info` levels in the words a reviewer
 * triages by. Nothing is scored from this — it only says which failures to read first.
 */
export type RuleSeverity = 'High' | 'Medium' | 'Low';

const SEVERITY_FOR_TONE: Partial<Record<ResultTone, RuleSeverity>> = {
  error: 'High',
  'could-not-run': 'High',
  warning: 'Medium',
  info: 'Low',
};

const SEVERITY_COLOR: Record<RuleSeverity, 'danger' | 'warning' | 'informative'> = {
  High: 'danger',
  Medium: 'warning',
  Low: 'informative',
};

/**
 * Whether the severity badge is shown beside the verdict.
 *
 * Off for now at the maker's request. Everything behind it stays live — rows still carry a
 * severity and still tag it — so turning this back on is the only change needed to restore it.
 */
const SHOW_SEVERITY: boolean = false;

/** The severity a tone implies, or none where the row carries no verdict against the agent. */
export function severityForTone(tone: ResultTone | undefined): RuleSeverity | undefined {
  return tone ? SEVERITY_FOR_TONE[tone] : undefined;
}

const useStyles = makeStyles({
  row: {
    backgroundColor: tokens.colorNeutralBackground1,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    overflow: 'hidden',
  },
  // A button rather than a div so the keyboard and screen readers get the disclosure for free.
  summary: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    width: '100%',
    padding: tokens.spacingHorizontalM,
    border: 'none',
    backgroundColor: 'transparent',
    textAlign: 'left',
    cursor: 'pointer',
    font: 'inherit',
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  chevron: { flexShrink: 0, color: tokens.colorNeutralForeground3 },
  /**
   * The title and its rule id travel together.
   *
   * The title used to grow to fill the row, which pushed the rule id to the far right and left it
   * reading as a second verdict rather than as the name of the one on screen. Growing the pair
   * instead keeps the id against the end of the title wherever the row is cut.
   */
  titleGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    flexGrow: 1,
    minWidth: 0,
    flexWrap: 'wrap',
  },
  title: { minWidth: 0, color: tokens.colorNeutralForeground1 },
  right: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    flexShrink: 0,
    color: tokens.colorNeutralForeground3,
  },
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    padding: `0 ${tokens.spacingHorizontalM} ${tokens.spacingHorizontalM} 36px`,
  },
  section: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXXS },
  sectionLabel: { color: tokens.colorNeutralForeground3 },
  // Verbatim platform text. Monospaced and boxed so it reads as quoted evidence, not as our prose.
  code: {
    padding: tokens.spacingHorizontalS,
    backgroundColor: tokens.colorNeutralBackground3,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase200,
    color: tokens.colorNeutralForeground1,
    overflowX: 'auto',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  list: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS },
});

/** The verdict badge. Shared so every list renders a tone identically. */
export function FindingStatusBadge({ tone, toneLabel }: { tone: ResultTone; toneLabel?: string }) {
  return (
    <Badge
      appearance={TONE_BADGE_APPEARANCE[tone] ?? 'tint'}
      color={TONE_APPEARANCE[tone]}
      shape="rounded"
      size="medium"
      icon={TONE_ICON[tone]}
    >
      {toneLabel ?? TONE_LABEL[tone]}
    </Badge>
  );
}

export function ExpandableRow({
  title,
  tags,
  severity,
  tone,
  toneLabel,
  meta,
  children,
  open,
  onOpenChange,
  defaultOpen = false,
}: ExpandableRowProps) {
  const styles = useStyles();
  const [uncontrolled, setUncontrolled] = useState(defaultOpen);
  const isOpen = open ?? uncontrolled;

  const toggle = () => {
    const next = !isOpen;
    if (open === undefined) setUncontrolled(next);
    onOpenChange?.(next);
  };

  const Chevron = isOpen ? ChevronDownRegular : ChevronRightRegular;

  return (
    <div className={styles.row}>
      <button type="button" className={styles.summary} onClick={toggle} aria-expanded={isOpen}>
        <Chevron className={styles.chevron} />
        <span className={styles.titleGroup}>
          <Body1Strong className={styles.title}>{title}</Body1Strong>
          {tags?.map((tag) => (
            <Badge key={tag} appearance="outline" color="informative" shape="rounded" size="small">
              {tag}
            </Badge>
          ))}
        </span>
        <span className={styles.right}>
          {meta ? <Caption1>{meta}</Caption1> : null}
          {SHOW_SEVERITY && severity ? (
            <Badge
              appearance="tint"
              color={SEVERITY_COLOR[severity]}
              shape="rounded"
              size="small"
              title={`${severity} severity`}
            >
              {severity}
            </Badge>
          ) : null}
          {tone ? <FindingStatusBadge tone={tone} toneLabel={toneLabel} /> : null}
        </span>
      </button>
      {isOpen && children ? <div className={styles.body}>{children}</div> : null}
    </div>
  );
}

/** A labelled block inside an expanded row — "Reported", "Cause", "Recommendation". */
export function RowSection({ label, children }: { label: string; children: ReactNode }) {
  const styles = useStyles();
  return (
    <div className={styles.section}>
      <Caption1 className={styles.sectionLabel}>{label}</Caption1>
      {typeof children === 'string' ? <Body1>{children}</Body1> : children}
    </div>
  );
}

/** Verbatim text from the platform, quoted rather than paraphrased. */
export function RowCode({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return <div className={styles.code}>{children}</div>;
}

/** Vertical stack for a set of rows, so every list spaces them identically. */
export function ExpandableRowList({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return <div className={styles.list}>{children}</div>;
}

/** Exported for callers that need to label a tone consistently outside a row. */
export function labelForTone(tone: ResultTone): string {
  return TONE_LABEL[tone];
}

export { Body1Strong as RowEmphasis };
