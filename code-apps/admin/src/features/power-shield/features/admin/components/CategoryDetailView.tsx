import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  makeStyles,
  tokens,
  Text,
  Button,
  Input,
  Field,
  Spinner,
  Tooltip,
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
  updateQuestionCategory,
  getQuestions,
  deleteQuestion,
  getQuestionOptionsForQuestion,
  getQuestionCategories as getQuestionCategoriesForDialog,
} from '../services/questionConfigService';
import type {
  QuestionCategoryConfig,
  QuestionConfig,
} from '../../../models/questionConfig';
import { QuestionDialog } from './QuestionDialog';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';
import { EmptyState } from './EmptyState';
import { useSurfaceStyles, useTableStyles, useToolbarStyles } from '../../../shared/styles';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_PAGE_SIZE = 5;
const PAGE_SIZE_OPTIONS = [5, 10, 25] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const useStyles = makeStyles({
  formGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: tokens.spacingHorizontalL,
    '@media (max-width: 640px)': {
      gridTemplateColumns: '1fr',
    },
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

interface CategoryDetailViewProps {
  category: QuestionCategoryConfig;
  onDrillToQuestion: (question: QuestionConfig) => void;
  /** Called after save/delete so parent can refresh */
  onDataChanged: () => void;
}

export function CategoryDetailView({
  category,
  onDrillToQuestion,
  onDataChanged,
}: CategoryDetailViewProps) {
  const styles = useStyles();
  const surfaceStyles = useSurfaceStyles();
  const tableStyles = useTableStyles();
  const toolbarStyles = useToolbarStyles();
  const { notifySuccess, notifyError } = useNotify();

  // ── Form state ──
  const [name, setName] = useState(category.name);
  const [displayOrder, setDisplayOrder] = useState(String(category.displayOrder));
  const [isSaving, setIsSaving] = useState(false);
  const [hasAttemptedSave, setHasAttemptedSave] = useState(false);

  // ── Questions subgrid state ──
  const [allQuestions, setAllQuestions] = useState<QuestionConfig[]>([]);
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSizeRaw] = useState(DEFAULT_PAGE_SIZE);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [questionDeleteTarget, setQuestionDeleteTarget] = useState<QuestionConfig | null>(null);

  const setPageSize = useCallback((size: number) => {
    setPageSizeRaw(size);
    setCurrentPage(1);
  }, []);

  // ── Data loading ──
  async function loadQuestions() {
    setIsLoadingQuestions(true);
    try {
      const qs = await getQuestions();
      setAllQuestions(qs);
    } catch (err) {
      notifyError(err instanceof Error ? err.message : 'Failed to load questions.');
    } finally {
      setIsLoadingQuestions(false);
    }
  }

  useEffect(() => {
    void loadQuestions();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category.id]);

  // Questions filtered to this category
  const categoryQuestions = useMemo(
    () => allQuestions.filter((q) => q.categoryId === category.id),
    [allQuestions, category.id],
  );

  const filtered = useMemo(() => {
    if (!searchTerm) return categoryQuestions;
    return categoryQuestions.filter((q) =>
      q.questionText.toLowerCase().includes(searchTerm.toLowerCase()),
    );
  }, [categoryQuestions, searchTerm]);

  const totalFiltered = filtered.length;
  const pageCount = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const safePage = Math.min(currentPage, pageCount);
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  // ── Form validation ──
  const nameInvalid = !name.trim();
  const orderInvalid = !displayOrder.trim() || isNaN(Number(displayOrder)) || Number(displayOrder) < 1;
  const showNameError = hasAttemptedSave && nameInvalid;
  const showOrderError = hasAttemptedSave && orderInvalid;

  // ── Save ──
  async function handleSave() {
    setHasAttemptedSave(true);
    if (nameInvalid || orderInvalid) return;

    setIsSaving(true);
    try {
      await updateQuestionCategory(category.id, {
        name: name.trim(),
        displayOrder: Number(displayOrder),
        isActive: category.isActive,
      });
      notifySuccess('Category updated successfully.');
      onDataChanged();
    } catch (err) {
      notifyError(err instanceof Error ? err.message : 'Failed to update category.');
    } finally {
      setIsSaving(false);
    }
  }

  // ── Question delete from grid ──
  async function handleQuestionDeleteClick(item: QuestionConfig) {
    try {
      const [childOptions, childQuestions] = await Promise.all([
        getQuestionOptionsForQuestion(item.id),
        Promise.resolve(allQuestions.filter((q) => q.parentQuestionId === item.id)),
      ]);
      if (childOptions.length > 0 || childQuestions.length > 0) {
        const parts: string[] = [];
        if (childOptions.length > 0) parts.push(`${childOptions.length} option${childOptions.length > 1 ? 's' : ''}`);
        if (childQuestions.length > 0) parts.push(`${childQuestions.length} child question${childQuestions.length > 1 ? 's' : ''}`);
        notifyError(`This question has ${parts.join(' and ')}. Delete them first.`);
        return;
      }
    } catch {
      // If check fails, still allow the user to try deleting
    }
    setQuestionDeleteTarget(item);
  }

  async function handleQuestionDeleteConfirm() {
    if (!questionDeleteTarget) return;
    try {
      await deleteQuestion(questionDeleteTarget.id);
      notifySuccess('Question deleted successfully.');
      setQuestionDeleteTarget(null);
      void loadQuestions();
      onDataChanged();
    } catch (err) {
      notifyError(err instanceof Error ? err.message : 'Failed to delete question.');
    }
  }

  // ── Questions grid columns ──
  const columns: TableColumnDefinition<QuestionConfig>[] = useMemo(
    () => [
      createTableColumn<QuestionConfig>({
        columnId: 'questionText',
        compare: (a, b) => a.questionText.localeCompare(b.questionText),
        renderHeaderCell: () => 'Question Text',
        renderCell: (item) => (
          <Tooltip content={item.questionText} relationship="label" withArrow>
            <span
              className={styles.nameLink}
              role="button"
              tabIndex={0}
              onClick={() => onDrillToQuestion(item)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onDrillToQuestion(item); } }}
              aria-label={`Open ${item.questionText}`}
              style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {item.questionText}
            </span>
          </Tooltip>
        ),
      }),
      createTableColumn<QuestionConfig>({
        columnId: 'answerType',
        compare: (a, b) => a.answerType.localeCompare(b.answerType),
        renderHeaderCell: () => 'Answer Type',
        renderCell: (item) => <Text>{item.answerType}</Text>,
      }),
      createTableColumn<QuestionConfig>({
        columnId: 'displayOrder',
        compare: (a, b) => a.displayOrder - b.displayOrder,
        renderHeaderCell: () => 'Display Order',
        renderCell: (item) => <Text>{item.displayOrder}</Text>,
      }),
      createTableColumn<QuestionConfig>({
        columnId: 'isRequired',
        compare: (a, b) => Number(a.isRequired) - Number(b.isRequired),
        renderHeaderCell: () => 'Required',
        renderCell: (item) => <Text>{item.isRequired ? 'Yes' : 'No'}</Text>,
      }),
      createTableColumn<QuestionConfig>({
        columnId: 'isActive',
        compare: (a, b) => Number(a.isActive) - Number(b.isActive),
        renderHeaderCell: () => 'Active',
        renderCell: (item) => <Text>{item.isActive ? 'Yes' : 'No'}</Text>,
      }),
      createTableColumn<QuestionConfig>({
        columnId: 'parentQuestion',
        renderHeaderCell: () => 'Parent Question',
        renderCell: (item) =>
          item.parentQuestionText ? (
            <Tooltip content={item.parentQuestionText} relationship="label" withArrow>
              <Text style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.parentQuestionText}
              </Text>
            </Tooltip>
          ) : (
            <Text style={{ color: tokens.colorNeutralForeground3 }}>-</Text>
          ),
      }),
      createTableColumn<QuestionConfig>({
        columnId: 'actions',
        renderHeaderCell: () => '',
        renderCell: (item) => (
          <Button
            appearance="subtle"
            icon={<DeleteRegular />}
            size="small"
            onClick={(e) => { e.stopPropagation(); void handleQuestionDeleteClick(item); }}
            aria-label={`Delete ${item.questionText}`}
            style={{ color: semanticColors.error }}
          />
        ),
      }),
    ],
    [styles.nameLink, onDrillToQuestion],
  );

  const columnSizingOptions = useMemo(
    () => ({
      questionText: { minWidth: 200, defaultWidth: 300 },
      answerType: { minWidth: 100, defaultWidth: 140 },
      displayOrder: { minWidth: 80, defaultWidth: 100 },
      isRequired: { minWidth: 70, defaultWidth: 80 },
      isActive: { minWidth: 70, defaultWidth: 80 },
      parentQuestion: { minWidth: 150, defaultWidth: 200 },
      actions: { minWidth: 40, defaultWidth: 48 },
    }),
    [],
  );

  // All categories needed for the create dialog
  const [allCategories, setAllCategories] = useState<QuestionCategoryConfig[]>([]);
  useEffect(() => {
    getQuestionCategoriesForDialog().then(setAllCategories).catch(() => { /* non-critical */ });
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* ── Inline Category Form ── */}
      <Card className={surfaceStyles.surfaceCard}>
        <Text size={400} weight="semibold">Category Details</Text>

        <div className={styles.formGrid}>
          <Field
            label="Name"
            required
            validationState={showNameError ? 'error' : 'none'}
            validationMessage={showNameError ? 'Name is required.' : undefined}
          >
            <Input value={name} onChange={(_, data) => setName(data.value)} placeholder="e.g., Guest Access" />
          </Field>

          <Field
            label={
              <InfoLabel info="Controls the order this section appears in the maker's questionnaire form. Lower numbers appear first.">
                Display Order
              </InfoLabel>
            }
            required
            validationState={showOrderError ? 'error' : 'none'}
            validationMessage={showOrderError ? 'Must be a positive number.' : undefined}
          >
            <Input type="number" value={displayOrder} onChange={(_, data) => setDisplayOrder(data.value)} min={1} />
          </Field>
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <Text size={400} weight="semibold">Questions in this Category</Text>

        <div className={toolbarStyles.toolbar}>
          <Button appearance="primary" onClick={() => setCreateDialogOpen(true)}>
            + New Question
          </Button>
          <Input
            className={styles.searchInput}
            contentBefore={<SearchRegular />}
            placeholder="Search questions..."
            value={searchTerm}
            onChange={(_, data) => { setSearchTerm(data.value); setCurrentPage(1); }}
          />
          <Button
            appearance="subtle"
            icon={<ArrowClockwise20Regular />}
            onClick={() => void loadQuestions()}
            disabled={isLoadingQuestions}
            aria-label="Refresh questions"
          >
            Refresh
          </Button>
          {categoryQuestions.length > 0 && (
            <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
              {categoryQuestions.length} {categoryQuestions.length === 1 ? 'question' : 'questions'}
            </Text>
          )}
        </div>

        {isLoadingQuestions ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: tokens.spacingVerticalXXL }}>
            <Spinner label="Loading questions..." />
          </div>
        ) : filtered.length === 0 ? (
          searchTerm ? (
            <MessageBar>
              <MessageBarBody>{`No questions match "${searchTerm}".`}</MessageBarBody>
            </MessageBar>
          ) : (
            <EmptyState
              icon={<QuestionCircleRegular />}
              title="No questions in this category"
              description="Questions are what makers answer when submitting a policy request. Their responses help you make approval decisions."
              actionLabel="+ Create your first question"
              onAction={() => setCreateDialogOpen(true)}
            />
          )
        ) : (
          <div className={tableStyles.tableShell}>
            <DataGrid
              items={paged}
              columns={columns}
              columnSizingOptions={columnSizingOptions}
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
              <DataGridBody<QuestionConfig>>
                {({ item, rowId }) => (
                  <DataGridRow<QuestionConfig> key={rowId}>
                    {({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
                  </DataGridRow>
                )}
              </DataGridBody>
            </DataGrid>

            <PaginationBar
              page={safePage}
              pageCount={pageCount}
              pageSize={pageSize}
              pageSizeOptions={PAGE_SIZE_OPTIONS}
              totalRecords={totalFiltered}
              onPageChange={(p) => setCurrentPage(p)}
              onPageSizeChange={(size) => setPageSize(size)}
            />
          </div>
        )}

        <QuestionDialog
          open={createDialogOpen}
          onClose={() => setCreateDialogOpen(false)}
          onSaved={() => { setCreateDialogOpen(false); void loadQuestions(); onDataChanged(); }}
          onCreatedChoiceQuestion={(newId) => {
            setCreateDialogOpen(false);
            void loadQuestions().then(() => {
              // Find and drill into the newly created question
              getQuestions().then((qs) => {
                const newQ = qs.find((q) => q.id === newId);
                if (newQ) onDrillToQuestion(newQ);
              }).catch(() => { /* non-critical */ });
            });
            onDataChanged();
          }}
          editData={null}
          categories={allCategories}
          allQuestions={allQuestions}
          defaultCategoryId={category.id}
        />
      </div>

      <DeleteConfirmDialog
        open={!!questionDeleteTarget}
        title="Delete Question"
        message={`Are you sure you want to delete "${questionDeleteTarget?.questionText ?? ''}"? This action cannot be undone.`}
        onConfirm={() => void handleQuestionDeleteConfirm()}
        onCancel={() => setQuestionDeleteTarget(null)}
        isSaving={false}
      />
    </div>
  );
}
