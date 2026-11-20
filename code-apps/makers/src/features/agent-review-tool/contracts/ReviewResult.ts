/**
 * ReviewResult and BotMetadata TypeScript interfaces
 *
 * These interfaces map to the cat_agentreviews Dataverse table structure
 * and represent the complete review result for an agent.
 */

import type { StandardReviewWorkflowProvenance } from './StandardReviewWorkflow';
import type {
  StandardReviewAssessmentIdentity,
  StandardReviewConsistencyResult,
} from './StandardReviewConsistency';

/**
 * Explicit outcome for one AI-dependent review stage (Task 4 — instruction AI
 * availability). Infrastructure status is always separate from findings: a
 * classifier that never ran, failed, or was cancelled must never be silently
 * conflated with "no issues found".
 */
export interface ReviewStageStatus {
  state:
    | 'complete'
    | 'partial'
    | 'unavailable'
    | 'not-applicable'
    | 'failed'
    | 'cancelled';
  reason?:
    | 'unprovisioned'
    | 'empty-instructions'
    | 'insufficient-skills'
    | 'incomplete-population'
    | 'missing-output'
    | 'incomplete-response'
    | 'invocation-failed'
    | 'review-cancelled';
}

/** Explicit AI-stage availability for the review, keyed by stage name. Additive and optional. */
export interface ReviewAnalysisStatus {
  instructionCoverage: ReviewStageStatus;
  /** Absent on older snapshots; absence does not establish applicability or completion. */
  crossSkillOrchestration?: ReviewStageStatus;
}

// Re-export display models for convenience
export type {
  PatternDisplayRow,
  ComplianceDisplayRow,
  ComplianceIssueDetail,
} from './DisplayModels';

/**
 * Harness of an agent (spec 013, issue 947).
 * 'unsupported' means that ART does not know the harness. No checks run for it.
 * The scorer Harness union in review-core/harness.ts does not include 'unsupported'.
 */
export type AgentHarnessKind = 'standard' | 'copilot' | 'unsupported';

/**
 * Bot metadata extracted from bot and botcomponent tables
 */
export interface BotMetadata {
  /** Bot unique identifier (GUID) */
  botId: string;

  /** Display name of the bot */
  name: string;

  /** Bot status (active, inactive, etc.) */
  statusCode: number;

  /** Bot component unique identifier (YAML configuration) */
  componentIdUnique: string;

  /** Last modified date of bot */
  modifiedOn?: Date;

  /** Created date of bot */
  createdOn?: Date;

  /** Latest published date of the bot */
  publishedOn?: Date;

  /** Bot description */
  description?: string;

  /** Bot icon/avatar URL */
  iconUrl?: string;

  /** Bot icon as base64 string (from bot.iconbase64) */
  iconBase64?: string;

  /** Agent-level settings (language, auth mode, AI settings) */
  agentSettings?: import('./ServiceContracts').AgentSettings;
  /** Reviewed configuration used to resolve orchestration without assuming a mode. */
  configuration?: string;

  /** Harness of the agent (spec 013). Absent = standard. 'unsupported' = no checks run. */
  harness?: AgentHarnessKind;
}

/** Target agent metadata retained from an uploaded solution for the saved Agent Map. */
export interface ReviewAgentMapTarget {
  schemaName: string;
  name: string;
  /** Image data URL for the target agent, when its bot record contains a logo. */
  iconBase64?: string;
}

/**
 * Complete review result structure
 * Maps to cat_agentreviews Dataverse table
 */
export interface ReviewResult {
  /** Unique review record ID (GUID) - cat_agentreviewid */
  reviewId?: string;

  /** Bot ID being reviewed */
  botId: string;

  /** Bot component unique ID (used for deduplication) */
  componentIdUnique: string;

  /** Bot name for display */
  botName: string;

  /** Bot icon as base64 string — persisted for ZIP-sourced bots that have no Dataverse bot record */
  iconBase64?: string;

