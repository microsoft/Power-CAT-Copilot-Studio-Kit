import { useCallback } from 'react';
import {
  Spinner,
  Table,
  TableHeader,
  TableHeaderCell,
  TableBody,
  TableRow,
  TableCell,
  Text,
  Tooltip,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { getCreditRequestAudit } from '../../../shared/services/dataverse/creditRequestService';
import { describeActivity } from './creditCapacityText';
import type { CreditAuditEvent } from '../../../models/creditRequest';
import { useFetch } from '../../../shared/hooks/useFetch';
import { useLayoutStyles } from '../../../shared/styles';

// ─────────────────────────────────────────────────────────────────────────────
// Credit Activity + audit tab (FR-024).
//
// Reads through getCreditRequestAudit, which asserts `cat_requesttype = Credits`
// BEFORE reading any log row, so the audit trail can never leak a connector
// request's activity into the credit surface (FR-035).
// ─────────────────────────────────────────────────────────────────────────────

const useStyles = makeStyles({
  table: { width: '100%' },
  headerCell: { fontWeight: tokens.fontWeightSemibold },
  timestampCell: { whiteSpace: 'nowrap', color: tokens.colorNeutralForeground3, minWidth: '170px' },
  actorCell: { whiteSpace: 'nowrap', minWidth: '140px' },
  actionCell: { minWidth: '130px' },
  detailCell: { whiteSpace: 'normal', wordBreak: 'break-word' },
  detailStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
    paddingTop: tokens.spacingVerticalXS,
    paddingBottom: tokens.spacingVerticalXS,
  },
  reference: { color: tokens.colorNeutralForeground3, width: 'fit-content' },
  centeredState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: tokens.spacingVerticalM,
    paddingTop: tokens.spacingVerticalXXL,
    paddingBottom: tokens.spacingVerticalXXL,
  },
});

const DASH = '\u2014';

function formatTimestamp(iso: string | undefined): string {
  if (!iso) return DASH;
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

interface CreditActivityTabProps {
  requestId: string;
}

export function CreditActivityTab({ requestId }: CreditActivityTabProps) {
  const styles = useStyles();
  const layoutStyles = useLayoutStyles();

  const fetcher = useCallback(() => getCreditRequestAudit(requestId), [requestId]);
  const { data, isLoading, error } = useFetch<CreditAuditEvent[]>(fetcher, [requestId]);

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

  const events = data ?? [];
  if (events.length === 0) {
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
            <TableHeaderCell className={styles.headerCell}>Timestamp</TableHeaderCell>
            <TableHeaderCell className={styles.headerCell}>Actor</TableHeaderCell>
            <TableHeaderCell className={styles.headerCell}>Action</TableHeaderCell>
            <TableHeaderCell className={styles.headerCell}>Detail</TableHeaderCell>
          </TableRow>
        </TableHeader>
        <TableBody>
          {events.map((e) => {
            const view = describeActivity(e.action, e.detail);
            return (
              <TableRow key={e.id}>
                <TableCell className={styles.timestampCell}>{formatTimestamp(e.timestamp)}</TableCell>
                <TableCell className={styles.actorCell}>{e.actor ?? DASH}</TableCell>
                <TableCell className={styles.actionCell}>{view.action}</TableCell>
                <TableCell className={styles.detailCell}>
                  <div className={styles.detailStack}>
                    <Text>{view.summary}</Text>
                    {view.reference && (
                      <Tooltip content={`Reference: ${view.reference}`} relationship="description">
                        <Text size={200} className={styles.reference} tabIndex={0}>
                          Reference: {view.reference.slice(0, 8)}
                        </Text>
                      </Tooltip>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export default CreditActivityTab;
