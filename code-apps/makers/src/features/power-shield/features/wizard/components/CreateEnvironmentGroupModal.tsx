import { useState } from 'react';
import {
  Dialog,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogContent,
  DialogActions,
  Button,
  Field,
  Input,
  Textarea,
} from '@fluentui/react-components';
import { createGroup } from '../../../shared/services/dataverse/environmentGroupService';
import { useAuth } from '../../../shared/hooks/useAuth';
import { useNotify } from '../../../shared/hooks/useNotify';
import type { WizardSelectedEnvironment } from '../contexts/wizardTypes';

interface CreateEnvironmentGroupModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string, name: string) => void;
  selectedEnvironments: WizardSelectedEnvironment[];
  serviceTreeId: string;
}

export function CreateEnvironmentGroupModal({
  open,
  onClose,
  onCreated,
  selectedEnvironments,
  serviceTreeId,
}: CreateEnvironmentGroupModalProps) {
  const { aadObjectId, upn } = useAuth();
  const { notifySuccess, notifyError } = useNotify();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [hasAttemptedSave, setHasAttemptedSave] = useState(false);

  const nameInvalid = !name.trim();
  const showNameError = hasAttemptedSave && nameInvalid;

  function resetForm() {
    setName('');
    setDescription('');
    setHasAttemptedSave(false);
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  async function handleSave() {
    setHasAttemptedSave(true);
    if (nameInvalid) return;

    setIsSaving(true);
    try {
      const id = await createGroup({
        name: name.trim(),
        description: description.trim() || undefined,
        serviceTreeId,
        ownerAadObjectId: aadObjectId,
        ownerUpn: upn,
        members: selectedEnvironments.map((e) => ({
          environmentGuid: e.environmentId,
          environmentName: e.displayName,
        })),
      });
      resetForm();
      onCreated(id, name.trim());
      notifySuccess('Environment container saved successfully.');
    } catch (err) {
      notifyError(err instanceof Error ? err.message : 'Failed to save environment container.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(_, data) => { if (!data.open) handleClose(); }}>
      <DialogSurface aria-labelledby="create-env-group-title">
        <DialogTitle id="create-env-group-title">Save Environment Container</DialogTitle>
        <DialogBody>
          <DialogContent>
            <Field
              label="Group Name"
              required
              validationState={showNameError ? 'error' : 'none'}
              validationMessage={showNameError ? 'Name is required.' : undefined}
            >
              <Input
                value={name}
                onChange={(_, data) => setName(data.value)}
                placeholder="e.g. Production US environments..."
              />
            </Field>
            <Field label="Description" style={{ marginTop: '12px' }}>
              <Textarea
                value={description}
                onChange={(_, data) => setDescription(data.value)}
                placeholder="Description (optional)..."
                rows={3}
              />
            </Field>
            <Field label="Environments" style={{ marginTop: '12px' }}>
              <div>
                {selectedEnvironments.map((e) => e.displayName).join(', ')}
              </div>
            </Field>
          </DialogContent>
          <DialogActions>
            <Button
              appearance="primary"
              onClick={() => void handleSave()}
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
            <Button appearance="secondary" onClick={handleClose} disabled={isSaving}>
              Cancel
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
