import { useState } from 'react';
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  Badge,
  Button,
  MessageBar,
  MessageBarBody,
  Text,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import {
  CheckmarkCircleFilled,
  ChevronDownRegular,
  ChevronUpRegular,
  DismissCircleFilled,
  ErrorCircleFilled,
  InfoFilled,
  SubtractCircleFilled,
  WarningFilled,
} from '@fluentui/react-icons';
import type { RuleEvaluationStatus } from '../../core/index.js';
import type { CheckGroupView, CheckRowView, ChecksView } from './viewTypes.js';
import { ruleDisplayLabel } from './ruleDisplayLabels.js';

/**
 * Every rule and what it concluded — including the ones that passed.
 *
 * The Findings rail shows only rules that fired, which makes a clean agent look
 * identical to an unreviewed one. This panel is the counterweight: it states
 * what was checked and cleared, and — importantly — what could not be checked
 * at all.
 */

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    // This panel had no padding at all, so its intro line and the totals sat
    // flush against the card edge while every other tab indented its content.
    // Matches the padding the Findings, Skills and Coverage tabs already use,
    // so switching tabs does not shift the left margin.
    padding: '14px 20px 20px',
  },
  intro: { color: tokens.colorNeutralForeground2, fontSize: '13px' },
  totals: { display: 'flex', flexWrap: 'wrap', gap: tokens.spacingHorizontalS },
  groupHeader: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS, flexWrap: 'wrap' },
  familyName: { fontWeight: 600 },
  row: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: tokens.spacingHorizontalS,
    padding: `${tokens.spacingVerticalXS} 0`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke3}`,
  },
  rowLast: { borderBottom: 'none' },
  checkName: {
    color: tokens.colorNeutralForeground2,
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    lineHeight: tokens.lineHeightBase200,
    minWidth: '180px',
  },
  rowText: { flex: 1, minWidth: 0, fontSize: '13px', color: tokens.colorNeutralForeground2 },
  rowSubject: { color: tokens.colorNeutralForeground3, fontSize: '13px' },
  cleanToggle: {
    alignSelf: 'flex-start',
    marginTop: tokens.spacingVerticalXS,
    fontWeight: 400,
    color: tokens.colorNeutralForeground2,
  },
  passIcon: { color: tokens.colorPaletteGreenForeground1, flexShrink: 0 },
  infoIcon: { color: tokens.colorNeutralForeground3, flexShrink: 0 },
  warnIcon: { color: tokens.colorPaletteYellowForeground1, flexShrink: 0 },
  errIcon: { color: tokens.colorPaletteRedForeground1, flexShrink: 0 },
  naIcon: { color: tokens.colorNeutralForeground4, flexShrink: 0 },
  failIcon: { color: tokens.colorPaletteDarkOrangeForeground1, flexShrink: 0 },
});

const STATUS_LABEL: Record<RuleEvaluationStatus, string> = {
  passed: 'Passed',
  info: 'Information',
  warning: 'Warning',
  error: 'Error',
  'not-applicable': 'Not applicable',
  failed: 'Could not run',
};

/** What a status means, so "not applicable" is never read as "fine". */
const STATUS_HINT: Record<RuleEvaluationStatus, string> = {
  passed: 'Checked — nothing to report.',
  info: 'Checked — surfaced for the record.',
  warning: 'Checked — worth attention.',
  error: 'Checked — needs fixing.',
  'not-applicable': 'Did not apply to this agent, so it was not assessed.',
  failed: 'This check could not complete, so the agent was not assessed against it.',
};

function StatusIcon({ status, styles }: { status: RuleEvaluationStatus; styles: ReturnType<typeof useStyles> }) {
  switch (status) {
    case 'passed': return <CheckmarkCircleFilled className={styles.passIcon} aria-hidden />;
    case 'info': return <InfoFilled className={styles.infoIcon} aria-hidden />;
    case 'warning': return <WarningFilled className={styles.warnIcon} aria-hidden />;
    case 'error': return <DismissCircleFilled className={styles.errIcon} aria-hidden />;
    case 'not-applicable': return <SubtractCircleFilled className={styles.naIcon} aria-hidden />;
    case 'failed': return <ErrorCircleFilled className={styles.failIcon} aria-hidden />;
  }
}

function CountBadge({ n, color, label }: { n: number; color: 'success' | 'warning' | 'danger' | 'informative' | 'subtle'; label: string }) {
  if (n === 0) return null;
  return <Badge appearance="tint" color={color}>{n} {label}</Badge>;
}

/** A row the maker must read: it failed, warned, or reported something. */
const isNotable = (row: CheckRowView): boolean =>
  !row.record && row.status !== 'passed' && row.status !== 'not-applicable';

function CheckRow({
  row, last, styles,
}: { row: CheckRowView; last: boolean; styles: ReturnType<typeof useStyles> }) {
  return (
    <div className={last ? `${styles.row} ${styles.rowLast}` : styles.row}>
      <StatusIcon status={row.status} styles={styles} />
      <Text className={styles.checkName}>
        {ruleDisplayLabel(row.ruleId, row.family)}
      </Text>
      <Text className={styles.rowText}>
        {row.findings.length > 0 ? row.findings[0].title : STATUS_HINT[row.status]}
        {/* Only when there is no finding. A finding states what happened
            and already names the component it is about, so appending the
            subject there gave "…display-audit has no examples · display-audit".
            A pass shows a generic hint that carries no identity at all,
            which is exactly where several rows sharing a rule id become
            indistinguishable. */}
        {row.findings.length === 0 && row.subject && (
          <Text className={styles.rowSubject}> · {row.subject}</Text>
        )}
      </Text>
      <Text className={styles.rowText} style={{ flex: '0 0 auto' }}>
        {row.record ? 'Recorded' : STATUS_LABEL[row.status]}
      </Text>
    </div>
  );
}

/**
 * Notable rows always; clean ones behind a disclosure.
 *
 * A rule that runs per component multiplies quickly -- four skills turned nine
 * skill rules into 36 rows, 27 of them the same "nothing to report" line. That
 * buried the twelve rows worth reading. The clean ones still matter, because
 * this panel exists to prove what was checked, so they stay one click away and
 * the count is always visible rather than being filtered out silently.
 */
function GroupRows({ group, styles }: { group: CheckGroupView; styles: ReturnType<typeof useStyles> }) {
  const [showClean, setShowClean] = useState(false);
  const notable = group.rows.filter(isNotable);
  const clean = group.rows.filter(row => !isNotable(row));
  const visible = showClean ? [...notable, ...clean] : notable;

  return (
    <>
      {visible.map((row: CheckRowView, i) => (
        <CheckRow
          key={row.key}
          row={row}
          last={i === visible.length - 1}
          styles={styles}
        />
      ))}
      {clean.length > 0 && (
        <Button
          appearance="subtle"
          size="small"
          className={styles.cleanToggle}
          icon={showClean ? <ChevronUpRegular /> : <ChevronDownRegular />}
          onClick={() => setShowClean(value => !value)}
          aria-expanded={showClean}
        >
          {showClean
            ? `Hide ${clean.length} that had nothing to report`
            : `Show ${clean.length} that had nothing to report`}
        </Button>
      )}
    </>
  );
}

export function ChecksPanel({ checks }: { checks: ChecksView }) {
  const styles = useStyles();

  // A legacy review recorded no outcomes. Saying so is the only honest option —
  // an empty checklist would claim nothing was checked.
  if (!checks.recorded) {
    return (
      // Inside the padded root, so this state indents like every other tab
      // rather than sitting flush against the card edge.
      <section className={styles.root} aria-label="Checks">
        <MessageBar intent="info">
          <MessageBarBody>
            This review was run before per-check results were recorded, so the list of
            checks that passed is not available. Re-run the review to see it.
          </MessageBarBody>
        </MessageBar>
      </section>
    );
  }

  const t = checks.totals;
  return (
    <section className={styles.root} aria-label="Checks">
      <Text className={styles.intro}>
        Every check that ran, including the ones that passed. &ldquo;Not applicable&rdquo;
        means the check did not apply to this agent &mdash; it is not a pass.
        &ldquo;Recorded&rdquo; states a fact about the configuration and is not scored.
      </Text>

      <div className={styles.totals}>
        <CountBadge n={t.passed} color="success" label="passed" />
        <CountBadge n={t.error} color="danger" label="error" />
        <CountBadge n={t.warning} color="warning" label="warning" />
        <CountBadge n={t.info} color="informative" label="info" />
        <CountBadge n={t.notApplicable} color="subtle" label="not applicable" />
        <CountBadge n={t.recorded} color="subtle" label="recorded" />
        <CountBadge n={t.failed} color="danger" label="could not run" />
      </div>

      <Accordion multiple collapsible defaultOpenItems={checks.groups.map(g => g.family)}>
        {checks.groups.map(group => (
          <AccordionItem key={group.family} value={group.family}>
            <AccordionHeader>
              <span className={styles.groupHeader}>
                <Text className={styles.familyName}>{group.family}</Text>
                <CountBadge n={group.counts.error} color="danger" label="error" />
                <CountBadge n={group.counts.warning} color="warning" label="warning" />
                <CountBadge n={group.counts.info} color="informative" label="info" />
                <CountBadge n={group.counts.passed} color="success" label="passed" />
                <CountBadge n={group.counts.notApplicable} color="subtle" label="n/a" />
                <CountBadge n={group.counts.recorded} color="subtle" label="recorded" />
                <CountBadge n={group.counts.failed} color="danger" label="could not run" />
              </span>
            </AccordionHeader>
            <AccordionPanel>
              <GroupRows group={group} styles={styles} />
            </AccordionPanel>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}
