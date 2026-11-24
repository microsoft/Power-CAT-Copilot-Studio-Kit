import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  makeStyles,
  tokens,
  Text,
  Button,
  Input,
  Spinner,
  DataGrid,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridBody,
  DataGridRow,
  DataGridCell,
  createTableColumn,
  MessageBar,
  MessageBarBody,
  Badge,
} from '@fluentui/react-components';
import type { TableColumnDefinition } from '@fluentui/react-components';
import {
  SearchRegular,
  ArrowClockwise20Regular,
  FolderRegular,
  DeleteRegular,
} from '@fluentui/react-icons';
import { PaginationBar } from '../../../shared/components/PaginationBar';
import { semanticColors } from '../../../theme/powerShieldTheme.tokens';
import { useNotify } from '../../../shared/hooks/useNotify';
import { getQuestionCategories, getQuestions, deleteQuestionCategory } from '../services/questionConfigService';
import type { QuestionCategoryConfig } from '../../../models/questionConfig';
import type { QuestionConfig } from '../../../models/questionConfig';
import { CategoryDialog } from './CategoryDialog';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';
import { EmptyState } from './EmptyState';
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

interface CategoriesTabProps {
  refreshKey: number;
  /** Drill into a category detail view */
  onDrillIn?: (category: QuestionCategoryConfig) => void;
  /** Report total entity count to parent for guide */
  onCountChange?: (count: number) => void;
  /** Report total questions count */
  onQuestionsCountChange?: (count: number) => void;
}

