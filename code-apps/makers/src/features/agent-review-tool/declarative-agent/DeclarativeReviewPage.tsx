/**
 * Declarative (M365 Copilot) review result page — spec 017, Phase 1.
 *
 * The same review `DAReviewDialog` shows, on the shared shell and at a URL that
 * reopens it. Content is ported without change: the same criterion tabs, the
 * same `DAEvaluationSection` accordions, the same AI summary, the same agent
 * details. Only the container and the position of the score differ.
 *
 * `DeclarativeAgentTab` navigates here instead of opening `DAReviewDialog`.
 * That dialog is still mounted but can no longer open — reverting the two
 * handlers in `DeclarativeAgentTab` restores it, which is what the Content
 * Inventory comparison needs.
 */

import { useCallback, useMemo, useState } from 'react';
import {
  Accordion, Badge, Button, Image, MessageBar, MessageBarBody, Spinner,
  Text, makeStyles, tokens,
} from '@fluentui/react-components';
import {
  Agents24Color, ArrowDownloadRegular, CodeBlockEditRegular,
} from '@fluentui/react-icons';
import { useNavigate } from 'react-router-dom';
import { ReviewPageShell } from '../shared/review-shell/ReviewPageShell';
import { AiDisclaimerBadge } from '../shared/review-shell/ReviewSummaryRail';
import type { ReviewRailModel, ReviewTabModel } from '../shared/review-shell/reviewShellTypes';
import { DAEvaluationSection } from './components/DAEvaluationSection';
import { DAAgentDetailsDrawer } from './components/DAAgentDetailsDrawer';
import { buildDAReviewShellModel, type DATabId } from './adapters/daReviewShellModel';
import { useDAReview } from './hooks/useDAReview';
import { useDAExportMutation } from './hooks/useDAExportMutation';
import { useTabRouteState } from '../shared/review-shell/useTabRouteState';
import { useReturnFocusOnClose } from '../shared/review-shell/useReturnFocusOnClose';
import type { DAReviewRecord } from './contracts/DAReviewRecord';
import { SkillsTab } from '../agents-experience/components/SkillsTab';
import { DACustomSkillIssues } from './components/DACustomSkillIssues';
import { DAScoreHint } from './components/DAScoreHint';

/** Returning here must put the reader back on the tab they came from. */
const DECLARATIVE_TAB_PATH = '/agent-review-tool?tab=declarative-agent';

const useStyles = makeStyles({
  panel: { padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalM}` },
  intro: {
    display: 'block',
    fontSize: '12px',
    color: tokens.colorNeutralForeground2,
    marginBottom: tokens.spacingVerticalS,
  },
  headerIcon: { width: '24px', height: '24px', borderRadius: tokens.borderRadiusSmall },
  centred: {
    display: 'flex',
    justifyContent: 'center',
    padding: tokens.spacingVerticalXXL,
  },
  customSkillsHeading: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalL} 0`,
  },
});
export interface DeclarativeReviewPageProps {
  reviewId: string;
}

export function DeclarativeReviewPage({ reviewId }: DeclarativeReviewPageProps) {
  const styles = useStyles();
  const navigate = useNavigate();
  const { review, isLoading, isLoadingDetails, isError, error, notFound } = useDAReview(reviewId);

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
          <MessageBarBody>Review could not be loaded: {error}</MessageBarBody>
        </MessageBar>
      </div>
    );
  }

  if (notFound || !review) {
    return (
      <div className={styles.panel}>
        <MessageBar intent="error">
          <MessageBarBody>
            This declarative review is unavailable. It may have been deleted, or you may
            not have access to it.
          </MessageBarBody>
        </MessageBar>
      </div>
    );
  }

  return (
    <DeclarativeReviewContent
      review={review}
      isLoadingDetails={isLoadingDetails}
      // Return to the tab this review came from, not the first one. Without the
      // query string the breadcrumb lands on Copilot Studio and the reader has
      // to find their way back to the declarative list by hand.
      onBack={() => navigate(DECLARATIVE_TAB_PATH)}
    />
  );
}

/**
 * Split so the hooks below run against a resolved review. The loading and
 * error branches above return before any of them, which they may not do in a
 * single component.
 */
