/**
 * Standard (Copilot Studio) review result page — spec 017, Phase 2.
 *
 * The same review `ReviewDialogV2` shows, on the shared shell and at a URL that
 * reopens it. Content and interaction are ported without change: the same two
 * grids, the same detail drawer with Prev/Next, the same instruction-analysis
 * toggle, the same loading skeleton, the same exports, the same agent-details
 * drawer. Only the container and the position of the score differ.
 *
 * The grid opens this page: `FilterContext.openReviewDialog` navigates here.
 * `ReviewDialogV2` is still mounted but can no longer open, because the state
 * gating it is never set — reverting that one function body restores it, which
 * is what the Content Inventory comparison needs.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Avatar, Badge, Breadcrumb, BreadcrumbButton, BreadcrumbDivider, BreadcrumbItem,
  Button, FluentProvider, Menu, MenuItem, MenuList, MenuPopover, MenuTrigger,
  MessageBar, MessageBarActions, MessageBarBody, MessageBarTitle, Spinner, SplitButton,
  Text, Toaster, Tooltip, makeStyles, shorthands, tokens, useId, useRestoreFocusTarget,
} from '@fluentui/react-components';
import {
  ArrowClockwise20Regular, ArrowDownload20Regular,
  CodeBlockEditRegular, History20Regular,
} from '@fluentui/react-icons';
import { useNavigate } from 'react-router-dom';
import { copilotStudioReviewLightTheme } from '../../agents-experience/components/copilotStudioReviewTheme';
import { pillarContributions } from '../../agents-experience/services/scoring';
import { pillarNameLabelFor } from '../../review-core/harness';
import { ReviewPageShell } from '../../shared/review-shell/ReviewPageShell';
import { AiDisclaimerBadge } from '../../shared/review-shell/ReviewSummaryRail';
import { ScoreHint } from '../../shared/review-shell/ScoreHint';
import type { ReviewRailModel, ReviewTabModel } from '../../shared/review-shell/reviewShellTypes';
import { CSAgentDetailsDrawer } from '../dialogs/CSAgentDetailsDrawer';
import { StandardFindingDrawer } from './StandardFindingDrawer';
import {
  buildStandardReviewShellModel,
  type StandardTabId,
} from '../../adapters/standardReviewShellModel';
import { useTabRouteState } from '../../shared/review-shell/useTabRouteState';
import { useStandardReview } from '../../hooks/useStandardReview';
import { useStandardReviewExports } from '../../hooks/useStandardReviewExports';
import type { ReviewResult } from '../../contracts/ReviewResult';
import { PUBLIC_SAFE_PDF_DESCRIPTION } from '../../contracts/DisplayModels';
import type { ReviewHistoryEntry, ReviewFreshness } from '../../contracts/ReviewResult';
import { ReviewHistory } from '../history/ReviewHistory';
import { useBotPublication } from '../../hooks/useBotPublication';
import { getReviewFreshness } from '../../utils/reviewHistory';
import { useStandardReviewRunner } from '../../context/standardReviewRunnerContext';
import { formatDateTime } from '../../utils/dateUtils';
import { describeWorkflowOutcome } from '../../utils/workflowOutcome';
import { useMediaQuery } from '../../shared/review-shell/useMediaQuery';
import { StandardFindingsWorkspace } from './StandardFindingsWorkspace';
import { StandardAgentMapWorkspace } from './StandardAgentMapWorkspace';
import {
  StandardWorkspaceNavigation,
  type StandardWorkspaceId,
} from './StandardWorkspaceNavigation';
import { UpgradeReadinessPanel } from './UpgradeReadinessPanel';
import { HarnessFitPanel } from './HarnessFitPanel';
import {
  defaultStandardContentTab,
  isStandardWorkspaceId,
  standardContentTabValidator,
  type StandardContentTabId,
} from './standardWorkspaceRoute';

const STANDARD_FINDING_OVERLAY_QUERY = '(max-width: 1499px)';

const useStyles = makeStyles({
  exportMenu: { maxWidth: '300px' },
  bannerBody: {
    display: 'block',
    marginTop: tokens.spacingVerticalXXS,
  },
  panel: { padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalM}` },
  intro: {
    display: 'block',
    fontSize: '12px',
    color: tokens.colorNeutralForeground2,
    marginBottom: tokens.spacingVerticalS,
  },
  instructionsSection: { marginBottom: tokens.spacingVerticalM },
  instructionsToggle: {
    justifyContent: 'flex-start',
  },
  instructionsBody: {
    marginTop: tokens.spacingVerticalXS,
    padding: tokens.spacingVerticalS,
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: tokens.borderRadiusMedium,
  },
  workflowFact: {
    display: 'inline-flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    textAlign: 'right',
    gap: tokens.spacingHorizontalXS,
  },
  instructionsText: { color: tokens.colorNeutralForeground2, lineHeight: 1.6 },
  snapshotValue: { overflowWrap: 'anywhere', minWidth: 0 },
  skeletonRows: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS },
  skeletonRow: { height: '36px' },
  centred: { display: 'flex', justifyContent: 'center', padding: tokens.spacingVerticalXXL },
  historyPage: {
    minHeight: '100vh',
    background: `radial-gradient(124.48% 109.39% at 26.98% 6.02%, ${tokens.colorNeutralBackground1} 0%, ${tokens.colorNeutralBackground1} 37.08%, ${tokens.colorBrandBackground2} 100%)`,
  },
  historyChrome: {
    display: 'flex',
    flexWrap: 'wrap',
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalXXL}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  historyContainer: {
    maxWidth: '1240px',
    margin: '0 auto',
    padding: `${tokens.spacingVerticalXL} ${tokens.spacingHorizontalXXL} 48px`,
  },
  historyHeaderBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    marginBottom: tokens.spacingVerticalL,
  },
  historyTitle: {
    margin: 0,
    fontSize: tokens.fontSizeHero800,
    fontWeight: tokens.fontWeightSemibold,
    lineHeight: tokens.lineHeightHero800,
  },
  historyIntro: {
    color: tokens.colorNeutralForeground2,
    lineHeight: 1.5,
  },
  breadcrumb: {
    maxWidth: '100%',
    '& ol': { flexWrap: 'wrap' },
    '& li': { minWidth: 0, maxWidth: '100%' },
  },
  crumb: {
    minWidth: 0,
    maxWidth: '100%',
    whiteSpace: 'normal',
    overflowWrap: 'anywhere',
    textAlign: 'left',
    backgroundColor: tokens.colorTransparentBackground,
    ...shorthands.borderColor('transparent'),
    ':hover': { backgroundColor: tokens.colorSubtleBackgroundHover, ...shorthands.borderColor('transparent') },
    ':hover:active': { backgroundColor: tokens.colorSubtleBackgroundPressed, ...shorthands.borderColor('transparent') },
  },
});

export interface StandardReviewPageProps {
  botId: string;
  reviewId?: string | null;
  orgUrl?: string | null;
  sourceEnvironment?: string | null;
}

export function StandardReviewPage({
  botId,
  reviewId,
  orgUrl,
  sourceEnvironment,
}: StandardReviewPageProps) {
  const styles = useStyles();
  const navigate = useNavigate();
  const standardRunner = useStandardReviewRunner();
  const { review, isLoading, isLoadingDetails, isError, error, notFound } =
    useStandardReview(botId, reviewId, orgUrl, sourceEnvironment);
  const publication = useBotPublication(
    sourceEnvironment === 'zip' ? undefined : botId,
    orgUrl,
  );
  if (isLoading) {
    return (
      <div className={styles.centred}>
        <Spinner label="Loading saved review…" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className={styles.panel}>
        <MessageBar intent="error">
          <MessageBarBody>
            <MessageBarTitle>Review could not be loaded</MessageBarTitle>
            <span className={styles.bannerBody}>Review could not be loaded: {error}</span>
          </MessageBarBody>
        </MessageBar>
      </div>
    );
  }

  if (notFound || !review) {
    return (
      <div className={styles.panel}>
        <MessageBar intent="error">
          <MessageBarBody>
            <MessageBarTitle>Saved review unavailable</MessageBarTitle>
            {/*
              Names the likeliest cause rather than only blaming access. A
              cross-environment review is filtered by `orgUrl`, so a shared link
              that drops that parameter finds nothing even though the record
              exists and the maker can see it.
            */}
            <span className={styles.bannerBody}>
              No saved review was found for this agent
              {orgUrl ? ' in the selected environment' : ''}. If the link came from
              someone else, it may be missing the environment it was reviewed in
              {orgUrl ? '' : ' (an “orgUrl” parameter)'}. Try opening the review
              from the Agent Review Tool grid instead.
            </span>
          </MessageBarBody>
        </MessageBar>
      </div>
    );
  }

  const currentPublishedOn = publication.data;
  const freshness = getReviewFreshness(
    review.agentVersion,
    currentPublishedOn,
    review.sourceEnvironment,
  );

  const buildReviewUrl = (nextReviewId: string) => {
    const params = new URLSearchParams({ reviewId: nextReviewId });
    if (orgUrl) params.set('orgUrl', orgUrl);
    if (sourceEnvironment === 'zip') {
      params.set('sourceEnvironment', 'zip');
    }
    return `/agent-review-tool/standard/${encodeURIComponent(botId)}?${params.toString()}`;
  };

  const runLatestReview = () => {
    if (
      standardRunner.isRunning ||
      !currentPublishedOn ||
      review.sourceEnvironment === 'zip'
    ) return;
    standardRunner.start(
      {
        botId: review.botId,
        botName: review.botName,
        componentIdUnique: review.componentIdUnique,
        orgUrl,
        sourceEnvironment: review.sourceEnvironment ?? orgUrl ?? '',
        agentVersion: currentPublishedOn.toISOString(),
      },
      { returnPath: '/agent-review-tool' },
    );
  };

  return (
    <StandardReviewContent
      review={review}
      isLoadingDetails={isLoadingDetails}
      freshness={freshness}
      currentPublishedOn={currentPublishedOn}
      isReviewing={standardRunner.isRunning}
      onBack={() => navigate('/agent-review-tool')}
      onReviewLatest={runLatestReview}
      onOpenHistory={(entry) => navigate(buildReviewUrl(entry.reviewId))}
    />
  );
}

