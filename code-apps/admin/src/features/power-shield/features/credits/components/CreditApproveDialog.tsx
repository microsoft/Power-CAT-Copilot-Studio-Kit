import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  Link,
  MessageBar,
  MessageBarBody,
  Spinner,
  Text,
  Textarea,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { useCreditApprovalReview } from '../hooks/useCreditApprovalReview';
import { useCreditApprovalSubmit } from '../hooks/useCreditApprovalSubmit';
import {
  PPAC_CAPACITY_LINK,
  canTurnOnDraw,
  prefillAmount,
  tenantDrawState,
  validateAmount,
} from '../services/creditApprovalRules';
import { MSG_COMMENT_REQUIRED, type ApprovalResult } from '../services/creditApprovalCommand';
import { useNavigate } from '../../../shared/hooks/useNavigate';
import { StepIndicator } from '../../../shared/components/StepIndicator';
import { CreditApproveReviewStep } from './CreditApproveReviewStep';
import { ApprovalErrorDetailsPanel } from './ApprovalErrorDetailsPanel';
import { EnvironmentGroupName } from './CreditApproveDrawBlock';
import {
  DRAW_DECLINED_TEXT,
  DRAW_LOCKED_NEXT,
  M365_ADMIN_LINK,
  MAC_SCOPE_APPROVE_NEXT,
  MAC_SCOPE_CHECK_END,
  MAC_SCOPE_CHECK_M365,
  MAC_SCOPE_CHECK_MIDDLE,
  MAC_SCOPE_CHECK_PPAC,
  SUPERSEDED_CHANGED_TEXT,
  SUPERSEDED_PAYG_TEXT,
  allocateBlockText,
  approveButtonLabel,
  belowRequestText,
  confirmDrawText,
  drawLockedRejectComment,
  succeededText,
  type ApprovalChoice,
} from './creditApproveText';

type Step = 'review' | 'confirm' | 'result';

const STEPS: Step[] = ['review', 'confirm', 'result'];
const STEP_NAMES = ['Review', 'Confirm', 'Result'];

const STEP_TITLES: Record<Step, string> = {
  review: 'Review and add credits',
  confirm: 'Confirm',
  result: 'Result',
};

const NOTIFY_LINE = 'The requester will be notified if email notifications are configured.';

const useStyles = makeStyles({
  body: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM },
  title: { outlineStyle: 'none' },
  noWrap: { whiteSpace: 'nowrap' },
});

interface Superseded {
  before: number;
  target: number;
  /** Spec 032: why save stopped when it wasn't a credit total change. */
  reason?: 'payg' | 'changed';
}

export interface CreditApproveDialogProps {
  requestId: string;
  requestNumber: string;
  open: boolean;
  onOpenChange(open: boolean): void;
  /** Called once when the Result step closes, so the detail reloads (D3b). */
  onActionComplete(): void;
  /** Spec 032 US5-AS4: close this dialog and open Reject with this editable comment. */
  onRejectInstead?(comment: string): void;
}

