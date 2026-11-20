import { useState, useEffect } from 'react';
import {
  makeStyles,
  tokens,
  Text,
  Button,
  Input,
  Textarea,
  Spinner,
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions,
  Field,
} from '@fluentui/react-components';
import { createGroup, updateGroup } from '../../../shared/services/dataverse/environmentGroupService';
import { useAuth } from '../../../shared/hooks/useAuth';
import { useNotify } from '../../../shared/hooks/useNotify';
import type { PpEnvironment } from '../../../models/environment';
import { EnvironmentPickerTable } from '../../../shared/components/EnvironmentPickerTable';

// Re-exported so existing Connector importers keep working.
export { TypeBadge } from '../../../shared/components/EnvironmentPickerTable';

const useStyles = makeStyles({
  dialogContent: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },
  footerHint: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    paddingTop: tokens.spacingVerticalXS,
  },
  nameSection: {
    marginBottom: tokens.spacingVerticalS,
  },
  descriptionSection: {
    marginBottom: tokens.spacingVerticalM,
  },
});

export interface EditContainerData {
  id: string;
  name: string;
  description?: string;
  memberEnvironmentIds: string[];
}

interface CreateContainerModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string, name: string) => void;
  serviceTreeId: string;
  environments: PpEnvironment[];
  /** When provided, the modal operates in edit mode with pre-populated data. */
  editContainer?: EditContainerData;
}

export function CreateContainerModal({
  open,
  onClose,
  onCreated,
  serviceTreeId,
  environments,
  editContainer,
}: CreateContainerModalProps) {
  const isEditMode = !!editContainer;
  const styles = useStyles();
  const { aadObjectId, upn } = useAuth();
  const { notifySuccess, notifyError } = useNotify();

  const [selectedEnvIds, setSelectedEnvIds] = useState<Set<string>>(new Set());
  const [containerName, setContainerName] = useState('');
  const [description, setDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [nameAttempted, setNameAttempted] = useState(false);
  const [descriptionAttempted, setDescriptionAttempted] = useState(false);

  // Pre-populate form when opening in edit mode
  useEffect(() => {
    if (open && editContainer) {
      setContainerName(editContainer.name);
      setDescription(editContainer.description ?? '');
      setSelectedEnvIds(new Set(editContainer.memberEnvironmentIds));
    }
  }, [open, editContainer]);

  function handleClose() {
    if (isSaving) return;
    resetForm();
    onClose();
  }

  function resetForm() {
    setSelectedEnvIds(new Set());
    setContainerName('');
    setDescription('');
    setNameAttempted(false);
    setDescriptionAttempted(false);
  }

  async function handleSave() {
    setNameAttempted(true);
    setDescriptionAttempted(true);
    if (!containerName.trim() || !description.trim() || selectedEnvIds.size === 0) return;

    setIsSaving(true);
    try {
      const envMap = new Map(environments.map((e) => [e.name, e]));
      const members = [...selectedEnvIds]
        .map((id) => envMap.get(id))
        .filter((e): e is PpEnvironment => !!e)
        .map((e) => ({ environmentGuid: e.name, environmentName: e.displayName }));

      if (isEditMode) {
        await updateGroup({
          groupId: editContainer.id,
          name: containerName.trim(),
          description: description.trim(),
          members,
        });
        notifySuccess(`Container "${containerName.trim()}" updated successfully.`);
        resetForm();
        onCreated(editContainer.id, containerName.trim());
      } else {
        const newId = await createGroup({
          name: containerName.trim(),
          description: description.trim(),
          serviceTreeId,
          ownerAadObjectId: aadObjectId,
          ownerUpn: upn,
          members,
        });
        notifySuccess(`Container "${containerName.trim()}" created successfully.`);
        resetForm();
        onCreated(newId, containerName.trim());
      }
    } catch (err) {
      notifyError(err instanceof Error ? err.message : `Failed to ${isEditMode ? 'update' : 'create'} container.`);
    } finally {
      setIsSaving(false);
    }
  }

  const canSave = containerName.trim().length > 0 && description.trim().length > 0 && selectedEnvIds.size > 0 && !isSaving;
  const showNameError = nameAttempted && !containerName.trim();
  const showDescriptionError = descriptionAttempted && !description.trim();

  return (
    <Dialog open={open} onOpenChange={(_, data) => { if (!data.open) handleClose(); }}>
      <DialogSurface style={{ maxWidth: '900px', width: '80vw', height: '90vh' }}>
        <DialogBody style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', height: '100%' }}>
          <DialogTitle>
            {isEditMode ? 'Edit Environment Container' : 'Create Environment Container'}
          </DialogTitle>

          <DialogContent className={styles.dialogContent}>
            {/* Container name */}
            <div className={styles.nameSection}>
              <Field
                label="Container name"
                required
                validationState={showNameError ? 'error' : 'none'}
                validationMessage={showNameError ? 'Container name is required.' : undefined}
              >
                <Input
                  value={containerName}
                  onChange={(_, d) => setContainerName(d.value)}
                  placeholder="e.g. Production US environments..."
                  style={{ maxWidth: '400px' }}
                />
              </Field>
            </div>

            {/* Description */}
            <div className={styles.descriptionSection}>
              <Field
                label="Description"
                required
                validationState={showDescriptionError ? 'error' : 'none'}
                validationMessage={showDescriptionError ? 'Description is required.' : undefined}
              >
                <Textarea
                  value={description}
                  onChange={(_, d) => setDescription(d.value)}
                  placeholder="Briefly describe the purpose of this container…"
                  rows={2}
                  resize="vertical"
                  style={{ maxWidth: '400px' }}
                />
              </Field>
            </div>

            {/* Environment table (search, filters, paging) */}
            <EnvironmentPickerTable
              items={environments}
              selectedIds={selectedEnvIds}
              onSelectionChange={setSelectedEnvIds}
              ariaLabel="Environments in this container"
            />
          </DialogContent>

          <DialogActions>
            <Button
              appearance="primary"
              onClick={() => void handleSave()}
              disabled={!canSave}
              icon={isSaving ? <Spinner size="tiny" /> : undefined}
            >
              {isSaving ? 'Saving…' : 'Save'}
            </Button>
            <Button appearance="secondary" onClick={handleClose} disabled={isSaving}>
              Cancel
            </Button>
          </DialogActions>
          <Text className={styles.footerHint}>
            Clicking Cancel will discard all unsaved changes.
          </Text>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
