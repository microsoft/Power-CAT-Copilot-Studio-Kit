import { Link, MessageBar, MessageBarBody, makeStyles, tokens } from '@fluentui/react-components';
import { useCreditRequestList, CREDIT_PAGE_SIZE_OPTIONS } from '../hooks/useCreditRequestList';
import { CreditStatsCards } from './CreditStatsCards';
import { CreditRequestListGrid } from './CreditRequestListGrid';

// ─────────────────────────────────────────────────────────────────────────────
// Copilot Credits landing (T032). Composes the stat cards, filters, search and
// paginated list. Rendered inside the Power Shield landing layout (shared header
// + tabs).
// ─────────────────────────────────────────────────────────────────────────────

// No API reveals whether a Microsoft 365 admin center spending policy covers an
// environment, so this notice is static and shown to every maker.
const MAC_SCOPE_LEARN_URL =
  'https://learn.microsoft.com/copilot/implement/usage-based-billing-manage-copilot-studio-costs';
const MAC_SCOPE_TEXT =
  'You can request credits for environments whose Copilot Credits are managed in the Power Platform admin center.';

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
  },
});

export function CreditHomeScreen() {
  const styles = useStyles();

  const {
    requests,
    nonBucketFiltered,
    isLoading,
    error,
    refresh,
    searchTerm,
    setSearchTerm,
    showCapNotice,
    bucketFilter,
    setBucketFilter,
    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
    pageCount,
    totalFilteredCount,
  } = useCreditRequestList();

  return (
    <div className={styles.container}>
      <MessageBar intent="info" layout="multiline">
        <MessageBarBody>
          {MAC_SCOPE_TEXT}{' '}
          <Link href={MAC_SCOPE_LEARN_URL} target="_blank" rel="noopener noreferrer" inline>
            Learn more
          </Link>
        </MessageBarBody>
      </MessageBar>

      <CreditStatsCards
        requests={nonBucketFiltered}
        isLoading={isLoading}
        activeBucket={bucketFilter}
        onBucketClick={setBucketFilter}
      />

      <CreditRequestListGrid
        requests={requests}
        isLoading={isLoading}
        error={error}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        showCapNotice={showCapNotice}
        refresh={refresh}
        hasActiveBucketFilter={bucketFilter !== null}
        onClearBucketFilter={() => setBucketFilter(null)}
        currentPage={currentPage}
        onPageChange={setCurrentPage}
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        pageSizeOptions={CREDIT_PAGE_SIZE_OPTIONS}
        pageCount={pageCount}
        totalFilteredCount={totalFilteredCount}
      />
    </div>
  );
}

export default CreditHomeScreen;
