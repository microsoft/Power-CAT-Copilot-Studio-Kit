import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Spinner,
} from '@fluentui/react-components';
import type { EnvironmentGroup } from '../contracts/types';

interface DeleteEnvironmentGroupDialogProps {
  group?: EnvironmentGroup;
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeleteEnvironmentGroupDialog({
  group,
  isDeleting,
  onCancel,
  onConfirm,
}: DeleteEnvironmentGroupDialogProps) {
  return (
    <Dialog open={Boolean(group)} onOpenChange={(_, data) => { if (!data.open) onCancel(); }}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>Delete environment group</DialogTitle>
          <DialogContent>
            Are you sure you want to delete {group?.name}? This action cannot be undone.
          </DialogContent>
          <DialogActions>
            <Button appearance="primary" onClick={onConfirm} disabled={isDeleting}>
              {isDeleting ? <><Spinner size="tiny" /> Deleting</> : 'Delete'}
            </Button>
            <Button appearance="secondary" onClick={onCancel} disabled={isDeleting}>Cancel</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
