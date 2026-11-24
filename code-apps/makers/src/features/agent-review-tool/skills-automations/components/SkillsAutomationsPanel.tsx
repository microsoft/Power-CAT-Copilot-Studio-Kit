/**
 * SkillsAutomationsPanel
 *
 * The third tab of the Agent Review Tool. Unlike the other two tabs, which read
 * agents already present in the tenant, this one reviews a file the user
 * uploads — a skill or automation has no tenant record to read from.
 *
 * The panel itself is not themed: the landing view sits inside the dashboard tab
 * with the page header and tab bar on screen, and flipping the app's colour
 * there would have nothing to explain it. The results view is themed, by
 * `ReviewPageShell` in embedded mode — the indigo palette arrives with the
 * results and leaves with them, which is the same rule the two full-page review
 * routes follow.
 */
import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Body1,
  Button,
  Caption1,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Input,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Popover,
  PopoverSurface,
  PopoverTrigger,
  Text,
  Title3,
  makeStyles,
  shorthands,
  tokens,
} from '@fluentui/react-components';
import {
  ArrowSyncRegular,
  InfoRegular,
  OpenRegular,
  SearchRegular,
} from '@fluentui/react-icons';
import { Pagination } from '../../components/core/Pagination';
import { ReviewProgressDialog } from '../../components/dialogs/ReviewProgressDialog';
import { useFilterContext } from '../../context/FilterContext';
import type {
  ArtifactFinding,
  ArtifactReviewResult,
  TargetRuntime,
  UploadedArtifact,
} from '../contracts/ArtifactReview';
import { isAssessedStatus } from '../contracts/ArtifactReview';
import { formatRelativeReviewDate } from '../../utils/reviewGridFormat';
import { useArtifactHistory } from '../hooks/useArtifactHistory';
import { useArtifactReviewRunner } from '../context/artifactReviewRunnerContext';
import { prepareArtifactUpload } from '../services/artifactUploadPreparation';
import {
  findArtifactReview,
  type StoredArtifactReview,
} from '../services/artifactReviewStore';
import { ArtifactHistoryList } from './ArtifactHistoryList';
import { ArtifactResultsPanel } from './ArtifactResultsPanel';
import {
  buildArtifactProgressStages,
  buildArtifactScopeSummary,
  SLOW_REVIEW_AFTER_MS,
  SLOW_REVIEW_NOTE,
} from './artifactProgressStages';
import { ArtifactUploadDialog } from './ArtifactUploadDialog';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    ...shorthands.padding(0),
  },
  intro: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXS, maxWidth: '760px' },
  muted: { color: tokens.colorNeutralForeground3 },
  // MessageBarTitle renders inline, so body copy placed straight after it reads as one
  // run-on sentence. A block wrapper puts the body on its own line, matching HeroSection.
  bannerBody: { display: 'block', marginTop: tokens.spacingVerticalXXS },
  // Section header, toolbar and grid frame copied from DeclarativeAgentTab, so
  // the three review tabs frame their grids identically.
  // The heading carries the scoring explanation behind an info button. It
  // cannot sit in the Score column header: that header is the sort control, a
  // `role="button"`, and a popover trigger inside it would nest one button in
  // another. The heading is the nearest place that governs the whole grid.
  sectionHeaderRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    maxWidth: '1100px',
    marginTop: '8px',
  },
  infoButton: { color: tokens.colorNeutralForeground3 },
  // Fluent gives Button `min-width: 96px`, which cancels the automatic minimum
  // size a flex item would otherwise get from its own content. DialogActions
  // then sits in a `1fr` grid column, roughly half the 600px surface, so two
  // buttons are squeezed to about 134px each and the label wraps onto a second
  // line, doubling their height. `nowrap` restores the content minimum: the
  // grid column grows to fit and the buttons stay one line tall.
  dialogActionButton: { whiteSpace: 'nowrap' },
  popoverSurface: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    maxWidth: '360px',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: tokens.spacingHorizontalM,
    width: '100%',
    maxWidth: '1100px',
  },
  searchInput: { minWidth: '300px', maxWidth: '400px' },
  gridContainer: {
    border: '1px solid #E0E0E0',
    borderRadius: '8px',
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.12), 0 0 1px rgba(0, 0, 0, 0.04)',
    maxWidth: '1100px',
  },
  pagination: { maxWidth: '1100px' },
});