  /** Connected targets present in the uploaded ZIP, retained for the saved Agent Map. */
  connectedAgentTargets?: ReviewAgentMapTarget[];

  /** Overall score (0-100) */
  overallScore: number;

  /** False when a completed modern review had no measurable score pillars. */
  overallScoreApplicable?: boolean;

  /** Explicit history score state; absent on rows mapped before version history. */
  scoreState?: ReviewScoreState;

  /** Pattern evaluation score (0-100) */
  patternScore: number;
  patternScoreApplicable?: boolean;

  /** Instruction compliance score (0-100) */
  instructionScore: number;
  instructionScoreApplicable?: boolean;
  assessmentPolicyVersion?: string;

  /**
   * How the standard harness' composite was reached: one entry per pillar, with the weight it
   * carried and whether it applied at all.
   *
   * Absent on every review saved before the standard harness moved onto the shared scorer. Read
   * that absence as "legacy score, rerun to compare with a copilot agent", never as "no pillars
   * applied" — the two are opposite claims and only one of them is in the data.
   */
  scorePillars?: import('../agents-experience/services/scoring').PillarBreakdown[];

  /**
   * 'partial' when part of the composite rests on evidence that could not be fully read — a rule
   * instance that failed to evaluate, or a capture that never carried evaluation rows. It
   * qualifies the score rather than withholding it.
   */
  scoreStatus?: 'complete' | 'partial';

  /** Every rule instance behind the composite, so the per-check list is evidence and not a recount. */
  ruleResults?: import('../agents-experience/contracts/Findings').RuleEvaluationResult[];

  /** Total number of high-severity issues */
  highSeverityCount: number;

  /** Total number of medium-severity issues */
  mediumSeverityCount: number;

  /** Total number of low-severity issues */
  lowSeverityCount: number;

  /** Total count of all issues */
  totalIssueCount: number;

  /** Total number of patterns evaluated (patterns tab row count) */
  patternTotalCount?: number;

  /** Review execution timestamp */
  reviewedOn: Date;

  /** Dataverse creation timestamp used as the review-date tie-breaker */
  createdOn?: Date;

  /** Bot publication captured when the review began (`cat_agentversion`) */
  agentVersion?: string;

  /** Review experience persisted in `cat_sourcetype` */
  reviewKind?: ReviewKind;

  /** Review execution duration in milliseconds */
  durationMs: number;

  /** Stage A output (JSON stringified) - stored in cat_reviewresultfile */
  stageAOutput?: string;

  /** Stage B output (JSON stringified) */
  stageBOutput?: string;

  /** Stage C output (JSON stringified) */
  stageCOutput?: string;

  /** Direct workflow audit link for Standard reviews. */
  workflowProvenance?: StandardReviewWorkflowProvenance;

  /** Stable hashes of the complete scoring input and each score-producing rule. */
  assessmentIdentity?: StandardReviewAssessmentIdentity;

  /** Comparison with the newest prior review under the same scoring policy. */
  consistency?: StandardReviewConsistencyResult;

  /** PDF report (base64 or file reference) - stored in cat_reviewpdfreport */
  pdfReport?: string;

  /** AI-generated summary text from Stage B */
  patternSummary?: string;

  /** AI-generated summary text from Stage C */
  complianceSummary?: string;

  /** Agent instructions text that was evaluated by Stage C */
  agentInstructions?: string;

  /** Display name of the user who ran this review */
  reviewedBy?: string;

  /** Review status (completed, failed, in-progress, not-reviewed) */
  status: 'completed' | 'failed' | 'in-progress' | 'not-reviewed';

  /** Error message if review failed */
  errorMessage?: string;

  /** Whether review detail data exists (memo field or legacy file column) — controls View button */
  hasReviewData?: boolean;

