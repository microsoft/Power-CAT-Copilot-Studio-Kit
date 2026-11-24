import { makeStyles, tokens, mergeClasses, Caption1, Button } from '@fluentui/react-components';
import { ChevronLeft16Regular, ChevronRight16Regular } from '@fluentui/react-icons';

/** Pagination controls (prev/next + numbered pages with ellipsis) for the All Agents table. */
interface AgentsTablePaginationProps {
  page: number;
  totalPages: number;
  totalRows: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

const useStyles = makeStyles({
  pagination: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: tokens.spacingVerticalM,
    paddingBottom: tokens.spacingVerticalM,
    paddingLeft: tokens.spacingHorizontalL,
    paddingRight: tokens.spacingHorizontalL,
    gap: tokens.spacingHorizontalM,
  },
  pageNote: { color: tokens.colorNeutralForeground3 },
  pageControls: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
  },
  pageButton: {
    minWidth: '32px',
    paddingLeft: tokens.spacingHorizontalXS,
    paddingRight: tokens.spacingHorizontalXS,
  },
  pageButtonActive: {
    backgroundColor: tokens.colorBrandBackground,
    color: tokens.colorNeutralForegroundOnBrand,
    ':hover': {
      backgroundColor: tokens.colorBrandBackgroundHover,
      color: tokens.colorNeutralForegroundOnBrand,
    },
  },
  ellipsis: {
    paddingLeft: tokens.spacingHorizontalXS,
    paddingRight: tokens.spacingHorizontalXS,
    color: tokens.colorNeutralForeground3,
  },
});

function getPageItems(current: number, total: number): (number | 'left-ellipsis' | 'right-ellipsis')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const items: (number | 'left-ellipsis' | 'right-ellipsis')[] = [];
  if (current <= 3) {
    items.push(1, 2, 3, 'right-ellipsis', total);
  } else if (current >= total - 2) {
    items.push(1, 'left-ellipsis', total - 2, total - 1, total);
  } else {
    items.push(1, 'left-ellipsis', current - 1, current, current + 1, 'right-ellipsis', total);
  }
  return items;
}

export function AgentsTablePagination({ page, totalPages, totalRows, pageSize, onPageChange }: AgentsTablePaginationProps) {
  const styles = useStyles();
  const start = totalRows === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalRows);
  const items = getPageItems(page, totalPages);

  return (
    <div className={styles.pagination}>
      <Caption1 className={styles.pageNote}>{`Showing ${start}–${end} of ${totalRows} agents`}</Caption1>
      <div className={styles.pageControls}>
        <Button
          appearance="subtle"
          size="small"
          icon={<ChevronLeft16Regular />}
          disabled={page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
          aria-label="Previous page"
        />
        {items.map((item, idx) => {
          if (item === 'left-ellipsis' || item === 'right-ellipsis') {
            return <span key={item} className={styles.ellipsis} aria-hidden>…</span>;
          }
          const isActive = item === page;
          return (
            <Button
              key={`p-${item}-${idx}`}
              appearance={isActive ? 'primary' : 'subtle'}
              size="small"
              className={mergeClasses(styles.pageButton, isActive && styles.pageButtonActive)}
              onClick={() => onPageChange(item)}
              aria-label={`Page ${item}`}
              aria-current={isActive ? 'page' : undefined}
            >
              {item}
            </Button>
          );
        })}
        <Button
          appearance="subtle"
          size="small"
          icon={<ChevronRight16Regular />}
          disabled={page >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          aria-label="Next page"
        />
      </div>
    </div>
  );
}
