import { useState, type ReactNode } from 'react';
import { Button, Text, makeStyles, tokens } from '@fluentui/react-components';
import { ChevronLeft16Regular, ChevronRight16Regular } from '@fluentui/react-icons';

// Fixed heights make the inline preview height a function of the row count,
// so an inline view can choose a row count that fits without a scroll.
export const INLINE_PREVIEW_ROW_HEIGHT = 32;
export const INLINE_PREVIEW_FOOTER_HEIGHT = 40;
export const INLINE_PREVIEW_CAPTION_HEIGHT = 24;
export const INLINE_PREVIEW_MAX_ROWS = 5;
const INLINE_PREVIEW_BORDER_HEIGHT = 2;

/** The number of preview rows, from 1 to 5, that fits in the available height. */
export function inlinePreviewRows(available: number, options: { caption?: boolean } = {}): number {
  const room = available - INLINE_PREVIEW_BORDER_HEIGHT - INLINE_PREVIEW_FOOTER_HEIGHT
    - (options.caption ? INLINE_PREVIEW_CAPTION_HEIGHT : 0);
  const rows = Math.floor(room / INLINE_PREVIEW_ROW_HEIGHT);
  return Math.max(1, Math.min(INLINE_PREVIEW_MAX_ROWS, Number.isFinite(rows) ? rows : 1));
}

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    overflow: 'hidden',
    boxSizing: 'border-box',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  caption: {
    display: 'block',
    flexShrink: 0,
    height: `${INLINE_PREVIEW_CAPTION_HEIGHT}px`,
    boxSizing: 'border-box',
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
    color: tokens.colorNeutralForeground2,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  list: {
    listStyleType: 'none',
    margin: 0,
    padding: 0,
    minWidth: 0,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    height: `${INLINE_PREVIEW_ROW_HEIGHT}px`,
    boxSizing: 'border-box',
    minWidth: 0,
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    ':not(:first-child)': { borderTop: `1px solid ${tokens.colorNeutralStroke3}` },
  },
  rowContent: {
    display: 'flex',
    alignItems: 'center',
    flex: '1 1 auto',
    minWidth: 0,
    height: '100%',
    boxSizing: 'border-box',
    paddingLeft: tokens.spacingHorizontalM,
    paddingRight: tokens.spacingHorizontalM,
    overflow: 'hidden',
    whiteSpace: 'nowrap',
  },
  rowButton: {
    border: 'none',
    margin: 0,
    backgroundColor: 'transparent',
    color: 'inherit',
    fontFamily: 'inherit',
    fontSize: 'inherit',
    lineHeight: 'inherit',
    textAlign: 'left',
    cursor: 'pointer',
    ':hover': { backgroundColor: tokens.colorSubtleBackgroundHover },
    ':active': { backgroundColor: tokens.colorSubtleBackgroundPressed },
    ':focus-visible': {
      outline: `2px solid ${tokens.colorStrokeFocus2}`,
      outlineOffset: '-2px',
    },
  },
  empty: {
    display: 'flex',
    alignItems: 'center',
    height: `${INLINE_PREVIEW_ROW_HEIGHT}px`,
    boxSizing: 'border-box',
    paddingLeft: tokens.spacingHorizontalM,
    paddingRight: tokens.spacingHorizontalM,
    color: tokens.colorNeutralForeground2,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: tokens.spacingHorizontalS,
    flexShrink: 0,
    height: `${INLINE_PREVIEW_FOOTER_HEIGHT}px`,
    boxSizing: 'border-box',
    paddingLeft: tokens.spacingHorizontalM,
    paddingRight: tokens.spacingHorizontalS,
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    minWidth: 0,
    overflow: 'hidden',
  },
  summary: {
    minWidth: 0,
    color: tokens.colorNeutralForeground2,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    columnGap: tokens.spacingHorizontalXS,
    flexShrink: 0,
  },
});

