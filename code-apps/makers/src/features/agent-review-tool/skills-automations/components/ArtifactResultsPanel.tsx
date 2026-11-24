/**
 * ArtifactResultsPanel
 *
 * Presents the review outcome in the same arrangement as the other two review
 * types: a score rail on the right, tabbed evidence on the left.
 *
 * Four presentation rules carry real weight here:
 *
 * 1. A dimension that could not be assessed shows "Not assessed", never 0. A
 *    zero would be read as a judgement nobody made.
 * 2. Verdicts stay separate per runtime. Averaging them would hide the case the
 *    multi-select exists to reveal — sound on one platform, unusable on another.
 * 3. Every score states the rubric and catalogue version it came from, and the
 *    wording never suggests Microsoft certified anything.
 * 4. The weight of each dimension is shown next to it. A weighted score with
 *    hidden weights is a number the reader cannot check, and this tool's weights
 *    are its own — the published rubric states none.
 *
 * The panel renders through {@link ReviewPageShell} in embedded mode because it
 * replaces the body of a dashboard tab rather than owning a route. See the
 * `embedded` docs for what that drops.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Caption1,
  Caption1Strong,
  Card,
  CardHeader,
  DataGrid,
  DataGridBody,
  DataGridCell,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridRow,
  Link,
  MessageBar,
  MessageBarActions,
  MessageBarBody,
  MessageBarTitle,
  Subtitle2,
  Text,
  Title3,
  Tooltip,
  createTableColumn,
  makeStyles,
  mergeClasses,
  tokens,
  useRestoreFocusTarget,
  type TableColumnDefinition,
  type TableColumnSizingOptions,
} from '@fluentui/react-components';
import {
  ArrowCounterclockwiseRegular,
  CheckmarkCircleFilled,
  ErrorCircleFilled,
  InfoFilled,
  SparkleRegular,
  WarningFilled,
} from '@fluentui/react-icons';
import type {
  ArtifactFinding,
  ArtifactReviewResult,
  RubricDimensionId,
  RubricDimensionScore,
  RuntimeVerdict,
} from '../contracts/ArtifactReview';
import {
  ARTIFACT_KIND_LABELS,
  RECOMMENDATION_LABELS,
  RUBRIC_DIMENSION_DESCRIPTIONS,
  RUBRIC_DIMENSION_IMPROVEMENTS,
  RUBRIC_DIMENSION_LABELS,
  RUBRIC_DIMENSION_WEIGHTS,
  RUNTIME_LABELS,
  RUNTIME_VERDICT_LABELS,
} from '../contracts/ArtifactReview';
import { effectiveWeights, hasScore, overallScoreOf } from '../services/artifactScore';
import { ReviewPageShell } from '../../shared/review-shell/ReviewPageShell';
import { AiDisclaimerBadge } from '../../shared/review-shell/ReviewSummaryRail';
import type { RailFact, ReviewRailModel, ReviewTabModel } from '../../shared/review-shell/reviewShellTypes';
import { ArtifactScoreHint } from './ArtifactScoreHint';
import { ArtifactFilesExplorer } from './ArtifactFilesExplorer';
import { ArtifactFindingDrawer } from './ArtifactFindingDrawer';
import { ArtifactFindingRail } from './ArtifactFindingRail';
import { ArtifactDimensionDrawer } from './ArtifactDimensionDrawer';
import { ArtifactDimensionRail } from './ArtifactDimensionRail';
import { RuntimeIcon } from './RuntimeIcon';
import { RuntimeVerdictIcon } from './RuntimeIconGroup';
import type { SkillFindingSeverity } from '../../agents-experience/contracts/Findings';

const SEVERITY_ORDER: Record<SkillFindingSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

const SEVERITY_APPEARANCE: Record<SkillFindingSeverity, 'danger' | 'warning' | 'informative' | 'subtle'> = {
  critical: 'danger',
  high: 'danger',
  medium: 'warning',
  low: 'informative',
  info: 'subtle',
};

const VERDICT_LABELS = RUNTIME_VERDICT_LABELS;
const FINDING_OVERLAY_QUERY = '(max-width: 840px)';

function useFindingOverlayLayout() {
  const [isNarrow, setIsNarrow] = useState(
    () =>
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia(FINDING_OVERLAY_QUERY).matches,
  );

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;

    const query = window.matchMedia(FINDING_OVERLAY_QUERY);
    const updateLayout = () => setIsNarrow(query.matches);

    updateLayout();
    query.addEventListener('change', updateLayout);
    return () => query.removeEventListener('change', updateLayout);
  }, []);

  return isNarrow;
}

const useStyles = makeStyles({
  muted: { color: tokens.colorNeutralForeground3 },
  // MessageBarTitle renders inline, so body copy placed straight after it reads as one
  // run-on sentence ("Recommendation: Submit Assessed against..."). A block wrapper puts
  // the body on its own line, matching HeroSection.
  bannerBody: {
    display: 'block',
    marginTop: tokens.spacingVerticalXXS,
  },
  panel: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalM}`,
  },
  cardGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: tokens.spacingHorizontalM,
  },
  dimensionCard: { padding: tokens.spacingVerticalM },
  dimensionHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalS,
    width: '100%',
  },
  dimensionTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
  },
  dimensionScore: {
    flexShrink: 0,
    marginLeft: 'auto',
  },
  improvement: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
    color: tokens.colorNeutralForeground2,
  },
  dimensionAction: { alignSelf: 'flex-start' },
  scoreValue: { color: tokens.colorBrandForeground1 },
  aiIcon: { color: tokens.colorBrandForeground1 },
  /** The rubric's own wording, kept visually distinct from this review's verdict. */
  measures: {
    color: tokens.colorNeutralForeground3,
    fontStyle: 'italic',
  },
  verdictRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
  },
  runtimeSummary: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
  },
  runtimeSummaryItem: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXXS,
  },
  tableValue: {
    fontSize: tokens.fontSizeBase300,
    lineHeight: tokens.lineHeightBase300,
  },
  findingTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    minWidth: 0,
    overflow: 'hidden',
  },
  cellText: {
    display: 'block',
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: tokens.spacingVerticalS,
    padding: tokens.spacingVerticalXXXL,
    color: tokens.colorNeutralForeground3,
  },
});

