/**
 * Contracts for the workflow-backed review job (spec 014).
 *
 * A job row carries one review: the app writes the whole component corpus to a
 * file column, the Copilot Studio workflow loops over `components`, and the
 * per-component agent output is written back to a second file column.
 *
 * The agent node supplies judgement and evidence only. Titles, explanations,
 * fixes and references stay client-side in the rule registry, and every
 * AI-supplied finding is re-validated by `validateStandardEvaluation` before it
 * reaches the UI.
 */

/** Dataverse entity set for the parent job row. */
export const REVIEW_JOB_ENTITY_SET = 'cat_agentreviewjobs';

/**
 * Dataverse entity set for per-component results.
 *
 * The workflow loop writes one row here per agent-node call rather than
 * accumulating an array. That keeps parallel iterations free of shared state
 * and means a crash part-way through still leaves the completed components
 * readable.
 */
export const REVIEW_JOB_ITEM_ENTITY_SET = 'cat_agentreviewjobitems';

/** `cat_jobstatus` option set. */
export const ReviewJobStatus = {
  Queued: 1,
  Running: 2,
  Succeeded: 3,
  Failed: 4,
  /**
   * Queued for the ARC2 workflow rather than the original ART one.
   *
   * A separate value because both workflows watch the same table and a Dataverse
   * trigger cannot read inside the uploaded corpus. ART's trigger filters on
   * `cat_jobstatus eq 1`, so a row queued at 1 is ART's by definition; queueing
   * ARC2 work at 1 would have both flows claim it and bill the review twice.
   */
  ARC2Queued: 100000000,
} as const;
export type ReviewJobStatusValue =
  (typeof ReviewJobStatus)[keyof typeof ReviewJobStatus];

/** Statuses that mean "submitted, but nothing has picked it up yet". */
export const UNCLAIMED_STATUSES: readonly ReviewJobStatusValue[] = [
  ReviewJobStatus.Queued,
  ReviewJobStatus.ARC2Queued,
];

/**
 * `cat_jobkind` option set. One workflow per kind.
 *
 * Values are never renumbered — a stored row keeps the integer. `ArtifactBundle` was
 * added once uploads began flowing through the same job table; before it existed an
 * upload had no value it could be written as and was recorded as `StandardSkillBundle`.
 */
export const ReviewJobKind = {
  StandardSkillBundle: 1,
  CrossSkillOrchestration: 2,
  ArtifactBundle: 3,
} as const;
export type ReviewJobKindValue =
  (typeof ReviewJobKind)[keyof typeof ReviewJobKind];

/**
 * `cat_harness` option set — the harness that produced the agent under review.
 *
 * A column rather than a corpus field so a future per-harness workflow can be selected
 * by the Dataverse trigger, which cannot read inside the uploaded file.
 */
export const ReviewHarness = {
  Standard: 1,
  Copilot: 2,
  DeclarativeAgent: 3,
  Skill: 4,
} as const;
export type ReviewHarnessValue =
  (typeof ReviewHarness)[keyof typeof ReviewHarness];

/** Harness names as they appear in a corpus. */
export type ReviewHarnessName = keyof typeof ReviewHarness;

/** Terminal states — polling stops when the row reaches one of these. */
export const TERMINAL_STATUSES: readonly ReviewJobStatusValue[] = [
  ReviewJobStatus.Succeeded,
  ReviewJobStatus.Failed,
];

/** `cat_itemstatus` option set on a job item row. */
export const ReviewJobItemStatus = {
  Succeeded: 1,
  Failed: 2,
} as const;
export type ReviewJobItemStatusValue =
  (typeof ReviewJobItemStatus)[keyof typeof ReviewJobItemStatus];

/** One per-component result row, as read back from Dataverse. */
export interface ReviewJobItemRow {
  cat_agentreviewjobitemid: string;
  cat_componentid?: string;
  cat_skillname?: string;
  cat_componentindex?: number;
  cat_itemstatus?: ReviewJobItemStatusValue;
  cat_correlationid?: string;
  /** The agent node's structured output, serialised. */
  cat_resultjson?: string;
  cat_errormessage?: string;
  /** Write time. Breaks ties when a retried iteration writes a second row. */
  createdon?: string;
}

/** A job row as read back from Dataverse. Only the columns the client needs. */
export interface ReviewJobRow {
  cat_agentreviewjobid: string;
  cat_name?: string;
  cat_jobstatus?: ReviewJobStatusValue;
  cat_jobkind?: ReviewJobKindValue;
  cat_harness?: ReviewHarnessValue;
  cat_correlationid?: string;
  cat_botid?: string;
  cat_botname?: string;
  cat_componentcount?: number;
  /** Free-text liveness ping written by each loop iteration. Benign race: any value is valid. */
  cat_laststatus?: string;
  cat_errormessage?: string;
  cat_outputfile_name?: string;
  modifiedon?: string;
  /** Row creation time. Used to match a job back to the review that started it. */
  createdon?: string;
}

