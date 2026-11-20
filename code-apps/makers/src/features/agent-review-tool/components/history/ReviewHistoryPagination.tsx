import {
  Button,
  Dropdown,
  Label,
  Option,
  Text,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import {
  ChevronLeft16Regular,
  ChevronRight16Regular,
} from '@fluentui/react-icons';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
    padding: tokens.spacingVerticalM,
  },
  pages: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
    marginLeft: 'auto',
  },
  pageSize: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    '@media (max-width: 600px)': {
      width: '100%',
    },
  },
  dropdown: {
    minWidth: '80px',
    width: '80px',
  },
  pageInfo: {
    color: tokens.colorNeutralForeground2,
  },
  live: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    overflow: 'hidden',
    clip: 'rect(0 0 0 0)',
  },
});

export interface ReviewHistoryPaginationProps {
  page: number;
  pageCount: number;
  pageSize: number;
  totalCount: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

/**
 * Local history pagination aligned with the Agent Review home grid.
 */
export function ReviewHistoryPagination({
  page,
  pageCount,
  pageSize,
  totalCount,
  onPageChange,
  onPageSizeChange,
}: ReviewHistoryPaginationProps) {
  const styles = useStyles();

  return (
    <div className={styles.root}>
      <div className={styles.pageSize}>
        <Label htmlFor="review-history-page-size">Items per page</Label>
        <Dropdown
          id="review-history-page-size"
          className={styles.dropdown}
          value={String(pageSize)}
          selectedOptions={[String(pageSize)]}
          onOptionSelect={(_, data) =>
            onPageSizeChange(Number(data.optionValue))}
        >
          {[5, 10, 25].map((size) => (
            <Option key={size} value={String(size)} text={String(size)}>
              {size}
            </Option>
          ))}
        </Dropdown>
      </div>

      <div
        className={styles.pages}
        role="group"
        aria-label="Review history pages"
      >
        <Button
          appearance="subtle"
          icon={<ChevronLeft16Regular />}
          aria-label="Previous page"
          disabled={page === 0}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </Button>
        <Text className={styles.pageInfo}>
          Page {page + 1} of {pageCount} ({totalCount} reviews)
        </Text>
        <Button
          appearance="subtle"
          icon={<ChevronRight16Regular />}
          iconPosition="after"
          aria-label="Next page"
          disabled={page >= pageCount - 1}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>

      <div className={styles.live} aria-live="polite">
        Page {page + 1} of {pageCount}. {totalCount} reviews.
      </div>
    </div>
  );
}
