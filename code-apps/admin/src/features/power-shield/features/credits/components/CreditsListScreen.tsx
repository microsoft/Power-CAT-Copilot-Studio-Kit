import { Link, MessageBar, MessageBarBody, makeStyles, tokens } from '@fluentui/react-components';
import { useCreditRequestList, CREDIT_PAGE_SIZE_OPTIONS } from '../hooks/useCreditRequestList';
import { CreditStatsCards } from './CreditStatsCards';
import { CreditListGrid } from './CreditListGrid';
import { PPAC_CAPACITY_LINK } from '../services/creditApprovalRules';
import { MAC_SCOPE_LEARN_URL, MAC_SCOPE_LIST_PPAC, MAC_SCOPE_LIST_TEXT } from './creditApproveText';

const useStyles = makeStyles({
  statsSpacer: {
    marginBottom: tokens.spacingVerticalL,
  },
});

/**
 * Copilot Credits tenant-wide triage list. Rendered inside the request-type tab
 * layout, which owns the page container and header row.
 */
export function CreditsListScreen() {
  const styles = useStyles();
  const {
    requests,
    nonBucketFiltered,
    isLoading,
    refresh,
    searchTerm,
    setSearchTerm,
    showCapNotice,
    bucketFilter,
    setBucketFilter,
    assignedToMe,
    setAssignedToMe,
    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
    pageCount,
    totalFilteredCount,
    sortState,
    setSortState,
  } = useCreditRequestList();

  return (
    <>
      <MessageBar intent="info" layout="multiline">
        <MessageBarBody>
          {MAC_SCOPE_LIST_TEXT}{' '}
          <Link href={PPAC_CAPACITY_LINK} target="_blank" rel="noopener noreferrer" inline>
            {MAC_SCOPE_LIST_PPAC}
          </Link>
          .{' '}
          <Link href={MAC_SCOPE_LEARN_URL} target="_blank" rel="noopener noreferrer" inline>
            Learn more
          </Link>
        </MessageBarBody>
      </MessageBar>

      <div className={styles.statsSpacer}>
        <CreditStatsCards
          requests={nonBucketFiltered}
          isLoading={isLoading}
          activeBucket={bucketFilter}
          onBucketClick={setBucketFilter}
        />
      </div>

      <CreditListGrid
        requests={requests}
        isLoading={isLoading}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        showCapNotice={showCapNotice}
        refresh={refresh}
        assignedToMe={assignedToMe}
        onAssignedToMeChange={setAssignedToMe}
        currentPage={currentPage}
        onPageChange={setCurrentPage}
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        pageSizeOptions={CREDIT_PAGE_SIZE_OPTIONS}
        pageCount={pageCount}
        totalFilteredCount={totalFilteredCount}
        sortState={sortState}
        onSortChange={setSortState}
      />
    </>
  );
}

export default CreditsListScreen;
