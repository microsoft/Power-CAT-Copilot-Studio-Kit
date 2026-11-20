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
import { useNavigate } from '../../../shared/hooks/useNavigate';
import type { RequestStatus } from '../../../models/status';

interface ResubmitButtonProps {
  requestId: string;
  requestNumber: string;
  currentStatus: RequestStatus;
  createdByAadObjectId: string;
  currentUserAadObjectId: string;
}

export function ResubmitButton({
  requestId,
  requestNumber,
  currentStatus,
  createdByAadObjectId,
  currentUserAadObjectId,
}: ResubmitButtonProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  // Only visible to creator when status is Withdrawn
  const isVisible =
    currentStatus === 'Withdrawn' && createdByAadObjectId === currentUserAadObjectId;

  if (!isVisible) return null;

  function handleConfirm() {
    setOpen(false);
    navigate('/new-request/environment', { state: { templateRequestId: requestId } });
  }

  function handleOpenChange(_: DialogOpenChangeEvent, data: DialogOpenChangeData) {
    setOpen(data.open);
  }

  return (
    <>
      <Button appearance="primary" onClick={() => setOpen(true)}>
        Revise {'&'} Resubmit
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogSurface>
          <DialogTitle>Revise {'&'} Resubmit {requestNumber}?</DialogTitle>
          <DialogBody>
            <DialogContent>
              <Text>
                A new Policy Request will be created with the details copied from{' '}
                <strong>{requestNumber}</strong>. The withdrawn request will remain unchanged
                for audit purposes.
              </Text>
            </DialogContent>
            <DialogActions>
              <Button appearance="primary" onClick={handleConfirm}>
                Proceed
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
