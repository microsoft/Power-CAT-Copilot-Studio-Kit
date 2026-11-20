/**
 * Dashboard Component
 *
 * Main dashboard layout for Agent Review Tool.
 * Contains a TabList to switch between CS agents and DA agents.
 *
 * Layout structure:
 * - PageHeader (title + Upload ZIP button + Help)
 * - TabList (Copilot Studio Agents | M365 Agents)
 * - Divider
 * - Tab-scoped content (stat cards, toolbar, grid)
 *
 * Zero regression rule: CS rendering path is unchanged — only wrapped in
 * an activeAgentType === 'copilot-studio' conditional.
 */

import { useMemo, useState, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Pagination } from './core/Pagination';
import {
  SearchBox,
  makeStyles,
  Text,
  Toast,
  Toaster,
  useId,
  useToastController,
  ToastTitle,
  TabList,
  Tab,
  Button,
  MessageBar,
  MessageBarBody,
  Tooltip,
  tokens,
  Spinner,
  Link,
  useRestoreFocusTarget,
} from '@fluentui/react-components';
import {
  DocumentBulletListRegular,
  FolderZipRegular,
  PuzzlePieceColor,
  QuestionCircleRegular,
} from '@fluentui/react-icons';
import { CSZipBotSelectorDialog } from './dialogs/CSZipBotSelectorDialog';
import { PageHeader } from './core/PageHeader';
import { StatCard } from './core/StatCard';
import { ActionToolbar } from './core/ActionToolbar';
import { QuickLinks } from './core/QuickLinks';
import { BotsGrid } from './grids/BotsGrid';
import { ReviewDialogV2 } from './dialogs/ReviewDialogV2';
import { WelcomeTour } from './tour/WelcomeTour';
import { useAllBots } from '../hooks/useAllBots';
import { useExistingReviews } from '../hooks/useExistingReviews';
import { useReviewDetails } from '../hooks/useReviewDetails';
import { useExportMutation } from '../hooks/useExportMutation';
import { useFRE } from '../hooks/useFRE';
import { reviewService } from '../services/ReviewService';
import { useFilterContext } from '../context/FilterContext';
import type { AgentTab } from '../context/FilterState';
import type { CSZipBot, CSZipParseResult } from '../declarative-agent/utils/csZipParser';
import { generateSARIF, downloadSarif, downloadPdf } from '../utils/exportUtils';
import { generateCsPdfReport } from '../utils/csPdfUtils';
import { composeReviewResult } from '../utils/composeReviewResult';
import { DeclarativeAgentTab } from '../declarative-agent/DeclarativeAgentTab';
import { SkillsAutomationsPanel, type SkillsTabLocationState } from '../skills-automations/components/SkillsAutomationsPanel';
import type { CopilotReviewZipData } from '../agents-experience/hooks/useCopilotReviewMutation';
import { useCopilotReviewRunner } from '../agents-experience/context/copilotReviewRunnerContext';
import { useStandardReviewRunner } from '../context/standardReviewRunnerContext';
import { buildViewSearchParams } from '../agents-experience/utils/copilotReviewRouteState';
import { UNSUPPORTED_HARNESS_MESSAGE } from '../agents-experience/services/detection';
import { resolveSavedReviewHarness, startReviewForHarness } from '../utils/agentHarness';

// Import product icons as URL strings (not available in @fluentui/react-icons)
import CopilotStudioIcon from '../assets/CopilotStudio_scalable.svg';
import M365CopilotIcon from '../assets/M365Copilot.png?inline';

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    width: '100%',
  },
  pageHeaderRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    width: '100%',
  },
  pageHeaderActions: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    alignItems: 'center',
    paddingBottom: '4px',
  },
  tabListRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '16px',
  },
  gridContainer: {
    border: '1px solid #E0E0E0',
    borderRadius: '8px',
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.12), 0 0 1px rgba(0, 0, 0, 0.04)',
  },
  toolbarRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '16px',
    width: '100%',
  },
  searchBox: {
    minWidth: '300px',
    maxWidth: '400px',
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px',
    gap: '16px',
  },
  sectionTitle: {
    marginTop: '24px',
  },
  tabIcon: {
    display: 'flex',
    alignItems: 'center',
  },
  hiddenInput: {
    display: 'none',
  },
});

