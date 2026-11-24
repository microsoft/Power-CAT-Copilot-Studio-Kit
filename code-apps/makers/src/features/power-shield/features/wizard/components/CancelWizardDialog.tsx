import { useState } from 'react';
import { useNavigate } from '../../../shared/hooks/useNavigate';
import {
  Button,
  Dialog,
  DialogTrigger,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogContent,
  DialogActions,
} from '@fluentui/react-components';
import { useWizard } from './WizardShell';

interface CancelWizardDialogProps {
  disabled?: boolean;
}

/**
 * Self-contained "Cancel" button with a confirmation dialog.
 * On confirm: navigates home, bypassing the WizardShell navigate-away guard
 * via the `bypassGuard` location state flag.
 */
export function CancelWizardDialog({ disabled }: CancelWizardDialogProps) {
  const { state } = useWizard();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  function handleConfirm() {
    setOpen(false);
    // Navigate to Home, bypassing the WizardShell navigate-away guard.
    // No RESET dispatch needed — WizardContextProvider unmounts when leaving
    // /new-request routes, so state is automatically fresh on re-entry.
    navigate('/', { state: { bypassGuard: true } });
  }

  return (
    <Dialog open={open} onOpenChange={(_, d) => setOpen(d.open)}>
      <DialogTrigger disableButtonEnhancement>
        <Button appearance="secondary" disabled={disabled}>
          Cancel
        </Button>
      </DialogTrigger>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>Cancel request?</DialogTitle>
          <DialogContent>
            {state.draftRequestId
              ? 'Any unsaved changes since your last save will be lost. Are you sure you want to cancel?'
              : 'All progress will be lost. Are you sure you want to cancel?'}
          </DialogContent>
          <DialogActions>
            <Button appearance="primary" onClick={handleConfirm}>
              Yes, cancel
            </Button>
            <DialogTrigger disableButtonEnhancement>
              <Button appearance="secondary">No, stay</Button>
            </DialogTrigger>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