export function CategoriesTab({ refreshKey, onDrillIn, onCountChange, onQuestionsCountChange }: CategoriesTabProps) {
  const styles = useStyles();
  const tableStyles = useTableStyles();
  const toolbarStyles = useToolbarStyles();
  const { notifyError, notifySuccess } = useNotify();

  const [items, setItems] = useState<QuestionCategoryConfig[]>([]);
  const [allQuestions, setAllQuestions] = useState<QuestionConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSizeRaw] = useState(DEFAULT_PAGE_SIZE);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<QuestionCategoryConfig | null>(null);

  const setPageSize = useCallback((size: number) => {
    setPageSizeRaw(size);
    setCurrentPage(1);
  }, []);

  async function fetchData() {
    setIsLoading(true);
    try {
      const [cats, qs] = await Promise.all([
        getQuestionCategories(),
        getQuestions(),
      ]);
      setItems(cats);
      setAllQuestions(qs);
      onCountChange?.(cats.length);
      onQuestionsCountChange?.(qs.length);
    } catch (err) {
      notifyError(err instanceof Error ? err.message : 'Failed to load categories.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const filtered = useMemo(
    () =>
      items.filter(
        (c) => !searchTerm || c.name.toLowerCase().includes(searchTerm.toLowerCase()),
      ),
    [items, searchTerm],
  );

  const totalFilteredCount = filtered.length;
  const pageCount = Math.max(1, Math.ceil(totalFilteredCount / pageSize));
  const safePage = Math.min(currentPage, pageCount);
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  function handleOpenCreate() {
    setDialogOpen(true);
  }

  function handleDialogClose() {
    setDialogOpen(false);
  }

  function handleSaved() {
    handleDialogClose();
    void fetchData();
  }

  function handleDeleteClick(item: QuestionCategoryConfig) {
    const qCount = questionCountMap.get(item.id) ?? 0;
    if (qCount > 0) {
      notifyError(`This category has ${qCount} question${qCount > 1 ? 's' : ''}. Delete all questions first.`);
      return;
    }
    setDeleteTarget(item);
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    try {
      await deleteQuestionCategory(deleteTarget.id);
      notifySuccess('Category deleted successfully.');
      setDeleteTarget(null);
      void fetchData();
    } catch (err) {
      notifyError(err instanceof Error ? err.message : 'Failed to delete category.');
    }
  }

  // Count questions per category for the grid
  const questionCountMap = useMemo(() => {
    const map = new Map<string, number>();
    allQuestions.forEach((q) => {
      map.set(q.categoryId, (map.get(q.categoryId) ?? 0) + 1);
    });
    return map;
  }, [allQuestions]);

  const columns: TableColumnDefinition<QuestionCategoryConfig>[] = useMemo(
    () => [
      createTableColumn<QuestionCategoryConfig>({
        columnId: 'name',
        compare: (a, b) => a.name.localeCompare(b.name),
        renderHeaderCell: () => 'Name',
        renderCell: (item) => (
          <span
            className={styles.nameLink}
            role="button"
            tabIndex={0}
            onClick={() => onDrillIn?.(item)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onDrillIn?.(item);
              }
            }}
            aria-label={`Open ${item.name}`}
          >
            {item.name}
          </span>
        ),
      }),
      createTableColumn<QuestionCategoryConfig>({
        columnId: 'questions',
        compare: (a, b) => (questionCountMap.get(a.id) ?? 0) - (questionCountMap.get(b.id) ?? 0),
        renderHeaderCell: () => 'Questions',
        renderCell: (item) => {
          const count = questionCountMap.get(item.id) ?? 0;
          return (
            <Badge
              appearance="tint"
              color={count > 0 ? 'informative' : 'subtle'}
              size="small"
            >
              {count}
            </Badge>
          );
        },
      }),
      createTableColumn<QuestionCategoryConfig>({
        columnId: 'displayOrder',
        compare: (a, b) => a.displayOrder - b.displayOrder,
        renderHeaderCell: () => 'Display Order',
        renderCell: (item) => <Text>{item.displayOrder}</Text>,
      }),
      createTableColumn<QuestionCategoryConfig>({
        columnId: 'isActive',
        compare: (a, b) => Number(a.isActive) - Number(b.isActive),
        renderHeaderCell: () => 'Is Active',
        renderCell: (item) => <Text>{item.isActive ? 'Yes' : 'No'}</Text>,
      }),
      createTableColumn<QuestionCategoryConfig>({
        columnId: 'actions',
        renderHeaderCell: () => '',
        renderCell: (item) => (
          <Button
            appearance="subtle"
            icon={<DeleteRegular />}
            size="small"
            onClick={(e) => { e.stopPropagation(); handleDeleteClick(item); }}
            aria-label={`Delete ${item.name}`}
            style={{ color: semanticColors.error }}
          />
        ),
      }),
    ],
    [styles.nameLink, questionCountMap, onDrillIn],
  );

  const columnSizingOptions = useMemo(
    () => ({
      name: { minWidth: 200, defaultWidth: 250 },
      questions: { minWidth: 80, defaultWidth: 100 },
      displayOrder: { minWidth: 100, defaultWidth: 120 },
      isActive: { minWidth: 80, defaultWidth: 100 },
      actions: { minWidth: 40, defaultWidth: 48 },
    }),
    [],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div className={toolbarStyles.toolbar}>
        <Button appearance="primary" onClick={handleOpenCreate}>
          + New Category
        </Button>
        <Input
          className={styles.searchInput}
          contentBefore={<SearchRegular />}
          placeholder="Search by name..."
          value={searchTerm}
          onChange={(_, data) => {
            setSearchTerm(data.value);
            setCurrentPage(1);
          }}
        />
        <Button
          appearance="subtle"
          icon={<ArrowClockwise20Regular />}
          onClick={() => void fetchData()}
          disabled={isLoading}
          aria-label="Refresh"
        >
          Refresh
        </Button>
        {items.length > 0 && (
          <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
            {filteredCount(totalFilteredCount, 'category', 'categories')}
          </Text>
        )}
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: tokens.spacingVerticalXXL }}>
          <Spinner label="Loading categories..." />
        </div>
      ) : filtered.length === 0 ? (
        searchTerm ? (
          <MessageBar>
            <MessageBarBody>
              {`No categories match "${searchTerm}".`}
            </MessageBarBody>
          </MessageBar>
        ) : (
          <EmptyState
            icon={<FolderRegular />}
            title="No categories yet"
            description="Categories are sections that organize your questionnaire. Start by creating categories, then add questions inside each one. The questionnaire will appear in Step 2 of maker policy requests."
            examples='Examples: "Guest Access", "Power Pages", "AI Builder"'
            actionLabel="+ Create your first category"
            onAction={handleOpenCreate}
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
            <DataGridBody<QuestionCategoryConfig>>
              {({ item, rowId }) => (
                <DataGridRow<QuestionCategoryConfig> key={rowId}>
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

      <CategoryDialog
        open={dialogOpen}
        onClose={handleDialogClose}
        onSaved={handleSaved}
        editData={null}
      />

      <DeleteConfirmDialog
        open={!!deleteTarget}
        title="Delete Category"
        message={`Are you sure you want to delete "${deleteTarget?.name ?? ''}"? This action cannot be undone.`}
        onConfirm={() => void handleDeleteConfirm()}
        onCancel={() => setDeleteTarget(null)}
        isSaving={false}
      />
    </div>
  );
}

function filteredCount(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
