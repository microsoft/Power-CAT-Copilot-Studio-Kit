import {
  Badge,
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  DialogTrigger,
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
import { Dismiss24Regular } from '@fluentui/react-icons';
import { PaginationBar } from '../../../shared/components/PaginationBar';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useRequestNotifications, statusLabel } from '../hooks/useRequestNotifications';
import type { NotificationEntry } from '../hooks/useRequestNotifications';
import type { Emailsstatuscode } from '../../../../../generated/models/EmailsModel';
import type { RequestType } from '../../../models/policyRequest';
import { useLayoutStyles, useTableStyles } from '../../../shared/styles';

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
  subjectCell: {
    minWidth: '200px',
    whiteSpace: 'normal',
    wordBreak: 'break-word',
  },
  subjectLink: {
    cursor: 'pointer',
    color: tokens.colorBrandForeground1,
    textDecorationLine: 'none',
    ':hover': {
      textDecorationLine: 'underline',
    },
  },
  toCell: {
    minWidth: '180px',
    whiteSpace: 'normal',
    wordBreak: 'break-word',
    color: tokens.colorNeutralForeground3,
  },
  dateCell: {
    whiteSpace: 'nowrap',
    color: tokens.colorNeutralForeground3,
    minWidth: '160px',
  },
  statusCell: {
    minWidth: '110px',
  },
  dialogSurface: {
    maxWidth: '720px',
    width: '90vw',
  },
  dialogMeta: {
    display: 'grid',
    gridTemplateColumns: '60px 1fr',
    gap: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
    marginBottom: tokens.spacingVerticalM,
  },
  dialogLabel: {
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
  },
  dialogValue: {
    fontSize: tokens.fontSizeBase200,
    wordBreak: 'break-word',
  },
  emailBodyFrame: {
    width: '100%',
    minHeight: '300px',
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  footerInfo: {
    fontSize: '12px',
    color: tokens.colorNeutralForeground2,
    fontWeight: '500',
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
  });
}

type BadgeColor = 'informative' | 'warning' | 'danger' | 'success' | 'subtle';

function statusBadgeColor(code: Emailsstatuscode | undefined): BadgeColor {
  switch (code) {
    case 3: return 'success';    // Sent
    case 6: return 'warning';    // Pending Send
    case 7: return 'informative'; // Sending
    case 8: return 'danger';     // Failed
    case 5: return 'subtle';     // Canceled
    default: return 'informative';
  }
}

const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;
const DEFAULT_PAGE_SIZE = 10;

type SortColumn = 'subject' | 'sentOn' | 'status';
type SortDirection = 'ascending' | 'descending';

