import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  makeStyles,
  tokens,
  Text,
  Button,
  Input,
  Textarea,
  Field,
  Switch,
  Spinner,
  Combobox,
  Option,
  DataGrid,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridBody,
  DataGridRow,
  DataGridCell,
  createTableColumn,
  Card,
  InfoLabel,
  MessageBar,
  MessageBarBody,
} from '@fluentui/react-components';
import type { TableColumnDefinition } from '@fluentui/react-components';
import {
  SearchRegular,
  ArrowClockwise20Regular,
  DeleteRegular,
  SaveRegular,
  QuestionCircleRegular,
} from '@fluentui/react-icons';
import { PaginationBar } from '../../../shared/components/PaginationBar';
import { semanticColors } from '../../../theme/powerShieldTheme.tokens';
import { useNotify } from '../../../shared/hooks/useNotify';
import {
  updateQuestion,
  getQuestions,
  getQuestionCategories,
  getQuestionOptionsForQuestion,
  deleteQuestionOption,
} from '../services/questionConfigService';
import type {
  QuestionConfig,
  QuestionCategoryConfig,
  QuestionOptionConfig,
} from '../../../models/questionConfig';
import type { AnswerType } from '../../../models/status';
import { QuestionOptionDialog } from './QuestionOptionDialog';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';
import { EmptyState } from './EmptyState';
import { useSurfaceStyles, useTableStyles, useToolbarStyles } from '../../../shared/styles';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_PAGE_SIZE = 5;
const PAGE_SIZE_OPTIONS = [5, 10, 25] as const;
const ANSWER_TYPES: AnswerType[] = ['Boolean', 'Text', 'Choice', 'MultiselectChoice', 'Date'];

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const useStyles = makeStyles({
  formGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: tokens.spacingHorizontalL,
    '@media (max-width: 640px)': {
      gridTemplateColumns: '1fr',
    },
  },
  formFullWidth: {
    gridColumn: '1 / -1',
  },
  formActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: tokens.spacingHorizontalM,
    paddingTop: tokens.spacingVerticalS,
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: tokens.colorNeutralStroke2,
  },
  sectionTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
  section: {
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: tokens.colorNeutralStroke2,
    paddingTop: tokens.spacingVerticalM,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  searchInput: {
    flex: '1',
    maxWidth: '360px',
  },
  headerCell: {
    fontWeight: tokens.fontWeightSemibold,
  },
  footerInfo: {
    fontSize: '12px',
    color: tokens.colorNeutralForeground3,
  },
  nameLink: {
    color: tokens.colorBrandForeground1,
    cursor: 'pointer',
    fontWeight: '500',
    textDecoration: 'none',
    ':hover': {
      textDecoration: 'underline',
    },
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

interface QuestionDetailViewProps {
  question: QuestionConfig;
  category: QuestionCategoryConfig;
  /** Called after save/delete so parent can refresh its data */
  onDataChanged: () => void;
}

export function QuestionDetailView({
  question,
  category,
  onDataChanged,
}: QuestionDetailViewProps) {
  const styles = useStyles();
  const surfaceStyles = useSurfaceStyles();
  const tableStyles = useTableStyles();
  const toolbarStyles = useToolbarStyles();
  const { notifySuccess, notifyError } = useNotify();

  // ── Form state ──
  const [questionText, setQuestionText] = useState(question.questionText);
  const [categoryId, setCategoryId] = useState(question.categoryId);
  const [categorySearch, setCategorySearch] = useState(question.categoryName || category.name);
  const [answerType, setAnswerType] = useState<AnswerType>(question.answerType);
  const [answerTypeSearch, setAnswerTypeSearch] = useState<string>(question.answerType);
  const [displayOrder, setDisplayOrder] = useState(String(question.displayOrder));
  const [isRequired, setIsRequired] = useState(question.isRequired);
  const [tooltipText, setTooltipText] = useState(question.tooltipText ?? '');
  const [parentQuestionId, setParentQuestionId] = useState<string | null>(question.parentQuestionId);
  const [parentSearch, setParentSearch] = useState(question.parentQuestionText ?? '');
  const [parentTriggerValue, setParentTriggerValue] = useState(question.parentTriggerValue ?? '');

  const [isSaving, setIsSaving] = useState(false);
  const [hasAttemptedSave, setHasAttemptedSave] = useState(false);

  // ── Reference data for dropdowns ──
  const [allCategories, setAllCategories] = useState<QuestionCategoryConfig[]>([]);
  const [allQuestions, setAllQuestions] = useState<QuestionConfig[]>([]);

  // ── Options subgrid state ──
  const [options, setOptions] = useState<QuestionOptionConfig[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [optionSearchTerm, setOptionSearchTerm] = useState('');
  const [optionPage, setOptionPage] = useState(1);
  const [optionPageSize, setOptionPageSizeRaw] = useState(DEFAULT_PAGE_SIZE);
  const [optionDialogOpen, setOptionDialogOpen] = useState(false);
  const [optionEditItem, setOptionEditItem] = useState<QuestionOptionConfig | null>(null);
  const [optionDeleteTarget, setOptionDeleteTarget] = useState<QuestionOptionConfig | null>(null);

  const setOptionPageSize = useCallback((size: number) => {
    setOptionPageSizeRaw(size);
    setOptionPage(1);
  }, []);

  const showOptionsSubgrid = answerType === 'Choice' || answerType === 'MultiselectChoice';

  // ── Data loading ──
  async function loadReferenceData() {
    try {
      const [cats, qs] = await Promise.all([getQuestionCategories(), getQuestions()]);
      setAllCategories(cats);
      setAllQuestions(qs);
    } catch {
      // non-critical — dropdowns will be empty
    }
  }

  async function loadOptions() {
    if (!showOptionsSubgrid) {
      setOptions([]);
      setOptionsLoading(false);
      return;
    }
    setOptionsLoading(true);
    try {
      const data = await getQuestionOptionsForQuestion(question.id);
      setOptions(data);
    } catch (err) {
      notifyError(err instanceof Error ? err.message : 'Failed to load options.');
    } finally {
      setOptionsLoading(false);
    }
  }

  useEffect(() => {
    void loadReferenceData();
    void loadOptions();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question.id]);

  // Reload options when answer type changes to a choice type
  useEffect(() => {
    if (showOptionsSubgrid) {
      void loadOptions();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showOptionsSubgrid]);

  // ── Form validation ──
  const textInvalid = !questionText.trim();
  const categoryInvalid = !categoryId;
  const orderInvalid = !displayOrder.trim() || isNaN(Number(displayOrder)) || Number(displayOrder) < 1;
  const triggerInvalid = !!parentQuestionId && !parentTriggerValue.trim();

  const showTextError = hasAttemptedSave && textInvalid;
  const showCategoryError = hasAttemptedSave && categoryInvalid;
  const showOrderError = hasAttemptedSave && orderInvalid;
  const showTriggerError = hasAttemptedSave && triggerInvalid;

  const otherQuestions = useMemo(
    () => allQuestions.filter((q) => q.id !== question.id),
    [allQuestions, question.id],
  );

  // ── Save ──
  async function handleSave() {
    setHasAttemptedSave(true);
    if (textInvalid || categoryInvalid || orderInvalid || triggerInvalid) return;

    setIsSaving(true);
    try {
      await updateQuestion(question.id, {
        questionText: questionText.trim(),
        categoryId,
        answerType,
        displayOrder: Number(displayOrder),
        isRequired,
        isActive: question.isActive,
        tooltipText: tooltipText.trim() || null,
        parentQuestionId: parentQuestionId || null,
        parentTriggerValue: parentQuestionId ? parentTriggerValue.trim() : null,
      });
      notifySuccess('Question updated successfully.');
      onDataChanged();
    } catch (err) {
      notifyError(err instanceof Error ? err.message : 'Failed to update question.');
    } finally {
      setIsSaving(false);
    }
  }

  // ── Options subgrid ──
  const filteredOptions = useMemo(() => {
    if (!optionSearchTerm) return options;
    return options.filter((o) =>
      o.optionText.toLowerCase().includes(optionSearchTerm.toLowerCase()),
    );
  }, [options, optionSearchTerm]);

  const optionPageCount = Math.max(1, Math.ceil(filteredOptions.length / optionPageSize));
  const safeOptionPage = Math.min(optionPage, optionPageCount);
  const pagedOptions = filteredOptions.slice(
    (safeOptionPage - 1) * optionPageSize,
    safeOptionPage * optionPageSize,
  );

  const optionColumns: TableColumnDefinition<QuestionOptionConfig>[] = useMemo(
    () => [
      createTableColumn<QuestionOptionConfig>({
        columnId: 'optionText',
        compare: (a, b) => a.optionText.localeCompare(b.optionText),
        renderHeaderCell: () => 'Option Text',
        renderCell: (item) => (
          <span
            className={styles.nameLink}
            role="button"
            tabIndex={0}
            onClick={() => { setOptionEditItem(item); setOptionDialogOpen(true); }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOptionEditItem(item); setOptionDialogOpen(true); } }}
            aria-label={`Edit ${item.optionText}`}
          >
            {item.optionText}
          </span>
        ),
      }),
      createTableColumn<QuestionOptionConfig>({
        columnId: 'displayOrder',
        compare: (a, b) => a.displayOrder - b.displayOrder,
        renderHeaderCell: () => 'Display Order',
        renderCell: (item) => <Text>{item.displayOrder}</Text>,
      }),
      createTableColumn<QuestionOptionConfig>({
        columnId: 'isActive',
        compare: (a, b) => Number(a.isActive) - Number(b.isActive),
        renderHeaderCell: () => 'Is Active',
        renderCell: (item) => <Text>{item.isActive ? 'Yes' : 'No'}</Text>,
      }),
      createTableColumn<QuestionOptionConfig>({
        columnId: 'actions',
        renderHeaderCell: () => '',
        renderCell: (item) => (
          <Button
            appearance="subtle"
            icon={<DeleteRegular />}
            size="small"
            onClick={(e) => { e.stopPropagation(); setOptionDeleteTarget(item); }}
            aria-label={`Delete ${item.optionText}`}
            style={{ color: semanticColors.error }}
          />
        ),
      }),
    ],
    [styles.nameLink],
  );

  const optionColumnSizing = useMemo(
    () => ({
      optionText: { minWidth: 200, defaultWidth: 280 },
      displayOrder: { minWidth: 100, defaultWidth: 120 },
      isActive: { minWidth: 80, defaultWidth: 100 },
      actions: { minWidth: 40, defaultWidth: 48 },
    }),
    [],
  );

  async function handleOptionGridDeleteConfirm() {
    if (!optionDeleteTarget) return;
    try {
      await deleteQuestionOption(optionDeleteTarget.id);
      notifySuccess('Option deleted successfully.');
      setOptionDeleteTarget(null);
      void loadOptions();
    } catch (err) {
      notifyError(err instanceof Error ? err.message : 'Failed to delete option.');
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* ── Inline Question Form ── */}
      <Card className={surfaceStyles.surfaceCard}>
        <Text size={400} weight="semibold">Question Details</Text>

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
          />
        </Field>

        <div className={styles.formGrid}>
          <Field
            label={
              <InfoLabel info="The section this question appears under in the maker's questionnaire form.">
                Category
              </InfoLabel>
            }
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
              placeholder="Select category..."
            >
              {allCategories.map((c) => (
                <Option key={c.id} value={c.id} text={c.name}>{c.name}</Option>
              ))}
            </Combobox>
          </Field>

          <Field
            label={
              <InfoLabel info="Boolean = Yes/No toggle. Text = free-form input. Choice = single-select dropdown. MultiselectChoice = multi-select checkboxes. Date = date picker.">
                Answer Type
              </InfoLabel>
            }
            required
          >
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
                <Option key={t} value={t} text={t}>{t}</Option>
              ))}
            </Combobox>
          </Field>

          <Field
            label={
              <InfoLabel info="Controls the order this question appears within its category section.">
                Display Order
              </InfoLabel>
            }
            required
            validationState={showOrderError ? 'error' : 'none'}
            validationMessage={showOrderError ? 'Must be a positive number.' : undefined}
          >
            <Input type="number" value={displayOrder} onChange={(_, data) => setDisplayOrder(data.value)} min={1} />
          </Field>

          <div style={{ display: 'flex', gap: tokens.spacingHorizontalXL }}>
            <Field label="Is Required">
              <Switch checked={isRequired} onChange={(_, data) => setIsRequired(data.checked)} />
            </Field>
          </div>
        </div>

        <Field label="Tooltip Text">
          <Textarea value={tooltipText} onChange={(_, data) => setTooltipText(data.value)} rows={2} placeholder="Optional help text shown to makers..." />
        </Field>

        {/* Parent Details */}
        <div className={styles.section}>
          <Text weight="semibold" size={300}>Parent Details</Text>
          <div className={styles.formGrid}>
            <Field
              label={
                <InfoLabel info="Makes this question conditional - it only appears when the parent question has the specified trigger value.">
                  Parent Question
                </InfoLabel>
              }
            >
              <Combobox
                value={parentSearch}
                onInput={(e) => setParentSearch((e.target as HTMLInputElement).value)}
                onOptionSelect={(_, data) => {
                  const val = data.optionValue ?? null;
                  setParentQuestionId(val);
                  setParentSearch(data.optionText ?? '');
                  if (!val) setParentTriggerValue('');
                }}
                placeholder="None (always visible)"
                clearable
              >
                {otherQuestions.map((q) => (
                  <Option key={q.id} value={q.id} text={q.questionText}>{q.questionText}</Option>
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
                validationMessage={showTriggerError ? 'Required when parent is set.' : undefined}
              >
                <Input value={parentTriggerValue} onChange={(_, data) => setParentTriggerValue(data.value)} placeholder="e.g., true" />
              </Field>
            )}
          </div>
        </div>

        <div className={styles.formActions}>
          <Button
            appearance="primary"
            icon={<SaveRegular />}
            onClick={() => void handleSave()}
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </Card>

      {/* ── Answer Options Subgrid ── */}
      {showOptionsSubgrid && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <Text size={400} weight="semibold">Answer Options</Text>

          <div className={toolbarStyles.toolbar}>
            <Button
              appearance="primary"
              onClick={() => { setOptionEditItem(null); setOptionDialogOpen(true); }}
            >
              + New Option
            </Button>
            <Input
              className={styles.searchInput}
              contentBefore={<SearchRegular />}
              placeholder="Search options..."
              value={optionSearchTerm}
              onChange={(_, data) => { setOptionSearchTerm(data.value); setOptionPage(1); }}
            />
            <Button
              appearance="subtle"
              icon={<ArrowClockwise20Regular />}
              onClick={() => void loadOptions()}
              disabled={optionsLoading}
              aria-label="Refresh options"
            >
              Refresh
            </Button>
            {options.length > 0 && (
              <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                {options.length} {options.length === 1 ? 'option' : 'options'}
              </Text>
            )}
          </div>

          {optionsLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: tokens.spacingVerticalXXL }}>
              <Spinner label="Loading options..." />
            </div>
          ) : filteredOptions.length === 0 ? (
            optionSearchTerm ? (
              <MessageBar>
                <MessageBarBody>{`No options match "${optionSearchTerm}".`}</MessageBarBody>
              </MessageBar>
            ) : (
              <EmptyState
                icon={<QuestionCircleRegular />}
                title="No answer options yet"
                description="Define the answer choices that will appear in the maker's dropdown for this question."
                actionLabel="+ Create your first option"
                onAction={() => { setOptionEditItem(null); setOptionDialogOpen(true); }}
              />
            )
          ) : (
            <div className={tableStyles.tableShell}>
              <DataGrid
                items={pagedOptions}
                columns={optionColumns}
                columnSizingOptions={optionColumnSizing}
                resizableColumns
                sortable
                defaultSortState={{ sortColumn: 'displayOrder', sortDirection: 'ascending' }}
                getRowId={(item) => item.id}
                focusMode="composite"
              >
                <DataGridHeader>
                  <DataGridRow>
                    {({ renderHeaderCell }) => (
                      <DataGridHeaderCell className={styles.headerCell}>{renderHeaderCell()}</DataGridHeaderCell>
                    )}
                  </DataGridRow>
                </DataGridHeader>
                <DataGridBody<QuestionOptionConfig>>
                  {({ item, rowId }) => (
                    <DataGridRow<QuestionOptionConfig> key={rowId}>
                      {({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
                    </DataGridRow>
                  )}
                </DataGridBody>
              </DataGrid>

              <PaginationBar
                page={safeOptionPage}
                pageCount={optionPageCount}
                pageSize={optionPageSize}
                pageSizeOptions={PAGE_SIZE_OPTIONS}
                totalRecords={filteredOptions.length}
                onPageChange={(p) => setOptionPage(p)}
                onPageSizeChange={(size) => setOptionPageSize(size)}
              />
            </div>
          )}

          <QuestionOptionDialog
            open={optionDialogOpen}
            onClose={() => { setOptionDialogOpen(false); setOptionEditItem(null); }}
            onSaved={() => { setOptionDialogOpen(false); setOptionEditItem(null); void loadOptions(); }}
            editData={optionEditItem}
            choiceQuestions={[{ ...question, categoryName: category.name }]}
            defaultQuestionId={question.id}
          />
        </div>
      )}

      <DeleteConfirmDialog
        open={!!optionDeleteTarget}
        title="Delete Option"
        message={`Are you sure you want to delete "${optionDeleteTarget?.optionText ?? ''}"? This action cannot be undone.`}
        onConfirm={() => void handleOptionGridDeleteConfirm()}
        onCancel={() => setOptionDeleteTarget(null)}
        isSaving={false}
      />
    </div>
  );
}
