import { Button, Checkbox, Field, Link, MessageBar, MessageBarBody, Text, Tooltip, makeStyles, tokens } from '@fluentui/react-components';
import { InfoRegular, OpenRegular, WarningRegular } from '@fluentui/react-icons';
import { environmentGroupLink, type EnvironmentGroupRef, type TenantDrawState } from '../services/creditApprovalRules';
import { DRAW_GROUP_HINT_END, DRAW_HINT_ALREADY_ON, DRAW_HINT_ON, DRAW_HINT_PAYG, paygDrawText } from './creditApproveText';

const useStyles = makeStyles({
  groupNote: {
    display: 'flex',
    alignItems: 'flex-start',
    columnGap: tokens.spacingHorizontalXS,
    color: tokens.colorNeutralForeground2,
  },
  warnIcon: { flexShrink: 0, marginTop: '2px', color: tokens.colorStatusWarningForeground1 },
  openIcon: { verticalAlign: 'middle', marginLeft: '2px' },
  // The info button sits beside the checkbox label, at the label's height.
  drawRow: { display: 'flex', alignItems: 'flex-start', columnGap: tokens.spacingHorizontalXXS },
  infoButton: { flexShrink: 0, marginTop: tokens.spacingVerticalXS },
});

/**
 * Spec 032: the environment group as a link to its PPAC page. Reads "the ALM environment group", or "its environment group"
 * when the name couldn't be read. `capital` starts it with a capital letter.
 */
export function EnvironmentGroupName({ group, capital }: { group?: EnvironmentGroupRef; capital?: boolean }) {
  const styles = useStyles();
  const lead = capital ? (group?.name ? 'The' : 'Its') : group?.name ? 'the' : 'its';
  if (!group) return <>{lead} environment group</>;
  const link = (
    <Link
      href={environmentGroupLink(group.id)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${group.name ? `${group.name} environment group` : 'Environment group'} in Power Platform admin center (opens in new tab)`}
    >
      {group.name ?? 'environment group'}
      <OpenRegular className={styles.openIcon} aria-hidden />
    </Link>
  );
  return group.name ? <>{lead} {link} environment group</> : <>{lead} {link}</>;
}

/** Spec 032: warning line for the check card and the draw checkbox. */
export function EnvironmentGroupDrawNote({ group }: { group: EnvironmentGroupRef }) {
  const styles = useStyles();
  return (
    <Text size={200} className={styles.groupNote}>
      <WarningRegular className={styles.warnIcon} aria-hidden />
      <span>
        This environment is in <EnvironmentGroupName group={group} />. {DRAW_GROUP_HINT_END}
      </span>
    </Text>
  );
}

export interface CreditApproveDrawBlockProps {
  state: TenantDrawState;
  paygActive: boolean;
  paygPolicyName?: string;
  /** Why turning on is blocked, when it's for a reason other than the state or pay-as-you-go. */
  blockedHint?: string;
  /** Spec 032: the environment's group. Its rule may have tenant draw turned off. */
  group?: EnvironmentGroupRef;
  checked: boolean;
  onCheckedChange(checked: boolean): void;
}

/** Spec 032: lets the admin turn on "Draw from the available capacity in my tenant". Never turns it off. */
export function CreditApproveDrawBlock({
  state,
  paygActive,
  paygPolicyName,
  blockedHint,
  group,
  checked,
  onCheckedChange,
}: CreditApproveDrawBlockProps) {
  const hint = paygActive ? DRAW_HINT_PAYG : state !== 'off' ? DRAW_HINT_ALREADY_ON : blockedHint;
  const enabled = !paygActive && state === 'off' && !blockedHint;
  const showGroup = enabled && !!group;
  const styles = useStyles();

  return (
    <>
      {paygActive && (
        <MessageBar intent="info" layout="multiline">
          <MessageBarBody>{paygDrawText(paygPolicyName)}</MessageBarBody>
        </MessageBar>
      )}
      <div className={styles.drawRow}>
        {/* Field ties a "why it's off" hint to the checkbox through aria-describedby (FR-014). */}
        <Field hint={hint}>
          <Checkbox
            checked={enabled && checked}
            disabled={!enabled}
            onChange={(_, d) => onCheckedChange(d.checked === true)}
            label={
              <>
                Turn on <strong>Draw from the available capacity in my tenant</strong>
              </>
            }
          />
        </Field>
        <Tooltip content={DRAW_HINT_ON} relationship="description" withArrow>
          <Button
            appearance="transparent"
            size="small"
            className={styles.infoButton}
            icon={<InfoRegular />}
            aria-label="About tenant draw"
          />
        </Tooltip>
      </div>
      {showGroup && <EnvironmentGroupDrawNote group={group} />}
    </>
  );
}
