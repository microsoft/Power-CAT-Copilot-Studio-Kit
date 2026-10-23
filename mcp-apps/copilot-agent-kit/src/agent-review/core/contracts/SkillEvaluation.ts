/**
 * Skill-evaluation output contracts (research doc §10).
 * Returned by the P2 Skill Bundle Evaluator AI prompts; deterministic L0
 * findings merge into safety/bundleIntegrity before the AI call.
 */
import type {
  GroundedSkillFinding,
  PlatformOverlapState,
  SkillFindingSeverity,
  SkillSafetyDisposition,
} from "./Findings.js";

// ---------------------------------------------------------------------------
// Shared dimension contract
// ---------------------------------------------------------------------------

export interface SkillDimension {
  key: "Clarity" | "Actionability" | "Scope discipline" | "Composability";
  score: number;
  rationale: string;
  /** Exact artifact quote supporting a score below 100. */
  evidence?: string;
  /** Concrete artifact-specific action supporting a score below 100. */
  improvement?: string;
}

// ---------------------------------------------------------------------------
// Legacy contracts (P2-N v1 — kept for backward-compatibility)
// ---------------------------------------------------------------------------

export interface SkillSafetyFinding {
  id: string;
  target: string;
  category: string;
  severity: "info" | "medium" | "high" | "critical";
  evidence: string; rationale: string; recommendation: string;
  reference: string;
  safetyDisposition?: SkillSafetyDisposition;
  platformOverlap?: PlatformOverlapState;
  skipAiEvaluation?: boolean;
}

export interface SkillResourceEval {
  path: string; kind: "script" | "reference" | "asset" | "template" | "data" | "other";
  language?: string; declaredPurpose: string; matchesSkill: boolean;
  riskLevel: "low" | "medium" | "high" | "critical";
  findings: SkillSafetyFinding[]; rationale: string;
}

export interface SkillBundleEvaluation {
  name: string;
  descriptionPresent: boolean; descriptionStatesWhen: boolean; descriptionRationale: string;
  dimensions: SkillDimension[];
  overallScorePercent: number;
  band: "Strong" | "Good" | "Needs work";
  sizeLabel: string; structureOk: boolean;
  safety: { flagged: boolean; severity: "none" | "info" | "medium" | "high" | "critical"; findings: SkillSafetyFinding[] };
  resources: SkillResourceEval[];
  bundleIntegrity: {
    referencedButMissing: { path: string; referencedIn: string }[];
    presentButUnreferenced: { path: string; note: string }[];
    progressiveDisclosureOk: boolean; rationale: string;
  };
  crossSkillConflicts: { withSkill: string; type: "overlap" | "contradiction"; evidence: string; severity: "warning" | "error"; rationale: string }[];
  citations: { id: string; title: string; url: string; source: "Microsoft Learn" | "Anthropic" | "OWASP" }[];
  summary: string;
}

// ---------------------------------------------------------------------------
// P2-O: Cross-skill orchestration evaluation (agent-level, 1 call per review)
// ---------------------------------------------------------------------------

/** Kinds of set-level (agent-level) orchestration issues across all skills. */
export type OrchestrationIssueType =
  | "overlap"
  | "redundancy"
  | "contradiction"
  | "coverage-gap"
  | "coupling"
  | "consistency";

/**
 * A single set-level orchestration finding. Unit of analysis is the whole skill
 * set (no single skill owns it), so it is surfaced in the orchestration section
 * rather than one of the four per-skill rubric dimensions.
 */
export interface CrossSkillOrchestrationFinding {
  /** Stable finding id, e.g. "XSK-01:web-search+file-search". */
  id: string;
  /** Registered orchestration rule id, e.g. "XSK-01". */
  ruleId: string;
  type: OrchestrationIssueType;
  severity: SkillFindingSeverity;
  title: string;
  /** Skills involved. For pairwise overlaps/contradictions, exactly two. */
  skills: string[];
  /** Verbatim evidence grounded in the submitted skill corpus. */
  evidence: string;
  /** Why this matters for orchestration/routing. */
  rationale: string;
  /** Actionable recommendation (URL-free). */
  recommendation: string;
  /** Ordered remediation steps. */
  fixSteps: Array<{ order: number; action: string }>;
  /** Approved reference IDs supporting this finding. */
  referenceIds: string[];
  confidence: "high" | "medium" | "low";
}

/**
 * Output of the P2-O Cross-Skill Orchestration Evaluator prompt.
 * Produced by exactly one AI call per review (needs the full skill set).
 */
export interface CrossSkillOrchestrationEvaluation {
  status: "complete" | "partial";
  findings: CrossSkillOrchestrationFinding[];
  summary: string;
  referenceIds: string[];
  parseError?: string;
}

// ---------------------------------------------------------------------------
// P2-R: Resource chunk evaluation (one chunk → one result)
// ---------------------------------------------------------------------------

