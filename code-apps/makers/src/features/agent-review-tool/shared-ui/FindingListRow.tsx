/**
 * One row of the consolidated list, reduced to a claim and a verdict.
 *
 * Nothing expands here. The row's job is to be scannable in bulk — a reader comparing forty checks
 * is reading titles and statuses, not prose — and everything that explains the verdict lives in the
 * drawer beside the list. Expanding in place pushed the rows below off screen, so opening the
 * second finding meant losing the first; a drawer keeps the whole list in view while one row is
 * being read.
 *
 * Selected rather than open: a list where exactly one row is current is a listbox, not a set of
 * independent disclosures, and saying so is what lets the arrow keys and the drawer agree about
 * which row the reader is on.
 */

import { Badge, Caption1, makeStyles, mergeClasses, tokens, Body1Strong } from '@fluentui/react-components';

import { FindingStatusBadge } from './ExpandableRow';
import type { ConsolidatedRow } from './consolidatedFindings';

export interface FindingListRowProps {
  row: ConsolidatedRow;
  selected: boolean;
  onSelect: (key: string) => void;
  /** Id of the drawer this row drives, so assistive tech can follow the relationship. */
  drawerId: string;
}

const useStyles = makeStyles({
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    width: '100%',
    padding: tokens.spacingHorizontalM,
    backgroundColor: tokens.colorNeutralBackground1,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    textAlign: 'left',
    cursor: 'pointer',
    font: 'inherit',
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
    ':active': { backgroundColor: tokens.colorNeutralBackground1Pressed },
  },
  /**
   * Selection is carried by a left bar and a tint, not by the border colour alone.
   *
   * A 1px colour change on an otherwise identical row is not a reliable signal next to the status
   * pills, which are already coloured; the bar is positional and reads at a glance.
   */
  selected: {
    backgroundColor: tokens.colorNeutralBackground1Selected,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}`,
    boxShadow: `inset 3px 0 0 0 ${tokens.colorBrandStroke1}`,
  },
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
});

export function FindingListRow({ row, selected, onSelect, drawerId }: FindingListRowProps) {
  const styles = useStyles();
  const tag = row.ruleId;

  return (
    <button
      type="button"
      className={mergeClasses(styles.row, selected && styles.selected)}
      onClick={() => onSelect(row.key)}
      aria-expanded={selected}
      aria-controls={drawerId}
    >
      <span className={styles.titleGroup}>
        <Body1Strong className={styles.title}>{row.title}</Body1Strong>
        {tag ? (
          <Badge appearance="outline" color="informative" shape="rounded" size="small">
            {tag}
          </Badge>
        ) : null}
      </span>
      <span className={styles.right}>
        {row.affected.length > 1 ? <Caption1>{row.affected.length} components</Caption1> : null}
        {row.tone ? <FindingStatusBadge tone={row.tone} /> : null}
      </span>
    </button>
  );
}