  /**
   * Source environment org URL for this review.
   * '' = current environment, full URL = cross-env, 'zip' = ZIP-sourced (not environment-bound).
   */
  sourceEnvironment?: string;

  /** Microsoft Copilot harness review payload (spec 013). Absent for standard reviews.
   *  Accepts either runtime (AgentsExperienceReviewPayload) or persisted (PersistedCopilotReviewPayload) form.
   */
  agentsExperience?: AgentsExperienceReviewPayload | PersistedCopilotReviewPayload;
}

/**
 * Minimal review info for grid display
 */
export interface ReviewGridRow {
  botId: string;
  botName: string;
  overallScore: number;
  /** False when a completed modern review had no measurable score pillars. */
  overallScoreApplicable?: boolean;
  totalIssueCount: number;
  highSeverityCount: number;
  reviewedOn?: Date;
  status: 'completed' | 'failed' | 'not-reviewed';
  /** Bot icon as base64 string for display */
  iconBase64?: string;
  /** Whether review detail data exists — controls View button enabled state */
  hasReviewData?: boolean;
  /** True for reviews sourced from a ZIP upload (no matching Dataverse bot) */
  isZipSource?: boolean;

  /** Display name of the user who ran this review */
  reviewedBy?: string;

  /**
   * Source environment org URL for this review.
   * '' = current environment, full URL = cross-env, 'zip' = ZIP-sourced (not environment-bound).
   */
  sourceEnvironment?: string;

  /** Harness of the agent (spec 013). Absent = standard. 'unsupported' = no checks run. */
  harness?: AgentHarnessKind;

  /** Harness of the saved review that the row shows, when the review states it. The View action routes by this value. */
  reviewHarness?: ReviewKind;

  /** Dataverse record ID (cat_agentreviewsid) — present for persisted reviews. */
  reviewId?: string;

  /** Current/stale state derived from reviewed and current publication dates. */
  freshness?: ReviewFreshness;
}

/** Review experience stored on new Copilot Studio review rows. */
export type ReviewKind = 'standard' | 'copilot';

/** Publication freshness derived at read time. */
export type ReviewFreshness =
  | 'current'
  | 'stale'
  | 'version-unknown'
  | 'not-published';

/** Preserves measured zero, non-measurable, and legacy unknown as separate states. */
export type ReviewScoreState =
  | 'measured'
  | 'not-applicable'
  | 'not-assessed'
  | 'legacy-unknown';

/** Identity used to group and query review history. */
export interface ReviewHistorySubject {
  botId: string;
  componentIdUnique?: string;
  sourceEnvironment?: string;
}

/** Lightweight history row with a persisted identity and derived freshness. */
export interface ReviewHistoryEntry extends ReviewResult {
  reviewId: string;
  freshness: ReviewFreshness;
  /** Sequential version number (v1 = oldest, ascending chronologically). */
  versionNumber: number;
}

/**
 * Quick stats for dashboard
 */
export interface DashboardStats {
  /** Total number of bots in environment */
  totalBots: number;

  /** Number of bots with completed reviews */
  reviewedBots: number;

  /** Percentage of bots reviewed */
  reviewedPercentage: number;

  /** Average score across all reviewed bots */
  averageScore: number;

  /** Number of reviews included in the average score. */
  scoredReviews: number;

  /** Total count of all issues across all reviews */
  totalIssues: number;

  /** Count of high-severity issues across all reviews */
  highSeverityIssues: number;
}

