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
import { useAuth } from '../../../shared/hooks/useAuth';
import { requestCreditChange } from '../../../shared/services/dataverse/creditRequestService';

// ─────────────────────────────────────────────────────────────────────────────
// "Request a change" dialog (T041, FR-006/FR-036). A type-aware clone of the
// maker-owned fields into a fresh Credits draft (no back-pointer, no amounts).
// On success it hands the new draft id back so the caller can resume it in the
// credit wizard, which re-runs access + eligibility revalidation before submit.
// ─────────────────────────────────────────────────────────────────────────────

const useStyles = makeStyles({
  bodyText: {
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground1,
    lineHeight: '1.5',
  },
});

interface CreditRequestChangeDialogProps {
  open: boolean;
  sourceRequestId: string;
  requestNumber: string;
  onClose: () => void;
  /** Called with the id of the new Credits draft created from the source request. */
  onDraftCreated: (draftRequestId: string) => void;
}

export function CreditRequestChangeDialog({
  open,
  sourceRequestId,
  requestNumber,
  onClose,
  onDraftCreated,
}: CreditRequestChangeDialogProps) {
  const styles = useStyles();
  const { notifyError } = useNotify();
  const { aadObjectId, upn } = useAuth();
  const [isWorking, setIsWorking] = useState(false);

  const handleConfirm = async () => {
    setIsWorking(true);
    try {
      const { requestId } = await requestCreditChange(sourceRequestId, { aadObjectId, upn });
      onDraftCreated(requestId);
    } catch (err) {
      notifyError(err instanceof Error ? err.message : 'Failed to start a change request.');
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(_, data) => { if (!data.open && !isWorking) onClose(); }}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>Request a change</DialogTitle>
          <DialogContent>
            <p className={styles.bodyText}>
              This starts a new Copilot Credits draft based on <strong>{requestNumber}</strong>. It
              copies the environment and justification so you can adjust them and resubmit. The original request is not changed.
            </p>
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onClose} disabled={isWorking}>
              Cancel
            </Button>
            <Button
              appearance="primary"
              onClick={() => void handleConfirm()}
              disabled={isWorking}
              icon={isWorking ? <Spinner size="tiny" /> : undefined}
            >
              {isWorking ? 'Preparing…' : 'Start change request'}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

export default CreditRequestChangeDialog;