function DeclarativeReviewContent({
  review,
  isLoadingDetails,
  onBack,
}: {
  review: DAReviewRecord;
  isLoadingDetails: boolean;
  onBack: () => void;
}) {
  const styles = useStyles();
  const model = useMemo(() => buildDAReviewShellModel(review), [review]);

  /**
   * The page owns its export, as `StandardReviewPage` does. The dialog is
   * handed a ready-made handler by `DeclarativeAgentTab`; a route has no such
   * parent, so without this the Download report button could never render and
   * the Content Inventory item for it could not be ticked.
   */
  const { downloadPdf, isPdfPending } = useDAExportMutation();
  const [exportError, setExportError] = useState<string | null>(null);

  const handleDownloadReport = useCallback(async () => {
    setExportError(null);
    try {
      await downloadPdf(review);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'PDF generation failed');
    }
  }, [downloadPdf, review]);

  const isValidTab = useCallback(
    (value: string) =>
      value === 'all' ||
      model.sections.some((s) => s.tab === value) ||
      (value === 'customSkills' && model.customSkills !== undefined),
    [model.customSkills, model.sections],
  );
  const [selectedTab, setSelectedTab] = useTabRouteState<DATabId>('all', isValidTab);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsButtonRef = useReturnFocusOnClose(detailsOpen);

  const renderPanel = (tabId: DATabId) => {
    const sections = tabId === 'all'
      ? model.sections
      : model.sections.filter((s) => s.tab === tabId);

    return (
      <div className={styles.panel}>
        <Text className={styles.intro}>
          {tabId === 'all'
            ? 'Review results by criterion. Issues and assessment limits appear before passing checks.'
            : `${sections[0]?.criterionName ?? ''}${
                sections[0]?.weightLabel ? `, ${sections[0].weightLabel} of the score` : ''
              }. Issues and assessment limits appear before passing checks.`}
        </Text>

        <Accordion
          key={tabId}
          multiple={tabId === 'all'}
          collapsible
          defaultOpenItems={tabId === 'all' ? model.sections.map((s) => s.value) : [tabId]}
        >
          {sections.map((section) => (
            <DAEvaluationSection
              key={section.value}
              value={section.value}
              criterionName={section.criterionName}
              criterionKey={section.tab === 'package' ? 'manifestHealth' : section.criterionKey}
              result={section.result}
              isLoading={isLoadingDetails}
              showScore={false}
            />
          ))}
        </Accordion>

        {/*
          The AI summary lives in the rail, not here.

          The dialog printed it at the foot of the All tab, where it was
          reachable from one of seven tabs. The rail is visible on all of them,
          so the same text is strictly more available. It is deliberately NOT
          rendered in both places: two copies of the same paragraph on one
          screen invite the reader to check whether they agree.
        */}
      </div>
    );
  };

  /**
   * Rendered at zero too. "0 issues" is a reassuring statement, and both the
   * dialog ("Pattern Analysis (0 issues)") and the reference `CopilotReviewPage`
   * show it. An absent badge reads as "not counted yet".
   */
  const issueBadge = (count: number, label: string) => ({
    text: String(count),
    ariaLabel: `${count} ${count === 1 ? 'issue' : 'issues'} in ${label}`,
    tooltip: count === 0
      ? `No issues in ${label}`
      : `${count} ${count === 1 ? 'issue needs' : 'issues need'} attention in ${label}`,
  });

  const customSkills = model.customSkills;
  const customSkillsTab: ReviewTabModel[] = customSkills
    ? [{
        id: 'customSkills',
        label: 'Custom skills',
        badge: issueBadge(model.issueCounts.customSkills ?? 0, 'Custom skills'),
        render: () => (
          <div className={styles.panel}>
            <div className={styles.customSkillsHeading}>
              <Text weight="semibold" size={400}>Custom skills</Text>
              <Badge appearance="outline" color="informative">Preview</Badge>
            </div>
            <DACustomSkillIssues issues={customSkills.checkIssues} />
            <SkillsTab
              grouped={customSkills.grouped}
              skills={customSkills.skills}
            />
          </div>
        ),
      }]
    : [];

  const tabs: ReviewTabModel[] = [
    {
      id: 'all',
      label: 'All',
      badge: issueBadge(model.severity.total, 'this review'),
      render: () => renderPanel('all'),
    },
    ...model.sections.map<ReviewTabModel>((section) => ({
      id: section.tab,
      label: section.tabLabel,
      badge: issueBadge(model.issueCounts[section.tab] ?? 0, section.criterionName),
      render: () => renderPanel(section.tab),
    })),
    ...customSkillsTab,
  ];

  const severityFacts = [
    // Each severity keeps its own row, as the dialog rendered them, and a zero
    // stays suppressed. Combining Medium and Low would print "0 / 2" when only
    // Low is present — a zero the dialog deliberately never showed.
    model.severity.high > 0
      ? { key: 'high', label: 'High severity', value: String(model.severity.high) }
      : null,
    model.severity.medium > 0
      ? { key: 'medium', label: 'Medium severity', value: String(model.severity.medium) }
      : null,
    model.severity.low > 0
      ? { key: 'low', label: 'Low severity', value: String(model.severity.low) }
      : null,
  ].filter((fact): fact is { key: string; label: string; value: string } => fact !== null);

  const rail: ReviewRailModel = {
    scoreLabel: 'Quality score',
    score: model.score,
    scoreHint: (
      <DAScoreHint score={model.score} scoreBreakdown={model.scoreBreakdown} />
    ),
    subScores: model.subScores,
    badges: <AiDisclaimerBadge />,
    facts: [
      ...severityFacts,
      { key: 'agent', label: 'Agent', value: review.agentName },
      {
        key: 'package-validity',
        label: 'Package validity',
        value: (
          <Badge
            appearance="tint"
            color={
              model.packageValidity === 'valid'
                ? 'success'
                : model.packageValidity === 'valid-with-warnings'
                  ? 'warning'
                  : model.packageValidity === 'invalid'
                    ? 'danger'
                    : 'informative'
            }
          >
            {
              model.packageValidity === 'valid'
                ? 'Valid'
                : model.packageValidity === 'valid-with-warnings'
                  ? 'Valid with warnings'
                  : model.packageValidity === 'invalid'
                    ? 'Invalid'
                    : 'Unavailable'
            }
          </Badge>
        ),
      },
      /*
        No "Powered by" row. That is a column on the Copilot Studio agents
        grid, and its value is the review harness — standard or copilot. A
        declarative agent is not in that grid and has no harness, so
        "Powered by: Declarative" was a borrowed label restating the page
        the reader is already on.

        The manifest schema version takes the slot instead: it is a real
        declarative fact, it governs the starter and action limits the
        criteria are judged against, and it disambiguates the app version
        below it. It was otherwise reachable only through the drawer.
      */
      { key: 'manifest', label: 'Manifest', value: review.manifest?.schemaVersion || '—' },
      { key: 'version', label: 'Version', value: review.agentVersion || '—' },
      { key: 'publisher', label: 'Publisher', value: review.publisherName || '—' },
      // No "Source" row: the header chip beside the agent name already states
      // it, verbatim. Two copies of "ZIP upload" on one screen is the defect
      // that removed the metric strip.
      {
        key: 'reviewed-on',
        label: 'Reviewed',
        value: review.reviewedOn ? review.reviewedOn.toLocaleDateString() : '—',
        quiet: true,
      },
    ],
    summary: model.aiSummary
      ? { title: 'AI summary', body: model.aiSummary }
      : undefined,
  };

  return (
    <ReviewPageShell
      agentName={review.agentName}
      pageTitle="Declarative Agent Review"
      breadcrumbRoot={{ label: 'Agent Review Tool', onClick: onBack }}
      headerIcon={
        review.iconBase64
          ? <Image src={review.iconBase64} alt="" className={styles.headerIcon} />
          : <Agents24Color aria-hidden="true" />
      }
      headerChips={
        <Badge appearance="outline" shape="circular">
          {model.sourceLabel}
        </Badge>
      }
      headerActions={
        <>
          {review.manifest && (
            <Button
              appearance="secondary"
              ref={detailsButtonRef}
              icon={<CodeBlockEditRegular />}
              onClick={() => setDetailsOpen((open) => !open)}
              aria-expanded={detailsOpen}
              aria-controls="review-agent-details-drawer"
            >
              Agent details
            </Button>
          )}
          <Button
            appearance="primary"
            icon={isPdfPending ? <Spinner size="tiny" /> : <ArrowDownloadRegular />}
            onClick={() => void handleDownloadReport()}
            disabled={isPdfPending}
          >
            {isPdfPending ? 'Generating…' : 'Download report'}
          </Button>
        </>
      }
      banners={exportError ? (
        <MessageBar intent="error">
          <MessageBarBody>{exportError}</MessageBarBody>
        </MessageBar>
      ) : undefined}
      tabs={tabs}
      selectedTabId={selectedTab}
      onTabSelect={(id) => setSelectedTab(id as DATabId)}
      tabsAriaLabel="Declarative agent review results"
      rail={rail}
      drawerOpen={detailsOpen}
      drawerReplacesRail
      drawer={
        <DAAgentDetailsDrawer
          open={detailsOpen}
          manifest={review.manifest}
          onClose={() => setDetailsOpen(false)}
        />
      }
    />
  );
}
