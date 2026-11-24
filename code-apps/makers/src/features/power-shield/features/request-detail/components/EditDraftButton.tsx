import { Button } from '@fluentui/react-components';
import { useNavigate } from '../../../shared/hooks/useNavigate';
import type { RequestStatus } from '../../../models/status';

interface EditDraftButtonProps {
  requestId: string;
  currentStatus: RequestStatus;
  createdByAadObjectId: string;
  currentUserAadObjectId: string;
}

export function EditDraftButton({
  requestId,
  currentStatus,
  createdByAadObjectId,
  currentUserAadObjectId,
}: EditDraftButtonProps) {
  const navigate = useNavigate();

  const isVisible =
    currentStatus === 'Draft' && createdByAadObjectId === currentUserAadObjectId;

  if (!isVisible) return null;

  function handleClick() {
    // Pass draftRequestId via React Router state so WizardShell can dispatch LOAD_DRAFT
    navigate('/new-request/environment', {
      state: { draftRequestId: requestId },
    });
  }

  return (
    <Button appearance="primary" onClick={handleClick}>
      Resume Draft
    </Button>
  );
}
