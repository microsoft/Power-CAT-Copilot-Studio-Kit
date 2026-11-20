import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
} from '@fluentui/react-components';

interface DeleteResultsDialogProps {
  count: number;
  open: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/** Confirms deleting the selected analysis results (AR-4). */
export function DeleteResultsDialog({ count, open, onConfirm, onClose }: DeleteResultsDialogProps) {
  return (
    <Dialog open={open} modalType="alert" onOpenChange={(_e, data) => { if (!data.open) onClose(); }}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>Delete conversations</DialogTitle>
          <DialogContent>
            Delete the analysis results of {count.toLocaleString()} {count === 1 ? 'conversation' : 'conversations'}?
            The conversation transcripts are kept, and you can analyze them again later.
          </DialogContent>
          <DialogActions>
            <Button appearance="primary" onClick={onConfirm}>Delete</Button>
            <Button onClick={onClose}>Cancel</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
