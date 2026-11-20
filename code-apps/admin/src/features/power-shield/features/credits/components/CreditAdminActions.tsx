import { useState } from 'react';
import {
  Button,
  MessageBar,
  MessageBarActions,
  MessageBarBody,
  MessageBarTitle,
  Spinner,
  Tooltip,
  makeStyles,
} from '@fluentui/react-components';
import { approveOffTip } from './creditCapacityText';
import type { ApproveAvailability } from '../services/creditApprovalRules';
import { useAuth } from '../../../shared/hooks/useAuth';
import { CreditAssignDialog } from './CreditAssignDialog';
import { CreditApproveDialog } from './CreditApproveDialog';
import { CreditRejectDialog } from './CreditRejectDialog';
import type { CreditChildState, RequestStatus } from '../../../models/status';
import type { CreditRecoveryState } from '../hooks/useCreditRecovery';

interface CreditAdminActionsProps {
  requestId: string;
  requestNumber: string;
  status: RequestStatus;
  assignedAdminName?: string;
  assignedAdminDvUserId?: string;
  rowState?: CreditChildState;
  recovery: CreditRecoveryState;
  onActionComplete: () => void;
  /** Spec 030: result of the automatic credits check. Approve is off while checking or when blocked. */
  approveAvailability: ApproveAvailability;
}

const MSG_UNFINISHED = "An earlier try to add credits didn't finish. Select Retry to check this environment's credits.";
const MSG_CHECKING = "Checking this environment's credits...";

const TIP_RETRY = 'Checks whether the earlier try added the credits, then finishes it. It never adds credits twice.';
const TIP_START_FRESH = 'Closes the earlier try so you can approve or reject this request again.';
const TIP_ASSIGN = 'Makes you the admin for this request, so you can approve or reject it.';
const TIP_APPROVE = 'Approves the request. You review the amount and confirm before any credits are added.';
const TIP_REJECT = 'Turns down the request. You must add a comment that explains why.';

