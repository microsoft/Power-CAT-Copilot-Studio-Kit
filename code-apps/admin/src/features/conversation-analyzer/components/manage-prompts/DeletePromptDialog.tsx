/** Delete confirmation for a custom prompt (MP-7). */

import {
  Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle,
} from '@fluentui/react-components';

interface DeletePromptDialogProps {
  name?: string;
  isDeleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeletePromptDialog({ name, isDeleting, onConfirm, onCancel }: DeletePromptDialogProps) {
  return (
    <Dialog open={Boolean(name)} modalType="alert" onOpenChange={(_e, d) => { if (!d.open) onCancel(); }}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>Delete prompt</DialogTitle>
          <DialogContent>
            Are you sure you want to delete <strong>{name}</strong>? This action cannot be undone.
            Analysis results produced by this prompt are deleted too.
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onCancel}>Cancel</Button>
            <Button appearance="primary" onClick={onConfirm} disabled={isDeleting}>
              {isDeleting ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
