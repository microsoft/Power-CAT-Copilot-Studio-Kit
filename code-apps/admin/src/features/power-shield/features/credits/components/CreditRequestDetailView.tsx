import { useState, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import {
  makeStyles,
  tokens,
  Spinner,
  Text,
  Button,
  TabList,
  Tab,
  MessageBar,
  MessageBarActions,
  MessageBarBody,
  mergeClasses,
} from '@fluentui/react-components';
import type { SelectTabData, SelectTabEvent } from '@fluentui/react-components';
import { ArrowClockwise24Regular } from '@fluentui/react-icons';
import { StatusBadge } from '../../../shared/components/StatusBadge';
import { PowerShieldBreadcrumb } from '../../../shared/components/PowerShieldBreadcrumb';
import { useCreditRequestDetail } from '../hooks/useCreditRequestDetail';
import { useCreditRecovery } from '../hooks/useCreditRecovery';
import { useCreditCapacity } from '../hooks/useCreditCapacity';
import { getApproveAvailability, type ApproveAvailability } from '../services/creditApprovalRules';
import { useLayoutStyles, useToolbarStyles } from '../../../shared/styles';
import { CREDIT_STATUS_BADGE } from '../../../models/status';
import { CommentsTab } from '../../comments/components/CommentsTab';
import { NotificationsTab } from '../../request-detail/components/NotificationsTab';
import { CreditAdminActions } from './CreditAdminActions';
import { CreditSummaryTab } from './CreditSummaryTab';
import { CreditActivityTab } from './CreditActivityTab';
import { CREDITS_CHECK_HEADER_ID, UNKNOWN_BAR_TEXT, approveOffTip } from './creditCapacityText';

// ─────────────────────────────────────────────────────────────────────────────
// Credit request detail surface (T026).
//
// Mirrors the connector RequestDetailView shell but is bound to the credit
// repository, whose reads assert `cat_requesttype = Credits` before touching any
// child. The Comments and Notifications tabs are the connector components reused
// with `requestType="Credits"`, so they run the same Credits header guard and can
// never surface a connector request's threads here (FR-024/FR-035).
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
  title: { margin: 0 },
  actionsWrap: { flexWrap: 'wrap' },
});

type CreditDetailTab = 'summary' | 'comments' | 'activity' | 'notifications';

