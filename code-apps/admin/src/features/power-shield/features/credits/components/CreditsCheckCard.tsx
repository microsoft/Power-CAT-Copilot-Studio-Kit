import { useState } from 'react';
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  Badge,
  Button,
  Caption1,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Spinner,
  Subtitle2,
  Text,
  Tooltip,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components';
import { ArrowClockwiseRegular } from '@fluentui/react-icons';
import { useSurfaceStyles } from '../../../shared/styles';
import { tenantDrawState, type ApproveAvailability } from '../services/creditApprovalRules';
import type { CreditSnapshot, Part } from '../services/creditCapacity';
import { PpacLink } from './CreditApproveChecks';
import { CreditStat } from './CreditStat';
import { CreditsCheckTip } from './CreditsCheckTip';
import { DEFAULTED_RULES_TEXT, DRAW_STAT_LABEL, DRAW_STAT_TIP, drawStateText } from './creditApproveText';
import { EnvironmentGroupDrawNote } from './CreditApproveDrawBlock';
import {
  ACCESS_DENIED_TEXT,
  ATTEMPT_OPEN_TEXT,
  CHECKING_TEXT,
  CREDITS_CHECK_HEADER_ID,
  checkBadge,
  checkVerdict,
  partFailureText,
  paygStatusText,
  toVerdictFacts,
  type CapacityPart,
} from './creditCapacityText';

const ITEM = 'credits';

const useStyles = makeStyles({
  card: { paddingTop: tokens.spacingVerticalXS, paddingBottom: tokens.spacingVerticalXS },
  headerRow: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS, flexWrap: 'wrap' },
  header: { flexGrow: 1, minWidth: 0 },
  headerContent: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS, flexWrap: 'wrap' },
  title: { margin: 0 },
  body: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalL, paddingBottom: tokens.spacingVerticalM },
  stats: { display: 'flex', flexWrap: 'wrap', gap: tokens.spacingHorizontalXXL },
  spinner: { alignSelf: 'flex-start' },
  error: { color: tokens.colorPaletteRedForeground1 },
  caption: { color: tokens.colorNeutralForeground3 },
  visuallyHidden: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    margin: '-1px',
    padding: 0,
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    border: 0,
  },
});

export interface CreditsCheckCardProps {
  /** The finished check, or null while it runs. */
  snapshot: CreditSnapshot | null;
  availability: ApproveAvailability;
  /** Credits the maker asked for; undefined on older requests. */
  requestedAmount?: number;
  /** Spec 032: the maker asked to draw from tenant capacity. */
  requestTenantDraw?: boolean;
  /** An earlier approval is unfinished, so Approve and Reject are replaced by the Needs attention bar. */
  attemptOpen: boolean;
  open: boolean;
  onOpenChange(open: boolean): void;
  onRefresh(): void;
}

function statValue(part: Part<number> | undefined): number | 'loading' | 'error' {
  if (!part) return 'loading';
  return part.ok ? part.value : 'error';
}

/** Failure wording for one part. A dash when the access bar already explains it. */
function failureText(snapshot: CreditSnapshot, name: CapacityPart, part: Part<unknown>): string | undefined {
  if (part.ok) return undefined;
  if (snapshot.accessDenied && part.kind === 'Permission') return '—';
  return partFailureText(name, part.kind);
}

/**
 * Spec 030: the Copilot Credits check on the Summary tab. Runs on its own when the request opens, says whether
 * the admin can approve, and shows the numbers behind that answer. Collapsible, open by default.
 */
