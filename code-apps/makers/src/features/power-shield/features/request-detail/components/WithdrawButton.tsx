import { useState } from 'react';
import {
  Button,
  Dialog,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogContent,
  DialogActions,
  Text,
} from '@fluentui/react-components';
import type { DialogOpenChangeData, DialogOpenChangeEvent } from '@fluentui/react-components';
import { withdrawRequest } from '../../../shared/services/dataverse/requestService';
import { useNotify } from '../../../shared/hooks/useNotify';
import type { RequestStatus } from '../../../models/status';

interface WithdrawButtonProps {
  requestId: string;
  requestNumber: string;
  currentStatus: RequestStatus;
  createdByAadObjectId: string;
  currentUserAadObjectId: string;
  role?: 'maker' | 'none';
  onWithdrawn: () => void;
}

export function WithdrawButton({
  requestId,
  requestNumber,
  currentStatus,
  createdByAadObjectId,
  currentUserAadObjectId,
  onWithdrawn,
}: WithdrawButtonProps) {
  const { notifySuccess, notifyError } = useNotify();
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Only visible to creator when status is Draft or Submitted
  const isVisible =
    (currentStatus === 'Draft' || currentStatus === 'Submitted') &&
    createdByAadObjectId === currentUserAadObjectId;

  if (!isVisible) return null;

  async function handleWithdraw() {
    setIsLoading(true);
    try {
      await withdrawRequest(requestId);
      setOpen(false);
      notifySuccess('Request withdrawn successfully.');
      onWithdrawn();
    } catch (err) {
      notifyError(err instanceof Error ? err.message : 'Failed to withdraw request.');
    } finally {
      setIsLoading(false);
    }
  }

  function handleOpenChange(_: DialogOpenChangeEvent, data: DialogOpenChangeData) {
    setOpen(data.open);
  }

  return (
    <>
      <Button appearance="secondary" disabled={isLoading} onClick={() => setOpen(true)}>
        Withdraw
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogSurface>
          <DialogTitle>Withdraw Request</DialogTitle>
          <DialogBody>
            <DialogContent>
              <Text>
                Are you sure you want to withdraw <strong>{requestNumber}</strong>?
                This cannot be undone. The Service Tree will become available for new requests.
              </Text>
            </DialogContent>
            <DialogActions>
              <Button
                appearance="primary"
                onClick={() => void handleWithdraw()}
                disabled={isLoading}
              >
                Confirm Withdraw
              </Button>
              <Button appearance="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </>
  );
}
