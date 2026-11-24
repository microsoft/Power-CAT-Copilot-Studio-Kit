/**
 * Pagination Component
 *
 * Pagination controls with page size selector and navigation buttons.
 * Based on Figma node-id=25-262
 *
 * Layout:
 * - Border top: 0.8px solid #e0e0e0
 * - Height: 32px
 * - Left: Page size selector ("Show [dropdown] records per page")
 * - Right: Navigation (Previous, Page info, Next)
 */

import React from 'react';
import {
  Dropdown,
  Option,
  Button,
  makeStyles,
  mergeClasses,
  Text,
  type OptionOnSelectData,
  type SelectionEvents,
} from '@fluentui/react-components';
import {
  ChevronLeftRegular,
  ChevronRightRegular,
} from '@fluentui/react-icons';
import { useFilterContext } from '../../context/FilterContext';

/**
 * Pagination props
 */
export interface PaginationProps {
  /** Total filtered records (used for pagination math) */
  totalRecords: number;
  /** Total unfiltered records (shown in parentheses when a filter is active) */
  unfilteredCount?: number;
}

const useStyles = makeStyles({
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: '32px',
    paddingTop: '24px',
    borderTop: '1px solid #e0e0e0',
  },
  pageSizeSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  label: {
    fontSize: '14px',
    color: '#242424',
  },
  dropdown: {
    minWidth: '80px',
    width: '80px',
    height: '32px',
  },
  navigationSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  navButton: {
    height: '32px',
    border: '0.8px solid rgba(0,0,0,0)',
    borderRadius: '4px',
    '&:hover': {
      backgroundColor: '#f5f5f5',
    },
    '&:disabled': {
      color: '#bdbdbd',
    },
  },
  previousButton: {
    minWidth: '106px',
  },
  nextButton: {
    minWidth: '96px',
  },
  pageInfo: {
    fontSize: '14px',
    color: '#242424',
  },
});

/**
 * Pagination component
 *
 * Displays page size selector and navigation controls.
 *
 * @example
 * ```tsx
 * <Pagination totalRecords={150} />
 * ```
 */
export function Pagination({ totalRecords, unfilteredCount }: PaginationProps) {
  const styles = useStyles();
  const { currentPage, pageSize, setCurrentPage, setPageSize } = useFilterContext();

  const totalPages = Math.ceil(totalRecords / pageSize);
  const currentPageNum = currentPage + 1; // 0-indexed to 1-indexed
  const canGoPrevious = currentPage > 0;
  const canGoNext = currentPage < totalPages - 1;

  const handlePageSizeChange = (_: SelectionEvents, data: OptionOnSelectData) => {
    if (data.optionValue) {
      const newSize = parseInt(data.optionValue, 10);
      setPageSize(newSize);
    }
  };

  const handlePrevious = () => {
    if (canGoPrevious) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleNext = () => {
    if (canGoNext) {
      setCurrentPage(currentPage + 1);
    }
  };

  return (
    <div className={styles.container}>
      {/* Left: Page Size Selector */}
      <div className={styles.pageSizeSection}>
        <Text className={styles.label}>Show</Text>
        <Dropdown
          value={pageSize.toString()}
          selectedOptions={[pageSize.toString()]}
          onOptionSelect={handlePageSizeChange}
          className={styles.dropdown}
          aria-label="Records per page"
        >
          <Option value="5">5</Option>
          <Option value="10">10</Option>
          <Option value="25">25</Option>
          <Option value="50">50</Option>
          <Option value="100">100</Option>
        </Dropdown>
        <Text className={styles.label}>records per page</Text>
      </div>

      {/* Right: Navigation Controls */}
      <div className={styles.navigationSection}>
        <Button
          icon={<ChevronLeftRegular />}
          onClick={handlePrevious}
          disabled={!canGoPrevious}
          className={mergeClasses(styles.navButton, styles.previousButton)}
        >
          Previous
        </Button>

        <Text className={styles.pageInfo} aria-live="polite" aria-atomic="true">
          Page {currentPageNum} of {Math.max(1, totalPages)} ({totalRecords}{unfilteredCount !== undefined && unfilteredCount !== totalRecords ? ` of ${unfilteredCount}` : ''} total records)
        </Text>

        <Button
          icon={<ChevronRightRegular />}
          iconPosition="after"
          onClick={handleNext}
          disabled={!canGoNext}
          className={mergeClasses(styles.navButton, styles.nextButton)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
