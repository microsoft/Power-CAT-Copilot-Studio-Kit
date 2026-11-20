import { useState, useCallback, useMemo } from 'react';
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
import { AdminActions } from './AdminActions';
import { RequestSummaryTab } from './RequestSummaryTab';
import { FulfillmentTab } from './FulfillmentTab';
import { CommentsTab } from '../../comments/components/CommentsTab';
import { ActivityTab } from './ActivityTab';
import { NotificationsTab } from './NotificationsTab';

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

type DetailTab = 'summary' | 'fulfillment' | 'comments' | 'activity' | 'notifications';

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

  // Auto-select Fulfillment tab for admins viewing an in-progress implementation
  const initialTab = useMemo<DetailTab>(() => {
    if (detail && detail.status === 'Implementing') {
      return 'fulfillment';
    }
    return 'summary';
  }, [detail]);

  const [selectedTab, setSelectedTab] = useState<DetailTab | null>(null);
  const [commentCount, setCommentCount] = useState<number | null>(null);

  // Use explicit user selection if available, otherwise fall back to computed initial tab
  const activeTab = selectedTab ?? initialTab;

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
  const fulfillmentStatuses = ['Approved', 'Implementing', 'Implemented', 'ImplementedWithErrors'];
  const showFulfillmentTab = fulfillmentStatuses.includes(detail.status);

  // ── Detail view ────────────────────────────────────────────────────────────

  return (
    <div className={layoutStyles.detailContainer}>

      <PowerShieldBreadcrumb segments={[{ label: 'Policy Request Summary' }]} />

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

          {detail.assignedAdminName && (
            <Text size={200} className={styles.metaText}>
              Assigned Admin: {detail.assignedAdminName}
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
          <AdminActions
            requestId={detail.id}
            environments={detail.environments.map((e) => ({ guid: e.environmentGuid, name: e.environmentName }))}
            environmentCount={detail.environments.length}
            connectorCount={detail.connectors.length}
            requestConnectors={detail.connectors}
            status={detail.status}
            dlpPolicyId={detail.dlpPolicyId}
            assignedAdminName={detail.assignedAdminName}
            assignedAdminDvUserId={detail.assignedAdminDvUserId}
            serviceTreeId={detail.serviceTreeId}
            environmentGroupId={detail.environmentGroupId}
            onActionComplete={refresh}
          />
        </div>
      </div>

      {/* ── Tab bar (only for non-Draft requests) ────────────────────────── */}
      {showTabs && (
        <TabList
          selectedValue={activeTab}
          onTabSelect={handleTabSelect}
          aria-label="Request detail sections"
        >
          <Tab value="summary">Summary</Tab>
          {showFulfillmentTab && <Tab value="fulfillment">Fulfillment</Tab>}
          <Tab value="comments">{commentsLabel}</Tab>
          <Tab value="activity">Activity</Tab>
          <Tab value="notifications">Notifications</Tab>
        </TabList>
      )}

      {/* ── Tab content ──────────────────────────────────────────────────── */}
      <div className={layoutStyles.contentStack}>
        {(!showTabs || activeTab === 'summary') && (
          <RequestSummaryTab detail={detail} />
        )}

        {showFulfillmentTab && activeTab === 'fulfillment' && (
          <FulfillmentTab detail={detail} />
        )}

        {showTabs && activeTab === 'comments' && (
          <CommentsTab
            requestId={detail.id}
            onCommentCountChange={handleCommentCountChange}
          />
        )}

        {showTabs && activeTab === 'activity' && (
          <ActivityTab requestId={detail.id} />
        )}

        {showTabs && activeTab === 'notifications' && (
          <NotificationsTab requestId={detail.id} />
        )}
      </div>

    </div>
  );
}

export default RequestDetailView;
