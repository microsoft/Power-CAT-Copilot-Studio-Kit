/**
 * Presentational building blocks shared by the Architecture Review app and the Agent Review Tool.
 *
 * The rule that makes this folder importable from two apps: **props in, events out**. Nothing here
 * may fetch, cache, navigate, or reach a Dataverse client. A component that imported
 * `src/generated/**` or a React Query hook would drag one app's data layer into the other's bundle,
 * and would make the Architecture Review app's worker build fail its boundary guard.
 *
 * Nothing in `agent-review-tool` outside this folder imports it yet. That is deliberate — the Agent
 * Review Tool's existing screens keep their current UI until their own migration, so adding these
 * files changes no shipped pixel.
 */

export { MetricCard, MetricCardGroup } from './MetricCard';
export type { MetricCardProps, MetricTrend } from './MetricCard';

export {
  ExpandableRow,
  ExpandableRowList,
  FindingStatusBadge,
  RowCode,
  RowSection,
  labelForTone,
  severityForTone,
} from './ExpandableRow';
export type { ExpandableRowProps, ResultTone, RuleSeverity } from './ExpandableRow';

export {
  formatCount,
  formatDuration,
  formatPercent,
  pluralize,
  toneForScore,
} from './format';
export type { ScoreTone } from './format';

export { RuntimeMetrics, timingCard } from './RuntimeMetrics';
export type { RuntimeMetricsProps, RuntimeMetricsSummary, TimingCard } from './RuntimeMetrics';

export { RuntimeAnalysisToolbar, RUNTIME_LENSES } from './RuntimeAnalysisToolbar';
export type { RuntimeAnalysisToolbarProps, RuntimeLens } from './RuntimeAnalysisToolbar';

export { RuntimeErrorList } from './RuntimeErrorList';
export type {
  RuntimeErrorExample,
  RuntimeErrorGroup,
  RuntimeErrorListProps,
} from './RuntimeErrorList';

export { ScoreSummary, TargetChips } from './ScoreSummary';
export type { ReviewTarget, ScoreSummaryProps, TargetChipsProps } from './ScoreSummary';

export { ScoreCard, ScoreCardGroup, ScoreCardList, SCORE_BAND_COLORS } from './ScoreCard';
export type { ScoreCardProps } from './ScoreCard';

export { byImpact, scoreCardModel } from './score';
export type { ScoreCardModel, ScoreContributor } from './score';

export {
  TOP_FINDINGS,
  collapseToTop,
  collapseToggleLabel,
  findingCountLabel,
  matchesQuery,
  severityAppearance,
} from './findings';
export type { CollapsedGroup, SeverityAppearance } from './findings';

export { RULE_DISPLAY_LABELS, ruleDisplayLabel } from './ruleDisplayLabels';

export {
  STATUS_LABEL,
  aiStageRow,
  allRows,
  buildConsolidatedView,
  familyOptions,
  filterRows,
  gradedRows,
  rowStatus,
  searchFields,
  statusOptions,
} from './consolidatedFindings';
export type {
  ConsolidatedRow,
  ConsolidatedTotals,
  ConsolidatedView,
  FindingBucket,
  FindingInput,
  FindingStatus,
  FindingsFilter,
  RuleMeta,
  RuleMetaLookup,
  RuleOutcomeInput,
  StageStatusInput,
} from './consolidatedFindings';

export { ReviewSummaryBar } from './ReviewSummaryBar';
export type { ReviewSummaryBarProps, ReviewSummaryMetadata } from './ReviewSummaryBar';

export { FindingsToolbar } from './FindingsToolbar';
export type { FindingsToolbarProps } from './FindingsToolbar';

export { CollapsibleSection, SectionNote } from './CollapsibleSection';
export type { CollapsibleSectionProps } from './CollapsibleSection';
export { FindingsTable } from './FindingsTable';
export type { FindingsTableProps, FindingsTableRow } from './FindingsTable';

export { FindingListRow } from './FindingListRow';
export type { FindingListRowProps } from './FindingListRow';
export { FindingDrawer } from './FindingDrawer';
export type { FindingDrawerProps } from './FindingDrawer';
export { AffectedComponents } from './AffectedComponents';
export type { AffectedComponentsProps } from './AffectedComponents';
export { RuleOverrideControls } from './RuleOverrideControls';
export type { RuleOverrideControlsProps } from './RuleOverrideControls';

export { ConsolidatedFindingsList } from './ConsolidatedFindingsList';
export type { ConsolidatedFindingsListProps } from './ConsolidatedFindingsList';
