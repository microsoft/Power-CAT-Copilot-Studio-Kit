import { useState } from 'react';
import {
  Dialog,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogContent,
  DialogActions,
  Button,
  Spinner,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { useNotify } from '../../../shared/hooks/useNotify';
import { withdrawCreditRequest } from '../../../shared/services/dataverse/creditRequestService';

// ─────────────────────────────────────────────────────────────────────────────
// Copilot Credits withdraw confirm dialog (T034, FR-019). The repository guards
// request type, current state (awaiting approval only) and ownership server-side;
// this dialog only confirms intent. Shown by the row menu only when eligible.
// ─────────────────────────────────────────────────────────────────────────────

const useStyles = makeStyles({
  bodyText: {
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground1,
    lineHeight: '1.5',
  },
  withdrawBtn: {
    backgroundColor: tokens.colorStatusDangerBackground3,
    color: tokens.colorNeutralForegroundOnBrand,
    ':hover': {
      backgroundColor: tokens.colorStatusDangerBackground3Hover,
      color: tokens.colorNeutralForegroundOnBrand,
    },
    ':disabled': {
      opacity: '0.6',
    },
  },
});

interface CreditWithdrawConfirmDialogProps {
  open: boolean;
  requestId: string;
  requestNumber: string;
  onClose: () => void;
  onWithdrawn: () => void;
}

export function CreditWithdrawConfirmDialog({
  open,
  requestId,
  requestNumber,
  onClose,
  onWithdrawn,
}: CreditWithdrawConfirmDialogProps) {
  const styles = useStyles();
  const { notifySuccess, notifyError } = useNotify();
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  const handleWithdraw = async () => {
    setIsWithdrawing(true);
    try {
      await withdrawCreditRequest(requestId);
      notifySuccess(`${requestNumber} has been withdrawn.`);
      onWithdrawn();
    } catch (err) {
      notifyError(err instanceof Error ? err.message : 'Failed to withdraw the credit request.');
    } finally {
      setIsWithdrawing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(_, data) => { if (!data.open && !isWithdrawing) onClose(); }}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>Withdraw this credit request?</DialogTitle>
          <DialogContent>
            <p className={styles.bodyText}>
              <strong>{requestNumber}</strong> will be marked as Withdrawn and can no longer be
              actioned. You can only withdraw a request while it is awaiting approval. This cannot be
              undone.
            </p>
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onClose} disabled={isWithdrawing}>
              Cancel
            </Button>
            <Button
              className={styles.withdrawBtn}
              onClick={() => void handleWithdraw()}
              disabled={isWithdrawing}
              icon={isWithdrawing ? <Spinner size="tiny" /> : undefined}
            >
              {isWithdrawing ? 'Withdrawing…' : 'Withdraw request'}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

export default CreditWithdrawConfirmDialog;
