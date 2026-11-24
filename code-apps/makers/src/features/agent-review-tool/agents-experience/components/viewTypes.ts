/** View-model types for the Microsoft Copilot harness result screen (ported from the mock). */
import type {
  CopilotContextualGuidance,
  FindingSeverity,
  PlatformOverlapState,
  SkillRubricDimension,
  SkillSafetyDisposition,
} from '../contracts/Findings';
import type { ReferenceEntry } from '../contracts/references';
import type { CoverageBasis } from '../services/EvaluationCoverageService';

/**
 * Canonical citation source, derived from the reference registry rather than
 * restated, so adding a source cannot leave the view model silently behind.
 */
export type ReferenceSource = ReferenceEntry['source'];

export type Severity = FindingSeverity;

export type { SkillRubricDimension };

/** How one concrete finding was detected. */
export type FindingProvenance = 'ai-generated' | 'deterministic' | 'unknown';

/** Source rollup for a pattern that can contain findings from several skills. */
export type AggregateFindingProvenance = FindingProvenance | 'mixed';

/**
 * Explicit truthful skill evaluation state (Task 2). Never inferred from an
 * empty/synthetic dimension array — mapped directly from the canonical
 * runtime/persisted bundle review status (or the legacy fallback for
 * historical `skillEvaluations`-only payloads).
 */
export type SkillEvaluationState =
  | 'evaluated'
  | 'partial'
  | 'unavailable'
  | 'blocked'
  | 'failed'
  | 'cancelled';

export interface FindingView {
  id: string;
  sev: Severity;
  family: string;
  provenance: FindingProvenance;
  /** Compatibility flag for consumers that have not moved to `provenance`. */
  ai: boolean;
  title: string;
  sub: string;
  fact: string;
  /** Optional AI explanation; the canonical fact remains available separately. */
  displayFact?: string;
  why: string;
  fix: string;
  /** Optional advice; independent of evidence and detection provenance. */
  remediation?: CopilotContextualGuidance;
  /** Rubric dimension this finding rolls up to (registry value or derived). */
  dimension: SkillRubricDimension;
  refTitle: string;
  refUrl: string;
  source: ReferenceSource;
  how: string;
  safetyDisposition?: SkillSafetyDisposition;
  platformOverlap?: PlatformOverlapState;
  dispositionLabel?: string;
  skipAiEvaluation?: boolean;
  /** Component this finding is about; drives Agent map node attribution. */
  componentIdUnique?: string;
  /** Saved supporting-file location, when the finding identifies one. */
  resourcePath?: string;
  /** Ordered remediation steps (from GroundedSkillFinding; empty for plain findings). */
  fixSteps: Array<{ order: number; action: string }>;
  /** All official references resolved from the registry, primary first. */
  references: Array<{
    id: string;
    title: string;
    url: string;
    source: ReferenceSource;
  }>;
}

export interface CoverageRowView { name: string; kind: string; cases: number }

/** Per-evaluation-set coverage rollup shown above the capability matrix. */
export interface CoverageSetView {
  name: string;
  caseCount: number;
  declaringCases: number;
  canDeclare: boolean;
  covered: number;
  total: number;
}

export interface SkillDimensionView { key: string; score: number; rationale: string }

export interface QualifiedScoreView {
  value: number | null;
  status: 'complete' | 'partial' | 'unavailable';
  coveragePercent: number;
  note?: string;
}

export interface SkillBundleScoresView {
  quality: QualifiedScoreView;
  integrity: QualifiedScoreView;
  safety: QualifiedScoreView;
  readiness: QualifiedScoreView;
  safetyGate: 'none' | 'warning' | 'error';
}

export interface SkillResourceRowView {
  path: string;
  kind: string;
  language?: string;
  sizeBytes: number;
  analysisStatus: string;
  riskLevel?: string;
  readiness?: string;
  findingCount: number;
  reviewCoverage: string;
}

export interface SkillResourceManifestView {
  path: string;
  kind: string;
  language?: string;
  sizeBytes: number;
  referencedBy: string[];
  analysisStatus:
    | 'downloaded'
    | 'queued'
    | 'completed'
    | 'scanned'
    | 'evaluating'
    | 'partial'
    | 'failed'
    | 'skipped'
    | 'oversized'
    | 'cancelled';
  riskLevel?: 'none' | 'info' | 'medium' | 'high' | 'critical';
  readiness?: 'ready' | 'needs-configuration' | 'unsupported' | 'unknown';
}

export interface SkillResourceAnalysisView {
  path: string;
  source?: 'standard' | 'deep';
  evaluationStatus: 'complete' | 'partial' | 'failed' | 'skipped' | 'cancelled';
  riskLevel: 'none' | 'info' | 'medium' | 'high' | 'critical';
  readiness: 'ready' | 'needs-configuration' | 'unsupported' | 'unknown';
  analyzedChunks: number;
  totalChunks: number;
  observedBehaviors: Array<{ kind: string; evidence: string }>;
  dependencies: Array<{ name: string; kind: string; evidence?: string }>;
  externalEndpoints: Array<{ value: string; evidence: string }>;
  capabilities: Array<{ kind: string; evidence: string }>;
  runtimeAssumptions: Array<{ statement: string; evidence: string }>;
  findings: Array<{
    id: string;
    title: string;
    severity: string;
    evidence: string;
    why: string;
    fix: string;
  }>;
  purposeAlignment: { matches: boolean; rationale: string };
  parseError?: string;
}

