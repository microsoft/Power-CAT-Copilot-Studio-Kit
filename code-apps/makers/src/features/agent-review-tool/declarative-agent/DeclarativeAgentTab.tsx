/**
 * DeclarativeAgentTab
 *
 * DA tab root component.
 * Renders: DAStatCards + toolbar (Search, Refresh, Export All) + DAGrid.
 * Sends package reviews to the application-level durable review runner.
 * Wires "View Results" to the saved review route.
 * Wires Export All: useDAExportMutation.
 * Consumes pending file from page header ZIP upload.
 *
 * Per ui-specification.md Section 3–5, 9.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Input,
  Spinner,
  Text,
  Dropdown,
  Option,
  type OptionOnSelectData,
  type SelectionEvents,
  Toast,
  ToastTitle,
  Toaster,
  useToastController,
  useId,
  MessageBar,
  MessageBarBody,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components';
import {
  ArrowExportRegular,
  SearchRegular,
  ChevronLeftRegular,
  ChevronRightRegular,
} from '@fluentui/react-icons';
import { DAStatCards } from './components/DAStatCards';
import { DAGrid } from './components/DAGrid';
import { useDAReviews } from './hooks/useDAReviews';
import { useDAExportMutation } from './hooks/useDAExportMutation';
import type { DAGridRow } from './contracts/DAReviewRecord';
import { parseDAZip } from './utils/zipParser';
import { useDAReviewRunner } from './context/daReviewRunnerContext';

const DA_PAGE_SIZE_OPTIONS = [5, 10, 25, 50, 100];

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    width: '100%',
  },
  sectionTitle: {
    marginTop: '24px',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '16px',
    width: '100%',
  },
  toolbarLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
  searchInput: {
    minWidth: '300px',
    maxWidth: '400px',
  },
  gridContainer: {
    border: '1px solid #E0E0E0',
    borderRadius: '8px',
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.12), 0 0 1px rgba(0, 0, 0, 0.04)',
  },
  // Pagination — identical to CS Pagination component
  paginationContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: '32px',
    paddingTop: '24px',
    borderTop: '1px solid #e0e0e0',
  },
  pageSizeSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  paginationLabel: {
    fontSize: '14px',
    color: '#242424',
  },
  dropdown: {
    minWidth: '80px',
    width: '80px',
    height: '32px',
  },
  navigationSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  navButton: {
    height: '32px',
    border: '0.8px solid rgba(0,0,0,0)',
    borderRadius: '4px',
    '&:hover': { backgroundColor: '#f5f5f5' },
    '&:disabled': { color: '#bdbdbd' },
  },
  previousButton: { minWidth: '106px' },
  nextButton: { minWidth: '96px' },
  pageInfo: {
    fontSize: '14px',
    color: '#242424',
  },
});

export interface DeclarativeAgentTabProps {
  /** Callback to trigger ZIP upload (from page header button) */
  onUploadZip?: () => void;
  /** A ZIP file that was selected via the header button and routed here */
  pendingFile?: File | null;
  /** Called after the tab consumes the pending file */
  onPendingFileConsumed?: () => void;
}

/**
 * DeclarativeAgentTab component
 *
 * Root component for the Declarative Agents tab.
 */
