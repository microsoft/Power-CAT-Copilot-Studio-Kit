import { Fragment, useEffect, useRef, useState } from 'react';
import {
  Button,
  Text,
  Spinner,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Link,
  Dialog,
  DialogTrigger,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components';
import {
  Globe20Regular,
  Money20Regular,
  DocumentText20Regular,
  CheckmarkCircle20Regular,
  CheckmarkCircle20Filled,
} from '@fluentui/react-icons';
import {
  CreditWizardContextProvider,
  useCreditWizard,
} from '../contexts/CreditWizardContext';
import { canRetryFailed, canSubmitCredit, hasCreatedAnyEnvironment } from '../contexts/creditWizardTypes';
import { countInvalidRows, toSubmittableRows } from '../../../../shared/utils/creditAmountRules';
import { useAuth } from '../../../../shared/hooks/useAuth';
import { useNotify } from '../../../../shared/hooks/useNotify';
import { useLayoutStyles, useSurfaceStyles } from '../../../../shared/styles';
import { useEligibleEnvironments } from '../../../wizard/hooks/useEligibleEnvironments';
import { CreditStep1Environments } from './CreditStep1Environments';
import { CreditStep2RequestCredits } from './CreditStep2RequestCredits';
import { CreditStep3Justification } from './CreditStep3Justification';
import { CreditStep4Review } from './CreditStep4Review';
import { useCreditDraftResume } from '../../hooks/useCreditDraftResume';
import { findActiveCreditConflicts } from '../../../../shared/services/dataverse/creditRequestService';
import {
  mergeSubmitOutcomes,
  submitCreditWizard,
  summarizeOutcomes,
  type CreditWizardSubmitSummary,
} from '../services/creditWizardSubmitService';

const CREDIT_STEPS = [
  { label: 'Environments', Icon: Globe20Regular },
  { label: 'Request credits', Icon: Money20Regular },
  { label: 'Justification', Icon: DocumentText20Regular },
  { label: 'Review & Submit', Icon: CheckmarkCircle20Regular },
] as const;

// Chrome mirrors the Connector wizard shell (features/wizard/components/WizardShell.tsx):
// full-bleed wizardBackground → elevatedCard capped at 1400px, an icon-circle stepper
// bar, and one padded content region. Credit-specific behavior (conflict probe, draft
// resume, submit result, shared footer) is preserved.
const useStyles = makeStyles({
  cardMaxWidth: {
    maxWidth: '1400px',
  },
  stepper: {
    display: 'flex',
    alignItems: 'flex-start',
    padding: `${tokens.spacingVerticalL} ${tokens.spacingHorizontalXL}`,
    borderBottomColor: tokens.colorNeutralStroke1,
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    backgroundColor: tokens.colorNeutralBackground1,
  },
  stepWrapper: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: tokens.spacingVerticalXS,
    flexShrink: 0,
  },
  stepCircle: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: '2px',
    borderRightWidth: '2px',
    borderBottomWidth: '2px',
    borderLeftWidth: '2px',
    borderTopStyle: 'solid',
    borderRightStyle: 'solid',
    borderBottomStyle: 'solid',
    borderLeftStyle: 'solid',
    borderTopColor: tokens.colorNeutralStroke1,
    borderRightColor: tokens.colorNeutralStroke1,
    borderBottomColor: tokens.colorNeutralStroke1,
    borderLeftColor: tokens.colorNeutralStroke1,
    color: tokens.colorNeutralForeground2,
    backgroundColor: tokens.colorNeutralBackground1,
    boxSizing: 'border-box',
  },
  stepCircleActive: {
    borderTopColor: tokens.colorBrandBackground,
    borderRightColor: tokens.colorBrandBackground,
    borderBottomColor: tokens.colorBrandBackground,
    borderLeftColor: tokens.colorBrandBackground,
    backgroundColor: tokens.colorBrandBackground,
    color: tokens.colorNeutralForegroundOnBrand,
  },
  stepCircleCompleted: {
    borderTopColor: tokens.colorPaletteGreenForeground2,
    borderRightColor: tokens.colorPaletteGreenForeground2,
    borderBottomColor: tokens.colorPaletteGreenForeground2,
    borderLeftColor: tokens.colorPaletteGreenForeground2,
    backgroundColor: tokens.colorPaletteGreenForeground2,
    color: tokens.colorNeutralForegroundOnBrand,
  },
  stepClickable: {
    cursor: 'pointer',
    ':hover': {
      transform: 'scale(1.1)',
      borderTopColor: tokens.colorPaletteGreenForeground2,
      borderRightColor: tokens.colorPaletteGreenForeground2,
      borderBottomColor: tokens.colorPaletteGreenForeground2,
      borderLeftColor: tokens.colorPaletteGreenForeground2,
    },
  },
  stepLabel: {
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground2,
    textAlign: 'center',
    maxWidth: '90px',
    lineHeight: tokens.lineHeightBase200,
  },
  stepLabelActive: {
    color: tokens.colorNeutralForeground1,
    fontWeight: tokens.fontWeightSemibold,
  },
  stepButton: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: tokens.spacingVerticalXS,
    flexShrink: 0,
    backgroundColor: 'transparent',
    borderTopStyle: 'none',
    borderRightStyle: 'none',
    borderBottomStyle: 'none',
    borderLeftStyle: 'none',
    paddingTop: '0',
    paddingRight: '0',
    paddingBottom: '0',
    paddingLeft: '0',
    cursor: 'pointer',
  },
  connector: {
    flex: '1 0 12px',
    height: '2px',
    backgroundColor: tokens.colorNeutralStroke1,
    marginTop: '20px',
  },
  connectorActive: {
    backgroundColor: tokens.colorBrandBackground,
  },
  content: {
    padding: `${tokens.spacingVerticalXL} ${tokens.spacingHorizontalXL}`,
    flex: '1',
  },
  navRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    paddingTop: tokens.spacingVerticalM,
  },
  navRowGroup: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
    alignItems: 'center',
  },
  loadingCenter: {
    display: 'flex',
    justifyContent: 'center',
    padding: tokens.spacingVerticalXXL,
  },
  visuallyHidden: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: '0',
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0 0 0 0)',
    whiteSpace: 'nowrap',
  },
  resultList: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
});

