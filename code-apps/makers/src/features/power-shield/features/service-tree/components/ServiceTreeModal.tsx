import { useState, useEffect } from 'react';
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
  Text,
  Spinner,
  tokens,
} from '@fluentui/react-components';
import { createServiceTree, updateServiceTree } from '../../../shared/services/dataverse/serviceTreeService';
import { useNotify } from '../../../shared/hooks/useNotify';
import { useAuth } from '../../../shared/contexts/AuthContext';
import { MemberPicker } from './MemberPicker';
import type { ServiceTreeMemberEntry } from '../../../models/serviceTreeMember';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ServiceTreeEditData {
  id: string;
  name: string;
  organization?: string;
  description?: string;
  members: ServiceTreeMemberEntry[];
}

interface ServiceTreeModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string, name: string, organization?: string, description?: string) => void;
  /** When provided, the modal operates in edit mode with pre-populated data. */
  editData?: ServiceTreeEditData | null;
  onUpdated?: (id: string, data: { name: string; organization?: string; description?: string }) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function ServiceTreeModal({ open, onClose, onCreated, editData, onUpdated }: ServiceTreeModalProps) {
  const { notifySuccess, notifyError } = useNotify();
  const auth = useAuth();

  const isEditMode = !!editData;

  const [name, setName] = useState('');
  const [organization, setOrganization] = useState('');
  const [description, setDescription] = useState('');
  const [additionalMembers, setAdditionalMembers] = useState<ServiceTreeMemberEntry[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [hasAttemptedSave, setHasAttemptedSave] = useState(false);

  const creatorEntry: ServiceTreeMemberEntry = {
    dvUserId: auth.dvUserId,
    aadObjectId: auth.aadObjectId,
    upn: auth.upn,
    displayName: auth.displayName,
  };

  // Pre-populate form when opening in edit mode
  useEffect(() => {
    if (open && editData) {
      setName(editData.name);
      setOrganization(editData.organization ?? '');
      setDescription(editData.description ?? '');
      // Exclude the creator from additional members (they're shown as locked)
      const nonCreator = editData.members.filter((m) => m.dvUserId !== auth.dvUserId);
      setAdditionalMembers(nonCreator);
      setHasAttemptedSave(false);
    } else if (open && !editData) {
      resetForm();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editData]);

  const nameInvalid = !name.trim();
  const organizationInvalid = !organization.trim();
  const descriptionInvalid = !description.trim();
  const membersInvalid = additionalMembers.length === 0;
  const showNameError = hasAttemptedSave && nameInvalid;
  const showOrganizationError = hasAttemptedSave && organizationInvalid;
  const showDescriptionError = hasAttemptedSave && descriptionInvalid;
  const showMembersError = hasAttemptedSave && membersInvalid;

  function resetForm() {
    setName('');
    setOrganization('');
    setDescription('');
    setAdditionalMembers([]);
    setHasAttemptedSave(false);
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  async function handleSave() {
    setHasAttemptedSave(true);
    if (nameInvalid || organizationInvalid || descriptionInvalid || membersInvalid) return;

    setIsSaving(true);
    try {
      const payload = {
        name: name.trim(),
        organization: organization.trim() || undefined,
        description: description.trim() || undefined,
      };

      if (isEditMode && editData) {
        const allMembers = [creatorEntry, ...additionalMembers];
        await updateServiceTree(editData.id, payload, allMembers);
        notifySuccess('Service Tree updated successfully.');
        resetForm();
        onUpdated?.(editData.id, payload);
      } else {
        const { id } = await createServiceTree(payload, creatorEntry, additionalMembers);
        notifySuccess('Service Tree created successfully.');
        resetForm();
        onCreated(id, name.trim(), organization.trim() || undefined, description.trim() || undefined);
      }
    } catch (err) {
      notifyError(err instanceof Error ? err.message : `Failed to ${isEditMode ? 'update' : 'create'} Service Tree.`);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(_, data) => { if (!data.open) handleClose(); }}>
      <DialogSurface aria-labelledby="service-tree-modal-title">
        <DialogTitle id="service-tree-modal-title">
          {isEditMode ? 'Edit Service Tree' : 'Create New Service Tree'}
        </DialogTitle>
        <DialogBody>
          <DialogContent>
            {isEditMode && !editData ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '24px' }}>
                <Spinner size="small" label="Loading..." />
              </div>
            ) : (
              <>
                <Field
                  label="Name"
                  required
                  validationState={showNameError ? 'error' : 'none'}
                  validationMessage={showNameError ? 'Name is required.' : undefined}
                >
                  <Input
                    value={name}
                    onChange={(_, data) => setName(data.value)}
                    placeholder="Service Tree name..."
                  />
                </Field>
                <Field label="Organization" required style={{ marginTop: '12px' }}
                  validationState={showOrganizationError ? 'error' : 'none'}
                  validationMessage={showOrganizationError ? 'Organization is required.' : undefined}
                >
                  <Input
                    value={organization}
                    onChange={(_, data) => setOrganization(data.value)}
                    placeholder="Organization name..."
                  />
                </Field>
                <Field label="Description" required style={{ marginTop: '12px' }}
                  validationState={showDescriptionError ? 'error' : 'none'}
                  validationMessage={showDescriptionError ? 'Description is required.' : undefined}
                >
                  <Textarea
                    value={description}
                    onChange={(_, data) => setDescription(data.value)}
                    placeholder="Service tree description..."
                    rows={3}
                  />
                </Field>

                <div style={{ marginTop: '20px' }}>
                  <MemberPicker
                    members={additionalMembers}
                    onChange={setAdditionalMembers}
                    lockedMembers={[creatorEntry]}
                  />
                  {showMembersError && (
                    <Text size={200} style={{ color: tokens.colorPaletteRedForeground1, marginTop: '4px', display: 'block' }}>
                      Add at least one additional member.
                    </Text>
                  )}
                </div>
              </>
            )}
          </DialogContent>
          <DialogActions>
            <Button
              appearance="primary"
              onClick={() => void handleSave()}
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : isEditMode ? 'Save Changes' : 'Save'}
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