/** Approve dialog: Review and add credits → Confirm → Result (FR-004, FR-009, FR-010, FR-026). */
export function CreditApproveDialog({
  requestId,
  requestNumber,
  open,
  onOpenChange,
  onActionComplete,
  onRejectInstead,
}: CreditApproveDialogProps) {
  const styles = useStyles();
  const { review, blocks, allocateBlocks, warnings, loadReview, isLoading } = useCreditApprovalReview(requestId);
  const { submit, isWorking } = useCreditApprovalSubmit(requestId);
  const [step, setStep] = useState<Step>('review');
  const navigate = useNavigate();
  const [picked, setPicked] = useState<ApprovalChoice | undefined>();
  const [amount, setAmount] = useState('');
  // Spec 032: ticked by default, and only used when turning on is allowed.
  const [drawTicked, setDrawTicked] = useState(true);
  const [comment, setComment] = useState('');
  const [message, setMessage] = useState<string | undefined>();
  const [superseded, setSuperseded] = useState<Superseded | undefined>();
  const [result, setResult] = useState<ApprovalResult | undefined>();
  const titleRef = useRef<HTMLHeadingElement>(null);
  // Any submit that reached the server may have changed the request, so the detail must reload on close.
  // The parent remounts this dialog (new key) on every open, so form state always starts clean.
  const wroteRef = useRef(false);
  // Pre-fill the amount once per fresh review, never over what the admin typed.
  const prefilledRef = useRef(false);
  // Spec 032 US5-AS3: after "Approve without tenant draw", go to Confirm once the reloaded review allows it.
  const [toConfirm, setToConfirm] = useState(false);

  useEffect(() => {
    if (!open) return;
    void loadReview();
  }, [open, loadReview]);

  useEffect(() => {
    if (open) titleRef.current?.focus();
  }, [step, open]);

  // PAYG active: default to skip, and fall back to skip if Allocate becomes blocked. Otherwise always allocate.
  const choice: ApprovalChoice =
    review?.payg !== 'active' ? 'allocate' : picked === 'allocate' && allocateBlocks.length === 0 ? 'allocate' : 'skip';
  // Spec 032: a draw-only request asked for no credits, so the credit parts and checks don't apply.
  const wantsDraw = review?.requestedDraw === true;
  const wantsCredits = !(wantsDraw && review?.requested === undefined);
  const drawState = review ? tenantDrawState(review.rules, review.rulesDefaulted) : 'off';
  const drawBlockedHint = allocateBlocks.includes('UnknownRule') && review ? allocateBlockText('UnknownRule', review) : undefined;
  const canTurnOn = !!review && canTurnOnDraw(wantsDraw, drawState, review.payg) && !drawBlockedHint;
  const turnOnDraw = canTurnOn && drawTicked;
  const check = review ? validateAmount(amount, review.current, review.available) : undefined;
  const addCredits = wantsCredits && choice === 'allocate';
  // Spec 032: a draw-only request with draw that can't be turned on would change nothing, so Next stays off.
  const canContinue =
    !!review &&
    blocks.length === 0 &&
    !isLoading &&
    (wantsCredits || canTurnOn) &&
    (!wantsCredits || choice === 'skip' || (allocateBlocks.length === 0 && !!check?.ok));
  const note = comment.trim();
  const added = addCredits && check?.ok ? check.value : 0;
  const belowRequest = wantsCredits && review?.requested !== undefined && added < review.requested;
  const declined = canTurnOn && !drawTicked;
  const describedBy = [belowRequest && 'credit-below-request', declined && 'credit-draw-declined'].filter(Boolean).join(' ');

  // Layout effect so the empty box never paints with a validation error first.
  // Anything that reloads the review must also reset prefilledRef.
  useLayoutEffect(() => {
    if (prefilledRef.current || !review || isLoading || !addCredits || amount !== '') return;
    prefilledRef.current = true;
    setAmount(prefillAmount(review));
  }, [review, isLoading, addCredits, amount]);

  function close() {
    if (isWorking) return;
    onOpenChange(false);
    if (result || wroteRef.current) onActionComplete();
  }

  function openOtherRequest(id: string) {
    close();
    void navigate(`/credits/${id}`);
  }

  function startOver() {
    setResult(undefined);
    setSuperseded(undefined);
    setAmount('');
    setDrawTicked(true);
    prefilledRef.current = false;
    setStep('review');
    void loadReview();
  }

  // Keeps the amount and comment. The review reloads because the failed attempt changed the row.
  function approveWithoutDraw() {
    setResult(undefined);
    setSuperseded(undefined);
    setDrawTicked(false);
    setStep('review');
    setToConfirm(true);
    void loadReview();
  }

  // Adjusting state during render (not in an effect) once the reloaded review is in.
  if (toConfirm && !isLoading) {
    setToConfirm(false);
    if (canContinue) setStep('confirm');
  }

  function rejectInstead() {
    const text = drawLockedRejectComment(review?.group?.name);
    close();
    onRejectInstead?.(text);
  }

  const drawLocked = result?.kind === 'Failed' && result.drawLocked === true;

  async function handleSubmit() {
    if (!review) return;
    if (addCredits && !check?.ok) return;
    if (!note) return;
    setMessage(undefined);
    const target = addCredits && check?.ok ? check.newTotal : review.current;
    const r = await submit(
      review,
      wantsCredits && choice === 'skip'
        ? { mode: 'skip', comment: note }
        : { mode: 'allocate', amount: addCredits && check?.ok ? check.value : undefined, turnOnDraw, comment: note },
    );
    if (r.kind !== 'Busy' && r.kind !== 'Invalid') wroteRef.current = true;
    switch (r.kind) {
      case 'Busy':
        setMessage('Still working on this request. Wait a moment, then try again.');
        return;
      case 'Invalid':
        setMessage(r.message);
        return;
      case 'Superseded':
        // The credit numbers only explain it when credits were being added.
        setSuperseded({
          before: review.current, target,
          reason: r.reason === 'payg' ? 'payg' : addCredits ? undefined : 'changed',
        });
        setAmount('');
        prefilledRef.current = false;
        setStep('review');
        void loadReview();
        return;
      default:
        setResult(r);
        setStep('result');
    }
  }

  function renderResult() {
    if (!result) return null;
    if (result.kind === 'Succeeded') {
      return (
        <MessageBar intent="success">
          <MessageBarBody>
            {succeededText(requestNumber, result.verifiedTotal, result.creditsAdded !== false, result.drawTurnedOn === true)}{' '}
            {NOTIFY_LINE}
          </MessageBarBody>
        </MessageBar>
      );
    }
    if (result.kind === 'Skipped') {
      return (
        <MessageBar intent="success">
          <MessageBarBody>
            Approved without adding credits. This environment still has {result.total.toLocaleString()} credits.{' '}
            {NOTIFY_LINE}
          </MessageBarBody>
        </MessageBar>
      );
    }
    if (result.kind === 'Failed' && result.drawLocked) {
      return (
        <>
          <MessageBar intent="error" layout="multiline">
            <MessageBarBody>
              <strong>Approval failed.</strong> <EnvironmentGroupName group={review?.group} capital /> has tenant draw
              turned off, so it can't be turned on for this environment. {added > 0 ? 'No credits were added.' : 'Nothing was changed.'}
              <br />
              {DRAW_LOCKED_NEXT}
            </MessageBarBody>
          </MessageBar>
          {result.details && <ApprovalErrorDetailsPanel details={result.details} />}
        </>
      );
    }
    if (result.kind === 'Failed') {
      return (
        <>
          <MessageBar intent="error">
            <MessageBarBody>
              {result.message} The request is still waiting for a decision, so you can start again.{' '}
              {result.ppacLink && (
                <Link href={result.ppacLink} target="_blank" rel="noopener noreferrer">
                  Open Power Platform admin center (opens in new tab)
                </Link>
              )}
            </MessageBarBody>
          </MessageBar>
          {result.details && <ApprovalErrorDetailsPanel details={result.details} />}
        </>
      );
    }
    if (result.kind === 'NeedsAttention') {
      return (
        <>
          <MessageBar intent="warning">
            <MessageBarBody>
              Needs attention. {result.message} Open this request again to check what happened before you try again.
            </MessageBarBody>
          </MessageBar>
          {result.details && <ApprovalErrorDetailsPanel details={result.details} />}
        </>
      );
    }
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={(_, d) => (d.open ? onOpenChange(true) : close())}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle as="h2" ref={titleRef} tabIndex={-1} className={styles.title}>
            {step === 'review' && !wantsCredits ? 'Review and turn on tenant draw' : STEP_TITLES[step]}
          </DialogTitle>
          <DialogContent className={styles.body}>
            <StepIndicator steps={STEP_NAMES} current={STEPS.indexOf(step)} />
            <div role="status" aria-live="polite">
              {step === 'review' && superseded && review && (
                <MessageBar intent="warning">
                  <MessageBarBody>
                    {superseded.reason === 'payg' ? (
                      SUPERSEDED_PAYG_TEXT
                    ) : superseded.reason === 'changed' ? (
                      SUPERSEDED_CHANGED_TEXT
                    ) : (
                      <>
                        The credits changed while you were reviewing, so nothing was saved. This environment had{' '}
                        {superseded.before.toLocaleString()} and now has {review.current.toLocaleString()}. You wanted{' '}
                        {superseded.target.toLocaleString()}. Check the new numbers and try again.
                      </>
                    )}
                  </MessageBarBody>
                </MessageBar>
              )}
            </div>
            {step === 'review' && (
              <>
                <CreditApproveReviewStep
                  review={review}
                  blocks={blocks}
                  allocateBlocks={allocateBlocks}
                  warnings={warnings}
                  isLoading={isLoading}
                  wantsCredits={wantsCredits}
                  draw={
                    wantsDraw && review
                      ? {
                          state: drawState,
                          paygActive: review.payg === 'active',
                          paygPolicyName: review.paygPolicyName,
                          blockedHint: drawBlockedHint,
                          group: review.group,
                          checked: drawTicked,
                          onCheckedChange: setDrawTicked,
                        }
                      : undefined
                  }
                  choice={choice}
                  onChoiceChange={setPicked}
                  amount={amount}
                  onAmountChange={setAmount}
                  onRetry={() => void loadReview()}
                  onOpenRequest={openOtherRequest}
                />
              </>
            )}
            {step === 'confirm' && review && (!addCredits || check?.ok) && (
              <>
                {wantsCredits && (
                  <>
                    <Text>This environment has: {review.current.toLocaleString()} credits</Text>
                    {addCredits && check?.ok ? (
                      <>
                        <Text weight="semibold">New total: {check.newTotal.toLocaleString()} credits</Text>
                        <Text>This uses {check.value.toLocaleString()} of your tenant's spare credits.</Text>
                      </>
                    ) : (
                      <Text weight="semibold">New total: {review.current.toLocaleString()} credits (unchanged)</Text>
                    )}
                  </>
                )}
                <Text>
                  Draw from tenant: <Text weight="semibold">{confirmDrawText(wantsDraw, drawState, turnOnDraw)}</Text>
                </Text>
                {belowRequest && review.requested !== undefined && (
                  <MessageBar intent="warning" id="credit-below-request">
                    <MessageBarBody>{belowRequestText(review.requested)}</MessageBarBody>
                  </MessageBar>
                )}
                {declined && (
                  <MessageBar intent="warning" id="credit-draw-declined">
                    <MessageBarBody>{DRAW_DECLINED_TEXT}</MessageBarBody>
                  </MessageBar>
                )}
                <MessageBar intent="warning" layout="multiline" id="credit-mac-scope">
                  <MessageBarBody>
                    Check{' '}
                    <Link href={PPAC_CAPACITY_LINK} target="_blank" rel="noopener noreferrer" inline>
                      {MAC_SCOPE_CHECK_PPAC}
                    </Link>{' '}
                    {MAC_SCOPE_CHECK_MIDDLE}{' '}
                    <Link href={M365_ADMIN_LINK} target="_blank" rel="noopener noreferrer" inline>
                      {MAC_SCOPE_CHECK_M365}
                    </Link>{' '}
                    {MAC_SCOPE_CHECK_END} {MAC_SCOPE_APPROVE_NEXT}
                  </MessageBarBody>
                </MessageBar>
                <Field label="Comment" required hint={note ? undefined : MSG_COMMENT_REQUIRED}>
                  <Textarea
                    value={comment}
                    onChange={(_, d) => setComment(d.value)}
                    rows={3}
                    disabled={isWorking}
                    aria-describedby={describedBy || undefined}
                  />
                </Field>
              </>
            )}
            <div role="status" aria-live="polite">
              {step === 'confirm' && isWorking && (
                <Spinner
                  size="tiny"
                  labelPosition="after"
                  label={added > 0 ? 'Adding credits...' : turnOnDraw ? 'Turning on tenant draw...' : 'Approving...'}
                />
              )}
              {step === 'confirm' && message && (
                <MessageBar intent="error">
                  <MessageBarBody>{message}</MessageBarBody>
                </MessageBar>
              )}
              {step === 'result' && renderResult()}
            </div>
          </DialogContent>
          <DialogActions>
            {step === 'review' && (
              <Button appearance="primary" disabled={!canContinue} onClick={() => setStep('confirm')}>
                Next
              </Button>
            )}
            {step === 'confirm' && (
              <>
                <Button
                  appearance="primary"
                  className={styles.noWrap}
                  disabledFocusable={isWorking || !note}
                  onClick={() => void handleSubmit()}
                >
                  {wantsCredits && choice === 'skip' ? 'Approve without adding credits' : approveButtonLabel(addCredits, turnOnDraw)}
                </Button>
                <Button disabledFocusable={isWorking} onClick={() => setStep('review')}>
                  Back
                </Button>
              </>
            )}
            {step === 'result' && drawLocked && (
              <>
                <Button appearance="primary" className={styles.noWrap} onClick={approveWithoutDraw}>
                  Approve without tenant draw
                </Button>
                {onRejectInstead && (
                  <Button className={styles.noWrap} onClick={rejectInstead}>
                    Reject
                  </Button>
                )}
              </>
            )}
            {step === 'result' && !drawLocked && result?.kind === 'Failed' && result.state === 'FailedRetryable' && (
              <Button onClick={startOver}>Start over</Button>
            )}
            <Button
              appearance={step === 'result' && !drawLocked ? 'primary' : 'secondary'}
              className={styles.noWrap}
              disabledFocusable={isWorking}
              onClick={close}
            >
              {step === 'result' ? 'Close' : 'Cancel'}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