const useStyles = makeStyles({
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

/**
 * Admin decision actions for a credit request. Other admins see only Assign to Me.
 * Once the signed-in admin owns the request and it is Under review, they see
 * Approve (which allocates the credits) and Reject (FR-001).
 * While an attempt is unfinished or unclear, Approve and Reject are replaced by a
  * "Needs attention" bar whose Retry runs recovery only, never a new allocation (FR-003, FR-020).
 * If recovery finds a conflict, "Start a fresh review" closes that attempt so Approve and Reject return.
 */
export function CreditAdminActions({
  requestId,
  requestNumber,
  status,
  assignedAdminName,
  assignedAdminDvUserId,
  rowState,
  recovery,
  onActionComplete,
  approveAvailability,
}: CreditAdminActionsProps) {
  const { dvUserId } = useAuth();
  const styles = useStyles();
  const [assignOpen, setAssignOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  // Spec 032: pre-filled Reject comment when Reject opens from a failed approval. Empty from the header.
  const [rejectComment, setRejectComment] = useState<string | undefined>();
  // Bumped on every open so each dialog remounts with clean form state.
  const [openCount, setOpenCount] = useState(0);

  const isAwaiting = status === 'Submitted' || status === 'UnderReview';
  const isAssignedToMe =
    !!assignedAdminDvUserId &&
    !!dvUserId &&
    assignedAdminDvUserId.toLowerCase() === dvUserId.toLowerCase();
  const canAssign = isAwaiting && !isAssignedToMe;
  // An open dialog owns its own in-flight attempt, so never unmount it mid-submit.
  // Succeeded while still Under review means the credits landed but the approval didn't; Retry finishes it.
  const attemptOpen =
    (rowState === 'Processing' || rowState === 'UnknownOutcome' || rowState === 'Succeeded') &&
    !approveOpen &&
    !rejectOpen;
  const canDecide = status === 'UnderReview' && isAssignedToMe && !attemptOpen;
  const result = recovery.result;
  const attentionText =
    result?.kind === 'Conflict' || result?.kind === 'ReadFailed' ? result.message : MSG_UNFINISHED;
  const busy = recovery.isRecovering || recovery.isResetting;
  const showAttention = status === 'UnderReview' && attemptOpen;
  const canStartFresh = isAssignedToMe && result?.kind === 'Conflict';
  // Always mounted, so screen readers hear each change in the attention bar (WCAG 4.1.3).
  const announcement = !showAttention
    ? ''
    : recovery.isRecovering
      ? MSG_CHECKING
      : recovery.isResetting
        ? 'Starting a fresh review...'
        : (recovery.resetError ?? attentionText);
  // Spec 030: a failed check leaves Approve on; the dialog checks again when it opens.
  const approveOff =
    recovery.isRecovering || approveAvailability.kind === 'checking' || approveAvailability.kind === 'blocked';
  const approveTip = approveOffTip(approveAvailability) ?? TIP_APPROVE;

  return (
    <>
      <span role="status" className={styles.visuallyHidden}>
        {announcement}
      </span>

      {showAttention && (
        <MessageBar intent={recovery.isRecovering ? 'info' : 'warning'} layout="multiline">
          <MessageBarBody>
            <MessageBarTitle>Needs attention</MessageBarTitle>
            {recovery.isRecovering ? MSG_CHECKING : attentionText}
            {recovery.resetError && <div>{recovery.resetError}</div>}
          </MessageBarBody>
          <MessageBarActions>
            <Tooltip content={TIP_RETRY} relationship="description" withArrow>
              <Button
                size="small"
                disabledFocusable={busy}
                icon={recovery.isRecovering ? <Spinner size="tiny" /> : undefined}
                onClick={recovery.retry}
              >
                {recovery.isRecovering ? 'Checking...' : 'Retry'}
              </Button>
            </Tooltip>
            {canStartFresh && (
              <Tooltip content={TIP_START_FRESH} relationship="description" withArrow>
                <Button
                  size="small"
                  disabledFocusable={busy}
                  icon={recovery.isResetting ? <Spinner size="tiny" /> : undefined}
                  onClick={recovery.startFresh}
                >
                  Start a fresh review
                </Button>
              </Tooltip>
            )}
          </MessageBarActions>
        </MessageBar>
      )}

      {canAssign && (
        <>
          <Tooltip content={TIP_ASSIGN} relationship="description" withArrow>
            <Button appearance="secondary" onClick={() => setAssignOpen(true)}>
              Assign to Me
            </Button>
          </Tooltip>
          <CreditAssignDialog
            item={{ id: requestId, requestNumber, status, assignedAdminName }}
            open={assignOpen}
            onOpenChange={setAssignOpen}
            onAssigned={onActionComplete}
          />
        </>
      )}

      {canDecide && (
        <>
          <Tooltip content={approveTip} relationship="description" withArrow>
            <Button
              appearance="primary"
              disabledFocusable={approveOff}
              onClick={() => { setOpenCount((n) => n + 1); setApproveOpen(true); }}
            >
              Approve
            </Button>
          </Tooltip>
          <CreditApproveDialog
            key={`approve-${openCount}`}
            requestId={requestId}
            requestNumber={requestNumber}
            open={approveOpen}
            onOpenChange={setApproveOpen}
            onActionComplete={onActionComplete}
            onRejectInstead={(text) => {
              setRejectComment(text);
              setOpenCount((n) => n + 1);
              setRejectOpen(true);
            }}
          />
          <Tooltip content={TIP_REJECT} relationship="description" withArrow>
            <Button
              appearance="secondary"
              onClick={() => { setRejectComment(undefined); setOpenCount((n) => n + 1); setRejectOpen(true); }}
            >
              Reject
            </Button>
          </Tooltip>
          <CreditRejectDialog
            key={`reject-${openCount}`}
            requestId={requestId}
            open={rejectOpen}
            onOpenChange={setRejectOpen}
            onRejected={onActionComplete}
            initialComment={rejectComment}
          />
        </>
      )}
    </>
  );
}

export default CreditAdminActions;