const FINDING_COLUMN_SIZING: TableColumnSizingOptions = {
  severity: { defaultWidth: 120, minWidth: 110 },
  title: { defaultWidth: 230, minWidth: 180 },
  where: { defaultWidth: 280, minWidth: 180 },
  runtimes: { defaultWidth: 170, minWidth: 150 },
};

function severityIcon(severity: SkillFindingSeverity) {
  switch (severity) {
    case 'critical':
      return <ErrorCircleFilled />;
    case 'high':
      return <WarningFilled />;
    case 'medium':
      return <WarningFilled />;
    case 'low':
      return <InfoFilled />;
    default:
      return <InfoFilled />;
  }
}

/** Exported for render-contract tests; rubric tabs are not server-rendered until selected. */
export function DimensionCard({
  dimension,
  aiAssisted,
  onViewDetails,
}: {
  dimension: RubricDimensionScore;
  aiAssisted: boolean;
  onViewDetails: (dimension: RubricDimensionScore) => void;
}) {
  const styles = useStyles();
  const detailFocusTarget = useRestoreFocusTarget();
  const assessed = dimension.score !== null;
  const scorePercent = assessed
    ? Math.round((Math.max(0, Math.min(5, dimension.score ?? 0)) / 5) * 100)
    : null;

  return (
    <Card className={styles.dimensionCard}>
      <CardHeader
        header={
          <span className={styles.dimensionHead}>
            <span className={styles.dimensionTitle}>
              <Subtitle2>{RUBRIC_DIMENSION_LABELS[dimension.id]}</Subtitle2>
              {aiAssisted && (
                <Tooltip content="AI-assisted" relationship="label">
                  <SparkleRegular className={styles.aiIcon} aria-label="AI-assisted" />
                </Tooltip>
              )}
            </span>
            <span
              className={styles.dimensionScore}
              role="img"
              aria-label={
                assessed
                  ? `${scorePercent} out of 100`
                  : `${RUBRIC_DIMENSION_LABELS[dimension.id]} was not assessed`
              }
            >
            {assessed ? (
              <Title3 className={styles.scoreValue}>{scorePercent}%</Title3>
            ) : (
              // Never 0 — that would read as a judgement nobody made.
              <Text weight="semibold" className={styles.muted}>
                Not assessed
              </Text>
            )}
            </span>
          </span>
        }
      />
      <Caption1 className={styles.measures}>{RUBRIC_DIMENSION_DESCRIPTIONS[dimension.id]}</Caption1>
      {scorePercent !== null && scorePercent < 100 && (
        <div className={styles.improvement}>
          <Caption1Strong>How to improve:</Caption1Strong>
          <Caption1>
            {dimension.improvement ?? RUBRIC_DIMENSION_IMPROVEMENTS[dimension.id]}
          </Caption1>
        </div>
      )}
      <Button
        className={styles.dimensionAction}
        appearance="subtle"
        size="small"
        aria-label={`Why ${RUBRIC_DIMENSION_LABELS[dimension.id]} received this score`}
        {...detailFocusTarget}
        onClick={() => onViewDetails(dimension)}
      >
        Why this score
      </Button>
    </Card>
  );
}

