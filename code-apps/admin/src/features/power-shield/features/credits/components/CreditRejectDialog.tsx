import { useState } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  MessageBar,
  MessageBarBody,
  Spinner,
  Textarea,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { useAuth } from '../../../shared/hooks/useAuth';
import { useNotify } from '../../../shared/hooks/useNotify';
import { rejectCreditRequest } from '../../../shared/services/dataverse/creditRequestService';

const useStyles = makeStyles({
  body: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM },
});

export interface CreditRejectDialogProps {
  requestId: string;
  open: boolean;
  onOpenChange(open: boolean): void;
  onRejected(): void;
  /** Spec 032: editable starting comment, used when Reject opens from a failed approval. */
  initialComment?: string;
}

/** Reject dialog for a credit request. A comment is required. The parent remounts it on each open. */
export function CreditRejectDialog({ requestId, open, onOpenChange, onRejected, initialComment }: CreditRejectDialogProps) {
  const styles = useStyles();
  const { dvUserId } = useAuth();
  const { notifySuccess, notifyError } = useNotify();
  const [busy, setBusy] = useState(false);
  const [comment, setComment] = useState(initialComment ?? '');
  const [error, setError] = useState<string | undefined>();

  function setOpen(next: boolean) {
    if (!busy) onOpenChange(next);
  }

  async function handleReject() {
    if (!comment.trim() || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await rejectCreditRequest(requestId, comment, dvUserId);
      onOpenChange(false);
      setComment('');
      notifySuccess('Credit request rejected.');
      onRejected();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reject the credit request.';
      setError(message);
      notifyError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(_, d) => setOpen(d.open)}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>Reject Request</DialogTitle>
          <DialogContent className={styles.body}>
            <Field label="Admin comment" required>
              <Textarea
                value={comment}
                onChange={(_, d) => setComment(d.value)}
                placeholder="Enter your reason for rejection…"
                rows={4}
              />
            </Field>
            <div role="alert">
              {error && (
                <MessageBar intent="error">
                  <MessageBarBody>{error}</MessageBarBody>
                </MessageBar>
              )}
            </div>
          </DialogContent>
          <DialogActions>
            <Button
              appearance="primary"
              onClick={() => void handleReject()}
              disabled={!busy && !comment.trim()}
              disabledFocusable={busy}
              icon={busy ? <Spinner size="tiny" /> : undefined}
            >
              Confirm Reject
            </Button>
            <Button appearance="secondary" onClick={() => setOpen(false)} disabledFocusable={busy}>
              Cancel
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
