/**
 * "Mark as manual pass" — the reviewer's override, and the way back from it.
 *
 * A rubric is general and the agent in front of you is not. A skill with no negative scope may be
 * the only skill in the harness; a preview connector may be the very thing this agent exists to
 * exercise. Without somewhere to say so, a reviewer's only options are to accept a verdict they
 * disagree with or to stop trusting the tool, and it is always the second.
 *
 * Setting a rule aside returns the credit it was holding and marks the row as an override. It never
 * removes the row. That distinction is the whole design: this records a judgement, and a judgement
 * that hides its own subject is not reviewable by anyone else.
 *
 * A rule that fired against several components is several decisions, so the reviewer picks which
 * ones. Deciding a rule is wrong about one skill says nothing about the other three, and a single
 * action that excused all four would make the override useless precisely where it matters most.
 * That picker moved into a dialog when this became a menu: a menu cannot hold a checkbox list, and
 * the alternative — dropping the picker — would have taken the per-instance decision away.
 *
 * This is a menu rather than a button so it matches {@link AffectedComponents}, which has always
 * been a menu. The two sit in the same drawer and offer the same two decisions, and a paragraph of
 * prose above a button beside a bare icon menu read as two unrelated features.
 */

import { useState } from 'react';
import {
  Button,
  Caption1,
  Checkbox,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  DialogTrigger,
  Menu,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { MoreHorizontalRegular } from '@fluentui/react-icons';

import { isOverridable, type ConsolidatedRow } from './consolidatedFindings';

export interface RuleOverrideControlsProps {
  row: ConsolidatedRow;
  /** Records the decision. Absent when the host has nowhere to store it, which hides the control. */
  onSetAside: (keys: readonly string[], setAside: boolean) => void;
  /** A write is in flight; the buttons stop accepting a second one. */
  busy?: boolean;
}

const useStyles = makeStyles({
  note: { color: tokens.colorNeutralForeground3 },
  picker: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
    paddingTop: tokens.spacingVerticalS,
  },
});

export function RuleOverrideControls({ row, onSetAside, busy }: RuleOverrideControlsProps) {
  const styles = useStyles();
  const keys = row.instanceKeys;
  const [picking, setPicking] = useState(false);
  const [chosen, setChosen] = useState<readonly string[]>(keys);

  // Nothing to set aside, or nothing to overrule. A passing row and a rule that never ran are both
  // excluded here rather than in the drawer, so every caller inherits the same answer.
  if (!isOverridable(row)) return null;

  const dismissed = row.dismissed === true;
  const multi = keys.length > 1;

  // Labelled by the component each instance is about. A key with no named subject falls back to the
  // key itself rather than being dropped — an unlabelled choice is still a choice the reviewer made.
  const labels = new Map(
    row.affected
      .filter(a => a.instanceKey)
      .map(a => [a.instanceKey as string, a.name]),
  );

  const toggle = (key: string, on: boolean) =>
    setChosen(on ? [...chosen, key] : chosen.filter(k => k !== key));

  return (
    <>
      <Menu>
        <MenuTrigger disableButtonEnhancement>
          <Button
            appearance="subtle"
            size="small"
            icon={<MoreHorizontalRegular />}
            disabled={busy}
            aria-label={`Change the outcome for ${row.title}`}
          />
        </MenuTrigger>
        <MenuPopover>
          <MenuList>
            {dismissed ? (
              <MenuItem onClick={() => onSetAside(keys, false)}>
                Restore the review&apos;s verdict
              </MenuItem>
            ) : (
              <MenuItem onClick={() => onSetAside(keys, true)}>
                {multi ? 'Mark all as manual pass' : 'Mark as manual pass'}
              </MenuItem>
            )}
            {!dismissed && multi ? (
              <MenuItem
                onClick={() => {
                  setChosen(keys);
                  setPicking(true);
                }}
              >
                Choose which components…
              </MenuItem>
            ) : null}
          </MenuList>
        </MenuPopover>
      </Menu>

      <Dialog open={picking} onOpenChange={(_, data) => setPicking(data.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Mark as manual pass</DialogTitle>
            <DialogContent>
              <Caption1 className={styles.note}>
                Choose where this rule does not apply. The rest keep their verdict.
              </Caption1>
              <div className={styles.picker}>
                {keys.map(key => (
                  <Checkbox
                    key={key}
                    label={labels.get(key) ?? key}
                    checked={chosen.includes(key)}
                    onChange={(_, data) => toggle(key, data.checked === true)}
                  />
                ))}
              </div>
            </DialogContent>
            <DialogActions>
              <DialogTrigger disableButtonEnhancement>
                <Button appearance="subtle" disabled={busy}>Cancel</Button>
              </DialogTrigger>
              <Button
                appearance="primary"
                disabled={busy || chosen.length === 0}
                onClick={() => {
                  onSetAside(chosen, true);
                  setPicking(false);
                }}
              >
                {chosen.length === keys.length
                  ? 'Manual pass for all'
                  : `Manual pass for ${chosen.length} of ${keys.length}`}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </>
  );
}

export interface InstanceOverrideMenuProps {
  /** The one rule instance this menu decides. */
  instanceKey: string;
  /** What the menu is about, for its accessible name. */
  label: string;
  dismissed: boolean;
  onSetAside: (keys: readonly string[], setAside: boolean) => void;
  busy?: boolean;
}

/**
 * The override for a single named instance.
 *
 * {@link RuleOverrideControls} decides a whole row and so needs a picker to say which instances it
 * means. This decides one the surface has already named, so it is two menu items and nothing else.
 *
 * Shared by the components list and the findings list so the two cannot drift into different
 * wording for the same decision — they sit inside one drawer, a few pixels apart.
 */
export function InstanceOverrideMenu({
  instanceKey,
  label,
  dismissed,
  onSetAside,
  busy,
}: InstanceOverrideMenuProps) {
  return (
    <Menu>
      <MenuTrigger disableButtonEnhancement>
        <Button
          appearance="subtle"
          size="small"
          icon={<MoreHorizontalRegular />}
          disabled={busy}
          aria-label={`Change the outcome for ${label}`}
        />
      </MenuTrigger>
      <MenuPopover>
        <MenuList>
          {dismissed ? (
            <MenuItem onClick={() => onSetAside([instanceKey], false)}>
              Restore the review&apos;s verdict
            </MenuItem>
          ) : (
            <MenuItem onClick={() => onSetAside([instanceKey], true)}>
              Mark as manual pass
            </MenuItem>
          )}
        </MenuList>
      </MenuPopover>
    </Menu>
  );
}
