import {
  Badge,
  Link,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components';
import { PaginationBar } from '../../../shared/components/PaginationBar';
import { useCallback, useMemo, useState } from 'react';
import { useRequestLog } from '../hooks/useRequestLog';
import type { RequestLogEntry } from '../hooks/useRequestLog';
import type { Cat_powershieldpolicyrequestlogscat_eventtype } from '../../../../../generated/models/Cat_powershieldpolicyrequestlogsModel';
import type { Cat_powershieldpolicyrequestlogscat_loglevel } from '../../../../../generated/models/Cat_powershieldpolicyrequestlogsModel';
import { useLayoutStyles } from '../../../shared/styles';

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const useStyles = makeStyles({
  table: {
    width: '100%',
  },
  headerCell: {
    fontWeight: tokens.fontWeightSemibold,
  },
  sortableHeader: {
    cursor: 'pointer',
    userSelect: 'none' as const,
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
  sortIndicator: {
    fontSize: '10px',
    marginLeft: '4px',
    color: tokens.colorNeutralForeground3,
  },
  sortIndicatorActive: {
    color: tokens.colorBrandForeground1,
  },
  centeredState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: tokens.spacingVerticalM,
    paddingTop: tokens.spacingVerticalXXL,
    paddingBottom: tokens.spacingVerticalXXL,
  },
  timestampCell: {
    whiteSpace: 'nowrap',
    color: tokens.colorNeutralForeground3,
    minWidth: '160px',
  },
  levelCell: {
    minWidth: '90px',
  },
  eventCell: {
    minWidth: '130px',
  },
  messageCell: {
    whiteSpace: 'normal',
    wordBreak: 'break-word',
  },
  policyCell: {
    minWidth: '140px',
    whiteSpace: 'normal',
    wordBreak: 'break-word',
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatTimestamp(iso: string | undefined): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

type BadgeColor = 'informative' | 'warning' | 'danger' | 'success' | 'subtle';

function logLevelBadgeColor(level: Cat_powershieldpolicyrequestlogscat_loglevel | undefined): BadgeColor {
  switch (level) {
    case 2: return 'warning';
    case 3: return 'danger';
    default: return 'informative';
  }
}

function logLevelLabel(level: Cat_powershieldpolicyrequestlogscat_loglevel | undefined): string {
  switch (level) {
    case 2: return 'Warning';
    case 3: return 'Error';
    default: return 'Info';
  }
}

function eventTypeLabel(eventType: Cat_powershieldpolicyrequestlogscat_eventtype | undefined): string {
  switch (eventType) {
    case 1: return 'Started';
    case 2: return 'Policy Modified';
    case 3: return 'Policy Created';
    case 4: return 'Completed';
    case 5: return 'Failed';
    default: return '-';
  }
}

const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;
const DEFAULT_PAGE_SIZE = 10;

type SortColumn = 'timestamp' | 'level' | 'event' | 'policy';
type SortDirection = 'ascending' | 'descending';

function compareEntries(a: RequestLogEntry, b: RequestLogEntry, column: SortColumn): number {
  switch (column) {
    case 'timestamp': {
      const dateA = a.createdon ? new Date(a.createdon).getTime() : 0;
      const dateB = b.createdon ? new Date(b.createdon).getTime() : 0;
      return dateA - dateB;
    }
    case 'level':
      return (a.cat_loglevel ?? 0) - (b.cat_loglevel ?? 0);
    case 'event':
      return (a.cat_eventtype ?? 0) - (b.cat_eventtype ?? 0);
    case 'policy': {
      const pA = (a.cat_affectedpolicyname ?? '').toLowerCase();
      const pB = (b.cat_affectedpolicyname ?? '').toLowerCase();
      return pA.localeCompare(pB);
    }
    default:
      return 0;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sort arrow indicator
// ─────────────────────────────────────────────────────────────────────────────

function SortArrow({
  column,
  activeColumn,
  direction,
  styles,
}: {
  column: SortColumn;
  activeColumn: SortColumn;
  direction: SortDirection;
  styles: ReturnType<typeof useStyles>;
}) {
  const isActive = column === activeColumn;
  const arrow = isActive
    ? direction === 'ascending' ? '▲' : '▼'
    : '⇅';

  return (
    <span className={mergeClasses(styles.sortIndicator, isActive && styles.sortIndicatorActive)}>
      {arrow}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Row component
// ─────────────────────────────────────────────────────────────────────────────

function ActivityRow({ entry, styles }: { entry: RequestLogEntry; styles: ReturnType<typeof useStyles> }) {
  return (
    <TableRow>
      <TableCell className={styles.timestampCell}>
        {formatTimestamp(entry.createdon)}
      </TableCell>
      <TableCell className={styles.levelCell}>
        <Badge
          appearance="filled"
          color={logLevelBadgeColor(entry.cat_loglevel)}
          size="small"
        >
          {logLevelLabel(entry.cat_loglevel)}
        </Badge>
      </TableCell>
      <TableCell className={styles.eventCell}>
        {eventTypeLabel(entry.cat_eventtype)}
      </TableCell>
      <TableCell className={styles.messageCell}>
        {entry.cat_message ?? '-'}
      </TableCell>
      <TableCell className={styles.policyCell}>
        {entry.cat_affectedpolicyid && entry.cat_affectedpolicyname ? (
          <Link
            href={`https://admin.powerplatform.microsoft.com/security/dataprotection/dlp/policy/${entry.cat_affectedpolicyid}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {entry.cat_affectedpolicyname}
          </Link>
        ) : '-'}
      </TableCell>
    </TableRow>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

interface ActivityTabProps {
  requestId: string;
}

export function ActivityTab({ requestId }: ActivityTabProps) {
  const styles = useStyles();
  const layoutStyles = useLayoutStyles();
  const { logs, isLoading, error } = useRequestLog(requestId);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [sortColumn, setSortColumn] = useState<SortColumn>('timestamp');
  const [sortDirection, setSortDirection] = useState<SortDirection>('descending');

  const handleSort = useCallback((column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection((prev) => (prev === 'ascending' ? 'descending' : 'ascending'));
    } else {
      setSortColumn(column);
      setSortDirection(column === 'timestamp' ? 'descending' : 'ascending');
    }
    setCurrentPage(1);
  }, [sortColumn]);

  const sortedLogs = useMemo(
    () =>
      [...logs].sort((a, b) => {
        const cmp = compareEntries(a, b, sortColumn);
        return sortDirection === 'ascending' ? cmp : -cmp;
      }),
    [logs, sortColumn, sortDirection],
  );

  const totalCount = sortedLogs.length;
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));

  // Clamp currentPage if data changes
  const safePage = Math.min(currentPage, pageCount);
  if (safePage !== currentPage) {
    setCurrentPage(safePage);
  }

  const startIndex = (safePage - 1) * pageSize;
  const pageItems = sortedLogs.slice(startIndex, startIndex + pageSize);

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setCurrentPage(1);
  };

  if (isLoading) {
    return (
      <div className={styles.centeredState}>
        <Spinner label="Loading activity..." labelPosition="below" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.centeredState}>
        <Text>Error: {error}</Text>
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className={styles.centeredState}>
        <Text>No activity recorded for this request.</Text>
      </div>
    );
  }

  return (
    <div className={layoutStyles.contentStack}>
      <Table className={styles.table} size="small">
        <TableHeader>
          <TableRow>
            <TableHeaderCell
              className={mergeClasses(styles.headerCell, styles.sortableHeader)}
              onClick={() => handleSort('timestamp')}
              aria-sort={sortColumn === 'timestamp' ? sortDirection : undefined}
            >
              Timestamp
              <SortArrow column="timestamp" activeColumn={sortColumn} direction={sortDirection} styles={styles} />
            </TableHeaderCell>
            <TableHeaderCell
              className={mergeClasses(styles.headerCell, styles.sortableHeader)}
              onClick={() => handleSort('level')}
              aria-sort={sortColumn === 'level' ? sortDirection : undefined}
            >
              Level
              <SortArrow column="level" activeColumn={sortColumn} direction={sortDirection} styles={styles} />
            </TableHeaderCell>
            <TableHeaderCell
              className={mergeClasses(styles.headerCell, styles.sortableHeader)}
              onClick={() => handleSort('event')}
              aria-sort={sortColumn === 'event' ? sortDirection : undefined}
            >
              Event
              <SortArrow column="event" activeColumn={sortColumn} direction={sortDirection} styles={styles} />
            </TableHeaderCell>
            <TableHeaderCell className={styles.headerCell}>Message</TableHeaderCell>
            <TableHeaderCell
              className={mergeClasses(styles.headerCell, styles.sortableHeader)}
              onClick={() => handleSort('policy')}
              aria-sort={sortColumn === 'policy' ? sortDirection : undefined}
            >
              Policy
              <SortArrow column="policy" activeColumn={sortColumn} direction={sortDirection} styles={styles} />
            </TableHeaderCell>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pageItems.map((entry) => (
            <ActivityRow
              key={entry.cat_powershieldpolicyrequestlogid}
              entry={entry}
              styles={styles}
            />
          ))}
        </TableBody>
      </Table>

      {/* ── Footer / pagination ──────────────────────────────────────── */}
      <PaginationBar
        page={safePage}
        pageCount={pageCount}
        pageSize={pageSize}
        pageSizeOptions={PAGE_SIZE_OPTIONS}
        totalRecords={totalCount}
        onPageChange={setCurrentPage}
        onPageSizeChange={handlePageSizeChange}
      />
    </div>
  );
}
