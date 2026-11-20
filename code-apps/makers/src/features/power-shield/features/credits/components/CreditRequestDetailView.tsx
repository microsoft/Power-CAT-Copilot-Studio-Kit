import { useState, useCallback, useRef } from 'react';
import { makeStyles, tokens, Spinner, Text, Button, TabList, Tab } from '@fluentui/react-components';
import type { SelectTabData, SelectTabEvent } from '@fluentui/react-components';
import { useParams } from 'react-router-dom';
import { ArrowClockwise24Regular, ArrowUndoRegular } from '@fluentui/react-icons';
import { PowerShieldBreadcrumb } from '../../../shared/components/PowerShieldBreadcrumb';
import { useLayoutStyles, useToolbarStyles } from '../../../shared/styles';
import { useCreditRequestDetail } from '../hooks/useCreditRequestDetail';
import { PowerShieldNotFound } from '../../../shared/components/PowerShieldNotFound';
import { CreditStatusBadge } from './CreditStatusBadge';
import { CreditSummaryTab } from './CreditSummaryTab';
import { CommentsTab } from '../../comments/components/CommentsTab';
import { useAuth } from '../../../shared/hooks/useAuth';
import { CreditWithdrawConfirmDialog } from './CreditWithdrawConfirmDialog';

// ─────────────────────────────────────────────────────────────────────────────
// Copilot Credits detail view (T040, FR-034). Shows the lifecycle label and
// per-environment status with requested (and, once decided, approved) credits
// (spec 026), plus a Comments tab shared with the Connector experience. The
// request type + ownership are
// validated in the repository BEFORE any child is read; a wrong-type id lands on
// the typed not-found screen rather than rendering a credit shell.
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

function formatDate(isoString: string | undefined): string {
  if (!isoString) return '-';
  return new Date(isoString).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

type DetailTab = 'summary' | 'comments';

export function CreditRequestDetailView() {
  const { requestId } = useParams<{ requestId: string }>();
  const styles = useStyles();
  const layoutStyles = useLayoutStyles();
  const toolbarStyles = useToolbarStyles();
  const { detail, isLoading, error, notFound, refresh } = useCreditRequestDetail(requestId ?? '');
  const { aadObjectId } = useAuth();
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const refreshBtnRef = useRef<HTMLButtonElement>(null);

  const [selectedTab, setSelectedTab] = useState<DetailTab>('summary');
  const [commentCount, setCommentCount] = useState<number | null>(null);

  const handleTabSelect = useCallback((_: SelectTabEvent, data: SelectTabData) => {
    setSelectedTab(data.value as DetailTab);
  }, []);

  const handleCommentCountChange = useCallback((count: number) => {
    setCommentCount(count);
  }, []);

  if (notFound) {
    return (
      <PowerShieldNotFound
        title="Credit request not found"
        description="This request is not available in the Copilot Credits experience."
      />
    );
  }

  // Only block the page on the first load, so a refresh keeps an unsent comment.
  if (isLoading && !detail) {
    return (
      <div className={styles.centeredState}>
        <Spinner label="Loading credit request..." labelPosition="below" />
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

  if (!detail) return null;

  const showTabs = detail.status !== 'Draft';
  // Same rule as the list row menu; the service re-checks owner and state.
  const canWithdraw = detail.createdByAadObjectId === aadObjectId && detail.creditLabel === 'Awaiting approval';
  const commentsLabel = commentCount !== null ? `Comments (${commentCount})` : 'Comments';

  return (
    <div className={layoutStyles.detailContainer}>
      <PowerShieldBreadcrumb segments={[{ label: 'Copilot Credits Request' }]} />

      <div className={styles.header}>
        <Text size={600} weight="semibold">
          {detail.requestNumber}
        </Text>
        <CreditStatusBadge label={detail.creditLabel} />
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

      <div className={toolbarStyles.commandBar} role="toolbar" aria-label="Request actions">
        <Button
          ref={refreshBtnRef}
          appearance="subtle"
          icon={<ArrowClockwise24Regular />}
          onClick={refresh}
          aria-label="Refresh request detail"
          size="small"
        >
          Refresh
        </Button>
        {canWithdraw && (
          <div className={toolbarStyles.commandBarActions}>
            <Button appearance="secondary" icon={<ArrowUndoRegular />} onClick={() => setWithdrawOpen(true)}>
              Withdraw
            </Button>
          </div>
        )}
      </div>

      {canWithdraw && (
        <CreditWithdrawConfirmDialog
          open={withdrawOpen}
          requestId={detail.id}
          requestNumber={detail.requestNumber}
          onClose={() => setWithdrawOpen(false)}
          onWithdrawn={() => {
            setWithdrawOpen(false);
            // The Withdraw button disappears, so move focus somewhere that stays.
            refreshBtnRef.current?.focus();
            refresh();
          }}
        />
      )}

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

      <div className={layoutStyles.contentStack}>
        {(!showTabs || selectedTab === 'summary') && <CreditSummaryTab detail={detail} />}

        {showTabs && selectedTab === 'comments' && (
          <CommentsTab
            requestId={detail.id}
            requestType="Credits"
            requestCreatedByAadObjectId={detail.createdByAadObjectId}
            onCommentCountChange={handleCommentCountChange}
          />
        )}
      </div>
    </div>
  );
}

export default CreditRequestDetailView;