/** Split so the hooks below run against a resolved review. */
function StandardReviewContent({
  review,
  isLoadingDetails,
  freshness,
  currentPublishedOn,
  isReviewing,
  onBack,
  onReviewLatest,
  onOpenHistory,
}: {
  review: ReviewResult;
  isLoadingDetails: boolean;
  freshness: ReviewFreshness;
  currentPublishedOn?: Date | null;
  isReviewing: boolean;
  onBack: () => void;
  onReviewLatest: () => void;
  onOpenHistory: (entry: ReviewHistoryEntry) => void;
}) {
  const styles = useStyles();
  const toasterId = useId('standard-review-toaster');

  const model = useMemo(() => buildStandardReviewShellModel(review), [review]);

  // Derived from the unit outcomes rather than from the presence of provenance: a review whose
  // workflow returned nothing still carries provenance, and used to claim it had been verified.
  const workflowOutcome = useMemo(
    () => (review.workflowProvenance ? describeWorkflowOutcome(review.workflowProvenance) : null),
    [review.workflowProvenance],
  );

  const [selectedWorkspace, setSelectedWorkspace] = useTabRouteState<StandardWorkspaceId>(
    'findings',
    isStandardWorkspaceId,
    'workspace',
  );
  const [selectedRouteTab, setSelectedRouteTab] = useTabRouteState<StandardContentTabId>(
    defaultStandardContentTab(selectedWorkspace),
    standardContentTabValidator(selectedWorkspace),
    'tab',
  );
  const [selectedPatternIndex, setSelectedPatternIndex] = useState<number | null>(null);
  const [selectedCriterionIndex, setSelectedCriterionIndex] = useState<number | null>(null);
  const [agentDetailsOpen, setAgentDetailsOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const findingUsesOverlay = useMediaQuery(STANDARD_FINDING_OVERLAY_QUERY);
  const findingTriggerRef = useRef<HTMLButtonElement | null>(null);
  const agentDetailsFocusTarget = useRestoreFocusTarget();
  const historyHeadingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (showHistory) {
      historyHeadingRef.current?.focus();
    }
  }, [showHistory]);

  const closeFindingDrawer = useCallback(() => {
    const trigger = findingTriggerRef.current;
    setSelectedPatternIndex(null);
    setSelectedCriterionIndex(null);
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        if (trigger?.isConnected) trigger.focus();
      });
    }
  }, []);

  const handleWorkspaceSelect = useCallback((id: string) => {
    setSelectedWorkspace(id as StandardWorkspaceId);
    closeFindingDrawer();
    setAgentDetailsOpen(false);
  }, [closeFindingDrawer, setSelectedWorkspace]);

  const handleContentTabSelect = useCallback((id: string) => {
    setSelectedRouteTab(id as StandardContentTabId);
    closeFindingDrawer();
  }, [closeFindingDrawer, setSelectedRouteTab]);

  /**
   * Export handlers are duplicated from `Dashboard` rather than moved, so the
   * dialog keeps working while both surfaces are live. They are removed from
   * `Dashboard` in Phase 2b, after the switch.
   */
  const {
    downloadPdfReport, downloadPublicPdfReport, downloadSarifReport,
    isPdfDownloading, isSarifDownloading, isExporting,
  } = useStandardReviewExports(review, toasterId);

  const totalFindingCount =
    model.failedPatternCount + model.findingCounts.instructionIssueCount;
  const findingSummary =
    `${model.failedPatternCount} failed pattern checks and `
    + `${model.findingCounts.instructionIssueCount} instruction findings`;
  const renderFindingsWorkspace = (selectedTab: StandardTabId) => (
    <StandardFindingsWorkspace
      review={review}
      model={model}
      isLoadingDetails={isLoadingDetails}
      selectedPatternIndex={selectedPatternIndex}
      selectedCriterionIndex={selectedCriterionIndex}
      selectedTab={selectedTab}
      onOpenPattern={(index, trigger) => {
        findingTriggerRef.current = trigger;
        setSelectedPatternIndex(index);
        setSelectedCriterionIndex(null);
      }}
      onOpenCriterion={(index, trigger) => {
        findingTriggerRef.current = trigger;
        setSelectedCriterionIndex(index);
        setSelectedPatternIndex(null);
      }}
    />
  );
  const findingTabs: ReviewTabModel[] = [
    {
      id: 'patterns',
      label: 'Pattern analysis',
      badge: {
        text: String(model.failedPatternCount),
        ariaLabel: `Patterns: ${model.patternAssessmentSummary}`,
        tooltip: model.patternAssessmentSummary,
      },
      render: () => renderFindingsWorkspace('patterns'),
    },
    {
      id: 'compliance',
      label: 'Agent instructions',
      badge: {
        text: String(model.findingCounts.instructionIssueCount),
        ariaLabel: `Instructions: ${model.instructionAssessmentSummary}`,
        tooltip: model.instructionAssessmentSummary,
      },
      render: () => renderFindingsWorkspace('compliance'),
    },
  ];
  const agentMapTab: ReviewTabModel = {
    id: 'agent-map-content',
    label: 'Architecture',
      render: () => (
        <StandardAgentMapWorkspace
          agentId={review.botId}
          agentName={review.botName}
          resultIdentity={review.reviewId ?? `${review.botId}:${review.reviewedOn}`}
          stageA={model.stageAOutput}
          rootIconBase64={review.iconBase64}
          connectedAgentTargets={review.connectedAgentTargets}
          isLoading={isLoadingDetails}
        />
      ),
  };
  const upgradeReadinessTab: ReviewTabModel = {
    id: 'upgrade-readiness',
    label: 'Upgrade readiness',
    render: () => (
      <UpgradeReadinessPanel
        stageA={model.stageAOutput}
        isLoading={isLoadingDetails}
      />
    ),
  };
  const harnessFitTab: ReviewTabModel = {
    id: 'harness-fit',
    label: 'Harness fit',
    render: () => (
      <HarnessFitPanel
        stageA={model.stageAOutput}
        isLoading={isLoadingDetails}
        onOpenUpgradeReadiness={() => {
          handleContentTabSelect('upgrade-readiness');
          document.getElementById('review-tab-upgrade-readiness')?.focus();
        }}
      />
    ),
  };
  const harnessTabs: ReviewTabModel[] = [upgradeReadinessTab, harnessFitTab];
  const contentTabsByWorkspace: Record<StandardWorkspaceId, ReviewTabModel[]> = {
    findings: findingTabs,
    'agent-map': [agentMapTab],
    harness: harnessTabs,
  };
  const contentTabs = contentTabsByWorkspace[selectedWorkspace];
  const selectedContentTab = selectedWorkspace === 'agent-map'
    ? agentMapTab.id
    : selectedRouteTab;

  // Historical results retain their scores without an inferred numeric weight.
  const hasPatterns = model.scores.pattern !== null;
  const hasInstructions = model.scores.instruction !== null;
  const bothRan = hasPatterns && hasInstructions;
  // A review scored by the shared composite explains itself from the pillar
  // breakdown it recorded, read through the scorer's own arithmetic rather than
  // restated here. The pattern/instruction ladder below stays for rows saved
  // before that move, which carry no breakdown to read.
  const contributions = model.scores.legacy ? [] : pillarContributions(model.scores.pillars);
  const isComposite = contributions.some(c => c.applicable && c.score !== null);
  // This page serves the standard harness only, so its pillar names take that
  // harness's spelling: a classic agent's Skills pillar is scored entirely over
  // topics. The copilot rail reads the shared label because it scores skills.
  const pillarLabel = (name: string) => pillarNameLabelFor('standard', name);
  const effectiveWeightFor = (ran: boolean) => !ran || model.scores.legacy || isComposite
    ? undefined
    : bothRan ? '50%' : '100%';
  const weightFor = (ran: boolean) => !ran ? 'Not assessed'
    : effectiveWeightFor(ran) ? `${effectiveWeightFor(ran)} weight` : undefined;
  const reviewerName = review.reviewedBy?.trim() || undefined;

  const rail: ReviewRailModel = {
    scoreLabel: 'Overall score',
    score: model.scores.overall,
    scoreUnavailableReason: 'An overall score is not available for this review.',
    scoreHint: (
      <ScoreHint
        basis={model.scores.legacy
          ? 'The original saved scores. This historical review has not been regraded.'
          : isComposite
            ? 'Overall score = the weighted mean of the review pillars below, each taking the share it carried in this review.'
            : bothRan
              ? 'Overall score = (Pattern score × 50%) + (Instructions score × 50%).'
              : hasPatterns
                ? 'Overall score = Pattern score × 100%. Instructions were not assessed.'
                : hasInstructions
                  ? 'Overall score = Instructions score × 100%. Patterns were not assessed.'
                  : 'No overall score is calculated because neither part was assessed.'}
        caveat="Static review of saved authoring settings only. It does not measure answer quality, runtime behavior, access controls, or production readiness."
        redistribution={model.scores.legacy
          ? 'Historical results and their original assessment date are retained. Missing stage data does not justify calculating a replacement score.'
          : isComposite
            ? 'A pillar with nothing to measure is excluded and its share is spread across the pillars that did run. N/A and Not assessed checks are excluded, rather than counted as passes or failures.'
              + (model.scores.status === 'partial'
                ? ' Part of this score rests on evidence that could not be read in full.'
                : '')
            : 'When only one part was assessed, it carries the score. N/A and Not assessed checks are excluded, rather than counted as passes or failures.'}
        breakdownLabel="Overall score breakdown"
        breakdown={isComposite
          ? contributions.map(contribution => ({
            key: contribution.pillar,
            label: pillarLabel(contribution.pillar),
            weight: contribution.effectiveWeight > 0
              ? `${Math.round(contribution.effectiveWeight)}%`
              : undefined,
            value: contribution.score === null
              ? 'Not assessed'
              : `${Math.round(contribution.score)}%`,
          }))
          : [
            {
              key: 'patterns',
              label: 'Pattern score',
              weight: effectiveWeightFor(hasPatterns),
              value: model.scores.pattern === null
                ? 'Not assessed'
                : `${Math.round(model.scores.pattern)}%`,
            },
            {
              key: 'instructions',
              label: 'Instructions score',
              weight: effectiveWeightFor(hasInstructions),
              value: model.scores.instruction === null
                ? 'Not assessed'
                : `${Math.round(model.scores.instruction)}%`,
            },
          ]}
      />
    ),
    // A composite review names the pillars it actually scored, so the rail reads
    // the same way on every harness that shares the scorer. The two-sub-score
    // ladder stays for rows saved before that move, which recorded no breakdown.
    subScores: isComposite
      ? contributions.map(contribution => ({
        label: pillarLabel(contribution.pillar),
        percent: contribution.score,
        weight: contribution.score === null
          ? 'Not assessed'
          : contribution.effectiveWeight > 0
            ? `${Math.round(contribution.effectiveWeight)}% weight`
            : undefined,
      }))
      : [
        {
          label: 'Pattern score',
          percent: model.scores.pattern,
          weight: weightFor(hasPatterns),
        },
        {
          label: 'Instructions score',
          percent: model.scores.instruction,
          weight: weightFor(hasInstructions),
        },
      ],
    badges: <AiDisclaimerBadge />,
    facts: [
      { key: 'agent', label: 'Agent', value: <Text className={styles.snapshotValue}>{review.botName}</Text> },
      { key: 'reviewed', label: 'Reviewed', value: formatDateTime(review.reviewedOn) },
      ...(review.workflowProvenance && workflowOutcome ? [{
        key: 'workflow',
        label: 'Workflow result',
        alignToFirstLine: true,
        value: (
          <Tooltip
            relationship="description"
            content={`Workflow job ${review.workflowProvenance.jobId}. Correlation ${review.workflowProvenance.correlationId}. Retrieved ${formatDateTime(review.workflowProvenance.retrievedAt)}.`}
          >
            <span className={styles.workflowFact}>
              <Badge
                appearance="tint"
                color={workflowOutcome.badgeColor}
                size="small"
                shape="rounded"
              >
                {workflowOutcome.badgeLabel}
              </Badge>
              <Text>
                {workflowOutcome.succeededUnits} of {workflowOutcome.totalUnits} result units
              </Text>
            </span>
          </Tooltip>
        ),
      }] : []),
      {
        key: 'reviewed-by',
        label: 'Reviewed by',
        value: (
          <>
            {reviewerName && <Avatar name={reviewerName} size={24} color="colorful" />}
            <Text className={styles.snapshotValue}>{reviewerName ?? 'Not available'}</Text>
          </>
        ),
      },
    ],
  };

  const findingDrawerOpen = selectedPatternIndex !== null || selectedCriterionIndex !== null;

  const stepFinding = (delta: number) => {
    if (selectedPatternIndex !== null) {
      setSelectedPatternIndex((i) => {
        if (i === null) return i;
        const next = i + delta;
        return next >= 0 && next < model.patternRows.length ? next : i;
      });
      return;
    }
    setSelectedCriterionIndex((i) => {
      if (i === null) return i;
      const next = i + delta;
      return next >= 0 && next < model.complianceRows.length ? next : i;
    });
  };

  const findingDrawer = findingDrawerOpen ? (
    <StandardFindingDrawer
      open
      overlay={findingUsesOverlay}
      pattern={
        selectedPatternIndex !== null
          ? model.patternRows[selectedPatternIndex] ?? null
          : null
      }
      patternIndex={selectedPatternIndex}
      patternTotal={model.patternRows.length}
      criterion={
        selectedCriterionIndex !== null
          ? model.complianceRows[selectedCriterionIndex] ?? null
          : null
      }
      criterionIndex={selectedCriterionIndex}
      criterionTotal={model.complianceRows.length}
      agentInstructions={model.agentInstructions}
      onPrev={() => stepFinding(-1)}
      onNext={() => stepFinding(1)}
      onClose={closeFindingDrawer}
    />
  ) : undefined;

  return (
    <>
      <Toaster toasterId={toasterId} />
      {showHistory ? (
        <FluentProvider theme={copilotStudioReviewLightTheme}>
          <div className={styles.historyPage}>
            <header className={styles.historyChrome}>
              <Breadcrumb className={styles.breadcrumb} aria-label="Navigation">
                <BreadcrumbItem>
                  <BreadcrumbButton className={styles.crumb} onClick={onBack}>
                    Agent Review Tool
                  </BreadcrumbButton>
                </BreadcrumbItem>
                <BreadcrumbDivider />
                <BreadcrumbItem>
                  <BreadcrumbButton className={styles.crumb} onClick={() => setShowHistory(false)}>
                    {review.botName}
                  </BreadcrumbButton>
                </BreadcrumbItem>
                <BreadcrumbDivider />
                <BreadcrumbItem>
                  <BreadcrumbButton className={styles.crumb} current>
                    Version history
                  </BreadcrumbButton>
                </BreadcrumbItem>
              </Breadcrumb>
            </header>
            <div className={styles.historyContainer}>
              <div className={styles.historyHeaderBlock}>
                <h1 ref={historyHeadingRef} tabIndex={-1} className={styles.historyTitle}>Version history</h1>
                <Text className={styles.historyIntro}>
                  Open a stored review to compare saved findings without changing the current navigation flow.
                </Text>
              </div>
              <ReviewHistory
                subject={{
                  botId: review.botId,
                  componentIdUnique: review.componentIdUnique,
                  sourceEnvironment: review.sourceEnvironment,
                }}
                currentPublishedOn={currentPublishedOn}
                selectedReviewId={review.reviewId ?? null}
                onOpenReview={(entry) => {
                  setShowHistory(false);
                  onOpenHistory(entry);
                }}
              />
            </div>
          </div>
        </FluentProvider>
      ) : (
      <ReviewPageShell
        agentName={review.botName}
        pageTitle="Standard Agent Review"
        resultIdentity={review.reviewId}
        breadcrumbRoot={{ label: 'Agent Review Tool', onClick: onBack }}
        headerChips={
          <Badge appearance="outline" color="informative" shape="rounded">
            {model.isZipSource ? 'Uploaded ZIP'
              : review.sourceEnvironment || model.stageAOutput?.source === 'live' ? 'Live' : 'Source not recorded'}
          </Badge>
        }
        headerActions={
          <>
            <Tooltip content="Version history" relationship="label">
              <Button
                appearance="subtle"
                icon={<History20Regular />}
                aria-label="Version history"
                onClick={() => {
                  setShowHistory(true);
                  setAgentDetailsOpen(false);
                  closeFindingDrawer();
                }}
              />
            </Tooltip>
            {model.stageAOutput && (
              <Button
                appearance="secondary"
                {...agentDetailsFocusTarget}
                icon={<CodeBlockEditRegular />}
                onClick={() => {
                  setAgentDetailsOpen((open) => !open);
                }}
                aria-expanded={agentDetailsOpen}
              >
                Agent details
              </Button>
            )}
            <Menu positioning="below-end">
              <MenuTrigger disableButtonEnhancement>
                {(triggerProps) => (
                  <SplitButton
                    appearance="primary"
                    menuButton={{ ...triggerProps, 'aria-label': 'More export options' }}
                    primaryActionButton={{
                      onClick: () => void downloadPdfReport(),
                      disabled: isExporting,
                    }}
                    icon={isPdfDownloading ? <Spinner size="tiny" /> : <ArrowDownload20Regular />}
                    disabled={isExporting}
                  >
                    {isPdfDownloading ? 'Generating…' : 'Download PDF'}
                  </SplitButton>
                )}
              </MenuTrigger>
              <MenuPopover className={styles.exportMenu}>
                <MenuList>
                  <MenuItem
                    onClick={() => void downloadPdfReport()}
                    disabled={isExporting}
                  >
                    {isPdfDownloading ? 'Generating PDF…' : 'Download as PDF'}
                  </MenuItem>
                  <Tooltip content={PUBLIC_SAFE_PDF_DESCRIPTION} relationship="description">
                    <MenuItem
                      onClick={() => void downloadPublicPdfReport()}
                      disabled={isExporting}
                    >
                      Download public-safe PDF
                    </MenuItem>
                  </Tooltip>
                  <MenuItem
                    onClick={downloadSarifReport}
                    disabled={isExporting}
                  >
                    {isSarifDownloading ? 'Generating SARIF…' : 'Download as SARIF'}
                  </MenuItem>
                </MenuList>
              </MenuPopover>
            </Menu>
          </>
        }
        banners={(workflowOutcome?.notice || freshness === 'stale') ? (
          <>
            {workflowOutcome?.notice ? (
              <MessageBar intent={workflowOutcome.notice.intent} aria-live="polite">
                <MessageBarBody>
                  <MessageBarTitle>{workflowOutcome.notice.title}</MessageBarTitle>
                  <span className={styles.bannerBody}>{workflowOutcome.notice.body}</span>
                </MessageBarBody>
              </MessageBar>
            ) : null}
            {freshness === 'stale' ? (
              <MessageBar intent="warning" aria-live="assertive">
                <MessageBarBody>
                  <MessageBarTitle>Newer version available</MessageBarTitle>
                  <span className={styles.bannerBody}>A newer published version is available.</span>
                </MessageBarBody>
                <MessageBarActions>
                  <Button
                    appearance="primary"
                    icon={isReviewing
                      ? <Spinner size="tiny" />
                      : <ArrowClockwise20Regular />}
                    disabled={isReviewing}
                    onClick={onReviewLatest}
                  >
                    {isReviewing
                      ? 'Reviewing...'
                      : 'Review latest'}
                  </Button>
                </MessageBarActions>
              </MessageBar>
            ) : null}
          </>
        ) : undefined}
        workspaceNavigation={(
          <StandardWorkspaceNavigation
            selectedWorkspace={selectedWorkspace}
            findingCount={totalFindingCount}
            findingSummary={findingSummary}
            onWorkspaceChange={handleWorkspaceSelect}
          />
        )}
        tabs={contentTabs}
        selectedTabId={selectedContentTab}
        onTabSelect={handleContentTabSelect}
        tabsAriaLabel={selectedWorkspace === 'harness' ? 'Harness categories' : 'Review finding categories'}
        hideTabList={selectedWorkspace === 'agent-map'}
        rail={rail}
        hideRail={selectedWorkspace === 'agent-map'}
        drawerOpen={findingDrawerOpen && !findingUsesOverlay}
        drawerReplacesRail={findingDrawerOpen}
        drawerPresentation="panel"
        drawer={findingUsesOverlay ? undefined : findingDrawer}
        overlay={findingUsesOverlay ? findingDrawer : undefined}
      />
      )}
      <CSAgentDetailsDrawer
        open={agentDetailsOpen}
        stageAOutput={model.stageAOutput}
        onClose={() => setAgentDetailsOpen(false)}
        isZipSource={model.isZipSource}
        overlay
      />
    </>
  );
}