// ---------------------------------------------------------------------------
// Input corpus — what the app uploads to cat_inputfile
// ---------------------------------------------------------------------------

/** One resource excerpt supplied to the agent for evidence grounding. */
export interface CorpusResourceExcerpt {
  path: string;
  content: string;
  truncated: boolean;
}

/** Manifest entry describing a bundle resource (no content). */
export interface CorpusManifestEntry {
  path: string;
  kind: string;
  language?: string;
  sizeBytes: number;
  sha256: string;
  isBinary: boolean;
  referencedBy: string[];
  analysisStatus: string;
}

/**
 * One reviewable component. The workflow's Loop iterates over these and the
 * agent node receives exactly one per iteration, so this object must stay
 * inside the per-call instruction budget (see `tokenBudget.ts`).
 */
export interface ReviewCorpusComponent {
  componentIndex: number;
  kind: string;
  skillComponentId: string;
  skillComponentUniqueId: string;
  skillSchemaName: string;
  /** Correlation key used to match an agent result back to its bundle. */
  skillName: string;
  source: string;
  bundleHash: string;
  parentDescription?: string;
  skill_markdown: string;
  agent_instructions: string;
  sibling_descriptions: Array<{ name: string; description?: string }>;
  resource_manifest: CorpusManifestEntry[];
  resource_excerpts: CorpusResourceExcerpt[];
  /** Names of every tool, connected agent and knowledge source the agent has. */
  configuredCapabilities: string[];
  /** Authoritative scanner findings. The agent must not re-report these. */
  deterministic_findings: unknown[];
}

/**
 * What produced this corpus, and therefore which agent instructions suit it.
 *
 * The workflow branches on this immediately after Parse JSON, so it must stay a
 * top-level string the designer can compare without walking into `components`.
 *
 * Named for the corpus rather than the job because the `cat_jobkind` column it maps to
 * is a different set of values: the column also carries `CrossSkillOrchestration`,
 * which no corpus is ever built as. `corpusKindToJobKind` is the only bridge.
 *
 * - `StandardSkillBundle` — a Copilot Studio agent. One component per skill,
 *   each component a whole skill, siblings summarised alongside it.
 * - `ArtifactBundle` — an uploaded archive. One component per group of files,
 *   each component a *portion* of one skill. The agent must not judge the
 *   archive as a whole from a portion of it.
 */
export type ReviewCorpusKind = 'StandardSkillBundle' | 'ArtifactBundle';

/**
 * Every discriminator a corpus can carry, including `StandardReview` from the
 * standard-review workflow corpus and `DeclarativeAgent` from the M365
 * declarative-agent corpus, neither of which is built as a `ReviewCorpus`.
 */
export type ReviewJobCorpusKind = ReviewCorpusKind | 'StandardReview' | 'DeclarativeAgent';

/**
 * Maps a corpus discriminator onto the column's option set.
 *
 * `StandardReview` shares `StandardSkillBundle` because it is a standard-agent
 * bundle; the option set is never renumbered, so no value is added for it.
 *
 * `DeclarativeAgent` shares it for a different reason: the option set has no
 * declarative value and gaining one is a Dataverse schema change. The column is
 * not what routes the run — the flow reads `jobKind` out of the corpus file — so
 * the discriminator stays exact where it is read and the column keeps the value
 * every declarative job has always carried.
 */
export function corpusKindToJobKind(kind: ReviewJobCorpusKind): ReviewJobKindValue {
  return kind === 'ArtifactBundle'
    ? ReviewJobKind.ArtifactBundle
    : ReviewJobKind.StandardSkillBundle;
}

/** Whole-review payload written to `cat_inputfile`. */
export interface ReviewCorpus {
  schemaVersion: 1;
  jobKind: ReviewCorpusKind;
  /**
   * Harness that produced the agent. Optional: a caller that says nothing leaves
   * `cat_harness` unset rather than having a guess recorded as fact.
   */
  harness?: ReviewHarnessName;
  generatedBy: string;
  generatedOn: string;
  review: {
    correlationId: string;
    botId: string;
    botName: string;
    sourceEnvironment: string;
    componentCount: number;
  };
  components: ReviewCorpusComponent[];
}

/** Minimum whole-corpus shape required by the shared Dataverse job writer. */
export interface ReviewJobSubmissionCorpus {
  jobKind: ReviewJobCorpusKind;
  /**
   * Harness that produced the agent. Optional: a caller that says nothing leaves
   * `cat_harness` unset rather than having a guess recorded as fact.
   */
  harness?: ReviewHarnessName;
  review: {
    correlationId: string;
    botId: string;
    botName: string;
    sourceEnvironment: string;
    componentCount?: number;
  };
  components?: readonly unknown[];
  standardReview?: {
    reviewUnits: readonly unknown[];
  };
}

