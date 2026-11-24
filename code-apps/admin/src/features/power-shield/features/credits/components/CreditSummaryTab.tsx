import { useMemo } from 'react';
import {
  Text,
  Subtitle2,
  Persona,
  MessageBar,
  MessageBarBody,
  Table,
  TableHeader,
  TableRow,
  TableHeaderCell,
  TableBody,
  TableCell,
  Tooltip,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components';
import { CheckmarkRegular } from '@fluentui/react-icons';
import { useSurfaceStyles } from '../../../shared/styles';
import type { CreditRequestDetail } from '../../../models/creditRequest';
import type { RequestStatus } from '../../../models/status';
import { CreditAllocationGrid } from './CreditAllocationGrid';
import { CreditsCheckCard, type CreditsCheckCardProps } from './CreditsCheckCard';
import { approvedVsRequestedText } from './creditCapacityText';
import { buildRetryPlan } from '../services/creditRetryPlanning';
import { sessionAttempts } from '../services/creditApprovalCommand';

// ─────────────────────────────────────────────────────────────────────────────
// Credit request Summary tab.
//
// The first card holds two unheaded tables: who/when, then the request's single
// environment and its credits (spec 029). Once the request is in an allocation
// phase the live allocation grid is shown below, with a roll-up warning when
// any environment still needs attention.
// ─────────────────────────────────────────────────────────────────────────────

const ALLOCATION_PHASE_STATUSES: RequestStatus[] = [
  'Approved',
  'Implementing',
  'Implemented',
  'ImplementedWithErrors',
];

const DASH = '\u2014';

const useStyles = makeStyles({
  // Space between the who/when table and the environment table.
  // surfaceCard is already a flex column; this only sets the gap between the two tables.
  tables: { gap: tokens.spacingVerticalL },
  // Fluent tables use fixed column widths. Below the min width the table scrolls sideways
  // inside the card instead of squeezing columns until text overlaps.
  scroll: { overflowX: 'auto' },
  detailsTable: { minWidth: '560px' },
  envTable: { minWidth: '360px' },
  wrapCell: { wordBreak: 'break-word' },
  headerCell: { fontWeight: tokens.fontWeightSemibold },
  numCell: { fontVariantNumeric: 'tabular-nums' },
  note: { color: tokens.colorNeutralForeground3 },
  draw: { display: 'inline-flex', alignItems: 'center', gap: tokens.spacingHorizontalXS },
  justification: { whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  persona: { maxWidth: '100%' },
});

function formatDate(iso: string | undefined): string {
  if (!iso) return DASH;
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

interface CreditSummaryTabProps {
  detail: CreditRequestDetail;
  /** Spec 030: shown first while the request waits for a decision. */
  creditsCheck?: CreditsCheckCardProps;
}

export function CreditSummaryTab({ detail, creditsCheck }: CreditSummaryTabProps) {
  const styles = useStyles();
  const surfaceStyles = useSurfaceStyles();

  const isAllocationPhase = ALLOCATION_PHASE_STATUSES.includes(detail.status);
  const retryPlan = useMemo(
    () => buildRetryPlan(detail.environments, sessionAttempts),
    [detail.environments],
  );
  const attentionCount = retryPlan.attentionCount;

  const env = detail.environments[0];
  const requested = env?.requestedAmount;
  // Spec 032: a draw-only request asked for no credits, so its credit cells show "-", not "Not specified" or 0.
  const drawOnly = !!env?.requestTenantDraw && requested === undefined;
  // A pay-as-you-go "approve without adding credits" never writes an approved amount, so it counts as 0.
  const approved = drawOnly ? undefined : env?.creditChildState === 'Skipped' ? 0 : env?.approvedAmount;
  const approvedNote = approved !== undefined ? approvedVsRequestedText(approved, requested) : undefined;
  // Spec 032 (US7): "Turned on" only after a verified turn-on.
  const drawText =
    env?.tenantDrawApproved && env.creditChildState === 'Succeeded'
      ? 'Turned on'
      : env?.requestTenantDraw
        ? 'Requested'
        : '-';

  return (
    <>
      {creditsCheck && <CreditsCheckCard {...creditsCheck} />}

      {/* ── Request details and environment ────────────────────────────── */}
      <section className={mergeClasses(surfaceStyles.surfaceCard, styles.tables)} aria-label="Request summary">
        <div className={styles.scroll} role="region" aria-label="Request details" tabIndex={0}>
          <Table size="small" aria-label="Request details" className={styles.detailsTable}>
            <TableHeader>
              <TableRow>
                <TableHeaderCell className={styles.headerCell}>Requested by</TableHeaderCell>
                <TableHeaderCell className={styles.headerCell}>Submitted</TableHeaderCell>
                <TableHeaderCell className={styles.headerCell}>Assigned admin</TableHeaderCell>
                {detail.decidedOn && <TableHeaderCell className={styles.headerCell}>Decided</TableHeaderCell>}
                {detail.intendedDuration !== undefined && (
                  <TableHeaderCell className={styles.headerCell}>Intended duration</TableHeaderCell>
                )}
                {detail.reviewByDate && <TableHeaderCell className={styles.headerCell}>Review by</TableHeaderCell>}
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>
                  {/* The email is in the tooltip; focusable so keyboard users can read it too. */}
                  <Tooltip content={detail.createdByUpn || DASH} relationship="description">
                    <Persona
                      size="small"
                      name={detail.createdByName || detail.createdByUpn}
                      avatar={{ color: 'colorful' }}
                      className={styles.persona}
                      tabIndex={0}
                    />
                  </Tooltip>
                </TableCell>
                <TableCell className={styles.wrapCell}>{formatDate(detail.submittedOn)}</TableCell>
                <TableCell className={styles.wrapCell}>{detail.assignedAdminName || 'Unassigned'}</TableCell>
                {detail.decidedOn && <TableCell className={styles.wrapCell}>{formatDate(detail.decidedOn)}</TableCell>}
                {detail.intendedDuration !== undefined && (
                  <TableCell className={styles.wrapCell}>{detail.intendedDuration} months</TableCell>
                )}
                {detail.reviewByDate && <TableCell className={styles.wrapCell}>{formatDate(detail.reviewByDate)}</TableCell>}
              </TableRow>
            </TableBody>
          </Table>
        </div>

        <div className={styles.scroll} role="region" aria-label="Environment and credits" tabIndex={0}>
          <Table size="small" aria-label="Environment and credits" className={styles.envTable}>
            <TableHeader>
              <TableRow>
                <TableHeaderCell className={styles.headerCell}>Environment</TableHeaderCell>
                <TableHeaderCell className={styles.headerCell}>
                  Credits requested
                </TableHeaderCell>
                {isAllocationPhase && (
                  <TableHeaderCell className={styles.headerCell}>
                    Credits approved
                  </TableHeaderCell>
                )}
                <TableHeaderCell className={styles.headerCell}>Tenant draw</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className={styles.wrapCell}>{env?.environmentName || env?.environmentGuid || DASH}</TableCell>
                <TableCell className={styles.numCell}>
                  {drawOnly ? '-' : requested === undefined ? <Text className={styles.note}>Not specified</Text> : requested.toLocaleString()}
                </TableCell>
                {isAllocationPhase && (
                  <TableCell className={styles.numCell}>
                    {approved === undefined ? (
                      drawOnly ? '-' : DASH
                    ) : (
                      <>
                        {approved.toLocaleString()}
                        {approvedNote && <span className={styles.note}> {approvedNote}</span>}
                      </>
                    )}
                  </TableCell>
                )}
                <TableCell className={styles.wrapCell}>
                  {drawText === '-' ? (
                    drawText
                  ) : (
                    <span className={styles.draw}>
                      <CheckmarkRegular aria-hidden="true" />
                      {drawText}
                    </span>
                  )}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </section>

      {/* ── Allocation (after approval) ─────────────────────────────────── */}
      {isAllocationPhase && (
        <section className={surfaceStyles.surfaceCard} aria-labelledby="credit-allocation-title">
          <Subtitle2 as="h2" id="credit-allocation-title">
            Credits by environment ({detail.environments.length})
          </Subtitle2>
          {attentionCount > 0 && (
            <MessageBar intent={detail.status === 'ImplementedWithErrors' ? 'error' : 'warning'}>
              <MessageBarBody>
                {attentionCount === 1
                  ? '1 environment still needs attention.'
                  : `${attentionCount} environments still need attention.`}{' '}
                {retryPlan.candidateCount > 0
                  ? 'Use Retry to re-run only the unresolved environments; allocated environments are skipped.'
                  : 'These failures cannot be retried automatically.'}
              </MessageBarBody>
            </MessageBar>
          )}
          <CreditAllocationGrid environments={detail.environments} />
        </section>
      )}

      {/* ── Justification ───────────────────────────────────────────────── */}
      <section className={surfaceStyles.surfaceCard} aria-labelledby="credit-justification-title">
        <Subtitle2 as="h2" id="credit-justification-title">Justification</Subtitle2>
        <Text className={styles.justification}>
          {detail.justification?.trim() || 'No justification provided.'}
        </Text>
      </section>
    </>
  );
}

export default CreditSummaryTab;
