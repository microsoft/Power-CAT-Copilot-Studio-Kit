import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import {
  Badge, Breadcrumb, BreadcrumbButton, BreadcrumbDivider, BreadcrumbItem,
  Button, FluentProvider, Menu, MenuItem, MenuList, MenuPopover, MenuTrigger,
  MessageBar, MessageBarActions, MessageBarBody, SplitButton, Tab, TabList, Tooltip,
  Toast, ToastTitle, Toaster, makeStyles, shorthands, tokens, useId, useRestoreFocusTarget, useToastController,
} from '@fluentui/react-components';
import {
  ArrowClockwiseRegular, ArrowSwapRegular, DocumentPdfRegular, DocumentTableRegular, History20Regular,
} from '@fluentui/react-icons';
import { useNavigate } from 'react-router-dom';
import { copilotStudioReviewLightTheme } from './copilotStudioReviewTheme';
import { buildReviewViewModel } from './viewModel';
import type { ReviewSummaryView } from './viewTypes';
import { SummaryRail } from './SummaryRail';
import { FindingsTab } from './FindingsTab';
import { SkillsTab } from './SkillsTab';
import { CoverageTab } from './CoverageTab';
import { ChecksPanel } from './ChecksPanel';
import { AgentMapTab } from './agent-map/AgentMapTab';
// The map takes its two Dataverse reads as props so it can render outside this app. They are bound
// here, at the only place that knows this app's client.
import { useConnectedAgentMap } from '../hooks/useConnectedAgentMap';
import { loadAgentMapIcons } from '../services/agent-map/agentMapIcons';
import { CostEfficiencyTab } from './cost-efficiency/CostEfficiencyTab';
import {
  ReviewSectionNavigation,
  type ReviewSection,
} from './ReviewSectionNavigation';
import { useTranscriptEvidence } from '../hooks/useTranscriptEvidence';
import { resolveEvidenceOrganization } from '../services/transcript/transcriptEvidenceService';
import { NO_EVIDENCE_REASON, UPLOAD_NO_EVIDENCE_REASON, type EvidenceState } from '../contracts/TranscriptEvidence';
import { CopilotReviewSkeleton } from './CopilotReviewSkeleton';
import { useCopilotReviewRunner } from '../context/copilotReviewRunnerContext';
import { usePersistedCopilotReview } from '../hooks/usePersistedCopilotReview';
import type { CopilotReviewRouteState } from '../utils/copilotReviewRouteState';
import {
  buildRunSearchParams,
  buildViewSearchParams,
} from '../utils/copilotReviewRouteState';
import type { CopilotReviewDisplayPayload } from '../../contracts/ReviewResult';
import { generateCopilotReviewExcel, generateCopilotReviewPdf } from '../utils/copilotReviewExport';
import { isPersistedCopilotPayload } from '../utils/persistedCopilotReviewGuard';
import { downloadPdf, downloadExcel } from '../../utils/exportUtils';
import { buildCopilotStudioAgentEvaluateUrl } from '../../../../shared/services/copilotStudioUrl';
import { resolveAgentEnvironmentId } from '../services/agentEnvironment';
import { withoutRecognisedSystemKinds } from '../services/recognisedSystemKinds';
import type { CostScenario } from '../contracts/CostEfficiency';
import { useBotPublication } from '../../hooks/useBotPublication';
import { getReviewFreshness } from '../../utils/reviewHistory';
import { ReviewHistory } from '../../components/history/ReviewHistory';
import { getCopilotReviewCompletion } from '../services/copilotReviewCompletion';
import type { ReviewHistoryEntry } from '../../contracts/ReviewResult';
import { isUpgradedCopyName } from '../../utils/upgradePairing';
import { UpgradeComparisonDialog } from './UpgradeComparisonDialog';

/**
 * Microsoft Copilot harness review result screen (spec 013 + Task 11).
 *
 * - Run route: starts the application-level review runner with progress.
 * - View route: loads persisted payload via usePersistedCopilotReview — no AI.
 * - Re-run opens the options dialog instead of silently repeating.
 */