interface CreditWizardShellProps {
  /** Called when the maker cancels or, after a successful submit, chooses to leave. */
  onExit: () => void;
  /** Called after at least one environment was created, to navigate to the credit landing. */
  onSubmitted?: () => void;
  /** When set, the wizard resumes this durable draft instead of starting fresh (US4). */
  draftRequestId?: string;
  /** Called when a resumed id is not a Credits request, so the route can show not-found. */
  onWrongTypeDraft?: () => void;
}

function Stepper({
  current,
  onSelect,
}: {
  current: number;
  onSelect: (index: number) => void;
}) {
  const styles = useStyles();
  return (
    <div role="list" aria-label="Wizard steps" className={styles.stepper}>
      {CREDIT_STEPS.map((step, index) => {
        const isActive = index === current;
        const isCompleted = index < current;
        // Backward-only: only a step strictly before the current one is
        // clickable, so a click can never skip goNext's conflict probe or
        // validation by jumping ahead.
        const isClickable = index < current;
        const prevCompleted = index > 0 && index - 1 < current;
        const StepIcon = step.Icon;

        const circleClassName = mergeClasses(
          styles.stepCircle,
          isActive && styles.stepCircleActive,
          isCompleted && styles.stepCircleCompleted,
          isClickable && styles.stepClickable,
        );
        const labelClassName = mergeClasses(
          styles.stepLabel,
          isActive && styles.stepLabelActive,
        );
        const ariaLabel = `Step ${index + 1}: ${step.label}${
          isClickable ? ' (completed, go back to this step)' : isActive ? ' (current)' : ''
        }`;

        const inner = (
          <>
            <div
              className={circleClassName}
              aria-current={isActive ? 'step' : undefined}
              {...(!isClickable ? { 'aria-label': ariaLabel } : {})}
            >
              {isCompleted ? <CheckmarkCircle20Filled /> : <StepIcon />}
            </div>
            <Text className={labelClassName}>{step.label}</Text>
          </>
        );

        return (
          <Fragment key={step.label}>
            {index > 0 && (
              <div
                aria-hidden="true"
                className={mergeClasses(styles.connector, prevCompleted && styles.connectorActive)}
              />
            )}
            {isClickable ? (
              <button
                type="button"
                className={styles.stepButton}
                role="listitem"
                aria-label={ariaLabel}
                onClick={() => onSelect(index)}
              >
                {inner}
              </button>
            ) : (
              <div className={styles.stepWrapper} role="listitem" aria-label={ariaLabel}>
                {inner}
              </div>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

/**
 * Cancel button with a confirmation dialog, mirroring the Connector wizard's
 * CancelWizardDialog. On confirm it calls `onExit`; the message adapts to
 * whether a durable draft is being edited.
 */
function CancelCreditButton({ onExit, disabled }: { onExit: () => void; disabled?: boolean }) {
  const { state } = useCreditWizard();
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(_, d) => setOpen(d.open)}>
      <DialogTrigger disableButtonEnhancement>
        <Button appearance="secondary" disabled={disabled}>
          Cancel
        </Button>
      </DialogTrigger>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>Cancel request?</DialogTitle>
          <DialogContent>
            {state.draftRequestId
              ? 'Any unsaved changes since your last save will be lost. Are you sure you want to cancel?'
              : 'All progress will be lost. Are you sure you want to cancel?'}
          </DialogContent>
          <DialogActions>
            <Button
              appearance="primary"
              onClick={() => {
                setOpen(false);
                onExit();
              }}
            >
              Yes, cancel
            </Button>
            <DialogTrigger disableButtonEnhancement>
              <Button appearance="secondary">No, stay</Button>
            </DialogTrigger>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

function SubmitResult({
  summary,
  onExit,
  onRetry,
  retrying,
}: {
  summary: CreditWizardSubmitSummary;
  onExit: () => void;
  onRetry: () => void;
  retrying: boolean;
}) {
  const styles = useStyles();
  const resultRef = useRef<HTMLDivElement>(null);
  // The button the maker pressed is gone (Submit) or may vanish (Retry), so move focus to the result.
  useEffect(() => {
    resultRef.current?.focus();
  }, [summary]);
  const intent = summary.allCreated ? 'success' : summary.anyCreated ? 'warning' : 'error';
  return (
    <div className={styles.resultList} ref={resultRef} tabIndex={-1}>
      <MessageBar intent={intent}>
        <MessageBarBody>
          <MessageBarTitle>
            {summary.allCreated
              ? 'Request submitted'
              : summary.anyCreated
                ? 'Request partly submitted'
                : 'Request not submitted'}
          </MessageBarTitle>
          {summary.created.length > 0 &&
            ` ${summary.created.length} environment${summary.created.length === 1 ? '' : 's'} now awaiting approval.`}
        </MessageBarBody>
      </MessageBar>

      {summary.conflicts.map((c) => (
        <MessageBar key={c.environmentGuid} intent="warning">
          <MessageBarBody>
            An active credit request already exists for {c.environmentGuid}.{' '}
            {c.conflictWithRequestId && (
              <Link href={`#/power-shield/credit-requests/${c.conflictWithRequestId}`}>
                Open the existing request
              </Link>
            )}
          </MessageBarBody>
        </MessageBar>
      ))}

      {summary.failed.length > 0 && (
        <MessageBar intent="error">
          <MessageBarBody>
            {summary.failed.length} environment{summary.failed.length === 1 ? '' : 's'} could not be
            submitted. You can retry just those.
          </MessageBarBody>
        </MessageBar>
      )}

      <div className={styles.navRow}>
        <Button appearance="secondary" onClick={onExit}>
          Go to my requests
        </Button>
        {summary.failed.length > 0 && (
          <Button appearance="primary" onClick={onRetry} disabledFocusable={retrying}>
            {retrying ? 'Retrying...' : 'Retry failed'}
          </Button>
        )}
      </div>
    </div>
  );
}

function CreditWizardShellInner({
  onExit,
  onSubmitted,
  draftRequestId,
  onWrongTypeDraft,
}: CreditWizardShellProps) {
  const styles = useStyles();
  const layoutStyles = useLayoutStyles();
  const surfaceStyles = useSurfaceStyles();
  const { state, dispatch } = useCreditWizard();
  const { role, aadObjectId, upn } = useAuth();
  const { notifySuccess, notifyError } = useNotify();
  const isViewOnly = role !== 'maker';

  const eligible = useEligibleEnvironments();
  const { status: resumeStatus, isWrongType } = useCreditDraftResume(draftRequestId, eligible);

  const [step, setStep] = useState(0);
  const [summary, setSummary] = useState<CreditWizardSubmitSummary | null>(null);
  const [checkingConflicts, setCheckingConflicts] = useState(false);
  const [amountFocusRequest, setAmountFocusRequest] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Monotonic token + a key of the current Step 1 selection, so a slow conflict
  // probe can't apply its result (or advance) after the maker changed the
  // environments while it was in flight (duck #2).
  const probeTokenRef = useRef(0);
  const selectionKeyRef = useRef('');
  useEffect(() => {
    selectionKeyRef.current = state.selectedEnvironments.map((e) => e.environmentId).join(',');
  }, [state.selectedEnvironments]);

  // A resumed id that is not a Credits request routes to the typed not-found.
  useEffect(() => {
    if (isWrongType) onWrongTypeDraft?.();
  }, [isWrongType, onWrongTypeDraft]);

  // Move focus to the step heading on each step change (FR-023, SC-005).
  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  // If the environment list fails, resume pauses. Show Step 1 so the maker can use Retry.
  const resuming =
    !!draftRequestId && !eligible.error && (resumeStatus === 'loading' || resumeStatus === 'idle');

  const submitting = state.submitPhase === 'submitting';

  function goBack() {
    setStep((s) => Math.max(0, s - 1));
  }

  // Backward-only stepper navigation: jump straight to an earlier, already
  // visited step. Forward jumps are never offered, so the conflict probe and
  // per-step validation in goNext can't be bypassed.
  function goToStep(target: number) {
    if (target < step) setStep(target);
  }

  async function goNext() {
    if (step === 0) {
      const invalid = state.selectedEnvironments.length === 0;
      if (invalid || state.envConfirmation === 'diffPending') {
        dispatch({ type: 'MARK_NEXT_ATTEMPTED', payload: 1 });
        return;
      }
      // Early conflict probe (moved from submit): block leaving Step 1 when any
      // captured environment already has an active credit request, so the clash
      // is surfaced here instead of after the maker fills in every step.
      const token = ++probeTokenRef.current;
      const keyAtStart = selectionKeyRef.current;
      const stale = () => token !== probeTokenRef.current || keyAtStart !== selectionKeyRef.current;
      setCheckingConflicts(true);
      try {
        const conflicts = await findActiveCreditConflicts(state.selectedEnvironments);
        // Discard if a newer probe started, or the maker changed the selection
        // while this awaited — its result no longer describes the current scope.
        if (stale()) return;
        dispatch({ type: 'SET_STEP1_CONFLICTS', payload: conflicts });
        if (conflicts.length > 0) {
          dispatch({ type: 'MARK_NEXT_ATTEMPTED', payload: 1 });
          return;
        }
      } catch (err) {
        if (stale()) return;
        // Fail open: a transient probe error must not block a legitimate request.
        // Submit's unique alternate key still catches a genuine collision.
        dispatch({ type: 'SET_STEP1_CONFLICTS', payload: [] });
        notifyError(err instanceof Error ? err.message : 'Could not check for existing requests.');
      } finally {
        if (token === probeTokenRef.current) setCheckingConflicts(false);
      }
      // Re-verify the scope is still the one we probed before advancing.
      if (stale()) return;
      dispatch({ type: 'CONFIRM_ENVIRONMENTS' });
      dispatch({ type: 'ADVANCE_STEP', payload: 1 });
      setStep(1);
      return;
    }
    if (step === 1) {
      const ids = state.selectedEnvironments.map((e) => e.environmentId);
      if (countInvalidRows(ids, state.requestedAmounts, state.requestTenantDraw) > 0) {
        dispatch({ type: 'MARK_NEXT_ATTEMPTED', payload: 2 });
        setAmountFocusRequest((n) => n + 1);
        return;
      }
      dispatch({ type: 'ADVANCE_STEP', payload: 2 });
      setStep(2);
      return;
    }
    if (step === 2) {
      if (state.justification.trim().length === 0) {
        dispatch({ type: 'MARK_NEXT_ATTEMPTED', payload: 3 });
        return;
      }
      dispatch({ type: 'ADVANCE_STEP', payload: 3 });
      setStep(3);
    }
  }

  /**
   * What to send for these environments, or `null` when any row breaks the row rule. Checked
   * on the raw text, so a bad amount with a tick never becomes a silent draw-only row (FR-007).
   */
  function rowsFor(environments: typeof state.selectedEnvironments) {
    const rows = toSubmittableRows(
      environments.map((e) => e.environmentId),
      state.requestedAmounts,
      state.requestTenantDraw,
    );
    if (rows.invalidIds.length > 0) {
      notifyError('Fix the credits on Step 2 before submitting.');
      return null;
    }
    return rows;
  }

  function announceCreated(count: number) {
    if (count === 0) return;
    notifySuccess(
      count === 1
        ? 'Copilot Credits request submitted successfully.'
        : ` Copilot Credits requests submitted successfully.`
    );
  }

  async function runSubmit() {
    if (!canSubmitCredit(state, isViewOnly)) return;
    const rows = rowsFor(state.selectedEnvironments);
    if (!rows) return;
    dispatch({ type: 'SUBMIT_START' });
    try {
      const result = await submitCreditWizard({
        environments: state.selectedEnvironments,
        requestedAmounts: rows.amounts,
        requestTenantDraw: rows.draws,
        justification: state.justification,
        supportingDocument: state.supportingDocument,
        draftRequestId: state.draftRequestId,
        createdByAadObjectId: aadObjectId,
        createdByUpn: upn,
      });
      dispatch({ type: 'SUBMIT_COMPLETE', payload: result.outcomes });
      setSummary(result);
      announceCreated(result.created.length);
      if (result.anyCreated) onSubmitted?.();
    } catch (err) {
      dispatch({ type: 'SUBMIT_COMPLETE', payload: [] });
      notifyError(err instanceof Error ? err.message : 'Failed to submit the credit request.');
    }
  }

  // Retries only the failed environments. Submit's guard can't be reused here: after a
  // partial success it is locked (alreadySubmitted), which used to make Retry do nothing.
  async function runRetry(previous: CreditWizardSubmitSummary) {
    if (!canRetryFailed(state, isViewOnly)) return;
    const retry = previous.retryEnvironments;
    if (retry.length === 0) return;
    const rows = rowsFor(retry);
    if (!rows) return;
    // Keep the result on screen during the retry so focus stays on the Retry button.
    dispatch({ type: 'RETRY_START' });
    try {
      const result = await submitCreditWizard({
        environments: retry,
        requestedAmounts: rows.amounts,
        requestTenantDraw: rows.draws,
        justification: state.justification,
        supportingDocument: state.supportingDocument,
        // Once a header exists the draft has been consumed; don't touch it again.
        draftRequestId: hasCreatedAnyEnvironment(state) ? undefined : state.draftRequestId,
        createdByAadObjectId: aadObjectId,
        createdByUpn: upn,
      });
      dispatch({ type: 'RETRY_COMPLETE', payload: result.outcomes });
      const merged = mergeSubmitOutcomes(state.submitOutcomes, result.outcomes);
      setSummary(summarizeOutcomes(merged, state.selectedEnvironments));
      announceCreated(result.created.length);
      if (result.anyCreated) onSubmitted?.();
    } catch (err) {
      dispatch({ type: 'RETRY_COMPLETE', payload: [] });
      setSummary(previous);
      notifyError(err instanceof Error ? err.message : 'Failed to retry the credit request.');
    }
  }

  const stepBody = () => {
    if (step === 0) return <CreditStep1Environments eligible={eligible} />;
    if (step === 1) {
      return (
        <CreditStep2RequestCredits
          environments={eligible.environments}
          isLoading={eligible.isLoading}
          error={eligible.error}
          focusRequest={amountFocusRequest}
        />
      );
    }
    if (step === 2) return <CreditStep3Justification />;
    return <CreditStep4Review environments={eligible.environments} />;
  };

  return (
    <div className={layoutStyles.wizardBackground}>
      <div className={mergeClasses(surfaceStyles.elevatedCard, styles.cardMaxWidth)}>
        <Stepper current={step} onSelect={goToStep} />

        <div className={styles.content}>
          {/* Visible title is dropped to match the Connector chrome; a hidden,
              focusable step heading keeps the focus-on-step-change behavior
              (FR-023, SC-005) and tells screen-reader users where they are. */}
          <h2 tabIndex={-1} ref={headingRef} className={styles.visuallyHidden}>
            New Copilot Credits request - Step {step + 1} of {CREDIT_STEPS.length}: {CREDIT_STEPS[step].label}
          </h2>

          {resuming ? (
            <div className={styles.loadingCenter}>
              <Spinner label="Loading your draft..." labelPosition="below" />
            </div>
          ) : summary ? (
            <SubmitResult
              summary={summary}
              onExit={onExit}
              onRetry={() => void runRetry(summary)}
              retrying={submitting}
            />
          ) : (
            <>
              {stepBody()}
              <div className={styles.navRow}>
                <div className={styles.navRowGroup}>
                  {step > 0 && (
                    <Button appearance="secondary" disabled={submitting} onClick={goBack}>
                      Back
                    </Button>
                  )}
                  <CancelCreditButton onExit={onExit} disabled={submitting} />
                </div>
                <div className={styles.navRowGroup}>
                  {step < CREDIT_STEPS.length - 1 ? (
                    <Button
                      appearance="primary"
                      onClick={() => void goNext()}
                      disabled={checkingConflicts || state.step1Conflicts.length > 0}
                      icon={checkingConflicts ? <Spinner size="tiny" /> : undefined}
                    >
                      {checkingConflicts ? 'Checking…' : 'Next'}
                    </Button>
                  ) : (
                    <Button
                      appearance="primary"
                      disabled={!canSubmitCredit(state, isViewOnly) || submitting}
                      icon={submitting ? <Spinner size="tiny" /> : undefined}
                      onClick={() => void runSubmit()}
                    >
                      Submit request
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Credit wizard shell (T021). Frames its steps with the same chrome as the
 * Connector wizard (full-bleed background → 1400px elevated card → icon-circle
 * stepper bar → padded content), while keeping the credit-specific conflict
 * probe, draft resume, submit result, and shared footer. Focus moves to a
 * hidden step heading on each transition and validation is preserved across
 * Back. Owns the current step; the reducer owns `highestCompletedStep` and
 * submit state. Wraps its own CreditWizardContextProvider so callers get a
 * self-contained widget.
 */
export function CreditWizardShell(props: CreditWizardShellProps) {
  return (
    <CreditWizardContextProvider>
      <CreditWizardShellInner {...props} />
    </CreditWizardContextProvider>
  );
}
