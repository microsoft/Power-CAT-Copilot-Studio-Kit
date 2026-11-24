import {
  Button,
  Dropdown,
  Option,
  Text,
  makeStyles,
  tokens,
  type OptionOnSelectData,
  type SelectionEvents,
} from '@fluentui/react-components';
import { ChevronLeftRegular, ChevronRightRegular } from '@fluentui/react-icons';

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const useStyles = makeStyles({
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: tokens.spacingVerticalS,
    paddingBottom: tokens.spacingVerticalS,
    paddingLeft: tokens.spacingHorizontalM,
    paddingRight: tokens.spacingHorizontalM,
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: tokens.colorNeutralStroke1,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  pageSizeSection: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    flex: '1',
  },
  label: {
    color: tokens.colorNeutralForeground2,
    whiteSpace: 'nowrap',
  },
  dropdown: {
    minWidth: '72px',
    width: '72px',
  },
  navigationSection: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXXS,
    justifyContent: 'center',
  },
  pageButton: {
    minWidth: '32px',
    height: '28px',
  },
  ellipsis: {
    minWidth: '24px',
    height: '28px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
  },
  totalSection: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flex: '1',
  },
  totalText: {
    color: tokens.colorNeutralForeground3,
    whiteSpace: 'nowrap',
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Generate page numbers with ellipsis for large page counts. */
function getPageNumbers(current: number, total: number): (number | 'ellipsis-start' | 'ellipsis-end')[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages: (number | 'ellipsis-start' | 'ellipsis-end')[] = [1];

  if (current > 3) {
    pages.push('ellipsis-start');
  }

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  if (current < total - 2) {
    pages.push('ellipsis-end');
  }

  if (total > 1) {
    pages.push(total);
  }

  return pages;
}

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

export interface PaginationBarProps {
  /** Current page, 1-indexed */
  page: number;
  /** Total number of pages */
  pageCount: number;
  /** Current page size */
  pageSize: number;
  /** Available page size options */
  pageSizeOptions: readonly number[];
  /** Total record count (after filtering) */
  totalRecords: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function PaginationBar({
  page,
  pageCount,
  pageSize,
  pageSizeOptions,
  totalRecords,
  onPageChange,
  onPageSizeChange,
}: PaginationBarProps) {
  const styles = useStyles();

  const safePage = Math.min(Math.max(1, page), Math.max(1, pageCount));
  const canGoPrev = safePage > 1;
  const canGoNext = safePage < pageCount;

  const handlePageSizeSelect = (_: SelectionEvents, data: OptionOnSelectData) => {
    if (data.optionValue) onPageSizeChange(parseInt(data.optionValue, 10));
  };

  const pageNumbers = getPageNumbers(safePage, pageCount);

  return (
    <div className={styles.container}>
      {/* Left: page size selector */}
      <div className={styles.pageSizeSection}>
        <Text size={200} className={styles.label}>Show</Text>
        <Dropdown
          size="small"
          value={pageSize.toString()}
          selectedOptions={[pageSize.toString()]}
          onOptionSelect={handlePageSizeSelect}
          className={styles.dropdown}
        >
          {pageSizeOptions.map((opt) => (
            <Option key={opt} value={opt.toString()}>{opt.toString()}</Option>
          ))}
        </Dropdown>
        <Text size={200} className={styles.label}>per page</Text>
      </div>

      {/* Center: page number navigation */}
      <div className={styles.navigationSection}>
        <Button
          appearance="subtle"
          size="small"
          icon={<ChevronLeftRegular />}
          disabled={!canGoPrev}
          className={styles.pageButton}
          onClick={() => onPageChange(safePage - 1)}
          aria-label="Previous page"
        />

        {pageNumbers.map((item) =>
          typeof item === 'string' ? (
            <span key={item} className={styles.ellipsis} aria-hidden="true">
              ···
            </span>
          ) : (
            <Button
              key={item}
              appearance={item === safePage ? 'primary' : 'subtle'}
              size="small"
              className={styles.pageButton}
              onClick={() => onPageChange(item)}
              aria-label={`Page ${item}`}
              aria-current={item === safePage ? 'page' : undefined}
            >
              {item}
            </Button>
          ),
        )}

        <Button
          appearance="subtle"
          size="small"
          icon={<ChevronRightRegular />}
          disabled={!canGoNext}
          className={styles.pageButton}
          onClick={() => onPageChange(safePage + 1)}
          aria-label="Next page"
        />
      </div>

      {/* Right: total record count */}
      <div className={styles.totalSection}>
        <Text size={200} className={styles.totalText}>
          {totalRecords} {totalRecords === 1 ? 'item' : 'items'}
        </Text>
      </div>
    </div>
  );
}
