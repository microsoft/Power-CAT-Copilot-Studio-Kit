import { useState, useEffect, useMemo } from 'react';
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
  Textarea,
  Combobox,
  Option,
  Switch,
  Text,
  MessageBar,
  MessageBarBody,
  InfoLabel,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { semanticColors } from '../../../theme/powerShieldTheme.tokens';
import { useNotify } from '../../../shared/hooks/useNotify';
import {
  createQuestion,
  updateQuestion,
  getQuestionOptionsForQuestion,
} from '../services/questionConfigService';
import type { QuestionConfig, QuestionCategoryConfig, QuestionOptionConfig } from '../../../models/questionConfig';
import type { AnswerType } from '../../../models/status';

// ─────────────────────────────────────────────────────────────────────────────
// Types & Constants
// ─────────────────────────────────────────────────────────────────────────────

const ANSWER_TYPES: AnswerType[] = ['Boolean', 'Text', 'Choice', 'MultiselectChoice', 'Date'];

const useStyles = makeStyles({
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    paddingTop: '8px',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    paddingTop: '8px',
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: tokens.colorNeutralStroke1,
  },
  optionsTable: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    paddingTop: '8px',
  },
  optionRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    fontSize: tokens.fontSizeBase200,
    padding: '4px 0',
  },
});

interface QuestionDialogProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  editData: QuestionConfig | null;
  categories: QuestionCategoryConfig[];
  allQuestions: QuestionConfig[];
  /** Pre-fill category when creating from a category detail view */
  defaultCategoryId?: string;
  /** Called after creating a Choice/MultiselectChoice question to navigate to detail view */
  onCreatedChoiceQuestion?: (questionId: string) => void;
}