/** Microsoft Copilot harness (spec 013) — additive; standard consumers unaffected. */
export interface AgentsExperienceReviewPayload {
  model: import('../agents-experience/contracts/AgentsExperienceModel').AgentsExperienceModel;
  findings: Array<
    | import('../agents-experience/contracts/Findings').GroundedFinding
    | import('../agents-experience/contracts/Findings').GroundedSkillFinding
  >;
  skillEvaluations: import('../agents-experience/contracts/SkillEvaluation').SkillBundleEvaluation[];
  /** Per-bundle Standard/Deep review results (Task 8 execution state). */
  skillBundleReviews?: import('../agents-experience/contracts/SkillBundle').SkillBundleReviewResult[];
  /** Retrieval issues encountered assembling skill bundles (non-fatal propagation). */
  bundleRetrievalIssues?: import('../agents-experience/contracts/SkillBundle').RetrievalIssue[];
  /** Validated cross-skill output. Applicability and availability are recorded separately in analysisStatus. */
  crossSkillOrchestration?: import('../agents-experience/contracts/SkillEvaluation').CrossSkillOrchestrationEvaluation;
  /** Skill review mode used (standard or deep). Required after execution. */
  skillReviewMode?: import('../agents-experience/contracts/SkillBundle').SkillReviewMode;
  coverage: { name: string; kind: string; cases: number }[];
  /**
   * How coverage was determined. 'declared' when cases name the capability via
   * `expectedExecutionSteps`; 'inferred' when falling back to name matching;
   * 'unverified' when the available evaluation shape carries no capability
   * evidence and therefore cannot support either covered or uncovered claims.
   * Optional: absent on reviews persisted before declared coverage existed.
   */
  coverageBasis?: import('../agents-experience/services/EvaluationCoverageService').CoverageBasis;
  /** Per-evaluation-set coverage rollup. Empty when the case-to-set link is unavailable. */
  coverageSets?: import('../agents-experience/services/EvaluationCoverageService').SetCoverage[];
  /**
   * `basisVersion`/`status`/`pillars` are absent on reviews persisted before the
   * score v2 fix (Task 3) — treat their absence as "legacy score, rerun
   * recommended", never as v2 by assumption. `passed`/`evaluated` remain the
   * raw engine rule-pass/rule-count for backward-compatible display; the
   * composite (`grounded`) is computed from deduplicated rule-instance outcomes.
   */
  score: {
    grounded: number | null;
    passed: number;
    warnings: number;
    errors: number;
    evaluated: number;
    /** Present (value 2) only for reviews computed by the score-v2 rule-instance engine. */
    basisVersion?: 2;
    /** 'partial' when any applicable v2 rule instance failed to evaluate (execution exception). */
    status?: 'complete' | 'partial';
    /** Exact v2 pillar breakdown used to compute `grounded` — persisted for audit. */
    pillars?: import('../agents-experience/services/scoring').PillarBreakdown[];
  };
  /** Explicit AI-stage availability (Task 4). Absent on reviews persisted before this fix — legacy, unknown status. */
  analysisStatus?: ReviewAnalysisStatus;
  /**
   * Explicit outcome for every registered rule, including the ones that passed
   * or did not apply. The engine already computes this for scoring; surfacing it
   * lets the UI show what was checked and cleared, not only what fired.
   *
   * Optional: absent on reviews persisted before this existed. Absence means
   * "not recorded", never "nothing passed" — consumers must not render a zeroed
   * checklist from a legacy payload.
   */
  ruleResults?: import('../agents-experience/contracts/Findings').RuleEvaluationResult[];
}

// ---------------------------------------------------------------------------

/**
 * Common display payload accepted by buildReviewViewModel and CopilotReviewPage.
 * Both AgentsExperienceReviewPayload and PersistedCopilotReviewPayload satisfy this.
 */