/**
 * Router state accepted on the way back from a result page.
 */
export interface SkillsTabLocationState {
  /** Set by "Review another", so the reader lands on the upload dialog. */
  openUpload?: boolean;
}

export interface SkillsAutomationsPanelProps {
  /**
   * Controlled open state for the upload dialog. The trigger lives in the page
   * header, next to "Review from ZIP", so the parent owns this. Left undefined,
   * the panel falls back to its own state.
   */
  uploadOpen?: boolean;
  onUploadOpenChange?: (open: boolean) => void;
}

export function SkillsAutomationsPanel({
  uploadOpen: uploadOpenProp,
  onUploadOpenChange,
}: SkillsAutomationsPanelProps = {}) {
  const styles = useStyles();
  const navigate = useNavigate();
  // Falls back to local state only when no parent controls the dialog. The tab
  // is always mounted by `Dashboard`, which owns this so that the trigger in
  // the page header can open it — and which seeds it from the "Review another"
  // handover carried in router state.
  const [uploadOpenInternal, setUploadOpenInternal] = useState(false);
  const uploadOpen = uploadOpenProp ?? uploadOpenInternal;
  const setUploadOpen = useCallback(
    (open: boolean) => {
      setUploadOpenInternal(open);
      onUploadOpenChange?.(open);
    },
    [onUploadOpenChange],
  );

  /**
   * Opens a saved review on its own screen.
   *
   * The result travels in router state so the page paints at once instead of
   * waiting for Dataverse to return a row that is already in hand; the id in
   * the path remains the source of truth on reload or on a shared link.
   */
  const openReview = useCallback(
    (reviewId: string, result: ArtifactReviewResult) => {
      navigate(`/agent-review-tool/skills/${reviewId}`, { state: { result } });
    },
    [navigate],
  );

  const [searchValue, setSearchValue] = useState('');
  const { currentPage, pageSize, setCurrentPage } = useFilterContext();
  const [selectedFinding, setSelectedFinding] = useState<ArtifactFinding | null>(null);
  // Application-wide, not panel-owned. The review must survive this tab being
  // unmounted — which happens on every tab switch — so its state, its save and
  // its completion handover all live above the router.
  const {
    phase,
    progress,
    result,
    artifactName,
    error,
    startedAt,
    start,
    cancel,
    reset,
    watching,
    sendToBackground,
    saveError,
  } = useArtifactReviewRunner();
  const {
    entries: historyEntries,
    isLoading: historyLoading,
    loadError: historyLoadError,
    refresh: refreshHistory,
  } = useArtifactHistory();
  // An upload that matches a review already in the environment. Holding it here
  // lets the user decide before an AI call is spent on the same bytes twice.
  const [duplicate, setDuplicate] = useState<{
    file: File;
    runtimes: TargetRuntime[];
    artifact: UploadedArtifact;
    existing: StoredArtifactReview;
  } | null>(null);

  // Record a finished review once, then hand the reader over to its own page.
  // Both steps now belong to `ArtifactReviewRunnerProvider`: a review that
  // finishes while this tab is unmounted must still be saved, and the reader
  // must still be told about it.

  const handleSubmit = useCallback(
    async (file: File, runtimes: TargetRuntime[]): Promise<string | null> => {
      const prepared = await prepareArtifactUpload(file);
      if (!prepared.ok) return prepared.error;

      let existing: StoredArtifactReview | null = null;
      try {
        existing = await findArtifactReview(prepared.artifact.hash, runtimes);
      } catch {
        // A lookup that fails must not stop the review. The worst outcome is
        // a duplicate row, which the upsert on save then collapses anyway.
        existing = null;
      }
      if (existing) {
        setDuplicate({ file, runtimes, artifact: prepared.artifact, existing });
        return null;
      }
      void start(file, runtimes, prepared.artifact);
      return null;
    },
    [start],
  );

  /** Show the stored result instead of paying for the same review again. */
  const handleOpenDuplicate = useCallback(() => {
    if (!duplicate) return;
    const { existing } = duplicate;
    setDuplicate(null);
    reset();
    openReview(existing.reviewId, existing.result);
  }, [duplicate, reset, openReview]);

  /** Review the same bytes again. The stored row is replaced on save. */
  const handleReviewAnyway = useCallback(() => {
    if (!duplicate) return;
    const { file, runtimes, artifact } = duplicate;
    setDuplicate(null);
    void start(file, runtimes, artifact);
  }, [duplicate, start]);

  // Which of the three cases the matched record is. A running or stopped record
  // has no score, no verdicts and a placeholder recommendation, so the dialog
  // must not offer to open it as though it were a result.
  const duplicateStatus = duplicate?.existing.result.status;
  const duplicateRunning = duplicateStatus === 'in-progress';
  const duplicateStopped = duplicateStatus === 'failed';
  const duplicateAssessed = duplicateStatus ? isAssessedStatus(duplicateStatus) : false;
  const duplicateStartedOn = duplicate?.existing.result.startedAt
    ? new Date(duplicate.existing.result.startedAt)
    : duplicate?.existing.reviewedOn;

  const handleReviewAnother = useCallback(() => {
    setSelectedFinding(null);
    reset();
    setUploadOpen(true);
  }, [reset, setUploadOpen]);

  const handleBackToList = useCallback(() => {
    setSelectedFinding(null);
    reset();
  }, [reset]);

  const handleOpenFromHistory = useCallback(
    (stored: StoredArtifactReview) => {
      // Clears any live result first, so the page this opens is the stored one
      // and not whatever was last reviewed here.
      reset();
      openReview(stored.reviewId, stored.result);
    },
    [reset, openReview],
  );

  /**
   * A finished review still on this tab means the save did not yield an id, so
   * there is no page to send the reader to. Showing it here beats losing it.
   */
  const displayedResult = phase === 'results' ? result : null;

  const visibleHistoryEntries = useMemo(() => {
    const term = searchValue.trim().toLowerCase();
    if (!term) return historyEntries;
    return historyEntries.filter((e) => e.artifactName.toLowerCase().includes(term));
  }, [historyEntries, searchValue]);

  const paginatedHistoryEntries = useMemo(() => {
    const start = currentPage * pageSize;
    return visibleHistoryEntries.slice(start, start + pageSize);
  }, [currentPage, pageSize, visibleHistoryEntries]);

  return (
    <div className={styles.root}>
      {saveError && (
        <MessageBar intent="warning">
          <MessageBarBody>
            <MessageBarTitle>The list of past reviews was not updated</MessageBarTitle>
            <div className={styles.bannerBody}>
              {saveError} Any result on screen is still complete, but the change may not be
              visible to your team.
            </div>
          </MessageBarBody>
        </MessageBar>
      )}
      {displayedResult ? (
        <ArtifactResultsPanel
          embedded
          result={displayedResult}
          selectedFinding={selectedFinding}
          onSelectFinding={setSelectedFinding}
          onDismissFinding={() => setSelectedFinding(null)}
          onReviewAnother={handleReviewAnother}
          onBack={handleBackToList}
        />
      ) : (
          <>
            <div className={styles.intro}>
              <Title3 as="h2">Skills and automations</Title3>
              <Body1 className={styles.muted}>
                Upload a skill bundle or Scout automation file to review its authoring quality against
                Microsoft-published guidance and assess its documented compatibility with Copilot Cowork,
                Microsoft Scout, and Copilot Studio.
              </Body1>
            </div>

            {phase === 'error' && error && (
              <MessageBar intent="error">
                <MessageBarBody>
                  <MessageBarTitle>The upload could not be read</MessageBarTitle>
                  <div className={styles.bannerBody}>{error}</div>
                </MessageBarBody>
              </MessageBar>
            )}

            <div className={styles.sectionHeaderRow}>
              <Text size={500} weight="semibold">
                Reviewed skills and automations
              </Text>
              <Popover withArrow positioning="after">
                <PopoverTrigger disableButtonEnhancement>
                  <Button
                    appearance="transparent"
                    size="small"
                    className={styles.infoButton}
                    icon={<InfoRegular />}
                    aria-label="What the score column means"
                  />
                </PopoverTrigger>
                <PopoverSurface className={styles.popoverSurface}>
                  {/*
                    This explains the Score column only. The six dimensions and
                    the weight each one carried are on the review itself, beside
                    the overall score, and that is the only place they can be
                    stated truthfully: a dimension that could not be assessed is
                    dropped and its weight shared out, so the real weights differ
                    per review. Repeating the nominal table here would sooner or
                    later contradict the review the reader then opens.
                  */}
                  <Caption1>
                    One number per row, so two skills can be compared directly. It is a weighted mean of
                    six dimensions from Microsoft&apos;s published skill-authoring guidance, each scored out
                    of 5. The weighting is this tool&apos;s own — the published guidance states none.
                  </Caption1>
                  <Caption1 className={styles.muted}>
                    Open a review to see the six dimensions, what each one asks, and the weight it carried
                    in that review.
                  </Caption1>
                </PopoverSurface>
              </Popover>
            </div>

            {/*
              Toolbar. The entry action ("Review a skill or automation") is not
              here — it sits in the page header, matching the other two tabs.
              This row is for acting on the list that exists, so it holds search
              only. The empty grid keeps its own centred call to action for the
              first run.
            */}
            {historyEntries.length > 0 && (
              <div className={styles.toolbar}>
                <Input
                  className={styles.searchInput}
                  placeholder="Search skills and automations..."
                  contentBefore={<SearchRegular />}
                  value={searchValue}
                  onChange={(_, d) => {
                    setSearchValue(d.value);
                    setCurrentPage(0);
                  }}
                  aria-label="Search skills and automations"
                />
              </div>
            )}

            <div className={styles.gridContainer}>
              <ArtifactHistoryList
                entries={paginatedHistoryEntries}
                isLoading={historyLoading}
                loadError={historyLoadError}
                onOpen={handleOpenFromHistory}
                onRetry={refreshHistory}
                onUpload={() => setUploadOpen(true)}
                searchTerm={searchValue}
                onClearSearch={() => setSearchValue('')}
              />
            </div>

            {visibleHistoryEntries.length > 0 && (
              <div className={styles.pagination}>
                <Pagination
                  totalRecords={visibleHistoryEntries.length}
                  unfilteredCount={historyEntries.length}
                />
              </div>
            )}
            {/*
              No privacy or scope caption here. "Files are read in your browser"
              would promise that nothing leaves the machine, which is not true —
              the AI stage sends text onward, and the upload dialog says so at
              the moment the reader chooses to upload. The "not a Microsoft
              certification" scope note lives in the score help, where a score
              could otherwise be mistaken for approval.
            */}
          </>
        )}

        <ArtifactUploadDialog open={uploadOpen} onOpenChange={setUploadOpen} onSubmit={handleSubmit} />

        {/*
          The already-reviewed guard. A review costs an AI call, so an upload
          that matches a stored record offers it before spending one.

          The record may be a finished review, a review still running, or one
          that stopped. All three match the same bytes and the same runtimes,
          but only the first has anything to open — so the dialog says which
          case it is rather than offering a result that does not exist.

          Each body used to end by restating the buttons — "You can open that
          review, or run a new one". The buttons already say that, and the extra
          line wrapped the labels onto two rows, which made them tall and
          out of proportion with the dialog. The body now states the fact only.
        */}
        <Dialog open={duplicate !== null} onOpenChange={(_, data) => !data.open && setDuplicate(null)}>
          <DialogSurface>
            <DialogBody>
              <DialogTitle>
                {duplicateRunning
                  ? 'This file is already being reviewed'
                  : duplicateStopped
                    ? 'This file was reviewed before, but it did not finish'
                    : 'This file has already been reviewed'}
              </DialogTitle>
              <DialogContent>
                <Body1>
                  {duplicateRunning ? (
                    <>
                      A review of {duplicate?.existing.artifactName} against the same runtimes
                      started {formatRelativeReviewDate(duplicateStartedOn)} and has not finished.
                      Its result appears in the list below.
                    </>
                  ) : duplicateStopped ? (
                    <>
                      {duplicate?.existing.artifactName} was reviewed against the same runtimes, but
                      that review stopped before it scored anything.
                    </>
                  ) : (
                    <>
                      {duplicate?.existing.artifactName} was reviewed against the same runtimes on{' '}
                      {duplicate?.existing.result.reviewedAt
                        ? new Date(duplicate.existing.result.reviewedAt).toLocaleDateString(
                            undefined,
                            { year: 'numeric', month: 'short', day: 'numeric' },
                          )
                        : 'an earlier date'}
                      , and has not changed since.
                    </>
                  )}
                </Body1>
              </DialogContent>
              <DialogActions>
                {duplicateAssessed ? (
                  <>
                    <Button
                      className={styles.dialogActionButton}
                      appearance="secondary"
                      icon={<ArrowSyncRegular />}
                      onClick={handleReviewAnyway}
                    >
                      Review again
                    </Button>
                    <Button
                      className={styles.dialogActionButton}
                      appearance="primary"
                      icon={<OpenRegular />}
                      onClick={handleOpenDuplicate}
                    >
                      Open review
                    </Button>
                  </>
                ) : duplicateRunning ? (
                  <>
                    <Button
                      className={styles.dialogActionButton}
                      appearance="secondary"
                      icon={<ArrowSyncRegular />}
                      onClick={handleReviewAnyway}
                    >
                      Review again
                    </Button>
                    <Button
                      className={styles.dialogActionButton}
                      appearance="primary"
                      onClick={() => setDuplicate(null)}
                    >
                      Wait for it
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      className={styles.dialogActionButton}
                      appearance="secondary"
                      onClick={() => setDuplicate(null)}
                    >
                      Cancel
                    </Button>
                    <Button
                      className={styles.dialogActionButton}
                      appearance="primary"
                      icon={<ArrowSyncRegular />}
                      onClick={handleReviewAnyway}
                    >
                      Review again
                    </Button>
                  </>
                )}
              </DialogActions>
            </DialogBody>
          </DialogSurface>
        </Dialog>

        {/*
          The shared dialog, not a local one: it carries the workflow
          attribution mark, and the AI stage of this review is served by the
          same modern workflow the Copilot Studio review uses.
        */}
        <ReviewProgressDialog
          open={watching && (phase === 'reading' || phase === 'reviewing')}
          botName={artifactName}
          stages={buildArtifactProgressStages(progress ?? undefined)}
          error={null}
          onRetry={cancel}
          onCancel={cancel}
          titleIconColor={tokens.colorBrandForeground1}
          startedAt={startedAt}
          scopeSummary={buildArtifactScopeSummary(progress ?? undefined)}
          slowAfterMs={SLOW_REVIEW_AFTER_MS}
          slowNote={SLOW_REVIEW_NOTE}
          onContinueInBackground={sendToBackground}
        />

    </div>
  );
}
