import { useCallback, useMemo, useState } from 'react';
import {
  Badge, Button, Dialog, DialogBody, DialogSurface, DialogTitle, Menu, MenuItem, MenuList,
  MenuPopover, MenuTrigger, Skeleton, SkeletonItem,
  Spinner, SplitButton, Tab, TabList, Text, Tooltip, makeStyles, tokens, typographyStyles, useId, useRestoreFocusTarget,
} from '@fluentui/react-components';
import {
  ArrowDownload20Regular, ChevronDown16Regular, ChevronRight16Regular,
  CodeBlockEditRegular, Dismiss24Regular, Sparkle32Filled,
} from '@fluentui/react-icons';
import { RadialGauge } from '../core/RadialGauge';
import { PatternsDataGrid } from '../grids/PatternsDataGrid';
import { ComplianceDataGrid } from '../grids/ComplianceDataGrid';
import { StandardFindingDrawer } from '../review-page/StandardFindingDrawer';
import { CSAgentDetailsDrawer } from './CSAgentDetailsDrawer';
import type { ReviewResult } from '../../contracts/ReviewResult';
import { PUBLIC_SAFE_PDF_DESCRIPTION } from '../../contracts/DisplayModels';
import { buildStandardReviewShellModel } from '../../adapters/standardReviewShellModel';
import { STANDARD_REVIEW_LIMITS } from '../../utils/standardReviewProjection';
import { formatDateTime } from '../../utils/dateUtils';
import { ReviewContextDisclosure } from '../review-page/ReviewContextDisclosure';

export interface ReviewDialogV2Props {
  open: boolean;
  review: ReviewResult | null;
  isLoadingDetails?: boolean;
  onClose: () => void;
  onDownloadPdf?: () => void;
  /** Optional public-safe export supplied by the review container. */
  onDownloadPublicPdf?: () => void;
  onDownloadSarif?: () => void;
  isDownloadingPdf?: boolean;
  isDownloadingSarif?: boolean;
}

const useStyles = makeStyles({
  exportMenu: { maxWidth: '300px' },
  surface: {
    width: '100vw', height: '100vh', maxWidth: '100vw', minHeight: '100vh',
    borderRadius: 0, margin: 0, padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden',
  },
  body: {
    display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden',
    padding: 0, gap: 0, gridTemplateRows: 'unset',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap',
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalXL}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, flexShrink: 0,
    gap: tokens.spacingHorizontalM, backgroundColor: tokens.colorNeutralBackground1,
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalMNudge, flex: '1 1 auto', minWidth: 0 },
  headerTitle: { ...typographyStyles.subtitle2, overflowWrap: 'anywhere' },
  headerIcon: { color: tokens.colorBrandForeground1, flexShrink: 0 },
  headerActions: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: tokens.spacingHorizontalS, flex: '0 1 auto', minWidth: 0 },
  content: {
    display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0,
    '@media (max-width: 639px)': { flexDirection: 'column', overflowY: 'auto' },
    '@media (max-width: 959px), (max-height: 559px)': { flexDirection: 'column', overflowY: 'auto' },
  },
  scorePanel: {
    width: '200px', flexShrink: 0, minWidth: 0, display: 'flex', flexDirection: 'column',
    alignItems: 'center', padding: `${tokens.spacingVerticalXXL} ${tokens.spacingHorizontalL}`,
    borderRight: `1px solid ${tokens.colorNeutralStroke2}`, gap: tokens.spacingVerticalXL,
    backgroundColor: tokens.colorNeutralBackground2, overflowY: 'auto',
    '@media (max-width: 639px)': { width: 'auto', overflowY: 'visible' },
    '@media (max-width: 959px), (max-height: 559px)': {
      width: 'auto',
      borderRight: 'none',
      borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
      overflowY: 'visible',
    },
  },
  scorePanelTitle: { ...typographyStyles.caption1Strong, color: tokens.colorNeutralForeground3 },
  subScores: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM, width: '100%' },
  subScoreCard: {
    padding: `${tokens.spacingVerticalMNudge} ${tokens.spacingHorizontalM}`,
    backgroundColor: tokens.colorNeutralBackground1, borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`, display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXS,
  },
  subScoreLabel: { ...typographyStyles.caption1, color: tokens.colorNeutralForeground3 },
  subScoreValue: { ...typographyStyles.subtitle1, color: tokens.colorNeutralForeground2 },
  snapshotValue: { overflowWrap: 'anywhere', minWidth: 0 },
  gridArea: {
    flex: '1 1 auto', display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0,
    '@media (max-width: 639px)': { overflow: 'visible', flexShrink: 0 },
    '@media (max-width: 959px), (max-height: 559px)': { overflow: 'visible', flexShrink: 0 },
  },
  tabsHeader: { padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalXL} 0`, borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, flexShrink: 0 },
  tabPanel: {
    display: 'flex',
    flex: 1,
    minHeight: 0,
    flexDirection: 'column',
  },
  tabList: { flexWrap: 'wrap' },
  gridContent: {
    flex: 1, overflowY: 'auto', padding: `${tokens.spacingVerticalL} ${tokens.spacingHorizontalXL}`,
    display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM,
  },
  instructionsSection: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM },
  instructionsToggle: { justifyContent: 'flex-start' },
  instructionsBody: { padding: tokens.spacingVerticalM, backgroundColor: tokens.colorNeutralBackground2, borderRadius: tokens.borderRadiusMedium },
  skeletonRows: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXS },
  skeletonRow: { height: '24px', borderRadius: tokens.borderRadiusSmall },
  drawer: {
    width: '420px',
    borderLeft: `1px solid ${tokens.colorNeutralStroke2}`,
    '@media (max-width: 959px), (max-height: 559px)': {
      width: 'auto',
      borderLeft: 'none',
      borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    },
  },
});