// ---------------------------------------------------------------------------
// Output — what the workflow writes to cat_outputfile
// ---------------------------------------------------------------------------

/** One finding as returned by the agent node. Registry rules supply the prose. */
export interface AgentFinding {
  ruleId: string;
  severity: string;
  evidence: string;
  /**
   * The verbatim quotes behind `evidence`, in the order the node returned them.
   *
   * `evidence` is a readable narrative — model prose interleaved with component
   * ids and field paths — so it is not a substring of the reviewed source and
   * cannot pass a grounding check. These are, which is what lets a consumer
   * holding the source corpus pick a quote that provably came from it.
   */
  evidenceQuotes?: string[];
  resourcePath?: string;
  confidence?: string;
  /**
   * Instance prose from an `arc2-node-output-v4` exception.
   *
   * These are per-finding, not per-rule: the rule's title, why-text and
   * references still come from the registry, while the node supplies what is
   * true of *this* agent. They are optional because ART's nodes emit none of
   * them, and a v3 payload must keep parsing unchanged.
   */
  findingTitle?: string;
  fact?: string;
  whyItMatters?: string;
  makerAction?: string;
  acceptanceCheck?: string;
  suggestedText?: string;
  /** Display family, resolved from the rule's pillar when the adapter knows it. */
  family?: string;
  componentIdUnique?: string;
}

/** Per-component agent result. Mirrors the node's custom structured output. */
export interface AgentComponentResult {
  skillName: string;
  /**
   * Optional in practice: the 2026-07-28 spike proved Custom structured output
   * does not enforce `required`, so callers must default this.
   */
  status?: 'complete' | 'partial';
  dimensions: Array<{ key: string; score: number; rationale: string }>;
  findings: AgentFinding[];
  /**
   * Rules the node could not judge, carried through from v4.
   *
   * Kept distinct from a pass: an unassessed rule is withheld from both sides of
   * a coverage ratio, whereas treating it as a pass would credit work nobody
   * verified.
   */
  notAssessed?: Array<{ ruleId: string; reason?: string; scopeStatus?: string }>;
  /**
   * Why this component has no reviewer verdict, carried from `cat_errormessage`.
   *
   * Present only on a failed row. It exists so the UI can say what went wrong
   * instead of leaving the maker to infer it from an unassessed rule list.
   */
  errorMessage?: string;
  /** Provenance for a v4 payload, so the UI can tell which node produced a row. */
  arc2?: { node?: string; unitId?: string; attempt?: number };
  resourcePurposeAlignment?: Array<{
    resourcePath: string;
    matches: boolean;
    rationale: string;
  }>;
  operationalAssumptions?: Array<{
    statement: string;
    evidence: string;
    resourcePath?: string;
  }>;
  unreviewedResources?: Array<{ resourcePath: string; reason: string }>;
  /**
   * Per-resource analysis (spec 014 Phase B).
   *
   * The agent node receives each resource's full text on the component object,
   * so it evaluates the files in the same call that evaluates the skill. That
   * replaces the AI Builder chunk-then-synthesise cascade, which existed only
   * because a prompt cannot loop.
   *
   * `riskLevel` is typed loosely on purpose: Custom structured output does not
   * enforce `enum` any more than it enforces `required`, and the model has been
   * observed returning "low", which is not in the declared set. The mapper
   * normalises it.
   */
  resources?: Array<{
    resourcePath: string;
    status?: string;
    riskLevel?: string;
    readiness?: string;
    observedBehaviors?: Array<{ kind: string; evidence: string }>;
    purposeAlignment?: { matches: boolean; rationale: string };
    dependencies?: Array<{ name: string; kind: string; evidence?: string }>;
    externalEndpoints?: Array<{ value: string; evidence: string }>;
    capabilities?: Array<{ kind: string; evidence: string }>;
    runtimeAssumptions?: Array<{ statement: string; evidence: string }>;
    findings?: AgentFinding[];
  }>;
  /**
   * TASK 7 — capability edges. Loosely typed on purpose: this is the raw agent
   * payload, and custom structured output enforces neither `required` nor
   * `enum`. The provider normalises and drops malformed entries; validating the
   * shape here would reject the whole component over one bad edge.
   */
  capabilityEdges?: Array<{
    capabilityName?: string;
    usage?: string;
    evidence?: string;
    confidence?: string;
  }>;
  summary: string;
}

/** Classified job failure, surfaced to the UI. */
export type ReviewJobErrorCode =
  | 'capacity'
  | 'throttled'
  | 'timeout'
  | 'workflow-failed'
  /** The job was never claimed — the workflow is off, deleted, or its trigger is broken. */
  | 'workflow-unavailable'
  | 'malformed-output'
  | 'cancelled'
  | 'unknown';

export class ReviewJobError extends Error {
  readonly code: ReviewJobErrorCode;

  constructor(code: ReviewJobErrorCode, message: string) {
    super(message);
    this.name = 'ReviewJobError';
    this.code = code;
  }
}