export function CreditsCheckCard({
  snapshot: s,
  availability,
  requestedAmount,
  requestTenantDraw = false,
  attemptOpen,
  open,
  onOpenChange,
  onRefresh,
}: CreditsCheckCardProps) {
  const styles = useStyles();
  const surfaceStyles = useSurfaceStyles();
  const facts = toVerdictFacts(s, requestedAmount);
  const verdict = checkVerdict(availability, facts);
  const badge = attemptOpen ? { label: 'Needs attention', color: 'warning' as const } : checkBadge(availability, facts);
  const checking = availability.kind === 'checking';
  const [cardEl, setCardEl] = useState<HTMLElement | null>(null);

  const env = s?.env;
  const spare = s?.spare;
  const payg = s?.payg;
  const allocated: Part<number> | undefined = env && (env.ok ? { ok: true, value: env.value.allocated } : env);
  const drawState = env?.ok ? tenantDrawState(env.value.rules, env.value.rulesDefaulted) : undefined;
  const drawValue = !env ? 'loading' : drawState ? drawStateText(drawState) : 'error';
  const groupForNote = requestTenantDraw && drawState === 'off' ? s?.group : undefined;

  return (
    <section
      ref={setCardEl}
      className={mergeClasses(surfaceStyles.surfaceCard, styles.card)}
      aria-label="Copilot Credits check"
    >
      <span role="status" className={styles.visuallyHidden}>
        {checking ? CHECKING_TEXT : verdict ? verdict.title : ''}
      </span>
      <Accordion
        collapsible
        openItems={open ? [ITEM] : []}
        onToggle={(_, data) => onOpenChange(data.openItems.includes(ITEM))}
      >
        <AccordionItem value={ITEM}>
          <div className={styles.headerRow}>
            <AccordionHeader as="h2" size="large" className={styles.header} button={{ id: CREDITS_CHECK_HEADER_ID }}>
              <span className={styles.headerContent}>
                <Subtitle2 as="span" className={styles.title}>Copilot Credits check</Subtitle2>
                {!open && (
                  <Badge appearance="tint" color={badge.color}>
                    {badge.label}
                  </Badge>
                )}
              </span>
            </AccordionHeader>
            {s && <Caption1 className={styles.caption}>Checked at {s.loadedAt.toLocaleTimeString()}</Caption1>}
            <Tooltip content="Refresh credits check" relationship="label" withArrow>
              <Button
                appearance="subtle"
                size="small"
                icon={<ArrowClockwiseRegular />}
                disabledFocusable={checking}
                onClick={onRefresh}
              />
            </Tooltip>
          </div>

          <AccordionPanel>
            <div className={styles.body}>
              {attemptOpen && (
                <MessageBar intent="warning" layout="multiline">
                  <MessageBarBody>{ATTEMPT_OPEN_TEXT}</MessageBarBody>
                </MessageBar>
              )}

              {checking ? (
                <Spinner className={styles.spinner} size="tiny" label={CHECKING_TEXT} labelPosition="after" />
              ) : (
                verdict &&
                !verdict.quiet && (
                  <MessageBar intent={verdict.intent} layout="multiline">
                    <MessageBarBody>
                      <MessageBarTitle>{verdict.title}</MessageBarTitle>
                      {verdict.lines.map((line) => (
                        <div key={line}>{line}</div>
                      ))}
                      {verdict.ppac && <PpacLink />}
                    </MessageBarBody>
                  </MessageBar>
                )
              )}

              {s?.accessDenied && (
                <MessageBar intent="error" layout="multiline">
                  <MessageBarBody>{ACCESS_DENIED_TEXT}</MessageBarBody>
                </MessageBar>
              )}

              <div className={styles.stats}>
                <CreditStat
                  label="Maker asked for"
                  value={requestedAmount}
                  tip="Copilot Credits the maker asked for in this request."
                  emptyText={requestTenantDraw ? '-' : undefined}
                />
                <CreditStat
                  label="This environment has"
                  value={statValue(allocated)}
                  tip="Copilot Credits set aside for this environment now."
                  errorText={s && env ? failureText(s, 'env', env) : undefined}
                />
                <CreditStat
                  label="Spare in your tenant"
                  value={statValue(spare)}
                  tip="Copilot Credits your tenant owns that aren't set aside for any environment yet."
                  errorText={s && spare ? failureText(s, 'spare', spare) : undefined}
                />
                <CreditStat
                  label={DRAW_STAT_LABEL}
                  value={drawValue}
                  tip={DRAW_STAT_TIP}
                  errorText={s && env ? failureText(s, 'env', env) : undefined}
                />
              </div>

              {groupForNote && <EnvironmentGroupDrawNote group={groupForNote} />}

              {payg && (!payg.ok || payg.value.status !== 'none') && (
                <Text>
                  <Text weight="semibold">Billing policy: </Text>
                  {payg.ok ? (
                    paygStatusText(payg.value.status, payg.value.policyName)
                  ) : (
                    <span className={styles.error}>{partFailureText('payg', payg.kind)}</span>
                  )}
                </Text>
              )}

              {env?.ok && env.value.rulesDefaulted && (
                <MessageBar intent="info" layout="multiline">
                  <MessageBarBody>{DEFAULTED_RULES_TEXT}</MessageBarBody>
                </MessageBar>
              )}
            </div>
          </AccordionPanel>
        </AccordionItem>
      </Accordion>
      <CreditsCheckTip target={cardEl} ready={!checking} />
    </section>
  );
}