export function CreditRequestDetailView() {
  const { requestId } = useParams<{ requestId: string }>();
  const styles = useStyles();
  const layoutStyles = useLayoutStyles();
  const toolbarStyles = useToolbarStyles();

  const { detail, isLoading, error, refresh } = useCreditRequestDetail(requestId ?? '');
  const envRow = detail?.environments[0];
  const isAwaiting = detail?.status === 'Submitted' || detail?.status === 'UnderReview';
  // Spec 030: check credits as soon as the request opens, so Approve reflects what will actually happen.
  const capacity = useCreditCapacity(envRow?.environmentGuid ?? '', isAwaiting);
  const refreshCapacity = capacity.refresh;
  const refreshAll = useCallback(() => {
    refresh();
    refreshCapacity();
  }, [refresh, refreshCapacity]);
  const recovery = useCreditRecovery(
    detail?.id ?? '',
    envRow && {
      childState: envRow.creditChildState,
      attemptId: envRow.attemptId,
      underReview: detail?.status === 'UnderReview',
    },
    refreshAll,
  );
  // No environment GUID means the check never runs, so leave Approve on and let its dialog decide.
  // Spec 032: a draw-only request asks for no credits, so credit blocks don't apply to it.
  const creditsRequested = !(envRow?.requestTenantDraw && envRow.requestedAmount === undefined);
  const availability: ApproveAvailability = envRow?.environmentGuid
    ? getApproveAvailability(capacity.isLoading ? null : capacity.snapshot, creditsRequested)
    : { kind: 'unknown' };
  const [checkOpen, setCheckOpen] = useState(true);

  const [selectedTab, setSelectedTab] = useState<CreditDetailTab>('summary');
  const [commentCount, setCommentCount] = useState<number | null>(null);

  const handleTabSelect = useCallback((_: SelectTabEvent, data: SelectTabData) => {
    setSelectedTab(data.value as CreditDetailTab);
  }, []);

  const handleCommentCountChange = useCallback((count: number) => {
    setCommentCount(count);
  }, []);

  // The action button that opened a dialog is often gone afterwards, so move focus to the
  // request heading instead of letting it drop to the page body (WCAG 2.4.3).
  const headingRef = useRef<HTMLHeadingElement>(null);
  const handleActionComplete = useCallback(() => {
    refreshAll();
    setTimeout(() => headingRef.current?.focus(), 0);
  }, [refreshAll]);

  const showCreditsCheck = () => {
    setSelectedTab('summary');
    setCheckOpen(true);
    setTimeout(() => document.getElementById(CREDITS_CHECK_HEADER_ID)?.focus(), 0);
  };

  // Full-page spinner only on first load, so a background refresh never unmounts open dialogs.
  if (isLoading && !detail) {
    return (
      <div className={styles.centeredState}>
        <Spinner label="Loading request..." labelPosition="below" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.centeredState} role="alert">
        <Text>Error: {error}</Text>
        <Button appearance="primary" icon={<ArrowClockwise24Regular />} onClick={refresh}>
          Refresh
        </Button>
      </div>
    );
  }

  if (!detail) {
    return null;
  }

  const commentsLabel = commentCount !== null ? `Comments (${commentCount})` : 'Comments';
  const hasCheck = isAwaiting && !!envRow?.environmentGuid;
  const rowState = envRow?.creditChildState;
  const attemptOpen =
    detail.status === 'UnderReview' &&
    (rowState === 'Processing' || rowState === 'UnknownOutcome' || rowState === 'Succeeded');
  // Off the Summary tab, still tell the admin why Approve is off or why the check failed.
  const offTabBar =
    hasCheck && selectedTab !== 'summary' && (availability.kind === 'blocked' || availability.kind === 'unknown')
      ? availability.kind === 'blocked'
        ? { intent: 'warning' as const, text: approveOffTip(availability) ?? '' }
        : { intent: 'error' as const, text: UNKNOWN_BAR_TEXT }
      : undefined;

  return (
    <div className={layoutStyles.detailContainer}>
      <PowerShieldBreadcrumb
        segments={[{ label: 'Copilot Credits', route: '/credits' }, { label: detail.requestNumber }]}
      />

      {/* ── Header row ───────────────────────────────────────────────────── */}
      <div className={styles.header}>
        <Text as="h1" ref={headingRef} tabIndex={-1} size={600} weight="semibold" className={styles.title}>
          {detail.requestNumber}
        </Text>

        <StatusBadge
          label={CREDIT_STATUS_BADGE[detail.status].label}
          colorKey={CREDIT_STATUS_BADGE[detail.status].colorKey}
        />
      </div>

      {/* ── Command bar ──────────────────────────────────────────────────── */}
      {/* A plain labelled group: this bar uses Tab between buttons, not toolbar arrow keys. */}
      <div className={toolbarStyles.commandBar} role="group" aria-label="Request actions">
        <Button
          appearance="subtle"
          icon={<ArrowClockwise24Regular />}
          onClick={refreshAll}
          aria-label="Refresh request detail"
          size="small"
        >
          Refresh
        </Button>
        <div className={mergeClasses(toolbarStyles.commandBarActions, styles.actionsWrap)}>
          <CreditAdminActions
            requestId={detail.id}
            requestNumber={detail.requestNumber}
            status={detail.status}
            assignedAdminName={detail.assignedAdminName}
            assignedAdminDvUserId={detail.assignedAdminDvUserId}
            rowState={envRow?.creditChildState}
            recovery={recovery}
            onActionComplete={handleActionComplete}
            approveAvailability={availability}
          />
        </div>
      </div>

      {offTabBar && (
        <MessageBar intent={offTabBar.intent} layout="multiline">
          <MessageBarBody>{offTabBar.text}</MessageBarBody>
          <MessageBarActions>
            <Button size="small" onClick={showCreditsCheck}>
              View credits check
            </Button>
          </MessageBarActions>
        </MessageBar>
      )}

      {/* ── Tab bar ──────────────────────────────────────────────────────── */}
      <TabList selectedValue={selectedTab} onTabSelect={handleTabSelect} aria-label="Request detail sections">
        <Tab value="summary">Summary</Tab>
        <Tab value="comments">{commentsLabel}</Tab>
        <Tab value="activity">Activity</Tab>
        <Tab value="notifications">Notifications</Tab>
      </TabList>

      {/* ── Tab content ──────────────────────────────────────────────────── */}
      <div className={layoutStyles.contentStack}>
        {selectedTab === 'summary' && (
          <CreditSummaryTab
            detail={detail}
            creditsCheck={
              hasCheck
                ? {
                    snapshot: capacity.snapshot,
                    availability,
                    requestedAmount: envRow?.requestedAmount,
                    requestTenantDraw: envRow?.requestTenantDraw,
                    attemptOpen,
                    open: checkOpen,
                    onOpenChange: setCheckOpen,
                    onRefresh: refreshCapacity,
                  }
                : undefined
            }
          />
        )}

        {selectedTab === 'comments' && (
          <CommentsTab
            requestId={detail.id}
            requestType="Credits"
            onCommentCountChange={handleCommentCountChange}
          />
        )}

        {selectedTab === 'activity' && <CreditActivityTab requestId={detail.id} />}

        {selectedTab === 'notifications' && (
          <NotificationsTab requestId={detail.id} requestType="Credits" />
        )}
      </div>
    </div>
  );
}

export default CreditRequestDetailView;