export interface CopilotReviewDisplayPayload {
  model: import('../agents-experience/contracts/AgentsExperienceModel').AgentsExperienceModel;
  findings: Array<
    | import('../agents-experience/contracts/Findings').GroundedFinding
    | import('../agents-experience/contracts/Findings').GroundedSkillFinding
  >;
  skillEvaluations: import('../agents-experience/contracts/SkillEvaluation').SkillBundleEvaluation[];
  /**
   * Per-skill bundle reviews. Runtime form (`SkillBundleReviewResult`) when
   * viewing a freshly-executed review; persisted form (`PersistedSkillBundleReview`)
   * when reopening a saved review. Typed as a union so consumers can branch on
   * shape instead of casting through `unknown`.
   */
  skillBundleReviews?: Array<
    | import('../agents-experience/contracts/SkillBundle').SkillBundleReviewResult
    | PersistedSkillBundleReview
  >;
  /** Skill resource loading outcomes retained in runtime and saved reviews. */
  bundleRetrievalIssues?: import('../agents-experience/contracts/SkillBundle').RetrievalIssue[];
  coverage: { name: string; kind: string; cases: number }[];
  /** See AgentsExperienceReviewPayload.coverageBasis. */
  coverageBasis?: import('../agents-experience/services/EvaluationCoverageService').CoverageBasis;
  /** See AgentsExperienceReviewPayload.coverageSets. */
  coverageSets?: import('../agents-experience/services/EvaluationCoverageService').SetCoverage[];
  score: {
    grounded: number | null;
    passed: number;
    warnings: number;
    errors: number;
    evaluated: number;
    basisVersion?: 2;
    status?: 'complete' | 'partial';
    pillars?: import('../agents-experience/services/scoring').PillarBreakdown[];
  };
  skillReviewMode?: import('../agents-experience/contracts/SkillBundle').SkillReviewMode;
  /** Agent-level cross-skill orchestration evaluation (P2-O), when available. */
  crossSkillOrchestration?: import('../agents-experience/contracts/SkillEvaluation').CrossSkillOrchestrationEvaluation;
  /** Explicit AI-stage availability (Task 4). Absent for legacy reviews. */
  analysisStatus?: ReviewAnalysisStatus;
  /** See AgentsExperienceReviewPayload.ruleResults. Absent = not recorded, not "nothing passed". */
  ruleResults?: import('../agents-experience/contracts/Findings').RuleEvaluationResult[];
}

// ---------------------------------------------------------------------------
// Persisted contracts (Task 10)
// ---------------------------------------------------------------------------

/** Resource metadata persisted per skill bundle review — no raw content. */
export interface PersistedResourceManifest {
  path: string;
  kind: import('../agents-experience/contracts/SkillBundle').SkillBundleResource['kind'];
  language?: import('../agents-experience/contracts/SkillBundle').SkillBundleResource['language'];
  sizeBytes: number;
  sha256: string;
  referencedBy: string[];
  analysisStatus: import('../agents-experience/contracts/SkillBundle').ResourceAnalysisStatus;
  riskLevel?: import('../agents-experience/contracts/SkillEvaluation').SkillResourceEvaluation['riskLevel'];
  readiness?: import('../agents-experience/contracts/SkillEvaluation').SkillResourceEvaluation['readiness'];
}

/**
 * One file in the skill bundle, for the Source view — metadata only.
 *
 * Deliberately carries no file bytes, matching `PersistedResourceManifest`.
 * Raw content is withheld from the persisted review because a resource can hold
 * secrets or personal data, and a saved review is read by anyone who can open
 * the record. Paths, sizes and languages are enough to show the bundle's shape.
 *
 * Unlike `manifest`, this includes `SKILL.md` itself, so the file list matches
 * what the Copilot Studio designer shows ("4 files", not 3).
 */
export interface PersistedSourceFile {
  path: string;
  sizeBytes: number;
  language?: import('../agents-experience/contracts/SkillBundle').SkillBundleResource['language'];
  kind?: import('../agents-experience/contracts/SkillBundle').SkillBundleResource['kind'];
  /** True for the skill's own SKILL.md rather than a supporting resource. */
  isSkillDefinition?: boolean;
}