function compareEntries(a: NotificationEntry, b: NotificationEntry, column: SortColumn): number {
  switch (column) {
    case 'subject': {
      const sA = (a.subject ?? '').toLowerCase();
      const sB = (b.subject ?? '').toLowerCase();
      return sA.localeCompare(sB);
    }
    case 'sentOn': {
      const dateA = a.createdon ? new Date(a.createdon).getTime() : 0;
      const dateB = b.createdon ? new Date(b.createdon).getTime() : 0;
      return dateA - dateB;
    }
    case 'status':
      return (a.statuscode ?? 0) - (b.statuscode ?? 0);
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

function NotificationRow({
  entry,
  styles,
  onSubjectClick,
}: {
  entry: NotificationEntry;
  styles: ReturnType<typeof useStyles>;
  onSubjectClick: (entry: NotificationEntry) => void;
}) {
  return (
    <TableRow>
      <TableCell className={styles.subjectCell}>
        <Text
          className={styles.subjectLink}
          role="button"
          tabIndex={0}
          onClick={() => onSubjectClick(entry)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSubjectClick(entry); }}
        >
          {entry.subject ?? '-'}
        </Text>
      </TableCell>
      <TableCell className={styles.toCell}>
        {entry.torecipients ?? '-'}
      </TableCell>
      <TableCell className={styles.dateCell}>
        {formatTimestamp(entry.senton ?? entry.createdon)}
      </TableCell>
      <TableCell className={styles.statusCell}>
        <Badge
          appearance="filled"
          color={statusBadgeColor(entry.statuscode)}
          size="small"
        >
          {statusLabel(entry.statuscode)}
        </Badge>
      </TableCell>
    </TableRow>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

interface NotificationsTabProps {
  requestId: string;
  /** Experience gate — the credit detail passes 'Credits'. Defaults to connector (no assert). */
  requestType?: RequestType;
}

export function NotificationsTab({ requestId, requestType }: NotificationsTabProps) {
  const styles = useStyles();
  const layoutStyles = useLayoutStyles();
  const tableStyles = useTableStyles();
  const { notifications, isLoading, error } = useRequestNotifications(requestId, requestType);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [sortColumn, setSortColumn] = useState<SortColumn>('sentOn');
  const [sortDirection, setSortDirection] = useState<SortDirection>('descending');
  const [previewEntry, setPreviewEntry] = useState<NotificationEntry | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const handleSort = useCallback((column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection((prev) => (prev === 'ascending' ? 'descending' : 'ascending'));
    } else {
      setSortColumn(column);
      setSortDirection(column === 'sentOn' ? 'descending' : 'ascending');
    }
    setCurrentPage(1);
  }, [sortColumn]);

  const sortedNotifications = useMemo(
    () =>
      [...notifications].sort((a, b) => {
        const cmp = compareEntries(a, b, sortColumn);
        return sortDirection === 'ascending' ? cmp : -cmp;
      }),
    [notifications, sortColumn, sortDirection],
  );

  const totalCount = sortedNotifications.length;
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));

  // Clamp currentPage if data changes
  const safePage = Math.min(currentPage, pageCount);
  if (safePage !== currentPage) {
    setCurrentPage(safePage);
  }

  const startIndex = (safePage - 1) * pageSize;
  const pageItems = sortedNotifications.slice(startIndex, startIndex + pageSize);

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setCurrentPage(1);
  };

  if (isLoading) {
    return (
      <div className={styles.centeredState}>
        <Spinner label="Loading notifications..." labelPosition="below" />
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

  if (notifications.length === 0) {
    return (
      <div className={styles.centeredState}>
        <Text>No notifications sent for this request.</Text>
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
              onClick={() => handleSort('subject')}
              aria-sort={sortColumn === 'subject' ? sortDirection : undefined}
            >
              Subject
              <SortArrow column="subject" activeColumn={sortColumn} direction={sortDirection} styles={styles} />
            </TableHeaderCell>
            <TableHeaderCell className={styles.headerCell}>To</TableHeaderCell>
            <TableHeaderCell
              className={mergeClasses(styles.headerCell, styles.sortableHeader)}
              onClick={() => handleSort('sentOn')}
              aria-sort={sortColumn === 'sentOn' ? sortDirection : undefined}
            >
              Sent On
              <SortArrow column="sentOn" activeColumn={sortColumn} direction={sortDirection} styles={styles} />
            </TableHeaderCell>
            <TableHeaderCell
              className={mergeClasses(styles.headerCell, styles.sortableHeader)}
              onClick={() => handleSort('status')}
              aria-sort={sortColumn === 'status' ? sortDirection : undefined}
            >
              Status
              <SortArrow column="status" activeColumn={sortColumn} direction={sortDirection} styles={styles} />
            </TableHeaderCell>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pageItems.map((entry) => (
            <NotificationRow
              key={entry.activityid}
              entry={entry}
              styles={styles}
              onSubjectClick={setPreviewEntry}
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
        onPageChange={(p) => setCurrentPage(p)}
        onPageSizeChange={handlePageSizeChange}
      />

      {/* ── Email Preview Dialog ─────────────────────────────────────── */}
      <Dialog
        open={previewEntry !== null}
        onOpenChange={(_, data) => { if (!data.open) setPreviewEntry(null); }}
      >
        <DialogSurface className={styles.dialogSurface}>
          <DialogBody>
            <DialogTitle
              action={
                <DialogTrigger action="close">
                  <Button
                    appearance="subtle"
                    aria-label="Close"
                    icon={<Dismiss24Regular />}
                  />
                </DialogTrigger>
              }
            >
              {previewEntry?.subject ?? 'Email Preview'}
            </DialogTitle>
            <DialogContent>
              <div className={styles.dialogMeta}>
                <Text className={styles.dialogLabel}>From:</Text>
                <Text className={styles.dialogValue}>{previewEntry?.sender ?? '-'}</Text>
                <Text className={styles.dialogLabel}>To:</Text>
                <Text className={styles.dialogValue}>{previewEntry?.torecipients ?? '-'}</Text>
              </div>
              {previewEntry?.description ? (
                <iframe
                  ref={iframeRef}
                  title="Email body"
                  className={styles.emailBodyFrame}
                  sandbox=""
                  srcDoc={previewEntry.description}
                />
              ) : (
                <Text italic>No email body available.</Text>
              )}
            </DialogContent>
            <DialogActions>
              <DialogTrigger action="close">
                <Button appearance="secondary">Close</Button>
              </DialogTrigger>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}
