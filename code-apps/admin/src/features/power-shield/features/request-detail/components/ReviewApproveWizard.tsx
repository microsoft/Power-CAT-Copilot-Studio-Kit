import { useState, useEffect, useMemo } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  DialogTrigger,
  Divider,
  Field,
  Link,
  MessageBar,
  MessageBarBody,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
  Textarea,
  Tooltip,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components';
import {
  ArrowLeft20Regular,
  ArrowRight20Regular,
  CheckmarkCircle16Regular,
  Dismiss24Regular,
  ShieldError20Regular,
} from '@fluentui/react-icons';
import type { DlpPreflightSummary } from '../../../shared/services/dlp/dlpPreflightService';
import type { ConnectorBlockedStatus } from '../../../shared/services/dataverse/connectorService';
import type { RequestConnector } from '../../../models/requestConnector';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type WizardStep = 'review' | 'approve';

export interface ReviewApproveWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preflight: DlpPreflightSummary;
  blockedConnectors: ConnectorBlockedStatus[];
  requestConnectors: RequestConnector[];
  environmentCount: number;
  connectorCount: number;
  isFulfilling: boolean;
  onConfirm: (comment: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const useStyles = makeStyles({
  // Step indicator
  stepIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    marginBottom: tokens.spacingVerticalM,
  },
  stepDot: {
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
  },
  stepDotActive: {
    backgroundColor: tokens.colorBrandBackground,
    color: tokens.colorNeutralForegroundOnBrand,
  },
  stepDotCompleted: {
    backgroundColor: tokens.colorBrandBackground,
    color: tokens.colorNeutralForegroundOnBrand,
  },
  stepDotPending: {
    backgroundColor: tokens.colorNeutralBackground4,
    color: tokens.colorNeutralForeground3,
  },
  stepLine: {
    width: '40px',
    height: '2px',
    backgroundColor: tokens.colorNeutralStroke2,
  },
  stepLineCompleted: {
    width: '40px',
    height: '2px',
    backgroundColor: tokens.colorBrandBackground,
  },

  // Content
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  sectionHeading: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
  },
  divider: {
    marginTop: tokens.spacingVerticalS,
    marginBottom: tokens.spacingVerticalS,
  },
  impactSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  table: {
    width: '100%',
  },
  blockedTable: {
    width: '100%',
    marginTop: tokens.spacingVerticalXS,
  },
  blockedTableScroll: {
    maxHeight: '200px',
    overflowY: 'auto',
    borderTopStyle: 'solid',
    borderRightStyle: 'solid',
    borderBottomStyle: 'solid',
    borderLeftStyle: 'solid',
    borderTopWidth: tokens.strokeWidthThin,
    borderRightWidth: tokens.strokeWidthThin,
    borderBottomWidth: tokens.strokeWidthThin,
    borderLeftWidth: tokens.strokeWidthThin,
    borderTopColor: tokens.colorNeutralStroke2,
    borderRightColor: tokens.colorNeutralStroke2,
    borderBottomColor: tokens.colorNeutralStroke2,
    borderLeftColor: tokens.colorNeutralStroke2,
    borderRadius: tokens.borderRadiusMedium,
  },
  headerCell: {
    fontWeight: tokens.fontWeightSemibold,
  },
  policyCell: {
    whiteSpace: 'normal',
    wordBreak: 'break-word',
    minWidth: '140px',
  },
  envsCell: {
    color: tokens.colorNeutralForeground1,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function ReviewApproveWizard({
  open,
  onOpenChange,
  preflight,
  blockedConnectors,
  requestConnectors,
  environmentCount,
  connectorCount,
  isFulfilling,
  onConfirm,
}: ReviewApproveWizardProps) {
  const styles = useStyles();

  const [step, setStep] = useState<WizardStep>('review');
  const [comment, setComment] = useState('');

  // Reset state each time the dialog opens
  useEffect(() => {
    if (open) {
      setStep('review');
      setComment('');
    }
  }, [open]);

  // ── Preflight computations ──
  const willReplace = !!preflight.existingPolicyToReplace;
  const zeroEnvPolicies = preflight.policyImpacts.filter((p) => p.remainingCount === 0);
  const nonZeroImpacts = preflight.policyImpacts.filter((p) => p.remainingCount > 0);

  // Policies that GOVERN a requested env but are not owned by Power Shield.
  // Their presence blocks approval — the admin must adjust them in PPAC first.
  const blockingPolicies = preflight.blockingPolicies ?? [];
  const hasBlockingPolicies = blockingPolicies.length > 0;

  // Consolidated list of policies that will be automatically retired (deleted)
  const policiesToRetire = useMemo(() => {
    const items: Array<{ id: string; displayName: string; shortName: string; reason: string }> = [];
    if (willReplace) {
      items.push({
        id: preflight.existingPolicyToReplace!.policyId,
        displayName: preflight.existingPolicyToReplace!.policyDisplayName,
        shortName: preflight.existingPolicyToReplace!.policyShortName,
        reason: 'Same Service Tree & Environment Container',
      });
    }
    for (const p of zeroEnvPolicies) {
      // Avoid duplicating the ST+EC policy if it also appears in zeroEnvPolicies
      if (willReplace && p.policyId === preflight.existingPolicyToReplace!.policyId) continue;
      items.push({
        id: p.policyId,
        displayName: p.policyDisplayName,
        shortName: p.policyShortName,
        reason: 'All environments reassigned (zero remaining)',
      });
    }
    return items;
  }, [preflight, willReplace, zeroEnvPolicies]);

  // ── Blocked connector computations ──
  const blockedItems = useMemo(() => {
    const blockedMap = new Map(
      blockedConnectors
        .filter((c) => c.isBlocked)
        .map((c) => [c.connectorId, c]),
    );
    return requestConnectors
      .filter((rc) => blockedMap.has(rc.connectorId))
      .map((rc) => ({
        connectorId: rc.connectorId,
        connectorName: rc.connectorDisplayName || rc.connectorName || rc.connectorKey || 'Unknown',
      }));
  }, [blockedConnectors, requestConnectors]);

  const hasBlockedConnectors = blockedItems.length > 0;

  // Confirm is disabled while fulfilling, if the required admin comment is empty,
  // or if any blocking (external / tenant-wide / unknown-scope) policy governs a
  // requested environment.
  const confirmDisabled = isFulfilling || !comment.trim() || hasBlockingPolicies;

  // ── Step indicator ──
  function renderStepIndicator() {
    const isReview = step === 'review';
    return (
      <div className={styles.stepIndicator}>
        <div
          className={mergeClasses(styles.stepDot, isReview ? styles.stepDotActive : styles.stepDotCompleted)}
        >
          {isReview ? '1' : '✓'}
        </div>
        <Text size={200} weight={isReview ? 'semibold' : 'regular'}>
          Review
        </Text>
        <div className={mergeClasses(styles.stepLine, !isReview && styles.stepLineCompleted)} />
        <div
          className={mergeClasses(styles.stepDot, isReview ? styles.stepDotPending : styles.stepDotActive)}
        >
          2
        </div>
        <Text size={200} weight={!isReview ? 'semibold' : 'regular'}>
          Approve
        </Text>
      </div>
    );
  }

  // ── Step 1: Review content ──
  function renderReviewStep() {
    return (
      <>
        <DialogContent className={styles.content}>
          {/* ─── Blocked Connectors Section (only shown when blocked connectors exist) ─── */}
          {hasBlockedConnectors && (
            <>
              <div className={styles.sectionHeading}>
                <ShieldError20Regular />
                <Text weight="semibold">Blocked Connectors</Text>
              </div>

              <MessageBar intent="warning">
                <MessageBarBody>
                  <strong>
                    Warning: {blockedItems.length} connector{blockedItems.length !== 1 ? 's' : ''} in this
                    request {blockedItems.length !== 1 ? 'have' : 'has'} been blocked by an administrator
                    after the submission of this Policy Request.
                  </strong>{' '}
                  You may still proceed with approval, but consider reviewing
                  the governance impact.
                </MessageBarBody>
              </MessageBar>
              <div className={styles.blockedTableScroll}>
                <Table className={styles.table} size="small">
                  <TableHeader>
                    <TableRow>
                      <TableHeaderCell className={styles.headerCell}>Connector</TableHeaderCell>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {blockedItems.map((item) => (
                      <TableRow key={item.connectorId}>
                        <TableCell>{item.connectorName}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <Divider className={styles.divider} />
            </>
          )}

          {/* ─── DLP Policy Impact Section ─── */}
          <Text weight="semibold">DLP Policy Impact</Text>

          {/* Block gate — external / tenant-wide / unknown-scope policies that govern
              a requested environment. Approval is disabled until these are adjusted. */}
          {hasBlockingPolicies && (
            <MessageBar intent="error">
              <MessageBarBody>
                <strong>
                  Approval is blocked. {blockingPolicies.length} existing DLP{' '}
                  {blockingPolicies.length === 1 ? 'policy' : 'policies'} already{' '}
                  {blockingPolicies.length === 1 ? 'governs' : 'govern'} the requested
                  environment(s) and cannot be adjusted automatically.
                </strong>{' '}
                Review {blockingPolicies.length === 1 ? 'this policy' : 'these policies'} in the
                Power Platform admin center, then re-check.
                <Table className={styles.blockedTable} size="small">
                  <TableHeader>
                    <TableRow>
                      <TableHeaderCell className={styles.headerCell}>Policy</TableHeaderCell>
                      <TableHeaderCell className={styles.headerCell}>Scope</TableHeaderCell>
                      <TableHeaderCell className={styles.headerCell}>Reason</TableHeaderCell>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {blockingPolicies.map((p) => (
                      <TableRow key={p.policyId}>
                        <TableCell className={styles.policyCell}>
                          <Tooltip content={p.policyDisplayName} relationship="description">
                            <Link
                              href={`https://admin.powerplatform.microsoft.com/security/dataprotection/dlp/policy/${p.policyId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {p.policyShortName}
                            </Link>
                          </Tooltip>
                        </TableCell>
                        <TableCell className={styles.envsCell}>{p.environmentType}</TableCell>
                        <TableCell className={styles.envsCell}>{p.reason}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </MessageBarBody>
            </MessageBar>
          )}

          {/* Info banner for policies that will be retired (zero-env + ST+EC replacement) */}
          {policiesToRetire.length > 0 && (
            <MessageBar intent="info">
              <MessageBarBody>
                {policiesToRetire.length === 1 ? (
                  <>
                    <strong>Note:</strong>{' '}
                    The environments in this request are currently covered by{' '}
                    <Tooltip content={policiesToRetire[0].displayName} relationship="description">
                      <Link
                        href={`https://admin.powerplatform.microsoft.com/security/dataprotection/dlp/policy/${policiesToRetire[0].id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        inline
                      >
                        {policiesToRetire[0].shortName}
                      </Link>
                    </Tooltip>
                    . Approving will move them to a new policy and retire the previous one
                    automatically.
                  </>
                ) : (
                  <>
                    <strong>Note:</strong>{' '}
                    The following DLP policies already cover the environments in this request.
                    Approving will move them to a new policy and retire these automatically.
                    <Table className={styles.blockedTable} size="small">
                      <TableHeader>
                        <TableRow>
                          <TableHeaderCell className={styles.headerCell}>Policy</TableHeaderCell>
                          <TableHeaderCell className={styles.headerCell}>Reason</TableHeaderCell>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {policiesToRetire.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell className={styles.policyCell}>
                              <Tooltip content={p.displayName} relationship="description">
                                <Link
                                  href={`https://admin.powerplatform.microsoft.com/security/dataprotection/dlp/policy/${p.id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  {p.shortName}
                                </Link>
                              </Tooltip>
                            </TableCell>
                            <TableCell className={styles.envsCell}>{p.reason}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </>
                )}
              </MessageBarBody>
            </MessageBar>
          )}

          {/* DLP conflict banner (policies that will be modified but not deleted) */}
          {nonZeroImpacts.length > 0 ? (
            <MessageBar intent="warning">
              <MessageBarBody>
                <strong>
                  {nonZeroImpacts.length} existing DLP{' '}
                  {nonZeroImpacts.length === 1 ? 'policy' : 'policies'} will be modified.
                </strong>{' '}
                The environments below will be removed from their current policies and assigned to
                the new policy.
              </MessageBarBody>
            </MessageBar>
          ) : policiesToRetire.length === 0 ? (
            <MessageBar intent="success">
              <MessageBarBody>
                <strong>No existing DLP policies will be affected.</strong>{' '}
                A new policy will be created covering <strong>{environmentCount}</strong>{' '}
                environment(s) with <strong>{connectorCount}</strong> approved connector(s).
              </MessageBarBody>
            </MessageBar>
          ) : null}

          {/* Impact table (for policies being modified, not deleted) */}
          {nonZeroImpacts.length > 0 && (
            <div className={styles.impactSection}>
              <Table className={styles.table} size="small">
                <TableHeader>
                  <TableRow>
                    <TableHeaderCell className={styles.headerCell}>Policy</TableHeaderCell>
                    <TableHeaderCell className={styles.headerCell}>
                      Environments to be Reassigned
                    </TableHeaderCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {nonZeroImpacts.map((impact) => (
                    <TableRow key={impact.policyId}>
                      <TableCell className={styles.policyCell}>
                        <Tooltip content={impact.policyDisplayName} relationship="description">
                          <Link
                            href={`https://admin.powerplatform.microsoft.com/security/dataprotection/dlp/policy/${impact.policyId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {impact.policyShortName}
                          </Link>
                        </Tooltip>
                      </TableCell>
                      <TableCell className={styles.envsCell}>
                        {impact.environmentsLost.map((e) => e.name).join(', ')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Error banner — if policy listing failed */}
          {preflight.policyListError && (
            <MessageBar intent="warning">
              <MessageBarBody>
                Could not check existing policies: {preflight.policyListError} Impact status is
                unknown.
              </MessageBarBody>
            </MessageBar>
          )}
        </DialogContent>

        <DialogActions>
          <Button
            appearance="primary"
            icon={<ArrowRight20Regular />}
            iconPosition="after"
            onClick={() => setStep('approve')}
            disabled={hasBlockingPolicies}
          >
            Next
          </Button>
          <Button appearance="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogActions>
      </>
    );
  }

  // ── Step 2: Approve content ──
  function renderApproveStep() {
    return (
      <>
        <DialogContent className={styles.content}>
          <MessageBar intent="warning">
            <MessageBarBody>
              By clicking <strong>Confirm Approve</strong>, you are authorizing the creation of a
              DLP policy that will take effect immediately across the specified environments.
            </MessageBarBody>
          </MessageBar>

          {/* Admin comment / fulfillment spinner */}
          {isFulfilling ? (
            <Spinner
              label={willReplace ? 'Replacing existing DLP policy...' : 'Creating DLP policy...'}
              labelPosition="below"
            />
          ) : (
            <Field label="Admin comment" required>
              <Textarea
                value={comment}
                onChange={(_, data) => setComment(data.value)}
                placeholder="Enter a comment..."
                rows={3}
              />
            </Field>
          )}
        </DialogContent>

        <DialogActions>
          <Button
            appearance="primary"
            onClick={() => onConfirm(comment)}
            disabled={confirmDisabled}
            icon={isFulfilling ? <Spinner size="tiny" /> : <CheckmarkCircle16Regular />}
          >
            Confirm Approve
          </Button>
          <Button
            appearance="secondary"
            icon={<ArrowLeft20Regular />}
            onClick={() => setStep('review')}
            disabled={isFulfilling}
          >
            Back
          </Button>
          <Button appearance="secondary" onClick={() => onOpenChange(false)} disabled={isFulfilling}>
            Cancel
          </Button>
        </DialogActions>
      </>
    );
  }

  // ── Render ──
  return (
    <Dialog open={open} onOpenChange={(_, data) => onOpenChange(data.open)}>
      <DialogSurface
        style={{
          maxWidth: 'min(90vw, 960px)',
          width: 'min(90vw, 960px)',
          maxHeight: 'min(90vh, 840px)',
        }}
      >
        {renderStepIndicator()}
        <DialogTitle
          action={
            <DialogTrigger action="close">
              <Button
                appearance="subtle"
                aria-label="Close"
                icon={<Dismiss24Regular />}
                disabled={isFulfilling}
              />
            </DialogTrigger>
          }
        >
          {/* Title intentionally empty — step indicator serves as the visual header */}
          <span style={{ display: 'none' }}>Review & Approve</span>
        </DialogTitle>
        <DialogBody>
          {step === 'review' ? renderReviewStep() : renderApproveStep()}
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
