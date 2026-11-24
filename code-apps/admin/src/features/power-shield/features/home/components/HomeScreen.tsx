import { useState, useEffect } from 'react';
import { Button, makeStyles, MessageBar, MessageBarBody, MessageBarActions, tokens } from '@fluentui/react-components';
import { useNavigate } from '../../../shared/hooks/useNavigate';
import { useRequestList, PAGE_SIZE_OPTIONS } from '../hooks/useRequestList';
import { validateNotificationSettings } from '../../admin/services/notificationSettingsService';
import { checkPowerShieldHealth } from '../../admin/services/workflowService';
import type { HealthReason } from '../../admin/services/workflowService';
import { StatsCards } from './StatsCards';
import { RequestListGrid } from './RequestListGrid';
import { SyncFlowPrerequisitesBanner } from './SyncFlowPrerequisitesBanner';

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const useStyles = makeStyles({
  messageBarCompact: {
    marginBottom: `-${tokens.spacingVerticalS}`,
  },
  warningLink: {
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorBrandForeground1,
    padding: '0',
    minWidth: 'auto',
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function HomeScreen() {
  const styles = useStyles();
  const navigate = useNavigate();

  // Notification settings validation banner
  const [settingsWarning, setSettingsWarning] = useState<string[] | null>(null);
  const [warningDismissed, setWarningDismissed] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const validation = await validateNotificationSettings();
        if (!validation.isValid) {
          setSettingsWarning(validation.missingSettings);
        }
      } catch {
        // Silently ignore — don't block home screen for a settings check
      }
    })();
  }, []);

  const showSettingsWarning =
    settingsWarning !== null
    && settingsWarning.length > 0
    && !warningDismissed;

  // Sync flow data check — show prerequisites banner when health issues detected
  const [syncFlowBannerVisible, setSyncFlowBannerVisible] = useState(false);
  const [healthReason, setHealthReason] = useState<HealthReason>(null);

  useEffect(() => {
    void (async () => {
      try {
        const health = await checkPowerShieldHealth();
        setSyncFlowBannerVisible(!health.healthy);
        setHealthReason(health.reason);
      } catch {
        // Silently ignore — don't block home screen
      }
    })();
  }, []);

  const {
    requests,
    nonStatusFiltered,
    isLoading,
    refresh,
    searchTerm,
    setSearchTerm,
    showCapNotice,
    tileFilter,
    setTileFilter,
    serviceTreeFilter,
    setServiceTreeFilter,
    distinctServiceTrees,
    environmentGroupFilter,
    setEnvironmentGroupFilter,
    distinctEnvironmentGroups,
    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
    pageCount,
    totalFilteredCount,
  } = useRequestList();

  return (
    <>
      {/* Warning banners — shown above stat cards for immediate visibility */}
      {showSettingsWarning && (
        <MessageBar
          intent="warning"
          className={styles.messageBarCompact}
        >
          <MessageBarBody>
            <strong>Notification settings incomplete.</strong> Email notifications are
            disabled because the following settings are not configured:{' '}
            {settingsWarning.join(', ')}.{' '}
            <Button
              appearance="transparent"
              size="small"
              onClick={() => void navigate('/settings/setup?tab=notifications')}
              className={styles.warningLink}
            >
              Configure now →
            </Button>
          </MessageBarBody>
          <MessageBarActions>
            <Button
              appearance="transparent"
              size="small"
              onClick={() => setWarningDismissed(true)}
              aria-label="Dismiss"
            >
              Dismiss
            </Button>
          </MessageBarActions>
        </MessageBar>
      )}

      {/* Sync flow prerequisites banner — shown when connector/action tables are empty */}
      <SyncFlowPrerequisitesBanner visible={syncFlowBannerVisible} reason={healthReason} />

      {/* Stat cards — always 6 admin cards */}
      <StatsCards
        requests={nonStatusFiltered}
        isLoading={isLoading}
        activeTileStatuses={tileFilter}
        onTileClick={setTileFilter}
      />

      {/* Request list: filter bar + table */}
      <RequestListGrid
        requests={requests}
        isLoading={isLoading}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        showCapNotice={showCapNotice}
        refresh={refresh}
        tileFilter={tileFilter}
        onTileFilterChange={setTileFilter}
        serviceTreeFilter={serviceTreeFilter}
        onServiceTreeChange={setServiceTreeFilter}
        distinctServiceTrees={distinctServiceTrees}
        environmentGroupFilter={environmentGroupFilter}
        onEnvironmentGroupChange={setEnvironmentGroupFilter}
        distinctEnvironmentGroups={distinctEnvironmentGroups}
        currentPage={currentPage}
        onPageChange={setCurrentPage}
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        pageSizeOptions={PAGE_SIZE_OPTIONS}
        pageCount={pageCount}
        totalFilteredCount={totalFilteredCount}
      />
    </>
  );
}

export default HomeScreen;
