import { useState, useEffect } from 'react';
import { makeStyles, tokens } from '@fluentui/react-components';
import { useRequestList, PAGE_SIZE_OPTIONS } from '../hooks/useRequestList';
import { hasConnectors } from '../../../shared/services/dataverse/connectorService';
import { hasConnectorActions } from '../../../shared/services/dataverse/connectorActionsService';
import { StatsCards } from './StatsCards';
import { RequestListGrid } from './RequestListGrid';
import { SyncFlowPrerequisitesBanner } from './SyncFlowPrerequisitesBanner';

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const useStyles = makeStyles({
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXL,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Connector Requests tab body. The page header and (when Credits is enabled) the
 * request-type tabs are rendered by the shared PowerShieldLanding layout, so this
 * screen renders only the connector-specific content.
 */
export function HomeScreen() {
  const styles = useStyles();

  // Sync flow data check — show prerequisites banner when tables are empty
  const [syncFlowBannerVisible, setSyncFlowBannerVisible] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const [hasConn, hasAct] = await Promise.all([hasConnectors(), hasConnectorActions()]);
        setSyncFlowBannerVisible(!hasConn || !hasAct);
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
  } = useRequestList('maker');

  return (
    <div className={styles.body}>
      {/* Sync flow prerequisites banner — shown when connector/action tables are empty */}
      <SyncFlowPrerequisitesBanner visible={syncFlowBannerVisible} />

      {/* Stat cards */}
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
    </div>
  );
}

export default HomeScreen;