function scoreColor(score: number | null): string {
  if (score === null) return tokens.colorNeutralForeground2;
  if (score >= 80) return tokens.colorStatusSuccessForeground1;
  if (score >= 60) return tokens.colorStatusWarningForeground1;
  return tokens.colorStatusDangerForeground1;
}

/** Legacy full-screen surface using the same saved assessment and details projection as the review page. */
export function ReviewDialogV2({
  open, review, isLoadingDetails = false, onClose, onDownloadPdf, onDownloadPublicPdf, onDownloadSarif,
  isDownloadingPdf = false, isDownloadingSarif = false,
}: ReviewDialogV2Props) {
  const styles = useStyles();
  const agentDetailsFocusTarget = useRestoreFocusTarget();
  const instructionsBodyId = useId('standard-dialog-instructions');
  const dialogTabsetId = useId('standard-review-dialog');
  const model = useMemo(() => buildStandardReviewShellModel(review), [review]);
  const [selectedTab, setSelectedTab] = useState<'patterns' | 'compliance'>('patterns');
  const [selectedPatternIndex, setSelectedPatternIndex] = useState<number | null>(null);
  const [selectedCriterionIndex, setSelectedCriterionIndex] = useState<number | null>(null);
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [agentDetailsOpen, setAgentDetailsOpen] = useState(false);
  const closeDrawer = useCallback(() => {
    setSelectedPatternIndex(null);
    setSelectedCriterionIndex(null);
  }, []);
  const handleTabSelect = useCallback((_: unknown, data: { value: unknown }) => {
    setSelectedTab(data.value as 'patterns' | 'compliance');
    closeDrawer();
    setAgentDetailsOpen(false);
  }, [closeDrawer]);
  if (!review) return null;

  const { patternRows, complianceRows, scores } = model;
  const selectedPattern = selectedPatternIndex !== null ? patternRows[selectedPatternIndex] ?? null : null;
  const selectedCriterion = selectedCriterionIndex !== null ? complianceRows[selectedCriterionIndex] ?? null : null;
  const activeTabId = `${dialogTabsetId}-tab-${selectedTab}`;
  const activePanelId = `${dialogTabsetId}-panel-${selectedTab}`;
  const stepFinding = (delta: number) => {
    if (selectedPatternIndex !== null) {
      setSelectedPatternIndex(index => index !== null && index + delta >= 0 && index + delta < patternRows.length ? index + delta : index);
    } else {
      setSelectedCriterionIndex(index => index !== null && index + delta >= 0 && index + delta < complianceRows.length ? index + delta : index);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(_, data) => !data.open && onClose()} modalType="modal">
      <DialogSurface className={styles.surface}>
        <DialogBody className={styles.body}>
          <div className={styles.header}>
            <div className={styles.headerLeft}>
              <Sparkle32Filled className={styles.headerIcon} aria-hidden />
              <DialogTitle className={styles.headerTitle}>Agent Review Report: {review.botName}</DialogTitle>
            </div>
            <div className={styles.headerActions}>
              {model.stageAOutput && (
                <Button {...agentDetailsFocusTarget} appearance="subtle" size="small" icon={<CodeBlockEditRegular />}
                  onClick={() => setAgentDetailsOpen(value => !value)} aria-expanded={agentDetailsOpen}>
                  Agent Details
                </Button>
              )}
              <Menu>
                <MenuTrigger disableButtonEnhancement>
                  <SplitButton
                    appearance="secondary" size="small"
                    icon={isDownloadingPdf ? <Spinner size="tiny" /> : <ArrowDownload20Regular />}
                    primaryActionButton={onDownloadPdf ? { onClick: onDownloadPdf, disabled: isDownloadingPdf || isDownloadingSarif } : undefined}
                    menuButton={{ disabled: isDownloadingPdf || isDownloadingSarif, 'aria-label': 'More export options' }}
                  >
                    {isDownloadingPdf ? 'Generating...' : 'Download PDF'}
                  </SplitButton>
                </MenuTrigger>
                <MenuPopover className={styles.exportMenu}>
                  <MenuList>
                    <MenuItem onClick={onDownloadPdf} disabled={isDownloadingPdf || isDownloadingSarif}>
                      {isDownloadingPdf ? 'Generating PDF...' : 'Download as PDF'}
                    </MenuItem>
                    {onDownloadPublicPdf && (
                      <Tooltip content={PUBLIC_SAFE_PDF_DESCRIPTION} relationship="description">
                        <MenuItem onClick={onDownloadPublicPdf} disabled={isDownloadingPdf || isDownloadingSarif}>
                          Download public-safe PDF
                        </MenuItem>
                      </Tooltip>
                    )}
                    <MenuItem onClick={onDownloadSarif} disabled={isDownloadingPdf || isDownloadingSarif}>
                      {isDownloadingSarif ? 'Generating SARIF...' : 'Download as SARIF'}
                    </MenuItem>
                  </MenuList>
                </MenuPopover>
              </Menu>
              <Button appearance="subtle" aria-label="Close" icon={<Dismiss24Regular />} onClick={onClose} />
            </div>
          </div>
          <div className={styles.content}>
            <div className={styles.scorePanel}>
              <Text className={styles.scorePanelTitle}>Overall Score</Text>
              {scores.overall === null
                ? <Text className={styles.subScoreValue}>Not assessed</Text>
                : <RadialGauge score={scores.overall} size={140} />}
              <div className={styles.subScores}>
                {[{ label: 'Pattern Score', score: scores.pattern }, { label: 'Instructions Score', score: scores.instruction }].map(({ label, score }) => (
                  <div className={styles.subScoreCard} key={label}>
                    <Text className={styles.subScoreLabel}>{label}</Text>
                    <Text className={styles.subScoreValue} style={{ color: scoreColor(score) }}>
                      {score === null ? 'Not assessed' : `${Math.round(score)}%`}
                    </Text>
                  </div>
                ))}
              </div>
              <Badge shape="rounded" appearance="outline" color="informative">
                {model.isZipSource ? 'Uploaded ZIP'
                  : review.sourceEnvironment || model.stageAOutput?.source === 'live' ? 'Live' : 'Source not recorded'}
              </Badge>
              <Text>Reviewed: {formatDateTime(review.reviewedOn)}</Text>
              {review.agentVersion && <Text>Published version: {formatDateTime(review.agentVersion)}</Text>}
              {review.sourceEnvironment && !model.isZipSource && (
                <Text className={styles.snapshotValue}>Source environment: {review.sourceEnvironment}</Text>
              )}
              <Text className={styles.subScoreLabel}>AI-generated content may be incorrect.</Text>
            </div>
            <div className={styles.gridArea}>
              <div className={styles.tabsHeader}>
                <TabList className={styles.tabList} selectedValue={selectedTab} onTabSelect={handleTabSelect} aria-label="Standard agent review results">
                  <Tab
                    value="patterns"
                    id={`${dialogTabsetId}-tab-patterns`}
                    aria-controls={`${dialogTabsetId}-panel-patterns`}
                    aria-label={`Pattern analysis: ${model.patternAssessmentSummary}`}
                  >
                    Pattern analysis ({model.failedPatternCount} failed)
                  </Tab>
                  <Tab
                    value="compliance"
                    id={`${dialogTabsetId}-tab-compliance`}
                    aria-controls={`${dialogTabsetId}-panel-compliance`}
                    aria-label={`Agent instructions: ${model.instructionAssessmentSummary}`}
                  >
                    Agent instructions ({model.findingCounts.instructionIssueCount} findings)
                  </Tab>
                </TabList>
              </div>
              <div
                className={styles.tabPanel}
                role="tabpanel"
                id={activePanelId}
                aria-labelledby={activeTabId}
                tabIndex={0}
              >
              <div className={styles.gridContent}>
                <ReviewContextDisclosure
                  limit={STANDARD_REVIEW_LIMITS}
                  notes={isLoadingDetails ? [] : scores.notes}
                />
                {isLoadingDetails ? (
                  <Skeleton><div className={styles.skeletonRows}>
                    {Array.from({ length: selectedTab === 'compliance' ? 15 : review.patternTotalCount ?? 8 }).map((_, i) =>
                      <SkeletonItem key={i} className={styles.skeletonRow} />)}
                  </div></Skeleton>
                ) : selectedTab === 'patterns' ? (
                  <PatternsDataGrid patterns={patternRows} selectedId={selectedPattern?.id} onViewDetails={pattern => {
                    setSelectedPatternIndex(patternRows.findIndex(row => row.id === pattern.id));
                    setSelectedCriterionIndex(null);
                  }} />
                ) : (
                  <>
                    {review.complianceSummary && (
                      <div className={styles.instructionsSection}>
                        <Button appearance="subtle" className={styles.instructionsToggle}
                          icon={summaryExpanded ? <ChevronDown16Regular /> : <ChevronRight16Regular />}
                          onClick={() => setSummaryExpanded(value => !value)} aria-expanded={summaryExpanded} aria-controls={instructionsBodyId}>
                          Instruction analysis
                        </Button>
                        <div id={instructionsBodyId} className={styles.instructionsBody} hidden={!summaryExpanded}>
                          <Text>{review.complianceSummary}</Text>
                        </div>
                      </div>
                    )}
                    <ComplianceDataGrid criteria={complianceRows} selectedId={selectedCriterion?.id} onViewDetails={criterion => {
                      setSelectedCriterionIndex(complianceRows.findIndex(row => row.id === criterion.id));
                      setSelectedPatternIndex(null);
                    }} />
                  </>
                )}
              </div>
              </div>
            </div>
            <CSAgentDetailsDrawer open={agentDetailsOpen} stageAOutput={model.stageAOutput}
              onClose={() => setAgentDetailsOpen(false)} isZipSource={model.isZipSource} />
            <StandardFindingDrawer
              open={selectedPatternIndex !== null || selectedCriterionIndex !== null} className={styles.drawer}
              pattern={selectedPattern} patternIndex={selectedPatternIndex} patternTotal={patternRows.length}
              criterion={selectedCriterion} criterionIndex={selectedCriterionIndex} criterionTotal={complianceRows.length}
              agentInstructions={model.agentInstructions} onPrev={() => stepFinding(-1)} onNext={() => stepFinding(1)} onClose={closeDrawer}
            />
          </div>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
