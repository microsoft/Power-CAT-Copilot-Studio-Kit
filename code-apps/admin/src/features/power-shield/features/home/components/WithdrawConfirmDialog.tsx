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
import { withdrawRequest } from '../../../shared/services/dataverse/requestService';

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const useStyles = makeStyles({
  bodyText: {
    fontSize: '14px',
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

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface WithdrawConfirmDialogProps {
  open: boolean;
  requestId: string;
  requestNumber: string;
  onClose: () => void;
  onWithdrawn: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function WithdrawConfirmDialog({
  open,
  requestId,
  requestNumber,
  onClose,
  onWithdrawn,
}: WithdrawConfirmDialogProps) {
  const styles = useStyles();
  const { notifySuccess, notifyError } = useNotify();
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  const handleWithdraw = async () => {
    setIsWithdrawing(true);
    try {
      await withdrawRequest(requestId);
      notifySuccess(`${requestNumber} has been withdrawn.`);
      onWithdrawn();
    } catch (err) {
      notifyError(err instanceof Error ? err.message : 'Failed to withdraw request.');
    } finally {
      setIsWithdrawing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(_, data) => { if (!data.open && !isWithdrawing) onClose(); }}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>Withdraw this request?</DialogTitle>
          <DialogContent>
            <p className={styles.bodyText}>
              <strong>{requestNumber}</strong> will be marked as Withdrawn and can no longer be
              actioned. This cannot be undone.
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

export default WithdrawConfirmDialog;