/** Exported for tests: the runtimes tab is not the default, so it never renders in a panel snapshot. */
export function VerdictCard({ verdict }: { verdict: RuntimeVerdict }) {
  const styles = useStyles();
  const isPackageContract = verdict.basis === 'package-contract';
  const isCleanPackageContract = isPackageContract && verdict.verdict === 'runs';
  const verdictLabel =
    isCleanPackageContract
      ? 'Package compatible'
      : VERDICT_LABELS[verdict.verdict];

  return (
    <Card className={styles.dimensionCard}>
      <CardHeader
        image={<RuntimeIcon runtime={verdict.runtime} size={24} />}
        header={<Subtitle2>{RUNTIME_LABELS[verdict.runtime]}</Subtitle2>}
        description={
          <span className={styles.verdictRow}>
            <Badge
              appearance="filled"
              color={
                verdict.verdict === 'runs'
                  ? 'success'
                  : verdict.verdict === 'will-not-run'
                    ? 'danger'
                    : verdict.verdict === 'runs-with-issues'
                      ? 'warning'
                      : verdict.verdict === 'not-applicable'
                        ? 'subtle'
                        : 'informative'
              }
              icon={<RuntimeVerdictIcon verdict={verdict.verdict} />}
            >
              {verdictLabel}
            </Badge>
            {verdict.score !== null && !isCleanPackageContract && (
              <Caption1 className={styles.muted}>{verdict.score} / 100</Caption1>
            )}
          </span>
        }
      />
      {/*
        "No issues found" must never print for a runtime that cannot install the
        format at all. Nothing was checked, so there was nothing to find, and
        that sentence would read as a pass. The stored reason says what the
        runtime does install instead, and where this format does run.
      */}
      <Caption1 className={styles.muted}>
        {verdict.verdict === 'not-applicable'
          ? (verdict.notApplicableReason ??
            `${RUNTIME_LABELS[verdict.runtime]} cannot install this file format.`)
          : verdict.verdict === 'not-evaluated'
            ? `${RUNTIME_LABELS[verdict.runtime]} publishes nothing this skill can be checked against.`
            : isCleanPackageContract
              ? 'The package format is valid. Tools configured on the target agent were not assessed.'
              : verdict.findingIds.length === 0
                ? 'No known compatibility issues found.'
              : `${verdict.findingIds.length} ${verdict.findingIds.length === 1 ? 'finding' : 'findings'} apply to this runtime.`}
      </Caption1>
      {verdict.stalenessNote && (
        <Caption1 className={styles.muted}>
          <WarningFilled /> {verdict.stalenessNote}
        </Caption1>
      )}
    </Card>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10240 ? 2 : 1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface ArtifactResultsPanelProps {
  result: ArtifactReviewResult;
  selectedFinding: ArtifactFinding | null;
  onSelectFinding: (finding: ArtifactFinding) => void;
  onDismissFinding: () => void;
  onReviewAnother: () => void;
  /**
   * Returns to the tab's landing page.
   *
   * Rendered as the breadcrumb root rather than a button, so the reader can see
   * where "back" leads before clicking it. Optional only so the panel can be
   * rendered in isolation; the tab always supplies it.
   */
  onBack?: () => void;
  /**
   * Renders without the full-page chrome, for the one case that is not a page:
   * a review that finished but could not be saved, and so has no id to address
   * and stays on the tab. The tab supplies its own header and margins.
   */
  embedded?: boolean;
}

export function ArtifactResultsPanel({
  result,
  selectedFinding,
  onSelectFinding,
  onDismissFinding,
  onReviewAnother,
  onBack,
  embedded = false,
}: ArtifactResultsPanelProps) {
  const styles = useStyles();
  const [tab, setTab] = useState('findings');
  const [selectedDimensionId, setSelectedDimensionId] = useState<RubricDimensionId | null>(null);
  const findingUsesOverlay = useFindingOverlayLayout();
  /*
    Marks whichever finding link was last focused, so that when the drawer
    closes Fluent returns focus there. `useRestoreFocusSource` in the drawer
    only restores to an element marked this way; without a target it drops
    focus to the document. That cost a keyboard user a full re-traverse,
    because the grid is a single tab stop under focusMode="composite"
    (WCAG 2.4.3). One hook serves every row: Fluent restores to the last
    focused marked element, which is the row that opened the drawer.
  */
  const findingFocusTarget = useRestoreFocusTarget();

  const findings = useMemo(
    () => [...result.findings].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]),
    [result.findings],
  );
  const selectedDimension =
    result.dimensions.find((dimension) => dimension.id === selectedDimensionId) ?? null;

  const blocking = useMemo(
    () =>
      findings.filter(
        (finding) => finding.severity === 'critical' || finding.severity === 'high',
      ).length,
    [findings],
  );

  const recommendationFinding = useMemo(
    () => {
      const critical = findings.find((finding) => finding.severity === 'critical');
      if (critical) return critical;

      return findings.find((finding) => finding.severity === 'high') ?? findings[0];
    },
    [findings],
  );

  const columns: TableColumnDefinition<ArtifactFinding>[] = useMemo(
    () => [
      createTableColumn<ArtifactFinding>({
        columnId: 'severity',
        renderHeaderCell: () => 'Severity',
        renderCell: (item) => (
          <Badge
            appearance={item.severity === 'critical' ? 'filled' : 'tint'}
            data-emphasis={item.severity === 'critical' ? 'strong' : 'standard'}
            color={
              SEVERITY_APPEARANCE[item.severity] === 'danger'
                ? 'danger'
                : SEVERITY_APPEARANCE[item.severity] === 'warning'
                  ? 'warning'
                  : 'informative'
            }
            icon={severityIcon(item.severity)}
            size="large"
            className={styles.tableValue}
          >
            {item.severity}
          </Badge>
        ),
      }),
      createTableColumn<ArtifactFinding>({
        columnId: 'title',
        renderHeaderCell: () => 'Finding',
        renderCell: (item) => (
          <span className={styles.findingTitle}>
            <Link
              as="button"
              className={styles.tableValue}
              {...findingFocusTarget}
              onClick={() => onSelectFinding(item)}
            >
              {item.title}
            </Link>
          </span>
        ),
      }),
      createTableColumn<ArtifactFinding>({
        columnId: 'where',
        renderHeaderCell: () => 'Where',
        renderCell: (item) => (
          <Text
            size={300}
            className={mergeClasses(styles.muted, styles.cellText)}
            title={`${item.resourcePath ?? '—'}${item.line ? `:${item.line}` : ''}`}
          >
            {item.resourcePath ?? '—'}
            {item.line ? `:${item.line}` : ''}
          </Text>
        ),
      }),
      createTableColumn<ArtifactFinding>({
        columnId: 'runtimes',
        renderHeaderCell: () => 'Applies to',
        renderCell: (item) => (
          <Text size={300} className={mergeClasses(styles.muted, styles.cellText)}>
            {item.runtimes.length === 0
              ? 'All selected runtimes'
              : item.runtimes.map((r) => RUNTIME_LABELS[r]).join(', ')}
          </Text>
        ),
      }),
    ],
    [findingFocusTarget, onSelectFinding, styles.cellText, styles.findingTitle, styles.muted, styles.tableValue],
  );

  const weights = useMemo(() => effectiveWeights(result), [result]);

  const rail: ReviewRailModel = useMemo(() => {
    const facts: RailFact[] = [
      {
        key: 'kind',
        label: 'Artifact',
        value: result.artifactKind ? ARTIFACT_KIND_LABELS[result.artifactKind] : 'Unidentified',
      },
      {
        key: 'files',
        label: 'Files read',
        value: result.files ? `${result.files.length}` : '—',
      },
      {
        key: 'size',
        label: 'Bundle size',
        value: result.uncompressedBytes !== undefined ? formatBytes(result.uncompressedBytes) : '—',
      },
      {
        key: 'findings',
        label: 'Findings',
        value: `${findings.length}`,
      },
      { key: 'blocking', label: 'Blocking', value: `${blocking}` },
      {
        key: 'products',
        label: 'Guidance applied',
        value: (
          <span className={styles.runtimeSummary}>
            {result.selectedRuntimes.map((runtime) => (
              <Tooltip key={runtime} content={RUNTIME_LABELS[runtime]} relationship="label">
                <span
                  className={styles.runtimeSummaryItem}
                  role="img"
                  aria-label={RUNTIME_LABELS[runtime]}
                >
                  <RuntimeIcon runtime={runtime} size={16} />
                </span>
              </Tooltip>
            ))}
          </span>
        ),
      },
      {
        key: 'rubric',
        label: 'Rubric',
        value: 'Microsoft skill-authoring, 5 dimensions',
        quiet: true,
      },
      {
        key: 'reviewed',
        label: 'Reviewed',
        value: new Date(result.reviewedAt).toLocaleDateString(),
        quiet: true,
      },
    ];

    return {
      scoreLabel: 'Overall score',
      score: hasScore(result) ? overallScoreOf(result) : null,
      scoreHint: <ArtifactScoreHint result={result} />,
      subScores: result.dimensions.filter((dimension) => dimension.id !== 'portability').map((dimension) => ({
        label: RUBRIC_DIMENSION_LABELS[dimension.id],
        // An unassessed dimension carries no percentage at all, so it draws no
        // bar and reads `--`. A zero here would claim the dimension was
        // assessed and scored nothing.
        percent: dimension.score === null ? null : (dimension.score / 5) * 100,
        weight:
          dimension.score === null
            ? 'not assessed'
            : `${Math.round(weights.get(dimension.id) ?? RUBRIC_DIMENSION_WEIGHTS[dimension.id])}%`,
      })),
      badges: <AiDisclaimerBadge />,
      facts,
    };
  }, [
    result,
    findings.length,
    blocking,
    weights,
    styles.runtimeSummary,
    styles.runtimeSummaryItem,
  ]);

  const tabs: ReviewTabModel[] = useMemo(
    () => [
      {
        id: 'findings',
        label: 'Findings',
        badge:
          findings.length > 0
            ? {
                text: `${findings.length}`,
                ariaLabel: `${findings.length} findings`,
                tooltip: `${findings.length} ${findings.length === 1 ? 'finding' : 'findings'}, ${blocking} blocking`,
              }
            : undefined,
        render: () => (
          <div className={styles.panel}>
            {findings.length === 0 ? (
              <div className={styles.empty}>
                <CheckmarkCircleFilled fontSize={32} />
                <Text weight="semibold">No issues found</Text>
                <Caption1>No artifact findings were detected.</Caption1>
              </div>
            ) : (
              <DataGrid
                items={findings}
                columns={columns}
                getRowId={(item) => item.id}
                focusMode="composite"
                resizableColumns
                columnSizingOptions={FINDING_COLUMN_SIZING}
              >
                <DataGridHeader>
                  <DataGridRow>
                    {({ renderHeaderCell }) => <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>}
                  </DataGridRow>
                </DataGridHeader>
                <DataGridBody<ArtifactFinding>>
                  {({ item, rowId }) => (
                    <DataGridRow<ArtifactFinding> key={rowId}>
                      {({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
                    </DataGridRow>
                  )}
                </DataGridBody>
              </DataGrid>
            )}
          </div>
        ),
      },
      {
        id: 'dimensions',
        label: 'Rubric dimensions',
        render: () => (
          <div className={styles.panel}>
            <Caption1 className={styles.muted}>
              Scores use one 0–100 scale. The sparkle marks writing dimensions assisted by AI; deterministic
              package checks support the remaining scores.
            </Caption1>
            <div className={styles.cardGrid}>
              {result.dimensions.filter((dimension) => dimension.id !== 'portability').map((dimension) => (
                <DimensionCard
                  key={dimension.id}
                  dimension={dimension}
                  onViewDetails={(selected) => setSelectedDimensionId(selected.id)}
                  aiAssisted={
                    result.aiAssessment?.dimensions.some((assessment) => {
                      if (dimension.id === 'trigger-clarity') return assessment.key === 'Clarity';
                      if (dimension.id === 'task-focus') return assessment.key === 'Scope discipline';
                      if (dimension.id === 'instruction-quality') return assessment.key === 'Actionability';
                      return false;
                    }) ?? false
                  }
                />
              ))}
            </div>
          </div>
        ),
      },
      {
        id: 'files',
        label: 'Files',
        badge: result.files
          ? {
              text: `${result.files.length}`,
              ariaLabel: `${result.files.length} files read`,
              tooltip: `${result.files.length} ${result.files.length === 1 ? 'file' : 'files'} read from this bundle`,
            }
          : undefined,
        render: () => (
          <div className={styles.panel}>
            <ArtifactFilesExplorer
              files={result.files}
              findings={findings}
              onSelectFinding={onSelectFinding}
            />
          </div>
        ),
      },
    ],
    [
      findings,
      blocking,
      columns,
      result,
      onSelectFinding,
      styles.panel,
      styles.empty,
      styles.cardGrid,
      styles.muted,
    ],
  );

  return (
    <ReviewPageShell
        embedded={embedded}
        agentName={result.artifactName}
        pageTitle="Skills and Automations Review"
        subtitle={`${result.artifactKind ? ARTIFACT_KIND_LABELS[result.artifactKind] : 'Unidentified artifact'} · reviewed ${new Date(result.reviewedAt).toLocaleString()}`}
        breadcrumbRoot={onBack ? { label: 'Agent Review Tool', onClick: onBack } : undefined}
        headerActions={
          <Button appearance="primary" icon={<ArrowCounterclockwiseRegular />} onClick={onReviewAnother}>
            Review another
          </Button>
        }
        banners={
          <>
            {result.status === 'partial' && (
              <MessageBar intent="warning">
                <MessageBarBody>
                  <MessageBarTitle>This is a partial review</MessageBarTitle>
                  <div className={styles.bannerBody}>
                    {result.error ?? 'The AI stage did not run.'} Dimensions that need it are shown as
                    not assessed rather than scored, and their weight is shared across the rest.
                  </div>
                </MessageBarBody>
              </MessageBar>
            )}

            {result.status === 'failed' && (
              <MessageBar intent="error">
                <MessageBarBody>
                  <MessageBarTitle>The review could not run</MessageBarTitle>
                  <div className={styles.bannerBody}>{result.error}</div>
                </MessageBarBody>
              </MessageBar>
            )}

            {result.status !== 'failed' && (
              <MessageBar
                intent={
                  result.recommendation === 'submit'
                    ? 'success'
                    : result.recommendation === 'revise'
                      ? 'warning'
                      : 'error'
                }
              >
                <MessageBarBody>
                  <MessageBarTitle>Recommendation: {RECOMMENDATION_LABELS[result.recommendation]}</MessageBarTitle>
                </MessageBarBody>
                {recommendationFinding && (
                  <MessageBarActions>
                    <Button
                      appearance="transparent"
                      aria-label={`${findings.length > 1 ? 'Open first finding' : 'Open finding'}: ${recommendationFinding.title}`}
                      {...findingFocusTarget}
                      onClick={() => onSelectFinding(recommendationFinding)}
                    >
                      {findings.length > 1 ? 'Open first finding' : 'Open finding'}
                    </Button>
                  </MessageBarActions>
                )}
              </MessageBar>
            )}
          </>
        }
        tabs={tabs}
        selectedTabId={tab}
        onTabSelect={(nextTab) => {
          setSelectedDimensionId(null);
          setTab(nextTab);
        }}
        tabsAriaLabel="Review results"
        rail={rail}
        drawer={
          selectedFinding && !findingUsesOverlay ? (
            <ArtifactFindingRail
              finding={selectedFinding}
              findings={findings}
              onSelectFinding={onSelectFinding}
              onDismiss={onDismissFinding}
            />
          ) : selectedDimension && !findingUsesOverlay ? (
            <ArtifactDimensionRail
              dimension={selectedDimension}
              onDismiss={() => setSelectedDimensionId(null)}
            />
          ) : undefined
        }
        drawerOpen={Boolean(selectedFinding || selectedDimension) && !findingUsesOverlay}
        drawerReplacesRail
        drawerMatchesRailWidth
        overlay={
          selectedFinding && findingUsesOverlay ? (
            <ArtifactFindingDrawer finding={selectedFinding} onDismiss={onDismissFinding} />
          ) : selectedDimension && findingUsesOverlay ? (
            <ArtifactDimensionDrawer
              dimension={selectedDimension}
              onDismiss={() => setSelectedDimensionId(null)}
            />
          ) : undefined
        }
      />
  );
}