export function DeclarativeAgentTab({
  onUploadZip,
  pendingFile,
  onPendingFileConsumed,
}: DeclarativeAgentTabProps) {
  const styles = useStyles();
  const toasterId = useId('da-tab-toaster');
  const { dispatchToast } = useToastController(toasterId);
  const navigate = useNavigate();

  const { data: reviews = [], isLoading: reviewsLoading } = useDAReviews();
  const reviewRunner = useDAReviewRunner();
  const { exportExcel, isExcelPending } = useDAExportMutation();

  const [searchValue, setSearchValue] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  // Build grid rows from reviewed DAs only
  const allGridRows = useMemo((): DAGridRow[] => {
    return reviews.map((r) => ({
      reviewId: r.reviewId,
      componentIdUnique: r.componentIdUnique,
      agentName: r.agentName,
      agentVersion: r.agentVersion,
      publisherName: r.publisherName,
      overallScore: r.overallScore ?? undefined,
      reviewedOn: r.reviewedOn,
      sourceType: r.sourceType,
      iconBase64: r.iconBase64,
      action: 'view-results' as const,
    }));
  }, [reviews]);

  // Client-side search filter
  const filteredRows = useMemo((): DAGridRow[] => {
    if (!searchValue.trim()) return allGridRows;
    const lower = searchValue.toLowerCase();
    return allGridRows.filter(
      (r) =>
        r.agentName.toLowerCase().includes(lower) ||
        (r.publisherName ?? '').toLowerCase().includes(lower)
    );
  }, [allGridRows, searchValue]);

  const totalCount = filteredRows.length;

  // Paginated slice for the current page
  const gridRows = useMemo((): DAGridRow[] => {
    const start = currentPage * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, currentPage, pageSize]);

  // Process pending ZIP file (routed from header Upload ZIP button)
  useEffect(() => {
    if (!pendingFile) return;

    const process = async () => {
      try {
        setParseError(null);
        const {
          manifest,
          packageEvidence,
          skillBundles,
          warning,
        } = await parseDAZip(pendingFile);

        if (warning) {
          dispatchToast(
            <Toast><ToastTitle>{warning}</ToastTitle></Toast>,
            { intent: 'warning' }
          );
        }

        reviewRunner.start({
          manifest,
          packageEvidence,
          skillBundles,
          sourceType: 'zip',
        });
      } catch (err) {
        setParseError(err instanceof Error ? err.message : 'Failed to process ZIP file');
      } finally {
        onPendingFileConsumed?.();
      }
    };

    process();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingFile]);

  // "Review" always prompts ZIP upload — ZIP is the only source
  const handleReview = useCallback(() => {
    onUploadZip?.();
  }, [onUploadZip]);

  const handleViewResults = useCallback(async (row: DAGridRow) => {
    const flatReview = reviews.find((r) => r.componentIdUnique === row.componentIdUnique);
    if (!flatReview?.reviewId) return;
    navigate(`/agent-review-tool/declarative/${flatReview.reviewId}`);
  }, [reviews, navigate]);

  const handleExportAll = useCallback(async () => {
    if (reviews.length === 0) return;
    try {
      await exportExcel(reviews);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Excel export failed';
      setParseError(msg);
    }
  }, [reviews, exportExcel]);

  return (
    <div className={styles.container}>
      <Toaster toasterId={toasterId} />

      {parseError && (
        <MessageBar intent="error">
          <MessageBarBody>{parseError}</MessageBarBody>
        </MessageBar>
      )}

      {/* Quick Stats */}
      <Text size={500} weight="semibold" className={styles.sectionTitle}>Quick Stats</Text>
      <DAStatCards reviews={reviews} isLoading={reviewsLoading} />

      {/* My Agents section header */}
      <Text size={500} weight="semibold" className={styles.sectionTitle}>My Agents</Text>

      {/* Toolbar — actions left, search right */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <Button
            appearance="subtle"
            icon={isExcelPending ? <Spinner size="tiny" /> : <ArrowExportRegular />}
            disabled={reviews.length === 0 || isExcelPending}
            onClick={() => void handleExportAll()}
            aria-label="Export All"
          >
            {isExcelPending ? 'Exporting...' : 'Export All'}
          </Button>
        </div>
        <Input
          className={styles.searchInput}
          placeholder="Search agents..."
          contentBefore={<SearchRegular />}
          value={searchValue}
          onChange={(_, d) => { setSearchValue(d.value); setCurrentPage(0); }}
          aria-label="Search agents"
        />
      </div>

      {/* Grid — bordered container matching CS tab */}
      <div className={styles.gridContainer}>
        <DAGrid
          rows={gridRows}
          isLoading={reviewsLoading}
          onReview={() => handleReview()}
          onViewResults={(row) => void handleViewResults(row)}
          onUploadZip={onUploadZip ?? (() => undefined)}
        />
      </div>

      {/* Pagination — outside the grid container, matching CS Pagination exactly */}
      {gridRows.length > 0 && (
        <div className={styles.paginationContainer}>
          <div className={styles.pageSizeSection}>
            <Text className={styles.paginationLabel}>Show</Text>
            <Dropdown
              value={String(pageSize)}
              selectedOptions={[String(pageSize)]}
              onOptionSelect={(_: SelectionEvents, data: OptionOnSelectData) => {
                if (data.optionValue) { setPageSize(parseInt(data.optionValue, 10)); setCurrentPage(0); }
              }}
              className={styles.dropdown}
            >
              {DA_PAGE_SIZE_OPTIONS.map((s) => (
                <Option key={s} value={String(s)}>{String(s)}</Option>
              ))}
            </Dropdown>
            <Text className={styles.paginationLabel}>records per page</Text>
          </div>
          <div className={styles.navigationSection}>
            <Button
              icon={<ChevronLeftRegular />}
              onClick={() => setCurrentPage((p) => p - 1)}
              disabled={currentPage === 0}
              className={mergeClasses(styles.navButton, styles.previousButton)}
            >
              Previous
            </Button>
            <Text className={styles.pageInfo} aria-live="polite" aria-atomic="true">
              Page {currentPage + 1} of {Math.max(1, Math.ceil(totalCount / pageSize))} ({totalCount} total records)
            </Text>
            <Button
              icon={<ChevronRightRegular />}
              iconPosition="after"
              onClick={() => setCurrentPage((p) => p + 1)}
              disabled={currentPage >= Math.ceil(totalCount / pageSize) - 1}
              className={mergeClasses(styles.navButton, styles.nextButton)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

    </div>
  );
}
