import type { AeStandardTopic } from './AgentsExperienceModel.js';

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
} as const;
export type ReviewJobStatusValue =
  (typeof ReviewJobStatus)[keyof typeof ReviewJobStatus];

/** `cat_jobkind` option set. One workflow per kind. */
export const ReviewJobKind = {
  StandardSkillBundle: 1,
  CrossSkillOrchestration: 2,
} as const;
export type ReviewJobKindValue =
  (typeof ReviewJobKind)[keyof typeof ReviewJobKind];

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
  cat_skillname?: string;
  cat_componentindex?: number;
  cat_itemstatus?: ReviewJobItemStatusValue;
  cat_correlationid?: string;
  cat_componentid?: string;
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
export interface SkillReviewCorpusComponent {
  componentIndex: number;
  kind: 'InlineAgentSkill';
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

export interface StandardTopicCorpusComponent extends AeStandardTopic {
  evaluationType: 'StandardTopic';
  contractVersion: 1;
  componentIndex: number;
  inputHash: string;
  agent_instructions: string;
  configuredCapabilities: string[];
}

export type ReviewCorpusComponent = SkillReviewCorpusComponent | StandardTopicCorpusComponent;

export function isStandardTopicComponent(
  component: ReviewCorpusComponent,
): component is StandardTopicCorpusComponent {
  return 'evaluationType' in component && component.evaluationType === 'StandardTopic';
}

/**
 * What produced this corpus, and therefore which agent instructions suit it.
 *
 * The workflow branches on this immediately after Parse JSON, so it must stay a
 * top-level string the designer can compare without walking into `components`.
 *
 * - `StandardSkillBundle` — a Copilot Studio agent. Each component is a whole
 *   skill or a Standard topic with its own evaluator contract.
 * - `ArtifactBundle` — an uploaded archive. One component per group of files,
 *   each component a *portion* of one skill. The agent must not judge the
 *   archive as a whole from a portion of it.
 */
export type ReviewJobKind = 'StandardSkillBundle' | 'ArtifactBundle';

/** Whole-review payload written to `cat_inputfile`. */
export interface ReviewCorpus {
  schemaVersion: 1;
  jobKind: ReviewJobKind;
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

// ---------------------------------------------------------------------------
// Output — what the workflow writes to cat_outputfile
// ---------------------------------------------------------------------------

/** One finding as returned by the agent node. Registry rules supply the prose. */
export interface AgentFinding {
  ruleId: string;
  severity: string;
  evidence: string;
  resourcePath?: string;
  confidence?: string;
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
  missingCapabilities?: Array<{
    capabilityName?: string;
    evidence?: string;
    resourcePath?: string;
    confidence?: string;
  }>;
  /**
   * TASK 2 semantic contradiction checklist.
   *
   * Both quoted sides are required before the provider creates SKL-10. The
   * model can still omit fields despite the output schema, so the provider
   * rejects incomplete entries instead of inferring a conflict.
   */
  contradictions?: Array<{
    evidence?: string;
    resourcePath?: string;
    conflictingEvidence?: string;
    conflictingResourcePath?: string;
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
