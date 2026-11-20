import { useState } from 'react';
import {
  Button,
  Dialog,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogContent,
  DialogActions,
  Link,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Text,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import type { CreditRequestSummary } from '../../../models/creditRequest';
import { assignCreditRequest } from '../../../shared/services/dataverse/creditRequestService';
import { useAuth } from '../../../shared/hooks/useAuth';
import { useNotify } from '../../../shared/hooks/useNotify';
import { PPAC_CAPACITY_LINK } from '../services/creditApprovalRules';
import {
  M365_ADMIN_LINK,
  MAC_SCOPE_ASSIGN_NEXT,
  MAC_SCOPE_ASSIGN_TITLE,
  MAC_SCOPE_CHECK_END,
  MAC_SCOPE_CHECK_M365,
  MAC_SCOPE_CHECK_MIDDLE,
  MAC_SCOPE_CHECK_PPAC,
} from './creditApproveText';

const useStyles = makeStyles({
  spacer: {
    marginTop: tokens.spacingVerticalM,
  },
  list: {
    margin: `${tokens.spacingVerticalXS} 0 0`,
    paddingLeft: tokens.spacingHorizontalL,
  },
});

interface CreditAssignDialogProps {
  /** The credit request being assigned. */
  item: Pick<CreditRequestSummary, 'id' | 'requestNumber' | 'status' | 'assignedAdminName'>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful assignment so the caller can refresh. */
  onAssigned: () => void;
}

/**
 * Assign / Reassign dialog for a Copilot Credits request.
 *
 * Copy mirrors the connector Assign flow (design of record: assign-dialog mockup).
 * The `AssignedTo` field written here is tracked separately from the approver
 * (`ApprovedBy`) and last-operator (`LastOperatedBy`) fields — assigning a
 * reviewer never records an approval.
 *
 * Opened from the list kebab (CreditRowActionsMenu) and, later, the detail
 * "Assign to Me" button, so it owns the mutation rather than the trigger.
 */
export function CreditAssignDialog({ item, open, onOpenChange, onAssigned }: CreditAssignDialogProps) {
  const styles = useStyles();
  const { dvUserId } = useAuth();
  const { notifySuccess, notifyError } = useNotify();
  const [isLoading, setIsLoading] = useState(false);

  const isReassign = item.status === 'UnderReview';

  async function handleConfirm() {
    setIsLoading(true);
    try {
      // rowVersion is reserved for a future server-side atomic action; the
      // repository performs a fresh-read state pre-check today.
      await assignCreditRequest(item.id, dvUserId, '');
      notifySuccess(
        isReassign
          ? 'Credit request reassigned to you.'
          : 'Credit request assigned to you.',
      );
      onOpenChange(false);
      onAssigned();
    } catch (err) {
      notifyError(err instanceof Error ? err.message : 'Failed to assign credit request.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(_, data) => onOpenChange(data.open)}>
      <DialogSurface>
        <DialogTitle>{isReassign ? 'Reassign Request' : 'Assign Request'}</DialogTitle>
        <DialogBody>
          <DialogContent>
            {isReassign ? (
              <Text>
                This request is currently assigned to{' '}
                <strong>{item.assignedAdminName ?? 'another administrator'}</strong>. You are about to
                reassign yourself as the reviewing administrator for <strong>{item.requestNumber}</strong>,
                and you will be responsible for the allocation decision.
              </Text>
            ) : (
              <Text>
                You are about to assign yourself as the reviewing administrator for{' '}
                <strong>{item.requestNumber}</strong>. The request status will change to{' '}
                <strong>Under Review</strong>, and you will be responsible for the allocation decision.
              </Text>
            )}

            <div className={styles.spacer}>
              <MessageBar intent="warning" layout="multiline">
                <MessageBarBody>
                  <MessageBarTitle>{MAC_SCOPE_ASSIGN_TITLE}</MessageBarTitle>
                  <ul className={styles.list}>
                    <li>
                      You need the <strong>Power Platform Administrator</strong> role. Approving allocates the
                      credits with your own account.
                    </li>
                    <li>
                      Check{' '}
                      <Link href={PPAC_CAPACITY_LINK} target="_blank" rel="noopener noreferrer" inline>
                        {MAC_SCOPE_CHECK_PPAC}
                      </Link>{' '}
                      {MAC_SCOPE_CHECK_MIDDLE}{' '}
                      <Link href={M365_ADMIN_LINK} target="_blank" rel="noopener noreferrer" inline>
                        {MAC_SCOPE_CHECK_M365}
                      </Link>{' '}
                      {MAC_SCOPE_CHECK_END} {MAC_SCOPE_ASSIGN_NEXT}
                    </li>
                  </ul>
                </MessageBarBody>
              </MessageBar>
            </div>
          </DialogContent>
          <DialogActions>
            <Button appearance="primary" onClick={() => void handleConfirm()} disabled={isLoading}>
              Confirm
            </Button>
            <Button appearance="secondary" onClick={() => onOpenChange(false)} disabled={isLoading}>
              Cancel
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

export default CreditAssignDialog;