export interface SkillView {
  /** Stable component identity used for keys and drill-down state. */
  id: string;
  schemaName: string;
  name: string;
  description: string;
  source: string;
  safetyFlagged: boolean;
  safetyFindingId?: string;
  safetyDisposition?: SkillSafetyDisposition;
  sizeLabel: string;
  dimensions: SkillDimensionView[];
  /** Explicit evaluation state (Task 2) — never inferred from an empty dimension array. */
  evaluationState: SkillEvaluationState;
  /** Fixed, truthful message shown when the skill has no real grade (unavailable/blocked/failed/cancelled). */
  evaluationMessage?: string;
  /** Reduced file-analysis coverage, separate from execution errors and rule findings. */
  coverageNote?: string;
  markdown: string;
  /** Review mode used for this skill bundle (present when persisted review is available). */
  mode?: 'standard' | 'deep';
  /** Four qualified scores (present when persisted review data is available). */
  scores?: SkillBundleScoresView;
  /** Resource manifest rows for the resource table (present when manifest is available). */
  resourceRows?: SkillResourceRowView[];
  /** Typed manifest metadata kept separate from evaluator output. */
  resourceManifest?: SkillResourceManifestView[];
  /** Sanitized standard/deep evaluator output. */
  resourceAnalyses?: SkillResourceAnalysisView[];
  /** Every file in the bundle including SKILL.md, for the Source view. */
  files?: SkillSourceFileView[];
  /** Preferred name for the same persisted file inventory. */
  sourceFiles?: SkillSourceFileView[];
  /** Complete redacted bundled SKILL.md retained with new reviews. */
  skillDefinitionSource?: string;
  skillDefinitionSourceOmission?: 'too-large' | 'payload-budget';
}

/** One file in the Source view's file list. Metadata only — never file bytes. */
export interface SkillSourceFileView {
  path: string;
  sizeBytes: number;
  language?: string;
  kind?: string;
  isSkillDefinition?: boolean;
}

export interface CapabilityChip {
  kind: 'tool' | 'mcp' | 'agent' | 'knw' | 'skill';
  label: string;
  count: number;
  color: string;
}

/** One skill affected by a per-skill weakness pattern, with its evidence + full finding. */
export interface SkillFindingInstance {
  skillId: string;
  skillName: string;
  evidence: string;
  finding: FindingView;
}

/** A per-skill weakness pattern (one rule) with the skills it degrades. */
export interface SkillPatternView {
  ruleId: string;
  title: string;
  sev: Severity;
  provenance: AggregateFindingProvenance;
  dimension: SkillRubricDimension;
  /** Plain-language meaning (finding.why). */
  meaning: string;
  /** Remediation summary (finding.fix). */
  fix: string;
  instances: SkillFindingInstance[];
}

/** A rubric-dimension group in the grouped Skills/Findings rail. Always one per dimension. */
export interface DimensionGroupView {
  dimension: SkillRubricDimension;
  label: string;
  /** Aggregate 0-100 score across skills (worst non-null value); null when unscored. */
  score: number | null;
  patterns: SkillPatternView[];
}

/** A pair of skills compared by a pairwise orchestration finding. */
export interface OrchestrationPairView {
  /** Stable identity for pair selection, independent of duplicate display names. */
  id: string;
  a: string;
  b: string;
  /** Present only when the display name identifies exactly one skill. */
  aSkillId?: string;
  /** Present only when the display name identifies exactly one skill. */
  bSkillId?: string;
  evidence: string;
}

/** A set-level cross-skill orchestration pattern (the agent-level gap-filler). */
export interface OrchestrationPatternView {
  ruleId: string;
  title: string;
  /** Optional AI explanation, separate from the recorded evidence. */
  fact?: string;
  evidence?: string;
  remediation?: CopilotContextualGuidance;
  sev: Severity;
  type: string;
  /** Plain-language meaning (finding.rationale). */
  meaning: string;
  /** Remediation summary (finding.recommendation). */
  fix: string;
  fixSteps: Array<{ order: number; action: string }>;
  /** All skills involved. */
  skills: string[];
  /** Pairwise comparisons (populated for overlap/redundancy/contradiction/coupling). */
  pairs: OrchestrationPairView[];
  references: Array<{
    id: string;
    title: string;
    url: string;
    source: ReferenceSource;
  }>;
}

/** Grouped-by-dimension view of the skill evaluation, plus the orchestration section. */
export interface SkillsGroupedView {
  /** Always four groups (one per rubric dimension), worst score first. */
  groups: DimensionGroupView[];
  /** Set-level orchestration patterns; empty when unprovisioned or clean. */
  orchestration: OrchestrationPatternView[];
  /** Skills keyed by stable component identity for per-skill drill-down. */
  skillsById: Record<string, SkillView>;
}