const useStyles = makeStyles({
  page: {
    background: `radial-gradient(124.48% 109.39% at 26.98% 6.02%, ${tokens.colorNeutralBackground1} 0%, ${tokens.colorNeutralBackground1} 37.08%, ${tokens.colorBrandBackground2} 100%)`,
    minHeight: '100vh',
  },
  chrome: {
    display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalL,
    flexWrap: 'wrap',
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalXXL}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, backgroundColor: tokens.colorNeutralBackground1,
    '@media (max-width: 600px)': {
      padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    },
  },
  chromeActions: {
    marginLeft: 'auto', display: 'flex', gap: tokens.spacingHorizontalS, alignItems: 'center',
    flexWrap: 'wrap',
  },
  crumb: {
    backgroundColor: tokens.colorTransparentBackground,
    ...shorthands.borderColor('transparent'),
    ':hover': { backgroundColor: tokens.colorSubtleBackgroundHover, ...shorthands.borderColor('transparent') },
    ':hover:active': { backgroundColor: tokens.colorSubtleBackgroundPressed, ...shorthands.borderColor('transparent') },
  },
  container: {
    maxWidth: '1240px', margin: '0 auto',
    padding: `${tokens.spacingVerticalXL} ${tokens.spacingHorizontalXXL} 48px`,
    display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalL,
    '@media (max-width: 600px)': {
      padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalM} 24px`,
    },
  },
  layout: {
    display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 316px', gap: tokens.spacingHorizontalL, alignItems: 'start',
    '@media (max-width: 840px)': {
      gridTemplateColumns: '1fr',
    },
  },
  /**
   * Agent map needs the width more than the summary does.
   *
   * The map is a spatial view — at 1fr minus a 316px rail it was squeezed to
   * roughly half the page. Dropping the rail on this tab hands those pixels to
   * the canvas. The summary is one tab-click away and unchanged, and the map's
   * own inspector takes over the "details for the current selection" job, which
   * is the same contextual-pane pattern Fluent and the Power Apps designers use.
   */
  layoutWide: {
    display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: tokens.spacingHorizontalL, alignItems: 'start',
  },
  contentCard: {
    backgroundColor: tokens.colorNeutralBackground1, border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: '12px', boxShadow: tokens.shadow2, overflow: 'hidden', paddingBottom: tokens.spacingVerticalS,
  },
  tabBar: {
    padding: `${tokens.spacingVerticalSNudge} ${tokens.spacingHorizontalM} 0`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke3}`,
    flexWrap: 'wrap',
    rowGap: tokens.spacingVerticalXS,
    '& [role="tab"]': {
      // Fluent's own tab sizing. A custom minHeight here overrode it and made
      // the tab bar taller than the design intends.
      minHeight: 'unset',
    },
  },
  tabCount: { marginLeft: tokens.spacingHorizontalSNudge },
  visuallyHidden: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: 0,
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    clipPath: 'inset(50%)',
    whiteSpace: 'nowrap',
    border: 0,
  },
});

type ReviewTabValue = 'findings' | 'skills' | 'coverage' | 'checks';

interface CostPlanningState {
  reviewIdentity: string;
  monthlyTasksInput: string;
  scenario: CostScenario;
}

const DEFAULT_COST_MONTHLY_TASKS_INPUT = '1000';
const DEFAULT_COST_SCENARIO: CostScenario = 'medium';

/** Copilot Studio preview host for the coverage empty-state Evaluate deep-link (interim). */
const COPILOT_STUDIO_PREVIEW_BASE_URL = 'https://copilotstudio.preview.microsoft.com';

/**
 * Instruction-coverage AI availability banner (Task 4). Reuses the existing
 * Fluent MessageBar pattern. No banner for 'complete' or 'not-applicable' —
 * and none at all for historical reviews with no recorded status (legacy;
 * no false claim is made either way).
 */
function instructionCoverageBanner(
  status: ReviewSummaryView['instructionCoverageStatus'],
): ReactElement | null {
  if (!status) return null;
  switch (status.state) {
    case 'unavailable':
      return (
        <MessageBar intent="info">
          <MessageBarBody>
            AI instruction coverage was not run because the classifier is not configured.
            Deterministic instruction checks completed.
          </MessageBarBody>
        </MessageBar>
      );
    case 'failed':
      return (
        <MessageBar intent="warning">
          <MessageBarBody>
            AI instruction coverage failed. Deterministic instruction checks completed; rerun
            after the classifier is available.
          </MessageBarBody>
        </MessageBar>
      );
    case 'partial':
      return (
        <MessageBar intent="warning">
          <MessageBarBody>
            AI instruction coverage returned a partial classification. Unclassified elements
            were not treated as failures.
          </MessageBarBody>
        </MessageBar>
      );
    case 'cancelled':
      return (
        <MessageBar intent="info">
          <MessageBarBody>
            AI instruction coverage was cancelled. The saved review contains deterministic
            results only.
          </MessageBarBody>
        </MessageBar>
      );
    default:
      return null;
  }
}

export interface CopilotReviewPageProps {
  botId: string;
  botName?: string;
  reviewedBy?: string;
  orgUrl?: string | null;
  /** Power Platform environment GUID for the Copilot Studio evaluate deep-link. */
  environmentId?: string | null;
  routeState?: CopilotReviewRouteState;
}

