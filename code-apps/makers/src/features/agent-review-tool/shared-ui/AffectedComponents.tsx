/**
 * The components a rule fired against, and what a reviewer decided about each one.
 *
 * A rule that fired on four skills is one row and four decisions. Listing the components as chips
 * said which four, but gave the reviewer only a single all-or-nothing override underneath — so
 * agreeing with the verdict for three skills and disagreeing about the fourth was not expressible,
 * which is exactly the case an override exists for.
 *
 * Each component therefore carries its own menu. "Manual pass" is deliberately not called "ignore":
 * the row stays in the list, the decision stays attributed, and the reader can see that a human
 * overruled the rubric rather than that the rubric never ran.
 *
 * There is no header row and no outcome column. The section above already says what these are
 * ("Affected skill"), and the verdict is not per component: the list is grouped so that every
 * instance in a row shares one outcome, which the drawer header already states beside the title and
 * the findings table above repeats for each instance. A third copy said the same word twice down a
 * column that could never disagree with itself.
 *
 * The names are plain text. They were links once, which promised a detail view that only existed
 * for skills — every other component kind did nothing when clicked — and for a skill it opened a
 * second drawer on top of the finding, hiding the argument that named it. The skill's rubric is
 * already under the finding as its own tab, so the link offered a worse route to something the
 * reader is looking at.
 */

import { Fragment } from 'react';
import {
  makeStyles,
  tokens,
} from '@fluentui/react-components';

import { InstanceOverrideMenu } from './RuleOverrideControls';
import { isOverridable, type ConsolidatedRow } from './consolidatedFindings';

export interface AffectedComponentsProps {
  row: ConsolidatedRow;
  /** Records a manual pass, or takes one back. Omitted where there is nowhere to store the decision. */
  onSetAside?: (keys: readonly string[], setAside: boolean) => void;
  /** A decision is being written; the menu stops accepting another. */
  busy?: boolean;
}

const useStyles = makeStyles({
  table: {
    display: 'grid',
    gridTemplateColumns: '1fr auto',
    alignItems: 'center',
    columnGap: tokens.spacingHorizontalS,
    rowGap: tokens.spacingVerticalXXS,
    width: '100%',
  },
  name: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontFamily: tokens.fontFamilyBase,
    fontSize: tokens.fontSizeBase300,
    lineHeight: tokens.lineHeightBase300,
    color: tokens.colorNeutralForeground1,
  },
});

export function AffectedComponents({
  row,
  onSetAside,
  busy,
}: AffectedComponentsProps) {
  const styles = useStyles();
  const dismissed = row.dismissed === true;

  // One shared test with the row-level control, so the two cannot answer this differently again.
  const overridable = isOverridable(row);

  return (
    <div className={styles.table}>
      {row.affected.map((a, i) => {
        const key = a.instanceKey ?? a.id ?? `${a.name}-${i}`;
        return (
          <Fragment key={key}>
            <span className={styles.name} title={a.name}>{a.name}</span>

            {onSetAside && overridable && a.instanceKey ? (
              <InstanceOverrideMenu
                instanceKey={a.instanceKey}
                label={a.name}
                dismissed={dismissed}
                onSetAside={onSetAside}
                busy={busy}
              />
            ) : (
              <span />
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
