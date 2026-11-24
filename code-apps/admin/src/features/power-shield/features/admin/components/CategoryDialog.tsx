import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Field,
  Input,
  InfoLabel,
} from '@fluentui/react-components';
import { useNotify } from '../../../shared/hooks/useNotify';
import {
  createQuestionCategory,
  updateQuestionCategory,
} from '../services/questionConfigService';
import type { QuestionCategoryConfig } from '../../../models/questionConfig';

interface CategoryDialogProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  editData: QuestionCategoryConfig | null;
}

export function CategoryDialog({
  open,
  onClose,
  onSaved,
  editData,
}: CategoryDialogProps) {
  const isEditMode = !!editData;
  const { notifySuccess, notifyError } = useNotify();

  const [name, setName] = useState('');
  const [displayOrder, setDisplayOrder] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasAttemptedSave, setHasAttemptedSave] = useState(false);

  useEffect(() => {
    if (open) {
      if (editData) {
        setName(editData.name);
        setDisplayOrder(String(editData.displayOrder));
        setIsActive(editData.isActive);
      } else {
        setName('');
        setDisplayOrder('');
        setIsActive(true);
      }
      setHasAttemptedSave(false);
    }
  }, [open, editData]);

  const nameInvalid = !name.trim();
  const orderInvalid = !displayOrder.trim() || isNaN(Number(displayOrder)) || Number(displayOrder) < 1;
  const showNameError = hasAttemptedSave && nameInvalid;
  const showOrderError = hasAttemptedSave && orderInvalid;

  async function handleSave() {
    setHasAttemptedSave(true);
    if (nameInvalid || orderInvalid) return;

    setIsSaving(true);
    try {
      const payload = {
        name: name.trim(),
        displayOrder: Number(displayOrder),
        isActive,
      };
      if (isEditMode) {
        await updateQuestionCategory(editData.id, payload);
        notifySuccess('Category updated successfully.');
      } else {
        await createQuestionCategory(payload);
        notifySuccess('Category created successfully.');
      }
      onSaved();
    } catch (err) {
      notifyError(err instanceof Error ? err.message : `Failed to ${isEditMode ? 'update' : 'create'} category.`);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog
        open={open}
        onOpenChange={(_, data) => { if (!data.open) onClose(); }}
      >
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{isEditMode ? 'Edit Category' : 'Create New Category'}</DialogTitle>
            <DialogContent>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingTop: '8px' }}>
                <Field
                  label="Name"
                  required
                  validationState={showNameError ? 'error' : 'none'}
                  validationMessage={showNameError ? 'Name is required.' : undefined}
                >
                  <Input
                    value={name}
                    onChange={(_, data) => setName(data.value)}
                    placeholder="e.g., Guest Access"
                  />
                </Field>

                <Field
                  label={
                    <InfoLabel info="Controls the order this section appears in the maker's questionnaire form. Lower numbers appear first.">
                      Display Order
                    </InfoLabel>
                  }
                  required
                  validationState={showOrderError ? 'error' : 'none'}
                  validationMessage={showOrderError ? 'Display order must be a positive number.' : undefined}
                >
                  <Input
                    type="number"
                    value={displayOrder}
                    onChange={(_, data) => setDisplayOrder(data.value)}
                    min={1}
                  />
                </Field>



              </div>
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={onClose} disabled={isSaving}>
                Cancel
              </Button>
              <Button appearance="primary" onClick={() => void handleSave()} disabled={isSaving}>
                {isSaving ? 'Saving...' : isEditMode ? 'Save Changes' : 'Save'}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
  );
}