export function CopilotReviewPage({
  botId,
  botName = 'Agent',
  reviewedBy = 'You',
  orgUrl,
  environmentId,
  routeState,
}: CopilotReviewPageProps) {
  const styles = useStyles();
  const navigate = useNavigate();
  const toasterId = useId('mrp-toaster');
  const { dispatchToast } = useToastController(toasterId);

  const isViewMode = routeState?.view === true;
  const isRunMode = routeState?.run === true;

  // The runner is mounted above route content, so a review keeps its owner after
  // the user closes the progress dialog or navigates elsewhere.
  const runner = useCopilotReviewRunner();
  const { mutation } = runner;

  // Run payload — after Task 10 persistence, agentsExperience is PersistedCopilotReviewPayload
  // which satisfies CopilotReviewDisplayPayload
  const runPayload: CopilotReviewDisplayPayload | undefined =
    mutation.data?.agentsExperience ?? undefined;

  // -- View mode --
  const { data: persistedData, isLoading: isViewLoading, isError: isViewError, error: viewError } =
    usePersistedCopilotReview(isViewMode ? (routeState?.reviewId ?? null) : null);

  // Re-run componentIdUnique: prefer route state, fall back to persisted record
  const rerunComponentIdUnique =
    routeState?.componentIdUnique ?? persistedData?.componentIdUnique ?? null;
  const activeSourceEnvironment =
    persistedData?.sourceEnvironment
    ?? mutation.data?.sourceEnvironment
    ?? orgUrl
    ?? '';
  const isZipReview = activeSourceEnvironment === 'zip';
  const canRerun = !!rerunComponentIdUnique && !isZipReview;
  const reviewedOrgUrl = isZipReview
    ? null
    : activeSourceEnvironment || null;
  const publication = useBotPublication(
    isZipReview
      || (isRunMode && mutation.isPending)
      || (isViewMode && isViewLoading)
      ? undefined
      : botId,
    reviewedOrgUrl,
  );
  const reviewedAgentVersion =
    mutation.data?.agentVersion
    ?? persistedData?.agentVersion
    ?? routeState?.agentVersion
    ?? undefined;
  const freshness = getReviewFreshness(
    reviewedAgentVersion,
    publication.data,
    isZipReview ? 'zip' : reviewedOrgUrl ?? '',
  );

  // Copilot Studio "Evaluate" deep-link for the coverage empty-state handoff
  // (proposal §5D). The environment must be the one the agent actually lives in
  // — deep-linking a cross-environment review to the host environment sends the
  // user to a Copilot Studio tenant where the agent does not exist. Hidden for
  // ZIP reviews.
  const [evaluateUrl, setEvaluateUrl] = useState<string | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (isZipReview || !botId) {
        if (!cancelled) setEvaluateUrl(undefined);
        return;
      }
      try {
        const envId = await resolveAgentEnvironmentId(
          reviewedOrgUrl,
          environmentId ?? null,
          botId,
        );
        if (!envId) {
          if (!cancelled) setEvaluateUrl(undefined);
          return;
        }
        const url = buildCopilotStudioAgentEvaluateUrl(
          COPILOT_STUDIO_PREVIEW_BASE_URL,
          envId,
          botId,
        );
        if (!cancelled) setEvaluateUrl(url);
      } catch {
        if (!cancelled) setEvaluateUrl(undefined);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [environmentId, botId, isZipReview, reviewedOrgUrl]);

  // Execute review on mount for run mode (once only)
  useEffect(() => {
    if (!isRunMode || !routeState?.componentIdUnique) return;
    runner.start(
      {
        botId,
        botName,
        componentIdUnique: routeState.componentIdUnique,
        orgUrl,
        sourceEnvironment: orgUrl ?? '',
        agentVersion: routeState.agentVersion ?? undefined,
      },
      {
        environmentId,
        returnPath: '/agent-review-tool',
      },
    );
    // Only trigger on mount — deps are stable route params
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botId, isRunMode]);

  // Guard on `canRerun`, not just the component id: `sourceEnvironment` is the
  // literal string 'zip' for a ZIP review, so the `rerunOrgUrl` fallback below
  // would otherwise run a live review against an org named 'zip'.
  const handleRerun = useCallback(() => {
    if (!canRerun || freshness !== 'stale' || !publication.data) return;

    runner.reset();

    const rerunOrgUrl = orgUrl ?? persistedData?.sourceEnvironment ?? null;
    const qs = buildRunSearchParams(
      botName,
      rerunComponentIdUnique,
      rerunOrgUrl,
      environmentId,
      publication.data.toISOString(),
    );
    runner.start(
      {
        botId,
        botName,
        componentIdUnique: rerunComponentIdUnique,
        orgUrl: rerunOrgUrl,
        sourceEnvironment: rerunOrgUrl ?? '',
        agentVersion: publication.data.toISOString(),
      },
      {
        environmentId,
        returnPath: '/agent-review-tool',
      },
    );
    navigate(`/agent-review-tool/copilot/${botId}?${qs}`, { replace: true });
  }, [
    botId,
    botName,
    navigate,
    orgUrl,
    environmentId,
    persistedData?.sourceEnvironment,
    rerunComponentIdUnique,
    canRerun,
    freshness,
    publication.data,
    runner,
  ]);

  // Resolve the active payload (run result or persisted)
  // Both types satisfy CopilotReviewDisplayPayload — no unsafe cast needed.
  const activePayload: CopilotReviewDisplayPayload | undefined =
    runPayload ?? persistedData?.payload ?? undefined;
  const completionNotice = activePayload
    ? getCopilotReviewCompletion(activePayload)
    : undefined;

  const activeDurationMs = mutation.data
    ? (mutation.data.durationMs ?? 0)
    : (persistedData?.durationMs ?? 0);

  const activeReviewedBy = persistedData?.reviewedBy ?? reviewedBy;

  // -- Shared UI state --
  const [activeSection, setActiveSection] = useState<ReviewSection>('review');
  const [showHistory, setShowHistory] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const compareFocusTarget = useRestoreFocusTarget();
  const [activeReviewTab, setActiveReviewTab] = useState<ReviewTabValue>('findings');
  const [focusFindingId, setFocusFindingId] = useState<string | null>(null);
  const costPlanningIdentity =
    `${routeState?.reviewId ?? 'run'}:${botId}`;
  const [costPlanningState, setCostPlanningState] = useState<CostPlanningState>(() => ({
    reviewIdentity: costPlanningIdentity,
    monthlyTasksInput: DEFAULT_COST_MONTHLY_TASKS_INPUT,
    scenario: DEFAULT_COST_SCENARIO,
  }));
  if (costPlanningState.reviewIdentity !== costPlanningIdentity) {
    setCostPlanningState({
      reviewIdentity: costPlanningIdentity,
      monthlyTasksInput: DEFAULT_COST_MONTHLY_TASKS_INPUT,
      scenario: DEFAULT_COST_SCENARIO,
    });
  }
  const handleCostMonthlyTasksInputChange = useCallback((monthlyTasksInput: string) => {
    setCostPlanningState((current) => ({
      reviewIdentity: costPlanningIdentity,
      monthlyTasksInput,
      scenario: current.reviewIdentity === costPlanningIdentity
        ? current.scenario
        : DEFAULT_COST_SCENARIO,
    }));
  }, [costPlanningIdentity]);
  const handleCostScenarioChange = useCallback((scenario: CostScenario) => {
    setCostPlanningState((current) => ({
      reviewIdentity: costPlanningIdentity,
      monthlyTasksInput: current.reviewIdentity === costPlanningIdentity
        ? current.monthlyTasksInput
        : DEFAULT_COST_MONTHLY_TASKS_INPUT,
      scenario,
    }));
  }, [costPlanningIdentity]);

  const vm = useMemo(
    () => activePayload
      ? buildReviewViewModel(activePayload, activeReviewedBy, activeDurationMs, botName)
      : null,
    [activePayload, activeReviewedBy, activeDurationMs, botName],
  );

  // Tab badge counts reflect *problems*, not totals (proposal §3): findings drop
  // info-level noise, skills count dimensions needing attention.
  //
  // Coverage is the exception, and deliberately so. It is a ratio, not a count:
  // a bare "7" beside a panel reading "No evaluation coverage yet" says nothing
  // about which way the number points, and reads as "7 things covered". "0/7"
  // states the gap in the badge itself and matches the header stat.
  const tabProblemCounts = useMemo(() => {
    if (!vm) return { findings: 0, skills: 0, coverageCovered: 0, coverageTotal: 0 };
    return {
      findings: vm.findings.filter((f) => f.sev !== 'info').length,
      skills: vm.skillsGrouped.groups.filter(
        (g) => (g.score !== null && g.score < 80) || g.patterns.length > 0,
      ).length,
      coverageCovered: vm.coverage.filter((c) => c.cases > 0).length,
      coverageTotal: vm.coverage.length,
    };
  }, [vm]);

  // Cross-tab jump: focus a specific finding on the Findings tab (e.g. from the
  // Skill evaluator injection finding), replacing the retired FindingOverlay.
  const openFindingById = (id: string) => {
    setFocusFindingId(id);
    setActiveSection('review');
    setActiveReviewTab('findings');
  };

  const agentName = vm?.summary.agentName ?? botName;
  const showCompareWithOriginal = !isZipReview && isUpgradedCopyName(agentName);
  const resultIdentity = routeState?.reviewId ?? mutation.data?.reviewId ?? 'run';
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (vm) resultHeadingRef.current?.focus();
  }, [resultIdentity, vm]);

  const openHistoricalReview = useCallback((entry: ReviewHistoryEntry) => {
    const query = buildViewSearchParams(
      entry.botName || botName,
      entry.reviewId,
      environmentId,
    );
    navigate(`/agent-review-tool/copilot/${entry.botId}?${query}`);
  }, [botName, environmentId, navigate]);

  // A ZIP review stores the sentinel 'zip' in place of an org URL. Passing that
  // through would fire a doomed Dataverse request against an org literally named
  // 'zip', and then blame the environment. Null disables the query instead, so
  // the tab states plainly that observed use needs a source environment.
  const costOrgUrl = resolveEvidenceOrganization({
    isZipReview,
    isSavedReviewLoading: isViewMode && isViewLoading,
    routeOrgUrl: orgUrl,
    savedSourceEnvironment: persistedData?.sourceEnvironment,
  });
  const configuredSkills = useMemo(
    () =>
      activePayload && isPersistedCopilotPayload(activePayload)
        ? activePayload.model.skills.map(skill => skill.frontmatterName ?? skill.name)
        : [],
    [activePayload],
  );
  // Same query key as the Cost & efficiency tab, so React Query serves both from
  // one fetch. Read here so an export carries the evidence even when the tab is
  // not the active one.
  const evidenceQuery = useTranscriptEvidence({
    botId,
    orgUrl: costOrgUrl,
    configuredSkills,
  });
  // Memoised: the fallback branches allocate a fresh object each render, which
  // would otherwise rebuild both export callbacks on every render.
  const evidence: EvidenceState = useMemo(
    () =>
      evidenceQuery.data
        ?? (evidenceQuery.isLoading
          ? { status: 'loading' }
          : {
              status: 'no-access',
              // An upload has no environment behind it, so say that plainly
              // rather than referring to a missing source environment.
              reason: isZipReview ? UPLOAD_NO_EVIDENCE_REASON : NO_EVIDENCE_REASON,
            }),
    [evidenceQuery.data, evidenceQuery.isLoading, isZipReview],
  );

  const handleExportPdf = useCallback(() => {
    if (!vm || !activePayload || !isPersistedCopilotPayload(activePayload)) return;
    try {
      const blob = generateCopilotReviewPdf(vm, activePayload, evidence);
      downloadPdf(blob, agentName);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'PDF generation failed';
      dispatchToast(
        <Toast><ToastTitle>Export failed: {msg}</ToastTitle></Toast>,
        { intent: 'error' },
      );
    }
  }, [vm, activePayload, agentName, dispatchToast, evidence]);

  const handleExportExcel = useCallback(() => {
    if (!vm || !activePayload || !isPersistedCopilotPayload(activePayload)) return;
    void generateCopilotReviewExcel(vm, activePayload, evidence)
      .then((blob) => {
        downloadExcel(blob, `${agentName}-copilot-review.xlsx`);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Excel generation failed';
        dispatchToast(
          <Toast><ToastTitle>Export failed: {msg}</ToastTitle></Toast>,
          { intent: 'error' },
        );
      });
  }, [vm, activePayload, agentName, dispatchToast, evidence]);

  const isLoading = (isRunMode && mutation.isPending) || (isViewMode && isViewLoading);
  const isError = (isRunMode && mutation.isError) || (isViewMode && isViewError);
  const errorMsg = mutation.error?.message ?? viewError?.message ?? 'Unknown error';

  return (
    <FluentProvider theme={copilotStudioReviewLightTheme}>
      <div className={styles.page}>
        <header className={styles.chrome}>
          <Breadcrumb aria-label="Navigation">
            <BreadcrumbItem>
              <BreadcrumbButton className={styles.crumb} onClick={() => navigate('/agent-review-tool')}>Agent Review Tool</BreadcrumbButton>
            </BreadcrumbItem>
            <BreadcrumbDivider />
            <BreadcrumbItem>
              <BreadcrumbButton
                className={styles.crumb}
                current={!showHistory}
                onClick={showHistory ? () => setShowHistory(false) : undefined}
              >
                {agentName}
              </BreadcrumbButton>
            </BreadcrumbItem>
            {showHistory && (
              <>
                <BreadcrumbDivider />
                <BreadcrumbItem>
                  <BreadcrumbButton className={styles.crumb} current>
                    Version history
                  </BreadcrumbButton>
                </BreadcrumbItem>
              </>
            )}
          </Breadcrumb>
          {activePayload?.skillReviewMode === 'standard' && (
            <Badge
              appearance="outline"
              color="warning"
              shape="circular"
              aria-label="Limited coverage: per-resource analysis was not available for this review"
            >
              Limited coverage
            </Badge>
          )}
          {(isRunMode || activePayload) && (
            <Badge
              appearance="tint"
              color={isZipReview ? 'informative' : 'success'}
              shape="circular"
              aria-label={isZipReview ? 'Source: uploaded ZIP' : 'Source: live environment'}
            >
              {isZipReview ? 'Uploaded ZIP' : 'Live'}
            </Badge>
          )}
          <div className={styles.chromeActions}>
            {showCompareWithOriginal && (
              <Button
                {...compareFocusTarget}
                appearance="secondary"
                icon={<ArrowSwapRegular />}
                disabled={!activePayload}
                onClick={() => setCompareOpen(true)}
              >
                Compare with original
              </Button>
            )}
            <Tooltip content="Version history" relationship="label">
              <Button
                appearance="subtle"
                icon={<History20Regular />}
                aria-label="Version history"
                onClick={() => setShowHistory(true)}
              />
            </Tooltip>
            <Menu positioning="below-end">
              <MenuTrigger disableButtonEnhancement>
                {(triggerProps) => (
                  <SplitButton
                    appearance="secondary"
                    menuButton={triggerProps}
                    primaryActionButton={{
                      onClick: handleExportPdf,
                      disabled: !vm || mutation.isPending || !isPersistedCopilotPayload(activePayload),
                    }}
                    icon={<DocumentPdfRegular />}
                    disabled={!vm || mutation.isPending || !isPersistedCopilotPayload(activePayload)}
                  >
                    Export PDF
                  </SplitButton>
                )}
              </MenuTrigger>
              <MenuPopover>
                <MenuList>
                  <MenuItem icon={<DocumentPdfRegular />} onClick={handleExportPdf}>
                    Export as PDF
                  </MenuItem>
                  <MenuItem icon={<DocumentTableRegular />} onClick={handleExportExcel}>
                    Export as Excel
                  </MenuItem>
                </MenuList>
              </MenuPopover>
            </Menu>
          </div>
        </header>

        <main className={styles.container}>
          {/* Visually-hidden page title for screen readers */}
          <h1
            ref={resultHeadingRef}
            tabIndex={-1}
            className={styles.visuallyHidden}
          >
            {agentName} — {showHistory ? 'Version History' : 'Microsoft Copilot Agent Review'}
          </h1>

          {showHistory ? (
            <ReviewHistory
              subject={{
                botId,
                componentIdUnique: rerunComponentIdUnique ?? undefined,
                sourceEnvironment: isZipReview
                  ? 'zip'
                  : reviewedOrgUrl ?? '',
              }}
              currentPublishedOn={publication.data}
              selectedReviewId={routeState?.reviewId ?? mutation.data?.reviewId ?? null}
              onOpenReview={(entry) => {
                setShowHistory(false);
                openHistoricalReview(entry);
              }}
            />
          ) : (<>

          {isLoading && isViewMode && (
            <CopilotReviewSkeleton agentName={agentName} />
          )}

          {isError && !isRunMode && (
            <MessageBar intent="error">
              <MessageBarBody>Review failed: {errorMsg}</MessageBarBody>
            </MessageBar>
          )}

          {isViewMode && !isViewLoading && !isViewError && !persistedData && (
            <MessageBar intent="error">
              <MessageBarBody>Saved Microsoft Copilot review data is unavailable or invalid.</MessageBarBody>
            </MessageBar>
          )}

          {vm && activePayload && (
            <>
              {completionNotice?.errorMessage && (
                <MessageBar intent="warning">
                  <MessageBarBody>{completionNotice.errorMessage}</MessageBarBody>
                </MessageBar>
              )}
              {freshness === 'stale' && publication.data && !isViewMode && (
                <MessageBar intent="warning">
                  <MessageBarBody>
                    A newer published version is available.
                  </MessageBarBody>
                  <MessageBarActions>
                    <Button
                      appearance="primary"
                      icon={<ArrowClockwiseRegular />}
                      onClick={handleRerun}
                      disabled={mutation.isPending || !canRerun}
                    >
                      Review latest
                    </Button>
                  </MessageBarActions>
                </MessageBar>
              )}
              {/*
                A MessageBar marks something that needs attention on this
                review. Two standing notices failed that test and were removed.

                "Viewing a saved review" was permanent furniture: the review
                date and "Reviewed by" are already in the summary rail, and the
                Re-run review button is in the header.

                The production-ready-preview notice was a product fact, not a
                finding about this agent -- identical on every Microsoft Copilot harness
                review, and needing no action. It also duplicated rule LCY-01,
                which reports the same thing in All checks with a reference link
                and a suggested next step, and it was gated on run mode, so the
                same review looked different depending on how it was opened.

                The warning below stays: it counts components in *this* snapshot
                that were not reviewed, which the maker cannot learn elsewhere.
              */}
              {(() => {
                // Re-applied on read: a review saved before this rule existed
                // still lists the system kind in its payload, and saved reviews
                // are re-rendered rather than re-parsed.
                const unknown = withoutRecognisedSystemKinds(
                  activePayload.model.unknownKinds,
                );
                if (unknown.length === 0) return null;
                return (
                  <MessageBar intent="warning">
                    <MessageBarBody>
                      {unknown.length === 1
                        ? '1 component did not match a known schema'
                        : `${unknown.length} components did not match a known schema`}
                      {' — it is listed in the inventory but was not reviewed.'}
                    </MessageBarBody>
                  </MessageBar>
                );
              })()}

              {instructionCoverageBanner(vm.summary.instructionCoverageStatus)}

              {/*
                The page-level stat strip was removed here.

                It carried three cells, and two of them repeated numbers that
                were already on screen at the same time: "Checks passed" also
                renders in the summary rail and on the All checks tab badge,
                and "Capabilities with a test" also renders on the Evaluation
                coverage tab badge and inside that tab. Repeating a figure does
                not reinforce it -- it invites the reader to check whether the
                two copies agree.

                The third cell, "Test cases", was the only one with no other
                home on the main path, so it moved into the Evaluation coverage
                tab beside the ratio it explains. Nothing was lost.

                The rail keeps what only it can say: the score, and the
                error/warning/info split.
              */}

              <ReviewSectionNavigation
                selectedSection={activeSection}
                onSectionChange={setActiveSection}
              />

              <div
                role="tabpanel"
                id="copilot-review-section-panel-review"
                aria-labelledby="copilot-review-section-review"
                hidden={activeSection !== 'review'}
              >
                {activeSection === 'review' && (
                  <div className={styles.layout}>
                  <div className={styles.contentCard}>
                    <TabList
                      className={styles.tabBar}
                      selectedValue={activeReviewTab}
                      onTabSelect={(_, tabData) => setActiveReviewTab(tabData.value as ReviewTabValue)}
                      aria-label="Review views"
                    >
                      <Tab
                        value="findings"
                        id="copilot-review-tab-findings"
                        aria-controls="copilot-review-panel-findings"
                      >
                        Review findings
                        <Tooltip
                          relationship="description"
                          content={`${tabProblemCounts.findings} findings need attention (errors and warnings; informational findings are not counted)`}
                        >
                          <Badge className={styles.tabCount} appearance="tint"
                            color={activeReviewTab === 'findings' ? 'brand' : 'informative'} size="small" shape="circular"
                            aria-label={`${tabProblemCounts.findings} findings need attention`}>
                            {tabProblemCounts.findings}
                          </Badge>
                        </Tooltip>
                      </Tab>
                      <Tab
                        value="skills"
                        id="copilot-review-tab-skills"
                        aria-controls="copilot-review-panel-skills"
                      >
                        Skill evaluator
                        <Tooltip
                          relationship="description"
                          content={`${tabProblemCounts.skills} skills scored below the bar or have a weakness pattern`}
                        >
                          <Badge className={styles.tabCount} appearance="tint"
                            color={activeReviewTab === 'skills' ? 'brand' : 'informative'} size="small" shape="circular"
                            aria-label={`${tabProblemCounts.skills} skill dimensions need attention`}>
                            {tabProblemCounts.skills}
                          </Badge>
                        </Tooltip>
                      </Tab>
                      <Tab
                        value="coverage"
                        id="copilot-review-tab-coverage"
                        aria-controls="copilot-review-panel-coverage"
                      >
                        Evaluation coverage
                        <Tooltip
                          relationship="description"
                          content={`${tabProblemCounts.coverageCovered} of ${tabProblemCounts.coverageTotal} capabilities have test coverage`}
                        >
                          <Badge className={styles.tabCount} appearance="tint"
                            color={activeReviewTab === 'coverage' ? 'brand' : 'informative'}
                            size="small" shape="circular"
                            aria-label={`${tabProblemCounts.coverageCovered} of ${tabProblemCounts.coverageTotal} capabilities have test coverage`}>
                            {tabProblemCounts.coverageCovered}/{tabProblemCounts.coverageTotal}
                          </Badge>
                        </Tooltip>
                      </Tab>
                      <Tab
                        value="checks"
                        id="copilot-review-tab-checks"
                        aria-controls="copilot-review-panel-checks"
                      >
                        All checks
                        {vm.checks.recorded && (
                          <Tooltip
                            relationship="description"
                            content={`${vm.checks.totals.passed} of ${vm.checks.totals.evaluated} checks passed`}
                          >
                            <Badge className={styles.tabCount} appearance="tint"
                              color={activeReviewTab === 'checks' ? 'brand' : 'informative'} size="small" shape="circular"
                              aria-label={`${vm.checks.totals.passed} of ${vm.checks.totals.evaluated} checks passed`}>
                              {vm.checks.totals.passed}/{vm.checks.totals.evaluated}
                            </Badge>
                          </Tooltip>
                        )}
                      </Tab>
                    </TabList>

                    <div
                      role="tabpanel"
                      id="copilot-review-panel-findings"
                      aria-labelledby="copilot-review-tab-findings"
                      hidden={activeReviewTab !== 'findings'}
                    >
                      {activeReviewTab === 'findings' && (
                        <>
                          <h2 className={styles.visuallyHidden}>Review findings</h2>
                          <FindingsTab findings={vm.findings} capabilityChips={vm.capabilityChips} focusFindingId={focusFindingId} />
                        </>
                      )}
                    </div>
                    <div
                      role="tabpanel"
                      id="copilot-review-panel-skills"
                      aria-labelledby="copilot-review-tab-skills"
                      hidden={activeReviewTab !== 'skills'}
                    >
                      {activeReviewTab === 'skills' && (
                        <>
                          <h2 className={styles.visuallyHidden}>Skill evaluator</h2>
                          <SkillsTab grouped={vm.skillsGrouped} skills={vm.skills} onOpenFinding={openFindingById} />
                        </>
                      )}
                    </div>
                    <div
                      role="tabpanel"
                      id="copilot-review-panel-coverage"
                      aria-labelledby="copilot-review-tab-coverage"
                      hidden={activeReviewTab !== 'coverage'}
                    >
                      {activeReviewTab === 'coverage' && (
                        <>
                          <h2 className={styles.visuallyHidden}>Evaluation coverage</h2>
                          <CoverageTab
                            coverage={vm.coverage}
                            summary={vm.summary}
                            coverageBasis={vm.coverageBasis}
                            coverageSets={vm.coverageSets}
                            isZipReview={isZipReview}
                            evaluateUrl={evaluateUrl}
                          />
                        </>
                      )}
                    </div>
                    <div
                      role="tabpanel"
                      id="copilot-review-panel-checks"
                      aria-labelledby="copilot-review-tab-checks"
                      hidden={activeReviewTab !== 'checks'}
                    >
                      {activeReviewTab === 'checks' && (
                        <>
                          <h2 className={styles.visuallyHidden}>All checks</h2>
                          <ChecksPanel checks={vm.checks} />
                        </>
                      )}
                    </div>
                  </div>

                  <SummaryRail summary={vm.summary} />
                  </div>
                )}
              </div>

              <div
                role="tabpanel"
                id="copilot-review-section-panel-map"
                aria-labelledby="copilot-review-section-map"
                hidden={activeSection !== 'map'}
              >
                {activeSection === 'map' && (
                  <div className={styles.layoutWide}>
                  <div className={styles.contentCard}>
                    <h2 className={styles.visuallyHidden}>Architecture</h2>
                    <AgentMapTab
                      agentId={botId}
                      agentName={agentName}
                      payload={activePayload}
                      orgUrl={orgUrl ?? persistedData?.sourceEnvironment ?? null}
                      idleContent={<SummaryRail summary={vm.summary} />}
                      findings={vm.findings}
                      onOpenFinding={openFindingById}
                      useConnectedAgent={useConnectedAgentMap}
                      loadIcons={loadAgentMapIcons}
                    />
                  </div>
                  </div>
                )}
              </div>

              <div
                role="tabpanel"
                id="copilot-review-section-panel-cost"
                aria-labelledby="copilot-review-section-cost"
                hidden={activeSection !== 'cost'}
              >
                {activeSection === 'cost' && (
                  <div className={styles.layout}>
                  <div className={styles.contentCard}>
                    <h2 className={styles.visuallyHidden}>Cost and efficiency</h2>
                    <CostEfficiencyTab
                      model={activePayload.model}
                      monthlyTasksInput={costPlanningState.monthlyTasksInput}
                      scenario={costPlanningState.scenario}
                      evidence={evidence}
                      aiOrchestration={activePayload.crossSkillOrchestration}
                      onMonthlyTasksInputChange={handleCostMonthlyTasksInputChange}
                      onScenarioChange={handleCostScenarioChange}
                    />
                  </div>

                  <SummaryRail summary={vm.summary} />
                  </div>
                )}
              </div>
            </>
          )}
          </>)}
        </main>

        {compareOpen && activePayload && (
          <UpgradeComparisonDialog
            copyName={agentName}
            copy={activePayload.model}
            sourceEnvironment={activeSourceEnvironment}
            onClose={() => setCompareOpen(false)}
          />
        )}
        <Toaster toasterId={toasterId} position="top-end" />
      </div>
    </FluentProvider>
  );
}