interface CopilotReviewTarget {
  botId: string;
  name: string;
  componentIdUnique: string;
  agentVersion?: string;
  zipData?: CopilotReviewZipData;
}

/**
 * Dashboard component
 *
 * Main UI for viewing and managing agent reviews.
 *
 * @example
 * ```tsx
 * <FilterProvider>
 *   <Dashboard />
 * </FilterProvider>
 * ```
 */
export function Dashboard() {
  const styles = useStyles();
  const navigate = useNavigate();
  const copilotRunner = useCopilotReviewRunner();
  const standardRunner = useStandardReviewRunner();
  const {
    searchQuery,
    setSearchQuery,
    openReviewDialog,
    isReviewDialogOpen,
    reviewDialogBotId,
    closeReviewDialog,
    selectedOrgUrl,
    selectedEnvironmentId,
    activeAgentType,
    setActiveAgentType,
  } = useFilterContext();

  // Toast notifications
  const toasterId = useId('toaster');
  const { dispatchToast } = useToastController(toasterId);

  // Download loading state
  const [isPdfDownloading, setIsPdfDownloading] = useState(false);
  const [isSarifDownloading, setIsSarifDownloading] = useState(false);

  // Upload ZIP state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadParsing, setIsUploadParsing] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pendingDAFile, setPendingDAFile] = useState<File | null>(null);

  // CS ZIP selector state — set after parsing, cleared after selection or cancel
  const [pendingCSZip, setPendingCSZip] = useState<{
    file: File;
    parsed: CSZipParseResult;
  } | null>(null);

  // Skills & Automations upload dialog. The dialog lives in the panel, but its
  // trigger sits in the page header alongside "Review from ZIP", so the open
  // state is owned here and passed down.
  // "Review another" on a Skills and Automations result page returns here and
  // asks for the upload dialog. Read once at mount from router state: it leaves
  // no flag in the URL to go stale and does not survive a reload, which suits a
  // one-shot handover. This state lives here because the dialog's trigger is in
  // the page header, which this component owns.
  const skillsHandover = useLocation().state as SkillsTabLocationState | null;
  const [skillsUploadOpen, setSkillsUploadOpen] = useState(
    () => skillsHandover?.openUpload === true,
  );
  // The dialog is not opened by a DialogTrigger, so Tabster's restorer history
  // stays empty and focus lands on <body> when the dialog closes. Marking the
  // trigger gives it somewhere to go back to.
  const skillsUploadFocusTarget = useRestoreFocusTarget();

  // Welcome Tour
  const quickStatsRef = useRef<HTMLDivElement>(null);
  const reviewButtonRef = useRef<HTMLButtonElement>(null);
  const viewButtonRef = useRef<HTMLButtonElement>(null);

  const { shouldShowTour, currentStep: tourStep, nextStep: handleTourNext, previousStep: handleTourPrevious, completeTour: handleTourDismiss } = useFRE();
  const showTour = shouldShowTour;

  // Fetch data (CS agents only — DA data fetched by DeclarativeAgentTab)
  const { data: bots = [], isLoading: botsLoading } = useAllBots(selectedOrgUrl);
  // Fetch all user-owned reviews (no botId filter) — Dataverse User-level read
  // scopes to current user automatically, covering both Dataverse + ZIP reviews
  const { data: reviews = [], isLoading: reviewsLoading } = useExistingReviews(selectedOrgUrl);

  // CS export mutation
  const exportMutation = useExportMutation();

  // Calculate CS stats
  const stats = useMemo(() => {
    return reviewService.calculateDashboardStats(bots, reviews);
  }, [bots, reviews]);

  // Get CS grid rows
  const gridRows = useMemo(() => {
    return reviewService.getReviewGridRows(bots, reviews);
  }, [bots, reviews]);

  // Filtered count — mirrors BotsGrid filter logic, used for Pagination outside gridContainer
  const filteredCount = useMemo(() => {
    if (!searchQuery) return gridRows.length;
    const query = searchQuery.toLowerCase();
    return gridRows.filter((row) => row.botName.toLowerCase().includes(query)).length;
  }, [gridRows, searchQuery]);

  // Get current CS review for dialog
  const baseReview = useMemo(() => {
    if (!reviewDialogBotId) return null;
    return reviews.find((r) => r.botId === reviewDialogBotId) || null;
  }, [reviewDialogBotId, reviews]);

  // Fetch full stage outputs when dialog opens
  const { data: reviewDetails, isLoading: isReviewDetailsLoading } = useReviewDetails(isReviewDialogOpen ? baseReview?.reviewId : null);

  const currentReview = useMemo(
    () => composeReviewResult(baseReview, reviewDetails),
    [baseReview, reviewDetails],
  );

  // Upload ZIP handler — triggers file picker
  const handleUploadZip = useCallback(() => {
    setUploadError(null);
    fileInputRef.current?.click();
  }, []);

  // File selected — type detection and routing
  const handleFileSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ''; // Reset so same file can be re-selected

    setIsUploadParsing(true);
    setUploadError(null);

    try {
      const { detectZipType } = await import('../declarative-agent/utils/zipTypeDetector');
      const zipType = await detectZipType(file);

      if (zipType === 'declarative-agent') {
        if (activeAgentType !== 'declarative-agent') {
          setActiveAgentType('declarative-agent');
          dispatchToast(
            <Toast>
              <ToastTitle>Switched to M365 Declarative Agents — DA package detected</ToastTitle>
            </Toast>,
            { intent: 'info' }
          );
        }
        setPendingDAFile(file);
      } else if (zipType === 'copilot-studio') {
        if (activeAgentType !== 'copilot-studio') {
          setActiveAgentType('copilot-studio');
          dispatchToast(
            <Toast>
              <ToastTitle>Switched to Copilot Studio Agents — solution package detected</ToastTitle>
            </Toast>,
            { intent: 'info' }
          );
        }
        // Parse ZIP and collect eligible bots
        const { parseCSZip } = await import('../declarative-agent/utils/csZipParser');
        const parsed = await parseCSZip(file);
        const eligibleBots = parsed.bots.filter((b) => b.generativeActionsEnabled);

        if (eligibleBots.length === 0) {
          setUploadError(
            'No Generative AI agents found in this solution ZIP. Only agents with GenerativeActionsEnabled can be reviewed.'
          );
          return;
        }

        if (eligibleBots.length === 1) {
          // Single eligible bot — skip selector and start review immediately
          handleCSZipStartReview(eligibleBots[0], file, parsed);
        } else {
          // Multiple eligible bots — show selector dialog
          setPendingCSZip({ file, parsed });
        }
      } else {
        setUploadError(
          'Could not identify ZIP type. Expected a Copilot Studio solution ZIP or a Declarative Agent package ZIP.'
        );
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Failed to read ZIP file.');
    } finally {
      setIsUploadParsing(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAgentType, setActiveAgentType, dispatchToast]);

  // CS Handlers
  const handleExportAll = async () => {
    try {
      const result = await exportMutation.mutateAsync(reviews);
      dispatchToast(
        <Toast>
          <ToastTitle>
            Export successful! {result.reviewCount} reviewed agent(s) exported to {result.filename}
          </ToastTitle>
        </Toast>,
        { intent: 'success' }
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to export reviews';
      dispatchToast(
        <Toast>
          <ToastTitle>Export failed: {errorMessage}</ToastTitle>
        </Toast>,
        { intent: 'error' }
      );
    }
  };

  function startCopilotReview(
    target: CopilotReviewTarget,
  ): void {
    copilotRunner.start(
      {
        botId: target.botId,
        botName: target.name,
        componentIdUnique: target.componentIdUnique,
        orgUrl: target.zipData ? null : selectedOrgUrl,
        sourceEnvironment: target.zipData ? 'zip' : (selectedOrgUrl ?? ''),
        agentVersion: target.agentVersion,
        zipData: target.zipData,
      },
      {
        environmentId: selectedEnvironmentId,
        returnPath: '/agent-review-tool',
      },
    );
  }

  const notifyUnsupportedHarness = () => {
    dispatchToast(
      <Toast>
        <ToastTitle>{UNSUPPORTED_HARNESS_MESSAGE}</ToastTitle>
      </Toast>,
      { intent: 'warning' },
    );
  };

  const handleReview = (botId: string) => {
    const bot = bots.find((b) => b.botId === botId);
    if (!bot) {
      dispatchToast(
        <Toast>
          <ToastTitle>Agent unavailable. Refresh the agent list and try again.</ToastTitle>
        </Toast>,
        { intent: 'error' },
      );
      return;
    }

    startReviewForHarness(bot.harness, {
      // Issue 947: an unsupported harness gets no checks.
      unsupported: notifyUnsupportedHarness,
      // Microsoft Copilot agents (spec 013) — a single review depth, started directly.
      copilot: () =>
        startCopilotReview({
          botId: bot.botId,
          name: bot.name,
          componentIdUnique: bot.componentIdUnique,
          agentVersion: bot.publishedOn?.toISOString(),
        }),
      standard: () =>
        standardRunner.start(
          {
            botId: bot.botId,
            botName: bot.name,
            componentIdUnique: bot.componentIdUnique,
            orgUrl: selectedOrgUrl,
            sourceEnvironment: selectedOrgUrl ?? '',
            agentVersion: bot.publishedOn?.toISOString(),
          },
          {
            environmentId: selectedEnvironmentId,
            returnPath: '/agent-review-tool',
          },
        ),
    });
  };

  const handleView = (botId: string) => {
    const bot = bots.find((b) => b.botId === botId);
    const row = gridRows.find((r) => r.botId === botId);
    if (resolveSavedReviewHarness(row, bot?.harness) === 'copilot') {
      if (row?.reviewId) {
        const qs = buildViewSearchParams(row.botName, row.reviewId, selectedEnvironmentId);
        navigate(`/agent-review-tool/copilot/${row.botId}?${qs}`);
      } else {
        dispatchToast(
          <Toast>
            <ToastTitle>Saved review unavailable. Refresh the agent list and try again.</ToastTitle>
          </Toast>,
          { intent: 'error' }
        );
      }
      return;
    }
    if (!row?.reviewId) {
      dispatchToast(
        <Toast>
          <ToastTitle>Saved review unavailable. Refresh the agent list and try again.</ToastTitle>
        </Toast>,
        { intent: 'error' },
      );
      return;
    }
    openReviewDialog(botId, row.reviewId);
  };

  /**
   * Start review for a bot selected from a CS solution ZIP.
   * Standard agents keep the existing ZIP mutation. Microsoft Copilot agents retain the
   * parsed package in memory and open the Standard/Deep options dialog.
   * Unsupported harness agents show a warning toast, the upload message bar keeps the
   * message, and no review starts.
   */
  function handleCSZipStartReview(
    bot: CSZipBot,
    zipFile: File,
    parsed: CSZipParseResult
  ) {
    setPendingCSZip(null);

    startReviewForHarness(bot.harness, {
      unsupported: () => {
        notifyUnsupportedHarness();
        setUploadError(UNSUPPORTED_HARNESS_MESSAGE);
      },
      copilot: () =>
        startCopilotReview({
          botId: bot.botId,
          name: bot.name,
          componentIdUnique: bot.componentIdUnique,
          zipData: {
            configuration: bot.configuration,
            components: parsed.componentsBySchemaName[bot.schemaName] ?? [],
            resources: parsed.resourcesBySchemaName[bot.schemaName] ?? [],
            authenticationMode: bot.authenticationMode,
            template: bot.template,
          },
        }),
      standard: () =>
        standardRunner.start(
          {
            botId: bot.schemaName,
            botName: bot.name,
            componentIdUnique: bot.schemaName,
            zipFile,
            zipBotSchemaName: bot.schemaName,
            iconBase64: bot.iconBase64,
            sourceEnvironment: 'zip',
          },
          {
            environmentId: selectedEnvironmentId,
            returnPath: '/agent-review-tool',
          },
        ),
    });
  }

  const handleDownloadPdf = async (redactSensitiveValues: boolean) => {
    if (!currentReview) return;
    setIsPdfDownloading(true);
    try {
      const pdfBlob = await generateCsPdfReport(currentReview, { redactSensitiveValues });
      downloadPdf(pdfBlob, redactSensitiveValues ? 'Public_Agent_Review' : currentReview.botName);
      dispatchToast(
        <Toast><ToastTitle>PDF downloaded successfully!</ToastTitle></Toast>,
        { intent: 'success' }
      );
    } catch (error) {
      console.error('Failed to generate PDF:', error);
      const isMissingData = error instanceof Error && error.message === 'MISSING_STAGE_OUTPUTS';
      dispatchToast(
        <Toast>
          <ToastTitle>
            {isMissingData
              ? 'Review data unavailable. Please re-run the review to generate a PDF.'
              : 'Failed to generate PDF report. Please try again.'}
          </ToastTitle>
        </Toast>,
        { intent: isMissingData ? 'warning' : 'error' }
      );
    } finally {
      setIsPdfDownloading(false);
    }
  };

  const handleDownloadSarif = async () => {
    if (!currentReview) return;
    setIsSarifDownloading(true);
    try {
      const sarif = generateSARIF(currentReview);
      downloadSarif(sarif, currentReview.botName);
      dispatchToast(
        <Toast><ToastTitle>SARIF file downloaded successfully!</ToastTitle></Toast>,
        { intent: 'success' }
      );
    } catch (error) {
      console.error('Failed to generate SARIF:', error);
      dispatchToast(
        <Toast><ToastTitle>Failed to generate SARIF file. Please try again.</ToastTitle></Toast>,
        { intent: 'error' }
      );
    } finally {
      setIsSarifDownloading(false);
    }
  };

  const isGridLoading = botsLoading || reviewsLoading;

  return (
    <div className={styles.container}>
      {/* Toast Notifications */}
      <Toaster toasterId={toasterId} position="top-end" />

      {/* Hidden file input for ZIP upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".zip"
        className={styles.hiddenInput}
        onChange={handleFileSelected}
        aria-hidden="true"
      />

      {/* CS ZIP Bot Selector — shown when ZIP has multiple eligible agents */}
      {pendingCSZip && (
        <CSZipBotSelectorDialog
          open={true}
          bots={pendingCSZip.parsed.bots.filter((b) => b.generativeActionsEnabled)}
          zipFileName={pendingCSZip.file.name}
          onStartReview={(bot) =>
            handleCSZipStartReview(bot, pendingCSZip.file, pendingCSZip.parsed)
          }
          onCancel={() => setPendingCSZip(null)}
        />
      )}

      {/* ── Page Header Row — title left, Upload ZIP + Help right ── */}
      <div className={styles.pageHeaderRow}>
        <PageHeader />
        <div className={styles.pageHeaderActions}>
          {/* The ZIP actions read an exported agent package, which the skills
              tab has no equivalent of — it takes its upload from its own panel. */}
          {activeAgentType !== 'skills-automations' && (
            <>
              <Tooltip
                content={
                  activeAgentType === 'declarative-agent'
                    ? 'Upload a Declarative Agent package ZIP exported from Agent Builder'
                    : 'Upload a Copilot Studio solution ZIP containing your agent'
                }
                relationship="description"
              >
                <Button
                  appearance="primary"
                  icon={isUploadParsing ? <Spinner size="tiny" /> : <FolderZipRegular />}
                  onClick={handleUploadZip}
                  disabled={isUploadParsing}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  {isUploadParsing ? 'Reviewing...' : 'Review from ZIP'}
                </Button>
              </Tooltip>
              <Tooltip
                content={
                  activeAgentType === 'declarative-agent'
                    ? 'How to download a ZIP from Agent Builder: open your agent → ... → Download .zip file'
                    : 'How to export a ZIP from Copilot Studio: open your agent → Settings → Export → Export solution'
                }
                relationship="label"
              >
                <Button
                  appearance="subtle"
                  icon={<QuestionCircleRegular />}
                  aria-label="Help"
                  onClick={() => window.open(
                    activeAgentType === 'declarative-agent'
                      ? 'https://learn.microsoft.com/en-us/microsoft-365-copilot/extensibility/agent-builder-share-manage-agents#deploy-an-agent-via-zip-package'
                      : 'https://learn.microsoft.com/en-us/microsoft-copilot-studio/authoring-solutions-import-export#export-the-solution-with-your-agent',
                    '_blank'
                  )}
                />
              </Tooltip>
            </>
          )}
          {activeAgentType === 'skills-automations' && (
            <>
              <Tooltip
                content="Upload a .zip skill bundle, a single SKILL.md, or an automation .json"
                relationship="description"
              >
                <Button
                  appearance="primary"
                  icon={<DocumentBulletListRegular />}
                  {...skillsUploadFocusTarget}
                  onClick={() => setSkillsUploadOpen(true)}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  Review a skill or automation
                </Button>
              </Tooltip>
              <Tooltip content="Read Microsoft's guidance on authoring skills" relationship="label">
                <Button
                  appearance="subtle"
                  icon={<QuestionCircleRegular />}
                  aria-label="Help"
                  onClick={() => window.open(
                    'https://learn.microsoft.com/microsoft-365/copilot/cowork/cowork-plugin-development#skill-authoring-best-practices',
                    '_blank'
                  )}
                />
              </Tooltip>
            </>
          )}
        </div>
      </div>

      {/* Upload error message */}
      {uploadError && (
        <MessageBar intent="warning">
          <MessageBarBody>{uploadError}</MessageBarBody>
        </MessageBar>
      )}

      {/* ── TabList — Copilot Studio Agents | M365 Agents ── */}
      <div className={styles.tabListRow}>
        <TabList
          selectedValue={activeAgentType}
          onTabSelect={(_, data) => setActiveAgentType(data.value as AgentTab)}
        >
          <Tab
            value="copilot-studio"
            icon={
              <span className={styles.tabIcon}>
                <img src={CopilotStudioIcon} alt="" width={20} height={20} aria-hidden="true" />
              </span>
            }
          >
            Copilot Studio Agents
          </Tab>
          <Tab
            value="declarative-agent"
            icon={
              <span className={styles.tabIcon}>
                <img src={M365CopilotIcon} alt="" width={20} height={20} aria-hidden="true" />
              </span>
            }
          >
            M365 Declarative Agents
          </Tab>
          <Tab
            value="skills-automations"
            icon={
              <span className={styles.tabIcon}>
                {/*
                  The colour variant, not the flat one. Its two siblings are
                  full-colour product marks, so a flat brand-tinted glyph read
                  as a lesser control rather than a peer tab. The gradient is
                  in the same family — its #2764E7 is a colour the Copilot
                  Studio mark already uses — and the jigsaw shape keeps it
                  clearly distinct from the two ribbon marks beside it.
                */}
                <PuzzlePieceColor fontSize={20} />
              </span>
            }
          >
            Skills &amp; Automations
          </Tab>
        </TabList>
      </div>

      {/* ── Copilot Studio Agents tab content ── */}
      {activeAgentType === 'copilot-studio' && (
        <>
          {/* Quick Stats */}
          <Text size={500} weight="semibold" className={styles.sectionTitle}>
            Quick Stats
          </Text>
          <div ref={quickStatsRef} className={styles.statsGrid}>
            <StatCard
              label="Total Agents"
              value={stats.totalBots}
              barColor="slot1"
              tooltip="Total number of active agents"
            />
            <StatCard
              label="Reviewed"
              value={`${stats.reviewedBots} (${stats.reviewedPercentage}%)`}
              barColor="slot2"
              tooltip="Agents with completed reviews"
            />
            <StatCard
              label="Average Score"
              value={stats.scoredReviews > 0 ? `${stats.averageScore}%` : 'N/A'}
              barColor="slot3"
              variant={
                stats.scoredReviews === 0
                  ? 'default'
                  : stats.averageScore >= 80
                  ? 'success'
                  : stats.averageScore >= 60
                    ? 'warning'
                    : 'error'
              }
              tooltip="Average quality score across reviewed agents with measurable score pillars"
            />
            <StatCard
              label="Total Issues"
              value={stats.totalIssues}
              barColor="slot7"
              tooltip={`${stats.highSeverityIssues} high-severity issues`}
            />
          </div>

          {/* My Agents Section Header */}
          <Text size={500} weight="semibold" className={styles.sectionTitle}>My Agents</Text>

          {/* Action Toolbar with Search (CS tab: includes env selector) */}
          <div className={styles.toolbarRow}>
            <ActionToolbar
              onExportAll={handleExportAll}
              isExporting={exportMutation.isPending}
            />
            <SearchBox
              placeholder="Search agents..."
              value={searchQuery}
              onChange={(_, data) => setSearchQuery(data.value)}
              className={styles.searchBox}
            />
          </div>

          {/* CS Data Grid */}
          <div id="bots-grid" className={styles.gridContainer}>
            {!isGridLoading && gridRows.length === 0 ? (
              <div className={styles.loadingContainer}>
                <Text size={400}>No agents found</Text>
                <Text size={300}>
                  {selectedOrgUrl === null && selectedEnvironmentId ? (
                    <>
                      Create agents in{' '}
                      <Link
                        href={`https://copilotstudio.preview.microsoft.com/environments/${selectedEnvironmentId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Copilot Studio
                      </Link>{' '}
                      to get started
                    </>
                  ) : (
                    'Create agents in Copilot Studio to get started'
                  )}
                </Text>
              </div>
            ) : (
              <BotsGrid
                rows={gridRows}
                isLoading={isGridLoading}
                onReview={handleReview}
                onView={handleView}
                onReviewFromZip={handleUploadZip}
                isReviewingAny={
                  standardRunner.isRunning || copilotRunner.isRunning
                }
                reviewButtonRef={reviewButtonRef}
                viewButtonRef={viewButtonRef}
              />
            )}
          </div>

          {/* Pagination — outside gridContainer to avoid overflow:hidden clipping */}
          {gridRows.length > 0 && (
            <Pagination
              totalRecords={filteredCount}
              unfilteredCount={gridRows.length}
            />
          )}

          {/* Quick Links */}
          <QuickLinks />

          {/* Standard review results dialog */}
          <ReviewDialogV2
            open={isReviewDialogOpen}
            review={currentReview}
            isLoadingDetails={isReviewDetailsLoading}
            onClose={closeReviewDialog}
            onDownloadPdf={() => void handleDownloadPdf(false)}
            onDownloadPublicPdf={() => void handleDownloadPdf(true)}
            onDownloadSarif={handleDownloadSarif}
            isDownloadingPdf={isPdfDownloading}
            isDownloadingSarif={isSarifDownloading}
          />

          {/* Welcome Tour */}
          {showTour && gridRows.length > 0 && (
            <WelcomeTour
              currentStep={tourStep}
              onNext={handleTourNext}
              onPrevious={handleTourPrevious}
              onDismiss={handleTourDismiss}
              quickStatsRef={quickStatsRef}
              reviewButtonRef={reviewButtonRef}
              viewButtonRef={viewButtonRef}
            />
          )}
        </>
      )}

      {/* ── M365 Agents (Declarative) tab content ── */}
      {activeAgentType === 'declarative-agent' && (
        <DeclarativeAgentTab
          onUploadZip={handleUploadZip}
          pendingFile={pendingDAFile}
          onPendingFileConsumed={() => setPendingDAFile(null)}
        />
      )}

      {/* ── Skills & Automations tab content ── */}
      {activeAgentType === 'skills-automations' && (
        <SkillsAutomationsPanel
          uploadOpen={skillsUploadOpen}
          onUploadOpenChange={setSkillsUploadOpen}
        />
      )}
    </div>
  );
}