export function QuestionDialog({
  open,
  onClose,
  onSaved,
  editData,
  categories,
  allQuestions,
  defaultCategoryId,
  onCreatedChoiceQuestion,
}: QuestionDialogProps) {
  const styles = useStyles();
  const isEditMode = !!editData;
  const { notifySuccess, notifyError } = useNotify();

  // Form state
  const [questionText, setQuestionText] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [categorySearch, setCategorySearch] = useState('');
  const [answerType, setAnswerType] = useState<AnswerType>('Boolean');
  const [answerTypeSearch, setAnswerTypeSearch] = useState('');
  const [displayOrder, setDisplayOrder] = useState('');
  const [isRequired, setIsRequired] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [tooltipText, setTooltipText] = useState('');
  const [parentQuestionId, setParentQuestionId] = useState<string | null>(null);
  const [parentSearch, setParentSearch] = useState('');
  const [parentTriggerValue, setParentTriggerValue] = useState('');

  const [isSaving, setIsSaving] = useState(false);
  const [hasAttemptedSave, setHasAttemptedSave] = useState(false);
  const [editOptions, setEditOptions] = useState<QuestionOptionConfig[]>([]);

  // Load options when editing a Choice/MultiselectChoice question
  useEffect(() => {
    if (open && editData && (editData.answerType === 'Choice' || editData.answerType === 'MultiselectChoice')) {
      void (async () => {
        try {
          const opts = await getQuestionOptionsForQuestion(editData.id);
          setEditOptions(opts);
        } catch {
          setEditOptions([]);
        }
      })();
    } else {
      setEditOptions([]);
    }
  }, [open, editData]);

  useEffect(() => {
    if (open) {
      if (editData) {
        setQuestionText(editData.questionText);
        setCategoryId(editData.categoryId);
        setCategorySearch(editData.categoryName ?? '');
        setAnswerType(editData.answerType);
        setAnswerTypeSearch(editData.answerType);
        setDisplayOrder(String(editData.displayOrder));
        setIsRequired(editData.isRequired);
        setIsActive(editData.isActive);
        setTooltipText(editData.tooltipText ?? '');
        setParentQuestionId(editData.parentQuestionId);
        setParentSearch(editData.parentQuestionText ?? '');
        setParentTriggerValue(editData.parentTriggerValue ?? '');
      } else {
        setQuestionText('');
        const prefillCatId = defaultCategoryId ?? '';
        setCategoryId(prefillCatId);
        const prefillCatName = categories.find((c) => c.id === prefillCatId)?.name ?? '';
        setCategorySearch(prefillCatName);
        setAnswerType('Boolean');
        setAnswerTypeSearch('');
        setDisplayOrder('');
        setIsRequired(false);
        setIsActive(true);
        setTooltipText('');
        setParentQuestionId(null);
        setParentSearch('');
        setParentTriggerValue('');
      }
      setHasAttemptedSave(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editData]);

  // Other questions (exclude self for parent picker)
  const otherQuestions = useMemo(
    () => allQuestions.filter((q) => !editData || q.id !== editData.id),
    [allQuestions, editData],
  );

  // Validation
  const textInvalid = !questionText.trim();
  const categoryInvalid = !categoryId;
  const orderInvalid = !displayOrder.trim() || isNaN(Number(displayOrder)) || Number(displayOrder) < 1;
  const triggerInvalid = !!parentQuestionId && !parentTriggerValue.trim();

  const showTextError = hasAttemptedSave && textInvalid;
  const showCategoryError = hasAttemptedSave && categoryInvalid;
  const showOrderError = hasAttemptedSave && orderInvalid;
  const showTriggerError = hasAttemptedSave && triggerInvalid;

  const hasChoiceOptions = isEditMode && (editData.answerType === 'Choice' || editData.answerType === 'MultiselectChoice');

  async function handleSave() {
    setHasAttemptedSave(true);
    if (textInvalid || categoryInvalid || orderInvalid || triggerInvalid) return;

    setIsSaving(true);
    try {
      const payload = {
        questionText: questionText.trim(),
        answerType,
        isRequired,
        displayOrder: Number(displayOrder),
        isActive,
        categoryId,
        parentQuestionId: parentQuestionId || null,
        parentTriggerValue: parentQuestionId ? parentTriggerValue.trim() : null,
        tooltipText: tooltipText.trim() || null,
      };
      if (isEditMode) {
        await updateQuestion(editData.id, payload);
        notifySuccess('Question updated successfully.');
        onSaved();
      } else {
        const newId = await createQuestion(payload);
        if ((answerType === 'Choice' || answerType === 'MultiselectChoice') && onCreatedChoiceQuestion) {
          notifySuccess('Question created successfully. Since this is a choice-type question, you will be redirected to define the answer options.');
          onSaved();
          onCreatedChoiceQuestion(newId);
        } else {
          notifySuccess('Question created successfully.');
          onSaved();
        }
      }
    } catch (err) {
      notifyError(err instanceof Error ? err.message : `Failed to ${isEditMode ? 'update' : 'create'} question.`);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog
        open={open}
        onOpenChange={(_, data) => { if (!data.open) onClose(); }}
      >
        <DialogSurface style={{ maxWidth: '600px' }}>
          <DialogBody>
            <DialogTitle>{isEditMode ? 'Edit Question' : 'Create New Question'}</DialogTitle>
            <DialogContent>
              <div className={styles.form}>
                <Field
                  label="Question Text"
                  required
                  validationState={showTextError ? 'error' : 'none'}
                  validationMessage={showTextError ? 'Question text is required.' : undefined}
                >
                  <Textarea
                    value={questionText}
                    onChange={(_, data) => setQuestionText(data.value)}
                    rows={3}
                    placeholder="Enter the compliance question..."
                  />
                </Field>

                {/* Hide category picker when creating from a category context */}
                {!(defaultCategoryId && !isEditMode) && (
                <Field
                  label="Category"
                  required
                  validationState={showCategoryError ? 'error' : 'none'}
                  validationMessage={showCategoryError ? 'Category is required.' : undefined}
                >
                  <Combobox
                    value={categorySearch}
                    onInput={(e) => setCategorySearch((e.target as HTMLInputElement).value)}
                    onOptionSelect={(_, data) => {
                      setCategoryId(data.optionValue ?? '');
                      setCategorySearch(data.optionText ?? '');
                    }}
                    placeholder="Select a category..."
                  >
                    {categories.map((c) => (
                      <Option key={c.id} value={c.id} text={c.name}>
                        {c.name}
                      </Option>
                    ))}
                  </Combobox>
                </Field>
                )}

                <Field label={
                  <InfoLabel info="Boolean = Yes/No toggle. Text = free-form input. Choice = single-select dropdown. MultiselectChoice = multi-select checkboxes. Date = date picker.">
                    Answer Type
                  </InfoLabel>
                } required>
                  <Combobox
                    value={answerTypeSearch}
                    onInput={(e) => setAnswerTypeSearch((e.target as HTMLInputElement).value)}
                    onOptionSelect={(_, data) => {
                      setAnswerType((data.optionValue as AnswerType) ?? 'Boolean');
                      setAnswerTypeSearch(data.optionText ?? '');
                    }}
                    placeholder="Select answer type..."
                  >
                    {ANSWER_TYPES.map((t) => (
                      <Option key={t} value={t} text={t}>
                        {t}
                      </Option>
                    ))}
                  </Combobox>
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

                <Field label="Is Required">
                  <Switch
                    checked={isRequired}
                    onChange={(_, data) => setIsRequired(data.checked)}
                  />
                </Field>

                <Field label="Tooltip Text">
                  <Textarea
                    value={tooltipText}
                    onChange={(_, data) => setTooltipText(data.value)}
                    rows={2}
                    placeholder="Optional help text shown to users..."
                  />
                </Field>

                {/* Parent Details Section */}
                <div className={styles.section}>
                  <Text weight="semibold" size={300}>Parent Details</Text>

                  <Field label={
                    <InfoLabel info="Makes this question conditional - it only appears when the parent question has the specified trigger value. Leave empty for questions that are always visible.">
                      Parent Question
                    </InfoLabel>
                  }>
                    <Combobox
                      value={parentSearch}
                      onInput={(e) => setParentSearch((e.target as HTMLInputElement).value)}
                      onOptionSelect={(_, data) => {
                        const val = data.optionValue ?? null;
                        setParentQuestionId(val);
                        setParentSearch(data.optionText ?? '');
                        if (!val) setParentTriggerValue('');
                      }}
                      placeholder="Search questions..."
                      clearable
                    >
                      {otherQuestions.map((q) => (
                        <Option key={q.id} value={q.id} text={q.questionText}>
                          {q.questionText}
                        </Option>
                      ))}
                    </Combobox>
                  </Field>

                  {parentQuestionId && (
                    <Field
                      label={
                        <InfoLabel info="The parent's answer value that activates this question. For Boolean: 'true' or 'false'. For Choice: the exact option text.">
                          Parent Trigger Value
                        </InfoLabel>
                      }
                      required
                      validationState={showTriggerError ? 'error' : 'none'}
                      validationMessage={showTriggerError ? 'Trigger value is required when a parent question is set.' : undefined}
                      hint="For Boolean: 'true' or 'false'. For Choice/MultiselectChoice: option text."
                    >
                      <Input
                        value={parentTriggerValue}
                        onChange={(_, data) => setParentTriggerValue(data.value)}
                        placeholder="e.g., true"
                      />
                    </Field>
                  )}
                </div>

                {/* Options sub-table for Choice/MultiselectChoice in edit mode */}
                {hasChoiceOptions && (
                  <div className={styles.section}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text weight="semibold" size={300}>Answer Options</Text>
                    </div>
                    {editOptions.length === 0 ? (
                      <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                        No options defined for this question.
                      </Text>
                    ) : (
                      <div className={styles.optionsTable}>
                        {editOptions.map((opt) => (
                          <div key={opt.id} className={styles.optionRow}>
                            <Text size={200} style={{ flex: 1 }}>{opt.optionText}</Text>
                            <Text size={100} style={{ color: tokens.colorNeutralForeground3 }}>Order: {opt.displayOrder}</Text>
                            <Text size={100} style={{ color: opt.isActive ? semanticColors.success : tokens.colorNeutralForeground3 }}>
                              {opt.isActive ? 'Active' : 'Inactive'}
                            </Text>
                          </div>
                        ))}
                      </div>
                    )}
                    <MessageBar intent="info">
                      <MessageBarBody>
                        Manage answer options from the question detail view.
                      </MessageBarBody>
                    </MessageBar>
                  </div>
                )}
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