export interface ResourceChunkEvaluation {
  resourcePath: string;
  chunkId: string;
  status: "complete" | "partial";
  observedBehaviors: Array<{ kind: string; evidence: string }>;
  dependencies: Array<{ name: string; kind: string; evidence?: string }>;
  externalEndpoints: Array<{ value: string; evidence: string }>;
  capabilities: Array<{
    kind: "read" | "write" | "delete" | "network" | "process" | "execute" | "secret-access";
    evidence: string;
  }>;
  runtimeAssumptions: Array<{ statement: string; evidence: string }>;
  findings: GroundedSkillFinding[];
  purposeAlignment: { matches: boolean; rationale: string };
  referenceIds: string[];
}

// ---------------------------------------------------------------------------
// P2-N (v2): Standard skill bundle evaluation
// ---------------------------------------------------------------------------

export interface StandardSkillBundleEvaluation {
  status: "complete" | "partial";
  dimensions: SkillDimension[];
  findings: GroundedSkillFinding[];
  resourcePurposeAlignment: Array<{
    resourcePath: string;
    matches: boolean;
    rationale: string;
  }>;
  operationalAssumptions: Array<{
    statement: string;
    evidence: string;
    resourcePath?: string;
  }>;
  unreviewedResources: Array<{ resourcePath: string; reason: string }>;
  /**
   * Per-resource analysis, when the backend produced it in the same call.
   *
   * The workflow agent receives every resource's text in its input, so it
   * analyses them alongside the skill and returns this.
   * `deepEvaluationFromStandard` reshapes it into the deep evaluation.
   */
  resources?: SkillResourceEvaluation[];
  /**
   * Which configured capabilities this skill actually uses (TASK 7).
   *
   * The Agent Map previously inferred these edges by matching capability names
   * against skill text. Measured against real tool names -- `Copy file`,
   * `Create item`, `Add attachment` -- that produced a false edge on every
   * ordinary use of those words, including on the prohibition "do not copy file
   * contents", because a matcher has no notion of polarity.
   *
   * The agent receives `skill_markdown` and `configuredCapabilities` in the same
   * payload, so it can judge use rather than mention. Each edge carries verbatim
   * evidence and a confidence so a low-confidence edge can be rendered as
   * provisional rather than asserted as fact.
   *
   * Undefined on the AI Builder path and on reviews saved before TASK 7.
   */
  capabilityEdges?: SkillCapabilityEdge[];
  /**
   * Capabilities the skill names but the agent does not have. Kept separate from
   * {@link capabilityEdges} because these are review findings, not graph edges --
   * a missing capability has no node to draw an edge to.
   */
  missingCapabilities?: Array<{
    capabilityName: string;
    evidence: string;
    resourcePath?: string;
    confidence?: "high" | "medium" | "low";
  }>;
  summary: string;
  referenceIds: string[];
  parseError?: string;
}

/** One skill-to-capability dependency, with the evidence that justifies it. */
export interface SkillCapabilityEdge {
  /** Exact name as configured on the agent; the caller matches on this. */
  capabilityName: string;
  usage: "read" | "write" | "invoke" | "delegate" | "reference";
  /** Verbatim line from the skill showing the use. */
  evidence: string;
  confidence: "high" | "medium" | "low";
}

// ---------------------------------------------------------------------------
// P2-F: File-level resource evaluation (synthesizes chunk results)
// ---------------------------------------------------------------------------

export interface SkillResourceEvaluation {
  resourcePath: string;
  status: "complete" | "partial" | "failed" | "skipped" | "cancelled";
  riskLevel: "none" | "info" | "medium" | "high" | "critical";
  readiness: "ready" | "needs-configuration" | "unsupported" | "unknown";
  observedBehaviors: ResourceChunkEvaluation["observedBehaviors"];
  dependencies: ResourceChunkEvaluation["dependencies"];
  externalEndpoints: ResourceChunkEvaluation["externalEndpoints"];
  capabilities: ResourceChunkEvaluation["capabilities"];
  runtimeAssumptions: ResourceChunkEvaluation["runtimeAssumptions"];
  findings: GroundedSkillFinding[];
  purposeAlignment: ResourceChunkEvaluation["purposeAlignment"];
  analyzedChunks: number;
  totalChunks: number;
  referenceIds: string[];
  parseError?: string;
}

// ---------------------------------------------------------------------------
// P2-B: Deep bundle evaluation (synthesizes resource results)
// ---------------------------------------------------------------------------

export interface DeepSkillBundleEvaluation {
  status: "complete" | "partial" | "failed" | "cancelled";
  synthesisLevel: "partial" | "final";
  resources: SkillResourceEvaluation[];
  crossFileChains: Array<{
    resourcePaths: string[];
    behavior: string;
    findingIds: string[];
  }>;
  findings: GroundedSkillFinding[];
  operationalAssumptions: Array<{ statement: string; resourcePaths: string[] }>;
  summary: string;
  referenceIds: string[];
  parseError?: string;
}
