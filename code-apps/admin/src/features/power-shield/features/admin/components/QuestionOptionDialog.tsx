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
  Combobox,
  Option,
  InfoLabel,
} from '@fluentui/react-components';
import { useNotify } from '../../../shared/hooks/useNotify';
import {
  createQuestionOption,
  updateQuestionOption,
} from '../services/questionConfigService';
import type { QuestionOptionConfig, QuestionConfig } from '../../../models/questionConfig';

interface QuestionOptionDialogProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  editData: QuestionOptionConfig | null;
  /** Only Choice and MultiselectChoice questions */
  choiceQuestions: QuestionConfig[];
  /** Pre-fill question when creating from a question detail view */
  defaultQuestionId?: string;
}

export function QuestionOptionDialog({
  open,
  onClose,
  onSaved,
  editData,
  choiceQuestions,
  defaultQuestionId,
}: QuestionOptionDialogProps) {
  const isEditMode = !!editData;
  const { notifySuccess, notifyError } = useNotify();

  const [questionId, setQuestionId] = useState('');
  const [questionSearch, setQuestionSearch] = useState('');
  const [optionText, setOptionText] = useState('');
  const [displayOrder, setDisplayOrder] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasAttemptedSave, setHasAttemptedSave] = useState(false);

  useEffect(() => {
    if (open) {
      if (editData) {
        setQuestionId(editData.questionId);
        const matchingQ = choiceQuestions.find((q) => q.id === editData.questionId);
        setQuestionSearch(matchingQ?.questionText ?? editData.questionText ?? '');
        setOptionText(editData.optionText);
        setDisplayOrder(String(editData.displayOrder));
        setIsActive(editData.isActive);
      } else {
        const prefillQId = defaultQuestionId ?? '';
        setQuestionId(prefillQId);
        const prefillQText = choiceQuestions.find((q) => q.id === prefillQId)?.questionText ?? '';
        setQuestionSearch(prefillQText);
        setOptionText('');
        setDisplayOrder('');
        setIsActive(true);
      }
      setHasAttemptedSave(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editData, choiceQuestions]);

  const questionInvalid = !questionId;
  const textInvalid = !optionText.trim();
  const orderInvalid = !displayOrder.trim() || isNaN(Number(displayOrder)) || Number(displayOrder) < 1;

  const showQuestionError = hasAttemptedSave && questionInvalid;
  const showTextError = hasAttemptedSave && textInvalid;
  const showOrderError = hasAttemptedSave && orderInvalid;

  async function handleSave() {
    setHasAttemptedSave(true);
    if (questionInvalid || textInvalid || orderInvalid) return;

    setIsSaving(true);
    try {
      const payload = {
        questionId,
        optionText: optionText.trim(),
        displayOrder: Number(displayOrder),
        isActive,
      };
      if (isEditMode) {
        await updateQuestionOption(editData.id, payload);
        notifySuccess('Option updated successfully.');
      } else {
        await createQuestionOption(payload);
        notifySuccess('Option created successfully.');
      }
      onSaved();
    } catch (err) {
      notifyError(err instanceof Error ? err.message : `Failed to ${isEditMode ? 'update' : 'create'} option.`);
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
            <DialogTitle>{isEditMode ? 'Edit Option' : 'Create New Option'}</DialogTitle>
            <DialogContent>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingTop: '8px' }}>
                {/* Hide question picker when creating from a question context */}
                {!(defaultQuestionId && !isEditMode) && (
                <Field
                  label={
                    <InfoLabel info="Only Choice and Multi-select type questions need answer options. Select which question this option belongs to.">
                      Question
                    </InfoLabel>
                  }
                  required
                  validationState={showQuestionError ? 'error' : 'none'}
                  validationMessage={showQuestionError ? 'Question is required.' : undefined}
                >
                  <Combobox
                    value={questionSearch}
                    onInput={(e) => setQuestionSearch((e.target as HTMLInputElement).value)}
                    onOptionSelect={(_, data) => {
                      setQuestionId(data.optionValue ?? '');
                      setQuestionSearch(data.optionText ?? '');
                    }}
                    placeholder="Select a Choice/MultiselectChoice question..."
                  >
                    {choiceQuestions.map((q) => (
                      <Option key={q.id} value={q.id} text={q.questionText}>
                        {q.questionText}
                      </Option>
                    ))}
                  </Combobox>
                </Field>
                )}

                <Field
                  label="Option Text"
                  required
                  validationState={showTextError ? 'error' : 'none'}
                  validationMessage={showTextError ? 'Option text is required.' : undefined}
                >
                  <Input
                    value={optionText}
                    onChange={(_, data) => setOptionText(data.value)}
                    placeholder="e.g., Yes - with approval"
                  />
                </Field>

                <Field
                  label="Display Order"
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