export interface InlinePreviewListProps<T> {
  /** Accessible name of the list. */
  label: string;
  items: readonly T[];
  /** Rows per page; see `inlinePreviewRows`. */
  maxRows: number;
  noun: { one: string; other: string };
  getKey: (item: T, index: number) => string;
  /** Row content. It must be phrasing content, because a row can be a button. */
  renderRow: (item: T, index: number) => ReactNode;
  /** Makes each row a button that opens the item, for example in full screen. */
  onOpenItem?: (item: T, index: number) => void;
  itemTitle?: (item: T, index: number) => string;
  /** Shows the first rows and a show-all action. Without it, the list pages its rows. */
  onShowAll?: () => void;
  showAllLabel?: string;
  emptyText?: string;
  caption?: string;
}

/**
 * A finite, fixed-height list for an inline view. It never scrolls: it shows
 * the first rows with a show-all action, or pages its rows when no show-all
 * action is available.
 */
export function InlinePreviewList<T>({
  label,
  items,
  maxRows,
  noun,
  getKey,
  renderRow,
  onOpenItem,
  itemTitle,
  onShowAll,
  showAllLabel,
  emptyText,
  caption,
}: InlinePreviewListProps<T>) {
  const styles = useStyles();
  const [page, setPage] = useState(0);
  const [pagedItems, setPagedItems] = useState(items);
  if (pagedItems !== items) {
    setPagedItems(items);
    setPage(0);
  }
  const total = items.length;
  const rows = Math.max(1, Math.floor(maxRows) || 1);
  const paged = !onShowAll;
  const pageCount = Math.max(1, Math.ceil(total / rows));
  const currentPage = paged ? Math.min(page, pageCount - 1) : 0;
  const start = currentPage * rows;
  const shown = items.slice(start, start + rows);
  const nounFor = (count: number) => (count === 1 ? noun.one : noun.other);
  const summary = !total
    ? ''
    : !paged || pageCount === 1
      ? `Showing ${shown.length} of ${total} ${nounFor(total)}`
      : `Showing ${start + 1}–${start + shown.length} of ${total} ${noun.other}`;
  const showAction = Boolean(onShowAll && showAllLabel);
  const showPager = paged && pageCount > 1;
  return (
    <div className={styles.root}>
      {caption ? <Text size={200} className={styles.caption}>{caption}</Text> : null}
      {total ? (
        <ul className={styles.list} aria-label={label}>
          {shown.map((item, offset) => {
            const index = start + offset;
            return (
              <li key={getKey(item, index)} className={styles.row}>
                {onOpenItem ? (
                  <button
                    type="button"
                    className={`${styles.rowContent} ${styles.rowButton}`}
                    title={itemTitle?.(item, index)}
                    onClick={() => onOpenItem(item, index)}
                  >
                    {renderRow(item, index)}
                  </button>
                ) : (
                  <span className={styles.rowContent} title={itemTitle?.(item, index)}>{renderRow(item, index)}</span>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className={styles.empty}>{emptyText ?? `No ${noun.other}.`}</div>
      )}
      {summary || showAction || showPager ? (
        <div className={styles.footer}>
          <Text size={200} className={styles.summary}>{summary}</Text>
          <div className={styles.actions}>
            {showPager ? (
              <>
                <Button
                  size="small"
                  appearance="subtle"
                  icon={<ChevronLeft16Regular />}
                  disabled={currentPage === 0}
                  onClick={() => setPage(Math.max(0, currentPage - 1))}
                >
                  Previous
                </Button>
                <Button
                  size="small"
                  appearance="subtle"
                  icon={<ChevronRight16Regular />}
                  iconPosition="after"
                  disabled={currentPage >= pageCount - 1}
                  onClick={() => setPage(Math.min(pageCount - 1, currentPage + 1))}
                >
                  Next
                </Button>
              </>
            ) : null}
            {showAction ? (
              <Button size="small" appearance="primary" onClick={onShowAll}>{showAllLabel}</Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
