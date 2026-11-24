import { useState } from 'react';
import { useNavigate } from '../../../shared/hooks/useNavigate';
import { ArrowLeft20Regular, ArrowRight20Regular, ClipboardTask24Regular, Info16Regular } from '@fluentui/react-icons';
import { DatePicker } from '@fluentui/react-datepicker-compat';
import {
  makeStyles,
  tokens,
  Text,
  Button,
  RadioGroup,
  Radio,
  Input,
  Select,
  Combobox,
  Option,
  Tooltip,
  Spinner,
} from '@fluentui/react-components';
import { useWizard } from './WizardShell';
import { CancelWizardDialog } from './CancelWizardDialog';
import { SaveDraftButton } from './SaveDraftButton';
import { useQuestions } from '../hooks/useQuestions';
import type { WizardAnswer } from '../contexts/wizardTypes';
import type { Question } from '../../../models/question';

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  categorySection: {
    display: 'flex',
    flexDirection: 'column',
    marginBottom: tokens.spacingVerticalL,
  },
  categoryHeader: {
    backgroundColor: tokens.colorNeutralBackground3,
    paddingTop: tokens.spacingVerticalS,
    paddingBottom: tokens.spacingVerticalS,
    paddingLeft: tokens.spacingHorizontalM,
    paddingRight: tokens.spacingHorizontalM,
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase400,
    textDecorationLine: 'underline',
    display: 'block',
  },
  questionRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: tokens.spacingHorizontalL,
    paddingTop: tokens.spacingVerticalM,
    paddingBottom: tokens.spacingVerticalM,
    paddingLeft: tokens.spacingHorizontalM,
    paddingRight: tokens.spacingHorizontalM,
    borderBottomColor: tokens.colorNeutralBackground3,
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
  },
  questionLabelArea: {
    flex: 1,
    display: 'flex',
    alignItems: 'flex-start',
    gap: tokens.spacingHorizontalXS,
    paddingTop: '2px',
  },
  questionText: {
    lineHeight: tokens.lineHeightBase400,
  },
  requiredMark: {
    color: tokens.colorPaletteRedForeground1,
  },
  tooltipIcon: {
    flexShrink: 0,
    color: tokens.colorNeutralForeground3,
    cursor: 'default',
    marginTop: '2px',
  },
  answerArea: {
    flexShrink: 0,
    width: '220px',
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  errorMessage: {
    color: tokens.colorPaletteRedForeground1,
    fontSize: tokens.fontSizeBase200,
  },
  navRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    paddingTop: tokens.spacingVerticalL,
  },
  navRowGroup: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
    alignItems: 'center',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacingVerticalM,
    paddingTop: tokens.spacingVerticalXXXL,
    paddingBottom: tokens.spacingVerticalXXXL,
  },
  emptyStateIcon: {
    fontSize: '48px',
    color: tokens.colorNeutralForeground3,
  },
  emptyStateDescription: {
    color: tokens.colorNeutralForeground2,
    maxWidth: '400px',
    textAlign: 'center' as const,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function Step2Questionnaire() {
  const styles = useStyles();
  const navigate = useNavigate();
  const { state, dispatch } = useWizard();
  const { questions, categories, optionsByQuestionId, isLoading, error } = useQuestions();

  const [hasAttemptedNext, setHasAttemptedNext] = useState(false);

  // ── Answer helpers ──────────────────────────────────────────────────────────

  function getAnswer(questionId: string): string {
    return state.answers.find((a) => a.questionId === questionId)?.answerValue ?? '';
  }

  function toIsoDate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function parseDateValue(iso: string): Date | undefined {
    if (!iso) return undefined;
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  /**
   * Normalises Yes/No/1/0/true/false to "true"/"false" so that admins can
   * enter natural-language values in cat_parenttriggervalue (e.g. "Yes")
   * while the RadioGroup stores "true"/"false". Non-boolean strings pass through
   * unchanged (preserves exact match for Choice options like "Environment Access").
   */
  function normalizeValue(v: string): string {
    const lower = v.toLowerCase().trim();
    if (lower === 'yes' || lower === 'true' || lower === '1') return 'true';
    if (lower === 'no'  || lower === 'false' || lower === '0') return 'false';
    return v;
  }

  function isApplicable(question: Question): boolean {
    if (!question.parentQuestionId) return true;
    const parent = questions.find((q) => q.id === question.parentQuestionId);
    const parentAnswer = normalizeValue(getAnswer(question.parentQuestionId));
    const triggerValue = normalizeValue(question.parentTriggerValue ?? '');

    if (parent?.answerType === 'MultiselectChoice') {
      const selectedValues = parentAnswer
        .split(',')
        .map((v) => normalizeValue(v.trim()))
        .filter(Boolean);
      return selectedValues.includes(triggerValue);
    }

    return parentAnswer !== '' && parentAnswer === triggerValue;
  }

  function dispatchAnswer(question: Question, value: string, applicable: boolean) {
    const answer: WizardAnswer = {
      questionId: question.id,
      questionText: question.questionText,
      answerType: question.answerType,
      isRequired: question.isRequired,
      answerValue: value,
      isApplicable: applicable,
    };
    dispatch({ type: 'SET_ANSWER', payload: answer });
  }

  function handleAnswerChange(question: Question, value: string) {
    dispatchAnswer(question, value, true);

    // Auto-clear any children that no longer meet their condition
    const children = questions.filter((q) => q.parentQuestionId === question.id);
    for (const child of children) {
      const triggerValue = normalizeValue(child.parentTriggerValue ?? '');
      const childStillApplicable =
        question.answerType === 'MultiselectChoice'
          ? value.split(',').map((v) => normalizeValue(v.trim())).filter(Boolean).includes(triggerValue)
          : normalizeValue(value) === triggerValue;
      if (!childStillApplicable) {
        dispatchAnswer(child, '', false);
      }
    }
  }

  // ── Validation ──────────────────────────────────────────────────────────────

  const unansweredRequiredIds = new Set(
    questions
      .filter((q) => q.isRequired && isApplicable(q) && !getAnswer(q.id))
      .map((q) => q.id),
  );

  function handleNext() {
    setHasAttemptedNext(true);
    if (unansweredRequiredIds.size > 0) return;
    dispatch({ type: 'ADVANCE_STEP', payload: 2 });
    navigate('/new-request/connectors');
  }

  // ── Loading / error ─────────────────────────────────────────────────────────

  if (isLoading) return <Spinner label="Loading questions..." />;
  if (error) return <Text>Error loading questions: {error}</Text>;

  if (questions.length === 0) {
    return (
      <div className={styles.root}>
        <div className={styles.emptyState}>
          <ClipboardTask24Regular className={styles.emptyStateIcon} />
          <Text size={500} weight="semibold">
            No Questionnaire Configured
          </Text>
          <Text size={300} className={styles.emptyStateDescription}>
            Your administrator has not configured any questionnaire questions yet.
            You can proceed to the next step.
          </Text>
        </div>
        <div className={styles.navRow}>
          <div className={styles.navRowGroup}>
            <Button
              appearance="secondary"
              onClick={() => navigate('/new-request/environment')}
              icon={<ArrowLeft20Regular />}
            >
              Back
            </Button>
            <CancelWizardDialog />
          </div>
          <div className={styles.navRowGroup}>
            <SaveDraftButton />
            <Button
              appearance="primary"
              onClick={() => {
                dispatch({ type: 'ADVANCE_STEP', payload: 2 });
                navigate('/new-request/connectors');
              }}
              icon={<ArrowRight20Regular />}
              iconPosition="after"
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const sortedCategories = [...categories].sort((a, b) => a.displayOrder - b.displayOrder);

  return (
    <div className={styles.root}>
      {sortedCategories.map((category) => {
        const categoryQuestions = questions
          .filter((q) => q.categoryId === category.id)
          .sort((a, b) => a.displayOrder - b.displayOrder);

        if (categoryQuestions.length === 0) return null;

        return (
          <div key={category.id} className={styles.categorySection}>
            {/* Category header — grey background, bold underline */}
            <div className={styles.categoryHeader}>
              {category.name}
            </div>

            {categoryQuestions.map((question) => {
              const applicable = isApplicable(question);
              const value = getAnswer(question.id);
              const showError = hasAttemptedNext && unansweredRequiredIds.has(question.id);
              const options = optionsByQuestionId.get(question.id.toLowerCase()) ?? [];

              return (
                <div key={question.id} className={styles.questionRow}>
                  {/* Left: question text + optional tooltip icon */}
                  <div className={styles.questionLabelArea}>
                    <Text className={styles.questionText}>
                      {question.questionText}
                      {question.isRequired && (
                        <span className={styles.requiredMark} aria-hidden="true"> *</span>
                      )}
                    </Text>
                    {question.tooltipText && (
                      <Tooltip content={question.tooltipText} relationship="description">
                        <Info16Regular
                          className={styles.tooltipIcon}
                          aria-label={`More information about this question`}
                          tabIndex={0}
                        />
                      </Tooltip>
                    )}
                  </div>

                  {/* Right: answer control (fixed width) */}
                  <div className={styles.answerArea}>
                    {!applicable ? (
                      // N/A — condition not met: always show a disabled Select
                      <Select disabled aria-label="Not applicable - depends on a previous answer">
                        <option value="">N/A</option>
                      </Select>
                    ) : question.answerType === 'Boolean' ? (
                      <RadioGroup
                        value={value}
                        onChange={(_, data) => handleAnswerChange(question, data.value)}
                        layout="horizontal"
                        aria-required={question.isRequired}
                        aria-invalid={showError}
                      >
                        <Radio value="true" label="Yes" />
                        <Radio value="false" label="No" />
                      </RadioGroup>
                    ) : question.answerType === 'Choice' ? (
                      <Select
                        value={value}
                        onChange={(ev) => handleAnswerChange(question, ev.target.value)}
                        aria-required={question.isRequired}
                        aria-invalid={showError}
                      >
                        <option value="">-- Select --</option>
                        {options.map((opt) => (
                          <option key={opt.id} value={opt.optionText}>
                            {opt.optionText}
                          </option>
                        ))}
                      </Select>
                    ) : question.answerType === 'MultiselectChoice' ? (
                      <Combobox
                        multiselect
                        placeholder="-- Select --"
                        selectedOptions={value ? value.split(',').map((v) => v.trim()).filter(Boolean) : []}
                        onOptionSelect={(_, data) => {
                          const newVal = (data.selectedOptions ?? []).join(',');
                          handleAnswerChange(question, newVal);
                        }}
                        aria-required={question.isRequired}
                        aria-invalid={showError}
                        style={{ width: '100%' }}
                      >
                        {options.map((opt) => (
                          <Option key={opt.id} value={opt.optionText}>
                            {opt.optionText}
                          </Option>
                        ))}
                      </Combobox>
                    ) : question.answerType === 'Date' ? (
                      <DatePicker
                        placeholder="Select a date"
                        value={parseDateValue(value)}
                        onSelectDate={(date) => {
                          handleAnswerChange(question, date ? toIsoDate(date) : '');
                        }}
                        aria-required={question.isRequired}
                        aria-invalid={showError}
                        style={{ width: '100%' }}
                      />
                    ) : (
                      // Text type — single-line input, right-aligned
                      <Input
                        value={value}
                        onChange={(_, data) => handleAnswerChange(question, data.value)}
                        aria-required={question.isRequired}
                        aria-invalid={showError}
                      />
                    )}
                    {showError && (
                      <Text className={styles.errorMessage} aria-live="polite">
                        This question is required.
                      </Text>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}

      <div className={styles.navRow}>
        <div className={styles.navRowGroup}>
          <Button
            appearance="secondary"
            onClick={() => navigate('/new-request/environment')}
            icon={<ArrowLeft20Regular />}
          >
            Back
          </Button>
          <CancelWizardDialog />
        </div>
        <div className={styles.navRowGroup}>
          <SaveDraftButton />
          <Button
            appearance="primary"
            onClick={handleNext}
            icon={<ArrowRight20Regular />}
            iconPosition="after"
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
