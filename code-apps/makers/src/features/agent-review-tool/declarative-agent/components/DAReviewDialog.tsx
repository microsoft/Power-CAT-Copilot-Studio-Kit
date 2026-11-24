/**
 * DAReviewDialog Component
 *
 * Fullscreen dialog for DA review results — layout matches ReviewDialogV2 (CS dialog):
 *   - Header: agent icon + name + fullscreen close
 *   - Left panel: RadialGauge + per-criterion score cards + severity badge summary
 *   - Right area: tab per criterion → DAEvaluationSection accordion inline
 *   - AI Summary shown in "All" tab below accordions
 *   - Footer: Download Report + Close
 */

import { useState } from 'react';
import {
  Dialog,
  DialogSurface,
  Button,
  Text,
  Accordion,
  Badge,
  CounterBadge,
  Tab,
  TabList,
  Image,
  Divider,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components';
import {
  DismissRegular,
  Agents24Color,
  ArrowDownloadRegular,
  CodeBlockEditRegular,
} from '@fluentui/react-icons';
import { RadialGauge } from '../../components/core/RadialGauge';
import { DAEvaluationSection } from './DAEvaluationSection';
import type { DAReviewRecord } from '../contracts/DAReviewRecord';
import { DA_SCORE_THRESHOLDS } from '../contracts/constants';
import { criterionScore } from '../utils/scoreCalculator';
import {
  buildDAReviewShellModel,
  type DATabId,
} from '../adapters/daReviewShellModel';

// ─── Styles ───────────────────────────────────────────────────────────────────

const useStyles = makeStyles({
  surface: {
    width: '100vw',
    height: '100vh',
    maxWidth: '100vw',
    minHeight: '100vh',
    borderRadius: '0',
    margin: '0',
    padding: '0',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  inner: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    overflow: 'hidden',
  },

  // ── Header ──────────────────────────────────────────────────────────────────
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 20px',
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    flexShrink: 0,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  headerTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: tokens.colorNeutralForeground1,
  },
  headerMeta: {
    fontSize: '12px',
    color: tokens.colorNeutralForeground3,
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  iconImg: {
    width: '32px',
    height: '32px',
    borderRadius: '4px',
    objectFit: 'contain',
    flexShrink: 0,
  },
  fallbackIcon: {
    fontSize: '32px',
    flexShrink: 0,
  },

  // ── Main content ────────────────────────────────────────────────────────────
  content: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
    position: 'relative',
  },

  // ── Score panel (left) ───────────────────────────────────────────────────────
  scorePanel: {
    width: '200px',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '24px 16px',
    borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
    gap: '16px',
    backgroundColor: tokens.colorNeutralBackground2,
    overflowY: 'auto',
  },
  scorePanelTitle: {
    fontSize: '12px',
    fontWeight: '600',
    color: tokens.colorNeutralForeground3,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    textAlign: 'center',
  },
  subScores: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    width: '100%',
  },
  subScoreCard: {
    padding: '8px 10px',
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: '6px',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  subScoreLabel: {
    fontSize: '11px',
    color: tokens.colorNeutralForeground3,
    fontWeight: '500',
  },
  subScoreValue: {
    fontSize: '18px',
    fontWeight: '700',
  },
  issueSummary: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    width: '100%',
    paddingTop: '8px',
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  issueBadgeRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  issueBadgeLabel: {
    fontSize: '11px',
    color: tokens.colorNeutralForeground2,
  },
  aiDisclaimer: {
    height: 'auto',
    padding: '4px 8px',
    textAlign: 'center',
    lineHeight: '1.4',
    fontSize: '11px',
    whiteSpace: 'normal',
    maxWidth: '100%',
  },
  scorePass: { color: '#107c10' },
  scoreWarning: { color: '#b7580a' },
  scoreFail: { color: '#c50f1f' },

  // ── Right content area ───────────────────────────────────────────────────────
  rightArea: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    minWidth: 0,
  },
  tabsHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 20px 0',
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    flexShrink: 0,
  },
  tabContent: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
  },
  body: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },

  // ── AI Summary ───────────────────────────────────────────────────────────────
  summarySection: {
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    paddingTop: tokens.spacingVerticalM,
  },
  summaryTitle: {
    marginBottom: tokens.spacingVerticalXS,
  },
  summaryText: {
    color: tokens.colorNeutralForeground2,
  },

  // ── Agent Details drawer ─────────────────────────────────────────────────────
  detailsDrawer: {
    position: 'absolute' as const,
    top: 0,
    right: 0,
    height: '100%',
    width: '400px',
    backgroundColor: tokens.colorNeutralBackground1,
    borderLeft: `1px solid ${tokens.colorNeutralStroke2}`,
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '-4px 0 16px rgba(0,0,0,0.12)',
    zIndex: 10,
    transform: 'translateX(100%)',
    transition: 'transform 0.22s ease',
  },
  detailsDrawerOpen: {
    transform: 'translateX(0)',
  },
  drawerHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 16px',
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    flexShrink: 0,
  },
  drawerTitle: {
    fontSize: '14px',
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground1,
  },
  drawerBody: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
  },
  detailSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  detailLabel: {
    fontSize: '11px',
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground3,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.4px',
  },
  detailValue: {
    fontSize: '13px',
    color: tokens.colorNeutralForeground1,
    whiteSpace: 'pre-wrap' as const,
    lineHeight: '1.5',
  },
  detailValueMono: {
    fontSize: '12px',
    color: tokens.colorNeutralForeground1,
    fontFamily: 'Consolas, "Courier New", monospace',
    backgroundColor: tokens.colorNeutralBackground3,
    padding: '10px 12px',
    borderRadius: '4px',
    whiteSpace: 'pre-wrap' as const,
    lineHeight: '1.5',
    wordBreak: 'break-word' as const,
  },
  detailEmpty: {
    fontSize: '13px',
    color: tokens.colorNeutralForeground4,
    fontStyle: 'italic' as const,
  },
  startersList: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  starterItem: {
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: '4px',
    padding: '8px 10px',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  starterTitle: {
    fontSize: '11px',
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground3,
  },
  starterText: {
    fontSize: '13px',
    color: tokens.colorNeutralForeground1,
  },
  capabilitiesWrap: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: tokens.spacingHorizontalXS,
  },
  capabilityChip: {
    display: 'inline-flex',
    alignItems: 'center',
    backgroundColor: tokens.colorBrandBackground2,
    color: tokens.colorBrandForeground2,
    border: `1px solid ${tokens.colorBrandStroke1}`,
    borderRadius: '12px',
    padding: '3px 10px',
    fontSize: '12px',
    fontWeight: tokens.fontWeightSemibold,
  },
  actionsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  actionItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    padding: '6px 10px',
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: '4px',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  actionItemId: {
    fontSize: '13px',
    color: tokens.colorNeutralForeground1,
    fontFamily: 'Consolas, "Courier New", monospace',
  },
  actionItemFile: {
    fontSize: '11px',
    color: tokens.colorNeutralForeground3,
    fontFamily: 'Consolas, "Courier New", monospace',
  },
  metadataGrid: {
    display: 'grid',
    gridTemplateColumns: '120px 1fr',
    gap: '4px 12px',
  },
  metadataLabel: {
    fontSize: '13px',
    color: tokens.colorNeutralForeground3,
  },
  metadataValue: {
    fontSize: '13px',
    color: tokens.colorNeutralForeground1,
    wordBreak: 'break-all' as const,
  },

});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getScoreClass(score: number | null, s: ReturnType<typeof useStyles>): string {
  if (score === null) return '';
  if (score >= DA_SCORE_THRESHOLDS.PASS) return s.scorePass;
  if (score >= DA_SCORE_THRESHOLDS.WARNING) return s.scoreWarning;
  return s.scoreFail;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DAReviewDialogProps {
  open: boolean;
  review: DAReviewRecord | null;
  onDismiss: () => void;
  onDownloadReport?: () => void;
}

type TabValue = DATabId;

// ─── Main component ───────────────────────────────────────────────────────────

export function DAReviewDialog({
  open,
  review,
  onDismiss,
  onDownloadReport,
}: DAReviewDialogProps) {
  const styles = useStyles();
  const [selectedTab, setSelectedTab] = useState<TabValue>('all');
  const [detailsOpen, setDetailsOpen] = useState(false);

  if (!review) return null;

  const evaluation = review.evaluation;
  const shellModel = buildDAReviewShellModel(review);
  const score = shellModel.score;

  const sourceLabel = review.sourceType === 'zip' ? 'ZIP upload' : 'Catalog';
  const reviewedLabel = review.reviewedOn
    ? `Reviewed ${review.reviewedOn.toLocaleDateString()} · ${sourceLabel}`
    : sourceLabel;

  const criterionSections = shellModel.sections.map((section) => ({
    ...section,
    value: section.tab,
  }));

  // Issue counts per tab
  const issueCounts: Partial<Record<TabValue, number>> = {};
  let totalIssues = 0;
  let highCount = 0;
  let mediumCount = 0;
  let lowCount = 0;
  for (const s of criterionSections) {
    const issues = s.result?.issues ?? [];
    issueCounts[s.tab] = issues.length;
    totalIssues += issues.length;
    for (const issue of issues) {
      if (issue.severity === 'High') highCount++;
      else if (issue.severity === 'Medium') mediumCount++;
      else lowCount++;
    }
  }

  const visibleSections = selectedTab === 'all'
    ? criterionSections
    : criterionSections.filter((s) => s.tab === selectedTab);

  const defaultOpenItems = selectedTab === 'all'
    ? criterionSections.map((s) => s.value)
    : [selectedTab];

  const dialogTitleId = `da-review-title-${review.componentIdUnique}`;

  return (
    <>
      <style>{`
        @keyframes daReviewBorderShimmer {
          0%   { border-color: #e0e0e0; }
          25%  { border-color: #077FAB; }
          50%  { border-color: #B25ABF; }
          75%  { border-color: #F59F57; }
          100% { border-color: #e0e0e0; }
        }
        .da-shimmer-border {
          border: 3px solid #e0e0e0;
          animation: daReviewBorderShimmer 3s ease-in-out infinite;
        }
      `}</style>
      <Dialog open={open} onOpenChange={(_, d) => { if (!d.open) onDismiss(); }}>
        <DialogSurface
          className={mergeClasses('da-shimmer-border', styles.surface)}
          aria-labelledby={dialogTitleId}
        >
          <div className={styles.inner}>

            {/* ── Header ──────────────────────────────────────────────────── */}
            <div className={styles.header}>
              <div className={styles.headerLeft}>
                {review.iconBase64 ? (
                  <Image src={review.iconBase64} alt={review.agentName} className={styles.iconImg} />
                ) : (
                  <Agents24Color className={styles.fallbackIcon} aria-hidden="true" />
                )}
                <div>
                  <Text id={dialogTitleId} className={styles.headerTitle} block>
                    {review.agentName}
                  </Text>
                  <Text className={styles.headerMeta}>
                    {reviewedLabel}
                  </Text>
                </div>
              </div>
              <div className={styles.headerActions}>
                {review.manifest && (
                  <Button
                    appearance="subtle"
                    size="small"
                    icon={<CodeBlockEditRegular />}
                    onClick={() => setDetailsOpen((o) => !o)}
                    aria-expanded={detailsOpen}
                    aria-label="Agent Details"
                  >
                    Agent Details
                  </Button>
                )}
                {onDownloadReport && (
                  <Button
                    appearance="secondary"
                    size="small"
                    icon={<ArrowDownloadRegular />}
                    onClick={onDownloadReport}
                  >
                    Download Report
                  </Button>
                )}
                <Button
                  appearance="subtle"
                  icon={<DismissRegular />}
                  onClick={onDismiss}
                  aria-label="Close"
                />
              </div>
            </div>

            {/* ── Main content ─────────────────────────────────────────────── */}
            <div className={styles.content}>

              {/* ── Score panel (left) ──────────────────────────────────── */}
              <div className={styles.scorePanel}>
                <div className={styles.scorePanelTitle}>Quality Score</div>
                {score === null ? (
                  <Text size={500} weight="semibold">Not assessed</Text>
                ) : (
                  <RadialGauge score={score} size={140} />
                )}

                {/* Per-criterion score cards */}
                <div className={styles.subScores}>
                  {shellModel.packageValidity && (
                    <div className={styles.subScoreCard}>
                      <div className={styles.subScoreLabel}>Package Validity</div>
                      <div className={styles.subScoreValue}>
                        {shellModel.packageValidity === 'valid-with-warnings'
                          ? 'Warnings'
                          : shellModel.packageValidity.charAt(0).toUpperCase()
                            + shellModel.packageValidity.slice(1)}
                      </div>
                    </div>
                  )}
                  {criterionSections.map((s) => (
                    s.tab !== 'package' && s.result && (() => {
                      const subScore = criterionScore(s.result);
                      return (
                      <div key={s.tab} className={styles.subScoreCard}>
                        <div className={styles.subScoreLabel}>{s.criterionName}</div>
                        <div className={mergeClasses(styles.subScoreValue, getScoreClass(subScore, styles))}>
                          {subScore === null ? '—' : `${subScore}%`}
                        </div>
                      </div>
                      );
                    })()
                  ))}
                </div>

                {/* Severity summary */}
                {totalIssues > 0 && (
                  <div className={styles.issueSummary}>
                    {highCount > 0 && (
                      <div className={styles.issueBadgeRow}>
                        <span className={styles.issueBadgeLabel}>High</span>
                        <Badge appearance="filled" color="danger" size="small">{highCount}</Badge>
                      </div>
                    )}
                    {mediumCount > 0 && (
                      <div className={styles.issueBadgeRow}>
                        <span className={styles.issueBadgeLabel}>Medium</span>
                        <Badge appearance="filled" color="warning" size="small">{mediumCount}</Badge>
                      </div>
                    )}
                    {lowCount > 0 && (
                      <div className={styles.issueBadgeRow}>
                        <span className={styles.issueBadgeLabel}>Low</span>
                        <Badge appearance="filled" color="informative" size="small">{lowCount}</Badge>
                      </div>
                    )}
                  </div>
                )}

                <Badge appearance="tint" color="informative" size="small" className={styles.aiDisclaimer}>
                  Automated review — verify findings
                </Badge>
              </div>

              {/* ── Right: tabs + accordions ────────────────────────────── */}
              <div className={styles.rightArea}>

                {/* Tab bar */}
                <div className={styles.tabsHeader}>
                  <TabList
                    selectedValue={selectedTab}
                    onTabSelect={(_, d) => setSelectedTab(d.value as TabValue)}
                  >
                    <Tab value="all">
                      <div className={styles.tabContent}>
                        All
                        {totalIssues > 0 && (
                          <CounterBadge count={totalIssues} color="danger" size="small" />
                        )}
                      </div>
                    </Tab>
                    {criterionSections.map((s) => (
                      <Tab key={s.tab} value={s.tab}>
                        <div className={styles.tabContent}>
                          {s.criterionName}
                          {(issueCounts[s.tab] ?? 0) > 0 && (
                            <CounterBadge count={issueCounts[s.tab]!} color="danger" size="small" />
                          )}
                        </div>
                      </Tab>
                    ))}
                  </TabList>
                </div>

                {/* Scrollable criterion content */}
                <div className={styles.body}>
                  <Accordion
                    key={selectedTab}
                    multiple={selectedTab === 'all'}
                    collapsible
                    defaultOpenItems={defaultOpenItems}
                  >
                    {visibleSections.map((s) => (
                      <DAEvaluationSection
                        key={s.value}
                        value={s.value}
                        criterionName={s.criterionName}
                        criterionKey={s.criterionKey}
                        result={s.result}
                      />
                    ))}
                  </Accordion>

                  {/* AI Summary — All tab only */}
                  {selectedTab === 'all' && evaluation?.summary && (
                    <div className={styles.summarySection}>
                      <Text weight="semibold" block className={styles.summaryTitle}>
                        AI Summary
                      </Text>
                      <Text size={200} className={styles.summaryText}>
                        {evaluation.summary}
                      </Text>
                    </div>
                  )}
                </div>

              </div>

              {/* ── Agent Details sliding drawer ──────────────────────────── */}
              {review.manifest && (
                <div className={mergeClasses(styles.detailsDrawer, detailsOpen && styles.detailsDrawerOpen)}>
                  <div className={styles.drawerHeader}>
                    <Text className={styles.drawerTitle}>Agent Details</Text>
                    <Button
                      appearance="subtle"
                      size="small"
                      icon={<DismissRegular />}
                      onClick={() => setDetailsOpen(false)}
                      aria-label="Close Agent Details"
                    />
                  </div>
                  <div className={styles.drawerBody}>

                    {/* Instructions */}
                    <div className={styles.detailSection}>
                      <Text className={styles.detailLabel} block>Instructions</Text>
                      {review.manifest.instructions ? (
                        <Text className={styles.detailValueMono} block>
                          {review.manifest.instructions}
                        </Text>
                      ) : (
                        <Text className={styles.detailEmpty}>No instructions defined</Text>
                      )}
                    </div>

                    <Divider />

                    {/* Description */}
                    <div className={styles.detailSection}>
                      <Text className={styles.detailLabel} block>Short Description</Text>
                      {review.manifest.shortDescription ? (
                        <Text className={styles.detailValue} block>{review.manifest.shortDescription}</Text>
                      ) : (
                        <Text className={styles.detailEmpty}>Not provided</Text>
                      )}
                    </div>

                    {review.manifest.fullDescription && (
                      <div className={styles.detailSection}>
                        <Text className={styles.detailLabel} block>Full Description</Text>
                        <Text className={styles.detailValue} block>{review.manifest.fullDescription}</Text>
                      </div>
                    )}

                    <Divider />

                    {/* Conversation Starters */}
                    <div className={styles.detailSection}>
                      <Text className={styles.detailLabel} block>
                        Conversation Starters ({review.manifest.conversationStarters?.length ?? 0})
                      </Text>
                      {(review.manifest.conversationStarters?.length ?? 0) > 0 ? (
                        <div className={styles.startersList}>
                          {review.manifest.conversationStarters.map((s, i) => (
                            <div key={i} className={styles.starterItem}>
                              {s.title && (
                                <Text className={styles.starterTitle} block>{s.title}</Text>
                              )}
                              <Text className={styles.starterText}>{s.text}</Text>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <Text className={styles.detailEmpty}>No conversation starters defined</Text>
                      )}
                    </div>

                    <Divider />

                    {/* Capabilities */}
                    <div className={styles.detailSection}>
                      <Text className={styles.detailLabel} block>
                        Capabilities ({review.manifest.capabilities?.length ?? 0})
                      </Text>
                      {(review.manifest.capabilities?.length ?? 0) > 0 ? (
                        <div className={styles.capabilitiesWrap}>
                          {review.manifest.capabilities.map((c, i) => (
                            <span key={i} className={styles.capabilityChip}>{c.name}</span>
                          ))}
                        </div>
                      ) : (
                        <Text className={styles.detailEmpty}>No capabilities configured</Text>
                      )}
                    </div>

                    <Divider />

                    {/* Actions */}
                    <div className={styles.detailSection}>
                      <Text className={styles.detailLabel} block>
                        Actions / Plugins ({review.manifest.actions?.length ?? 0})
                      </Text>
                      {(review.manifest.actions?.length ?? 0) > 0 ? (
                        <div className={styles.actionsList}>
                          {review.manifest.actions.map((a, i) => (
                            <div key={i} className={styles.actionItem}>
                              <Text className={styles.actionItemId}>{a.id}</Text>
                              <Text className={styles.actionItemFile}>{a.file}</Text>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <Text className={styles.detailEmpty}>No actions configured</Text>
                      )}
                    </div>

                    <Divider />

                    {/* App metadata */}
                    <div className={styles.detailSection}>
                      <Text className={styles.detailLabel} block>App Metadata</Text>
                      <div className={styles.metadataGrid}>
                        {[
                          { label: 'App ID', value: review.manifest.appId },
                          { label: 'Version', value: review.manifest.appVersion },
                          { label: 'Schema Version', value: review.manifest.schemaVersion },
                          { label: 'Developer', value: review.manifest.developerName },
                        ].map(({ label, value }) => value ? (
                          <>
                            <Text key={`l-${label}`} className={styles.metadataLabel}>{label}</Text>
                            <Text key={`v-${label}`} className={styles.metadataValue}>{value}</Text>
                          </>
                        ) : null)}
                      </div>
                    </div>

                  </div>
                </div>
              )}

            </div>


          </div>
        </DialogSurface>
      </Dialog>
    </>
  );
}