/** Fully projected persisted skill bundle review — no raw source, no prompt payloads. */
export interface PersistedSkillBundleReview {
  schemaVersion: 1;
  skillComponentId: string;
  skillComponentUniqueId: string;
  skillSchemaName: string;
  skillName: string;
  bundleHash: string;
  reviewInputHash: string;
  mode: import('../agents-experience/contracts/SkillBundle').SkillReviewMode;
  /**
   * Mirrors the runtime `SkillBundleReviewStatus` exactly (Task 2/5): 'blocked'
   * and 'unavailable' must survive persistence distinctly from 'failed' so a
   * reopened review can still render "AI evaluation withheld" rather than a
   * false "Evaluation failed".
   */
  status: 'complete' | 'partial' | 'unavailable' | 'blocked' | 'failed' | 'cancelled';
  startedAt: string;
  completedAt: string;
  promptVersions: {
    standard: string;
    resource?: string;
    fileSynthesis?: string;
    bundleSynthesis?: string;
  };
  manifest: PersistedResourceManifest[];
  /**
   * Every file in the bundle including SKILL.md, for the Source view.
   * Optional: reviews saved before this field existed simply have no file list.
   */
  sourceFiles?: PersistedSourceFile[];
  /**
   * Redacted complete SKILL.md for a bundled skill. Supporting-resource bytes
   * remain excluded. Optional for historical and inline-skill reviews.
   */
  skillDefinitionSource?: string;
  /** Why bundled SKILL.md was not retained when it was available at review time. */
  skillDefinitionSourceOmission?: 'too-large' | 'payload-budget';
  retrievalIssues: import('../agents-experience/contracts/SkillBundle').RetrievalIssue[];
  deterministic: {
    findings: import('../agents-experience/contracts/Findings').GroundedSkillFinding[];
    integrity: import('../agents-experience/services/skill/bundleIntegrity').BundleIntegrityResult;
  };
  /** Conservative text-inferred tool/knowledge references retained without raw SKILL.md content. */
  capabilityReferences?: import('../agents-experience/contracts/SkillBundle').SkillCapabilityReference[];
  /** Ambiguous text matches intentionally withheld from the graph. */
  capabilityReferenceIssues?: import('../agents-experience/contracts/SkillBundle').SkillCapabilityReferenceIssue[];
  standard?: import('../agents-experience/contracts/SkillEvaluation').StandardSkillBundleEvaluation;
  deep?: import('../agents-experience/contracts/SkillEvaluation').DeepSkillBundleEvaluation;
  findings: import('../agents-experience/contracts/Findings').GroundedSkillFinding[];
  scores: import('../agents-experience/contracts/SkillBundle').SkillBundleScores;
  coverage: {
    resourcesTotal: number;
    resourcesReviewed: number;
    resourcesPartial: number;
    resourcesFailed: number;
    resourcesSkipped: number;
    resourcesOversized: number;
    resourcesCancelled: number;
    chunksTotal: number;
    chunksReviewed: number;
  };
  citations: Array<{
    id: import('../agents-experience/contracts/references').ReferenceId;
    title: string;
    url: string;
    source: import('../agents-experience/contracts/references').ReferenceEntry['source'];
  }>;
}

/**
 * Persisted form of the Microsoft Copilot harness review payload.
 * Carries the complete runtime payload needed for reopen, with
 * `skillBundleReviews` and `skillReviewMode` replaced by their
 * persisted counterparts, plus persistence issues.
 */
export type PersistedCopilotReviewPayload =
  Omit<AgentsExperienceReviewPayload, 'skillBundleReviews' | 'skillReviewMode'> & {
    skillBundleReviews: PersistedSkillBundleReview[];
    skillReviewMode: import('../agents-experience/contracts/SkillBundle').SkillReviewMode;
    persistenceIssues: import('../agents-experience/contracts/SkillBundle').RetrievalIssue[];
  };

/** Output of buildPersistedCopilotReview — ready for Dataverse cat_reviewresultjson. */
export interface PersistedCopilotReviewResult {
  payload: PersistedCopilotReviewPayload;
  json: string;
}
