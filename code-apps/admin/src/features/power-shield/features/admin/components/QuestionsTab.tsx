import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  makeStyles,
  tokens,
  Text,
  Button,
  Input,
  Spinner,
  Tooltip,
  DataGrid,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridBody,
  DataGridRow,
  DataGridCell,
  createTableColumn,
  mergeClasses,
  MessageBar,
  MessageBarBody,
  Combobox,
  Option,
} from '@fluentui/react-components';
import type { TableColumnDefinition } from '@fluentui/react-components';
import {
  SearchRegular,
  ArrowClockwise20Regular,
  DeleteRegular,
} from '@fluentui/react-icons';
import { PaginationBar } from '../../../shared/components/PaginationBar';
import { semanticColors } from '../../../theme/powerShieldTheme.tokens';
import { useNotify } from '../../../shared/hooks/useNotify';
import { getQuestions, getQuestionCategories, deleteQuestion, getQuestionOptionsForQuestion } from '../services/questionConfigService';
import type { QuestionConfig, QuestionCategoryConfig } from '../../../models/questionConfig';
import { QuestionDialog } from './QuestionDialog';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';
import { EmptyState } from './EmptyState';
import { QuestionCircleRegular } from '@fluentui/react-icons';
import { useTableStyles, useToolbarStyles } from '../../../shared/styles';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_PAGE_SIZE = 5;
const PAGE_SIZE_OPTIONS = [5, 10, 25] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const useStyles = makeStyles({
  searchInput: {
    flex: '1',
    maxWidth: '280px',
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
  truncated: {
    maxWidth: '280px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

interface QuestionsTabProps {
  refreshKey: number;
  onRefreshOptions?: () => void;
  /** Report total entity count to parent for guide/badges */
  onCountChange?: (count: number) => void;
}

export function QuestionsTab({ refreshKey, onRefreshOptions, onCountChange }: QuestionsTabProps) {
  const styles = useStyles();
  const tableStyles = useTableStyles();
  const toolbarStyles = useToolbarStyles();
  const { notifySuccess, notifyError } = useNotify();

  const [questions, setQuestions] = useState<QuestionConfig[]>([]);
  const [categories, setCategories] = useState<QuestionCategoryConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [categoryFilterSearch, setCategoryFilterSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSizeRaw] = useState(DEFAULT_PAGE_SIZE);
  const [editItem, setEditItem] = useState<QuestionConfig | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<QuestionConfig | null>(null);

  const setPageSize = useCallback((size: number) => {
    setPageSizeRaw(size);
    setCurrentPage(1);
  }, []);

  async function fetchData() {
    setIsLoading(true);
    try {
      const [q, c] = await Promise.all([getQuestions(), getQuestionCategories()]);
      setQuestions(q);
      setCategories(c);
      onCountChange?.(q.length);
    } catch (err) {
      notifyError(err instanceof Error ? err.message : 'Failed to load questions.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const filtered = useMemo(() => {
    let result = questions;
    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      result = result.filter((q) => q.questionText.toLowerCase().includes(lower));
    }
    if (categoryFilter) {
      result = result.filter((q) => q.categoryId === categoryFilter);
    }
    return result;
  }, [questions, searchTerm, categoryFilter]);

  const totalFilteredCount = filtered.length;
  const pageCount = Math.max(1, Math.ceil(totalFilteredCount / pageSize));
  const safePage = Math.min(currentPage, pageCount);
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  function handleOpenCreate() {
    setEditItem(null);
    setDialogOpen(true);
  }

  function handleOpenEdit(item: QuestionConfig) {
    setEditItem(item);
    setDialogOpen(true);
  }

  function handleDialogClose() {
    setDialogOpen(false);
    setEditItem(null);
  }

  function handleSaved() {
    handleDialogClose();
    void fetchData();
  }

  async function handleGridDeleteClick(item: QuestionConfig) {
    try {
      const [childOptions, childQuestions] = await Promise.all([
        getQuestionOptionsForQuestion(item.id),
        Promise.resolve(questions.filter((q) => q.parentQuestionId === item.id)),
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
    setDeleteTarget(item);
  }

  async function handleGridDeleteConfirm() {
    if (!deleteTarget) return;
    try {
      await deleteQuestion(deleteTarget.id);
      notifySuccess('Question deleted successfully.');
      setDeleteTarget(null);
      void fetchData();
      onRefreshOptions?.();
    } catch (err) {
      notifyError(err instanceof Error ? err.message : 'Failed to delete question.');
    }
  }

  const columns: TableColumnDefinition<QuestionConfig>[] = useMemo(
    () => [
      createTableColumn<QuestionConfig>({
        columnId: 'questionText',
        compare: (a, b) => a.questionText.localeCompare(b.questionText),
        renderHeaderCell: () => 'Question Text',
        renderCell: (item) => (
          <Tooltip content={item.questionText} relationship="label">
            <span
              className={mergeClasses(styles.nameLink, styles.truncated)}
              role="button"
              tabIndex={0}
              onClick={() => handleOpenEdit(item)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleOpenEdit(item);
                }
              }}
              aria-label={`Edit ${item.questionText}`}
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
        columnId: 'categoryName',
        compare: (a, b) => (a.categoryName ?? '').localeCompare(b.categoryName ?? ''),
        renderHeaderCell: () => 'Category',
        renderCell: (item) => <Text>{item.categoryName || '-'}</Text>,
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
        renderHeaderCell: () => 'Is Required',
        renderCell: (item) => <Text>{item.isRequired ? 'Yes' : 'No'}</Text>,
      }),
      createTableColumn<QuestionConfig>({
        columnId: 'isActive',
        compare: (a, b) => Number(a.isActive) - Number(b.isActive),
        renderHeaderCell: () => 'Is Active',
        renderCell: (item) => <Text>{item.isActive ? 'Yes' : 'No'}</Text>,
      }),
      createTableColumn<QuestionConfig>({
        columnId: 'parentQuestion',
        renderHeaderCell: () => 'Parent Question',
        renderCell: (item) =>
          item.parentQuestionText ? (
            <Tooltip content={item.parentQuestionText} relationship="label">
              <span className={styles.truncated} style={{ display: 'block', maxWidth: '180px' }}>
                {item.parentQuestionText}
              </span>
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
            onClick={(e) => { e.stopPropagation(); void handleGridDeleteClick(item); }}
            aria-label={`Delete ${item.questionText}`}
            style={{ color: semanticColors.error }}
          />
        ),
      }),
    ],
    [styles.nameLink, styles.truncated],
  );

  const columnSizingOptions = useMemo(
    () => ({
      questionText: { minWidth: 200, defaultWidth: 300 },
      answerType: { minWidth: 100, defaultWidth: 140 },
      categoryName: { minWidth: 120, defaultWidth: 160 },
      displayOrder: { minWidth: 100, defaultWidth: 120 },
      isRequired: { minWidth: 80, defaultWidth: 100 },
      isActive: { minWidth: 80, defaultWidth: 100 },
      parentQuestion: { minWidth: 140, defaultWidth: 200 },
      actions: { minWidth: 40, defaultWidth: 48 },
    }),
    [],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div className={toolbarStyles.toolbar}>
        <Button appearance="primary" onClick={handleOpenCreate}>
          + New Question
        </Button>
        <Input
          className={styles.searchInput}
          contentBefore={<SearchRegular />}
          placeholder="Search by question text..."
          value={searchTerm}
          onChange={(_, data) => {
            setSearchTerm(data.value);
            setCurrentPage(1);
          }}
        />
        <Combobox
          value={categoryFilterSearch}
          onInput={(e) => setCategoryFilterSearch((e.target as HTMLInputElement).value)}
          onOptionSelect={(_, data) => {
            setCategoryFilter(data.optionValue ?? '');
            setCategoryFilterSearch(data.optionText ?? '');
            setCurrentPage(1);
          }}
          placeholder="All categories"
          clearable
          style={{ minWidth: '180px' }}
        >
          {categories.map((c) => (
            <Option key={c.id} value={c.id} text={c.name}>
              {c.name}
            </Option>
          ))}
        </Combobox>
        <Button
          appearance="subtle"
          icon={<ArrowClockwise20Regular />}
          onClick={() => void fetchData()}
          disabled={isLoading}
          aria-label="Refresh"
        >
          Refresh
        </Button>
        {questions.length > 0 && (
          <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
            {totalFilteredCount} {totalFilteredCount === 1 ? 'question' : 'questions'}
          </Text>
        )}
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: tokens.spacingVerticalXXL }}>
          <Spinner label="Loading questions..." />
        </div>
      ) : filtered.length === 0 ? (
        searchTerm || categoryFilter ? (
          <MessageBar>
            <MessageBarBody>
              No questions match the current filters.
            </MessageBarBody>
          </MessageBar>
        ) : (
          <EmptyState
            icon={<QuestionCircleRegular />}
            title="No questions yet"
            description="Questions are what makers answer when submitting a connector access request. Each question belongs to a category and has an answer type (Boolean, Text, Choice, Date)."
            prerequisiteWarning={categories.length === 0 ? 'Create at least one category first before adding questions.' : undefined}
            actionLabel="+ Create your first question"
            onAction={handleOpenCreate}
            actionDisabled={categories.length === 0}
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
                  <DataGridHeaderCell className={styles.headerCell}>
                    {renderHeaderCell()}
                  </DataGridHeaderCell>
                )}
              </DataGridRow>
            </DataGridHeader>
            <DataGridBody<QuestionConfig>>
              {({ item, rowId }) => (
                <DataGridRow<QuestionConfig> key={rowId}>
                  {({ renderCell }) => (
                    <DataGridCell>{renderCell(item)}</DataGridCell>
                  )}
                </DataGridRow>
              )}
            </DataGridBody>
          </DataGrid>

          <PaginationBar
            page={safePage}
            pageCount={pageCount}
            pageSize={pageSize}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
            totalRecords={totalFilteredCount}
            onPageChange={(p) => setCurrentPage(p)}
            onPageSizeChange={(size) => setPageSize(size)}
          />
        </div>
      )}

      <QuestionDialog
        open={dialogOpen}
        onClose={handleDialogClose}
        onSaved={handleSaved}
        editData={editItem}
        categories={categories}
        allQuestions={questions}
      />

      <DeleteConfirmDialog
        open={!!deleteTarget}
        title="Delete Question"
        message={`Are you sure you want to delete "${deleteTarget?.questionText ?? ''}"? This action cannot be undone.`}
        onConfirm={() => void handleGridDeleteConfirm()}
        onCancel={() => setDeleteTarget(null)}
        isSaving={false}
      />
    </div>
  );
}