/** One review finding paired with a stable, dedup-safe selection key. */
export interface FindingRowView {
  /** Stable key (original index) so findings that share a rule id stay distinct. */
  key: string;
  finding: FindingView;
}

/** A findings group (one per rule family) in the grouped Findings rail. */
export interface FindingGroupView {
  family: string;
  rows: FindingRowView[];
  counts: { error: number; warning: number; info: number };
}

/** Grouped-by-family view of the review findings, worst family first. */
export interface FindingsGroupedView {
  groups: FindingGroupView[];
}

export interface ReviewSummaryView {
  agentName: string;
  score: number | null;
  passed: number;
  warnings: number;
  errors: number;
  /**
   * Info-severity count.
   *
   * When `countsAreChecks` is true these five counts are check outcomes and sum
   * exactly to `rulesEvaluated`. On legacy reviews with no persisted rule
   * outcomes they fall back to finding severities and do not sum — see
   * `countsAreChecks`.
   */
  infos: number;
  /** Checks whose captured subject was explicitly not applicable. */
  notApplicable: number;
  /**
   * True when passed/errors/warnings/infos/notApplicable describe checks and
   * therefore add up to `rulesEvaluated`. False for reviews saved before rule
   * outcomes were persisted, where they mix a rule count with finding counts.
   */
  countsAreChecks: boolean;
  rulesEvaluated: number;
  model: string;
  memoryEnabled: boolean;
  webSearchEnabled?: boolean;
  duration: string;
  reviewedBy: string;
  refCounts: { learn: number; owasp: number; anthropic: number; mitreCwe: number };
  capabilitiesCovered: number;
  capabilitiesTotal: number;
  testCases: number;
  multiTurnCases: number;
  graders: string;
  evaluationSets: number;
  /** Present (value 2) only when `score` was computed by the score-v2 rule-instance engine (Task 3). */
  scoreBasisVersion?: 2;
  /** 'partial' when any applicable v2 rule instance failed to evaluate. Absent for legacy (v1) scores. */
  scoreStatus?: 'complete' | 'partial';
  /** Exact v2 pillar breakdown used to compute `score` — absent for legacy scores. */
  pillars?: import('../services/scoring').PillarBreakdown[];
  /** Explicit instruction-coverage AI-stage status (Task 4). Absent for legacy reviews — no false claim is shown. */
  instructionCoverageStatus?: import('../../contracts/ReviewResult').ReviewStageStatus;
  /** Host-owned cross-skill scope and execution status; absent means legacy unknown. */
  crossSkillOrchestrationStatus?: import('../../contracts/ReviewResult').ReviewStageStatus;
}

/** One rule outcome in the Checks list — including the ones that passed. */
export interface CheckRowView {
  /** Stable key; rule instances can repeat a ruleId across skills. */
  key: string;
  ruleId: string;
  family: string;
  status: import('../contracts/Findings').RuleEvaluationStatus;
  /** What this instance evaluated, when a rule runs once per component. */
  subject?: string;
  /** Reports configuration rather than judging it, so it is not a scored check. */
  record: boolean;
  /** Findings this rule produced, empty when it passed or did not apply. */
  findings: FindingView[];
}

/** Checks grouped by rule family, so a clean family is visibly clean. */
export interface CheckGroupView {
  family: string;
  rows: CheckRowView[];
  counts: {
    passed: number;
    info: number;
    warning: number;
    error: number;
    notApplicable: number;
    failed: number;
    /** Rules that state a fact; counted apart from pass/fail. */
    recorded: number;
  };
}

/**
 * Every registered rule and what it concluded.
 *
 * `recorded` is false for reviews saved before rule outcomes were persisted.
 * The UI must say "not recorded" in that case — rendering an empty checklist
 * would claim nothing was checked, which is a different and untrue statement.
 */
export interface ChecksView {
  recorded: boolean;
  groups: CheckGroupView[];
  totals: {
    passed: number;
    info: number;
    warning: number;
    error: number;
    notApplicable: number;
    failed: number;
    /** Rules that state a fact; counted apart from pass/fail. */
    recorded: number;
    /** Real checks only, so passed/evaluated is a ratio an agent can reach. */
    evaluated: number;
  };
}

export interface ReviewViewModel {
  summary: ReviewSummaryView;
  findings: FindingView[];
  /** Per-rule outcomes including passes; `recorded: false` for legacy reviews. */
  checks: ChecksView;
  coverage: CoverageRowView[];
  /** Evidence basis used to attribute test cases to configured capabilities. */
  coverageBasis: CoverageBasis;
  coverageSets: CoverageSetView[];
  skills: SkillView[];
  /** Grouped-by-dimension skill view + orchestration section. */
  skillsGrouped: SkillsGroupedView;
  capabilityChips: CapabilityChip[];
}
