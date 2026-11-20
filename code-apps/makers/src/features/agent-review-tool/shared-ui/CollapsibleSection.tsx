/**
 * A labelled block in a detail panel that the reader can fold away.
 *
 * A finding drawer is a long scroll of unequal sections: a one-line recommendation sits above a
 * table of nine quoted facts, and a reader who has finished with the table has no way to get it off
 * the screen. Folding gives them one, and keeps the section labels visible as a map of what the
 * drawer holds rather than as headings they have to scroll past.
 *
 * Open by default, deliberately. The drawer exists to show detail; a panel that opens closed makes
 * the reader click to see the thing they asked for. Folding is an escape from length, not a gate in
 * front of content.
 *
 * Built here rather than on `ExpandableRow` because that component is a *row* — it owns a verdict, a
 * severity and a status badge, and carries them into every list that uses it. A section inside a
 * panel has none of those and should not inherit them.
 */

import { useState, type ReactNode } from 'react';
import { Body1, Caption1, makeStyles, tokens, typographyStyles } from '@fluentui/react-components';
import { ChevronDown16Regular, ChevronRight16Regular } from '@fluentui/react-icons';

export interface CollapsibleSectionProps {
  /** The question this block answers, e.g. "Why it matters". */
  label: string;
  /** Right-aligned qualifier shown on the header line, e.g. a count. */
  meta?: ReactNode;
  children: ReactNode;
  /** Starting state when uncontrolled. */
  defaultOpen?: boolean;
  /** Supply with `onOpenChange` to drive the fold from outside, e.g. for a fold-all control. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const useStyles = makeStyles({
  section: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXS, minWidth: 0 },
  /**
   * The whole header line is the control.
   *
   * A chevron on its own is a small target beside a label that reads like a heading, so a reader
   * who wants to fold the section clicks the words and nothing happens.
   */
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    width: '100%',
    padding: 0,
    border: 0,
    background: 'none',
    cursor: 'pointer',
    textAlign: 'left',
    color: 'inherit',
    minWidth: 0,
    ':hover': { color: tokens.colorNeutralForeground2 },
    ':focus-visible': {
      outline: `${tokens.strokeWidthThick} solid ${tokens.colorStrokeFocus2}`,
      outlineOffset: '2px',
      borderRadius: tokens.borderRadiusSmall,
    },
  },
  chevron: { display: 'flex', flexShrink: 0, color: tokens.colorNeutralForeground3 },
  label: {
    ...typographyStyles.caption1Strong,
    color: tokens.colorNeutralForeground2,
    textTransform: 'uppercase',
    letterSpacing: '0.03em',
    minWidth: 0,
    overflowWrap: 'anywhere',
  },
  meta: { ...typographyStyles.caption1, color: tokens.colorNeutralForeground3, marginLeft: 'auto', flexShrink: 0 },
  body: { minWidth: 0 },
});

export function CollapsibleSection({
  label,
  meta,
  children,
  defaultOpen = true,
  open,
  onOpenChange,
}: CollapsibleSectionProps) {
  const styles = useStyles();
  const [uncontrolled, setUncontrolled] = useState(defaultOpen);
  const isOpen = open ?? uncontrolled;

  const toggle = () => {
    const next = !isOpen;
    if (open === undefined) setUncontrolled(next);
    onOpenChange?.(next);
  };

  return (
    <div className={styles.section}>
      <button type="button" className={styles.header} aria-expanded={isOpen} onClick={toggle}>
        <span className={styles.chevron} aria-hidden="true">
          {isOpen ? <ChevronDown16Regular /> : <ChevronRight16Regular />}
        </span>
        <span className={styles.label}>{label}</span>
        {meta ? <span className={styles.meta}>{meta}</span> : null}
      </button>
      {isOpen ? (
        <div className={styles.body}>
          {typeof children === 'string' ? <Body1>{children}</Body1> : children}
        </div>
      ) : null}
    </div>
  );
}

/** Secondary text inside a section, for a qualifier that is not the section's own content. */
export function SectionNote({ children }: { children: ReactNode }) {
  return <Caption1>{children}</Caption1>;
}
