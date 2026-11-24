import { useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  makeStyles,
  tokens,
  Spinner,
  Text,
  Button,
  TabList,
  Tab,
} from '@fluentui/react-components';
import type { SelectTabData, SelectTabEvent } from '@fluentui/react-components';
import { ArrowClockwise24Regular } from '@fluentui/react-icons';
import { StatusBadge } from '../../../shared/components/StatusBadge';
import { PowerShieldBreadcrumb } from '../../../shared/components/PowerShieldBreadcrumb';
import { useRequestDetail } from '../hooks/useRequestDetail';
import { useAuth } from '../../../shared/hooks/useAuth';
import { useLayoutStyles, useToolbarStyles } from '../../../shared/styles';
import { WithdrawButton } from './WithdrawButton';
import { EditDraftButton } from './EditDraftButton';
import { ResubmitButton } from './ResubmitButton';
import { RequestSummaryTab } from './RequestSummaryTab';
import { CommentsTab } from '../../comments/components/CommentsTab';

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const useStyles = makeStyles({
  centeredState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingHorizontalXXL,
    minHeight: '200px',
  },

  header: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalM,
  },

  headerMeta: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
    marginLeft: 'auto',
  },

  metaText: {
    color: tokens.colorNeutralForeground3,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatDate(isoString: string | undefined): string {
  if (!isoString) return '-';
  return new Date(isoString).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

type DetailTab = 'summary' | 'comments';

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function RequestDetailView() {
  const { requestId } = useParams<{ requestId: string }>();
  const styles = useStyles();
  const layoutStyles = useLayoutStyles();
  const toolbarStyles = useToolbarStyles();
  const { aadObjectId } = useAuth();

  const { detail, isLoading, error, refresh } = useRequestDetail(requestId ?? '');

  const [selectedTab, setSelectedTab] = useState<DetailTab>('summary');
  const [commentCount, setCommentCount] = useState<number | null>(null);

  const handleTabSelect = useCallback((_: SelectTabEvent, data: SelectTabData) => {
    setSelectedTab(data.value as DetailTab);
  }, []);

  const handleCommentCountChange = useCallback((count: number) => {
    setCommentCount(count);
  }, []);

  // ── Loading state ──────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className={styles.centeredState}>
        <Spinner label="Loading request..." labelPosition="below" />
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className={styles.centeredState} role="alert">
        <Text>Error: {error}</Text>
        <Button
          appearance="primary"
          icon={<ArrowClockwise24Regular />}
          onClick={refresh}
        >
          Refresh
        </Button>
      </div>
    );
  }

  // ── Empty guard ────────────────────────────────────────────────────────────

  if (!detail) {
    return null;
  }

  const showTabs = detail.status !== 'Draft';
  const commentsLabel = commentCount !== null ? `Comments (${commentCount})` : 'Comments';

  // ── Detail view ────────────────────────────────────────────────────────────

  return (
    <div className={layoutStyles.detailContainer}>

      <PowerShieldBreadcrumb segments={[{ label: 'Connector Request' }]} />

      {/* ── Header row ───────────────────────────────────────────────────── */}
      <div className={styles.header}>
        <Text size={600} weight="semibold">
          {detail.requestNumber}
        </Text>

        <StatusBadge status={detail.status} />

        <div className={styles.headerMeta}>
          {detail.submittedOn && (
            <Text size={200} className={styles.metaText}>
              Submitted: {formatDate(detail.submittedOn)}
            </Text>
          )}

          {detail.decidedOn && (
            <Text size={200} className={styles.metaText}>
              Decided: {formatDate(detail.decidedOn)}
            </Text>
          )}
        </div>
      </div>

      {/* ── Command bar ──────────────────────────────────────────────────── */}
      <div className={toolbarStyles.commandBar} role="toolbar" aria-label="Request actions">
        <Button
          appearance="subtle"
          icon={<ArrowClockwise24Regular />}
          onClick={refresh}
          aria-label="Refresh request detail"
          size="small"
        >
          Refresh
        </Button>
        <div className={toolbarStyles.commandBarActions}>
          <WithdrawButton
            requestId={detail.id}
            requestNumber={detail.requestNumber}
            currentStatus={detail.status}
            createdByAadObjectId={detail.createdByAadObjectId}
            currentUserAadObjectId={aadObjectId}
            role="maker"
            onWithdrawn={refresh}
          />
          <EditDraftButton
            requestId={detail.id}
            currentStatus={detail.status}
            createdByAadObjectId={detail.createdByAadObjectId}
            currentUserAadObjectId={aadObjectId}
          />
          <ResubmitButton
            requestId={detail.id}
            requestNumber={detail.requestNumber}
            currentStatus={detail.status}
            createdByAadObjectId={detail.createdByAadObjectId}
            currentUserAadObjectId={aadObjectId}
          />
        </div>
      </div>

      {/* ── Tab bar (only for non-Draft requests) ────────────────────────── */}
      {showTabs && (
        <TabList
          selectedValue={selectedTab}
          onTabSelect={handleTabSelect}
          aria-label="Request detail sections"
        >
          <Tab value="summary">Summary</Tab>
          <Tab value="comments">{commentsLabel}</Tab>
        </TabList>
      )}

      {/* ── Tab content ──────────────────────────────────────────────────── */}
      <div className={layoutStyles.contentStack}>
        {(!showTabs || selectedTab === 'summary') && (
          <RequestSummaryTab detail={detail} />
        )}

        {showTabs && selectedTab === 'comments' && (
          <CommentsTab
            requestId={detail.id}
            requestCreatedByAadObjectId={detail.createdByAadObjectId}
            onCommentCountChange={handleCommentCountChange}
          />
        )}
      </div>

    </div>
  );
}

export default RequestDetailView;
